// Offline verification of the host half against a throwaway repository.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../dsh-git-bar/index.js'

const repo = mkdtempSync(join(tmpdir(), 'gitbar-selftest-'))
const gitIn = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' })
const identity = ['-c', 'user.name=Tester', '-c', 'user.email=tester@local']

gitIn(['init', '-b', 'main'])
writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
gitIn(['add', '-A'])
gitIn([...identity, 'commit', '-m', 'first commit'])
gitIn(['switch', '-c', 'feature/demo'])
writeFileSync(join(repo, 'b.txt'), 'three\n')
gitIn(['add', '-A'])
gitIn([...identity, 'commit', '-m', 'feature commit'])
gitIn(['switch', 'main'])

const routes = []
const ctx = {
  get(name) {
    if (name === 'webServer') {
      return {
        register(route) {
          routes.push(route)
          return () => {}
        },
      }
    }
    if (name === 'workingDirectory') return { defaultDirectory: repo, get: () => repo }
    if (name === 'sessions') return { get: (id) => ({ id }) }
    return undefined
  },
  effect(fn) {
    return fn()
  },
  logger: { info: () => {} },
}
apply(ctx)
const route = routes[0]
if (!route) throw new Error('route not registered')

function request(pathname, body, method = 'GET') {
  return new Promise((done) => {
    const listeners = {}
    const req = {
      url: pathname,
      method,
      on(event, fn) {
        listeners[event] = fn
        return req
      },
    }
    const res = {
      writeHead(status) {
        res.status = status
      },
      end(payload) {
        done({ status: res.status, body: JSON.parse(payload) })
      },
    }
    route.handler(req, res)
    if (body !== undefined) {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      ;(async () => {
        for (let at = 0; at < 400 && typeof listeners.data !== 'function'; at += 1) await wait(5)
        listeners.data?.(Buffer.from(body))
        for (let at = 0; at < 400 && typeof listeners.end !== 'function'; at += 1) await wait(5)
        listeners.end?.()
      })()
    }
  })
}

const checks = []
const check = (name, condition, detail) => checks.push({ name, ok: Boolean(condition), detail })

const state = await request('/dsh-git-bar/state?session=s1')
check('state.ok', state.body.ok === true, state.body.reason)
check('state branch main', state.body.branch === 'main', state.body.branch)
check('state commits carry full hash', /^[0-9a-f]{40}$/.test(state.body.commits[0]?.full ?? ''), state.body.commits[0])

const branches = await request('/dsh-git-bar/branches?session=s1')
check('branches.ok', branches.body.ok === true)
check('branches lists both', branches.body.branches?.length === 2, branches.body.branches?.map((b) => b.name))
check('branches marks current', branches.body.branches?.find((b) => b.current)?.name === 'main')

const commitHash = gitIn(['rev-parse', 'feature/demo']).trim()
const commit = await request(`/dsh-git-bar/commit?session=s1&hash=${commitHash}`)
check('commit.ok', commit.body.ok === true, commit.body.reason)
check('commit subject', commit.body.commit?.subject === 'feature commit', commit.body.commit?.subject)
check('commit has diff', typeof commit.body.diff === 'string' && commit.body.diff.includes('+three'), (commit.body.diff ?? '').slice(0, 60))
check('commit files', commit.body.files?.length === 1, commit.body.files)

const badCommit = await request('/dsh-git-bar/commit?session=s1&hash=zzzz')
check('commit rejects junk hash', badCommit.body.ok === false && badCommit.body.reason === 'invalid-hash')

const commitFile = await request(
  `/dsh-git-bar/commit-diff?session=s1&hash=${commitHash}&path=b.txt`,
)
check('commit-diff.ok', commitFile.body.ok === true, commitFile.body.reason)
check('commit-diff only that file', (commitFile.body.diff ?? '').includes('+three') && !(commitFile.body.diff ?? '').includes('a.txt'), (commitFile.body.diff ?? '').slice(0, 80))
check('commit-diff stats', commitFile.body.additions === 1 && commitFile.body.deletions === 0, commitFile.body)
const commitFileTraversal = await request(`/dsh-git-bar/commit-diff?session=s1&hash=${commitHash}&path=..%2Fsecret`)
check('commit-diff rejects traversal', commitFileTraversal.body.ok === false && commitFileTraversal.body.reason === 'invalid-path')
const commitFileJunk = await request('/dsh-git-bar/commit-diff?session=s1&hash=zz&path=b.txt')
check('commit-diff rejects junk hash', commitFileJunk.body.ok === false && commitFileJunk.body.reason === 'invalid-hash')

const unknownCommit = await request('/dsh-git-bar/commit?session=s1&hash=deadbeef')
check('commit rejects unknown commit', unknownCommit.body.ok === false && unknownCommit.body.reason === 'unknown-commit')

const rejected = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'nope' }), 'POST')
check('switch rejects unknown branch', rejected.body.ok === false && rejected.body.reason === 'unknown-branch')

const injected = await request('/dsh-git-bar/switch', JSON.stringify({ branch: '--force' }), 'POST')
check('switch rejects option-like name', injected.body.ok === false && injected.body.reason === 'invalid-branch')

const getSwitch = await request('/dsh-git-bar/switch?session=s1', undefined, 'GET')
check('switch requires POST', getSwitch.status === 405)

const switched = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'feature/demo' }), 'POST')
check('switch to feature/demo', switched.body.ok === true, switched.body)

const afterSwitch = await request('/dsh-git-bar/state?session=s1')
check('state follows switch', afterSwitch.body.branch === 'feature/demo', afterSwitch.body.branch)

const back = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'main' }), 'POST')
check('switch back to main', back.body.ok === true, back.body)
const again = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'main' }), 'POST')
check('switching to current branch is a no-op', again.body.ok === true && again.body.unchanged === true, again.body)

// A dirty tree git refuses to carry across must surface git's own message.
writeFileSync(join(repo, 'b.txt'), 'local edits that would be overwritten\n')
const dirty = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'feature/demo' }), 'POST')
check('switch refuses to overwrite local files', dirty.body.ok === false && dirty.body.reason === 'switch-failed', dirty.body)
check('switch failure carries git detail', typeof dirty.body.detail === 'string' && dirty.body.detail.length > 0, dirty.body.detail)
rmSync(join(repo, 'b.txt'), { force: true })

const traversal = await request('/dsh-git-bar/diff?session=s1&path=..%2F..%2Fetc%2Fpasswd')
check('diff rejects traversal', traversal.body.ok === false && traversal.body.reason === 'invalid-path')

// ── graph ────────────────────────────────────────────────────────────────────
gitIn(['switch', 'main'])
writeFileSync(join(repo, 'c.txt'), 'merge side\n')
gitIn(['add', '-A'])
gitIn([...identity, 'commit', '-m', 'main before merge'])
gitIn([...identity, 'tag', '-a', 'v1', '-m', 'release one', 'HEAD'])
gitIn(['switch', '-c', 'side'])
writeFileSync(join(repo, 'd.txt'), 'side work\n')
gitIn(['add', '-A'])
gitIn([...identity, 'commit', '-m', 'side commit'])
gitIn(['switch', 'main'])
gitIn([...identity, 'merge', '--no-ff', '-m', 'merge side into main', 'side'])
const mergeHead = gitIn(['rev-parse', 'HEAD']).trim()
const firstCommit = gitIn(['rev-list', '--max-parents=0', 'HEAD']).trim()

const graph = await request('/dsh-git-bar/graph?session=s1&limit=50')
check('graph.ok', graph.body.ok === true, graph.body.reason)
check('graph has commits', Array.isArray(graph.body.commits) && graph.body.commits.length >= 4, graph.body.commits?.length)
check('graph columns >= 2', graph.body.columns >= 2, graph.body.columns)
check('graph lanes are integers', graph.body.commits.every((c) => Number.isInteger(c.lane) && c.lane >= 0))
check('graph HEAD commit is first', graph.body.commits[0].full === mergeHead, graph.body.commits[0].full)
check('graph HEAD ref present', (graph.body.commits[0].refs ?? []).some((r) => r.kind === 'head' && r.name === 'HEAD'), graph.body.commits[0].refs)
check('graph current branch ref present', (graph.body.commits[0].refs ?? []).some((r) => r.kind === 'branch' && r.current && r.name === 'main'), graph.body.commits[0].refs)
const mergeRow = graph.body.commits.find((c) => c.full === mergeHead)
check('merge commit has two parents', mergeRow?.parents?.length === 2, mergeRow?.parents)
const tagRow = graph.body.commits.find((c) => (c.refs ?? []).some((r) => r.kind === 'tag' && r.name === 'v1'))
check('annotated tag resolves to its commit', Boolean(tagRow), tagRow?.hash)
check('remote-less repo keeps branches only', graph.body.commits.every((c) => (c.refs ?? []).every((r) => ['head', 'branch', 'remote', 'tag'].includes(r.kind))))

// ── detach switching ────────────────────────────────────────────────────────
const detach = await request('/dsh-git-bar/switch', JSON.stringify({ detach: firstCommit }), 'POST')
check('detach to a commit', detach.body.ok === true, detach.body)
const detachedState = await request('/dsh-git-bar/state?session=s1')
check('state reports detached HEAD', detachedState.body.detached === true, detachedState.body.branch)
const detachTag = await request('/dsh-git-bar/switch', JSON.stringify({ detach: 'v1' }), 'POST')
check('detach to an annotated tag', detachTag.body.ok === true, detachTag.body)
const detachJunk = await request('/dsh-git-bar/switch', JSON.stringify({ detach: 'not-a-ref' }), 'POST')
check('detach rejects unknown target', detachJunk.body.ok === false && detachJunk.body.reason === 'unknown-target')
const detachOption = await request('/dsh-git-bar/switch', JSON.stringify({ detach: '--force' }), 'POST')
check('detach rejects option-like target', detachOption.body.ok === false && detachOption.body.reason === 'invalid-target')
const detachMissing = await request('/dsh-git-bar/switch', JSON.stringify({}), 'POST')
check('switch rejects empty payload', detachMissing.body.ok === false && detachMissing.body.reason === 'missing-target')
const backToBranch = await request('/dsh-git-bar/switch', JSON.stringify({ branch: 'main' }), 'POST')
check('branch switch restores main from detached', backToBranch.body.ok === true, backToBranch.body)
const restored = await request('/dsh-git-bar/state?session=s1')
check('state back on main', restored.body.branch === 'main' && restored.body.detached === false)

console.log(JSON.stringify(checks, null, 2))
const failed = checks.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
rmSync(repo, { recursive: true, force: true })
process.exitCode = failed.length === 0 ? 0 : 1
