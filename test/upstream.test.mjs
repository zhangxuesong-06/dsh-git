// Strip a half-populated GIT_CONFIG_* environment (the desktop process can export GIT_CONFIG_COUNT
// without the matching keys, which breaks every git child).
for (const key of Object.keys(process.env)) {
  if (key === 'GIT_CONFIG_COUNT' || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) delete process.env[key]
}

// Verifies the upstream fallback: a branch with a remote-tracking ref but no
// configured tracking shows `<remote>/<branch>` and real ahead/behind counts.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const repo = mkdtempSync(join(tmpdir(), 'dshgit-upstream-'))
const gitIn = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
const id = ['-c', 'user.name=T', '-c', 'user.email=t@l']

gitIn(['init', '-b', 'main'])
writeFileSync(join(repo, 'a.txt'), 'one\n')
gitIn(['add', '-A'])
gitIn([...id, 'commit', '-m', 'first'])
const first = gitIn(['rev-parse', 'HEAD']).trim()

// A remote-tracking ref for origin/main that lags one commit behind, with NO
// branch.main.remote/merge configured — the re-initialised-repo situation.
writeFileSync(join(repo, 'a.txt'), 'two\n')
gitIn(['add', '-A'])
gitIn([...id, 'commit', '-m', 'second'])
gitIn(['remote', 'add', 'origin', 'https://example.invalid/repo.git'])
gitIn(['update-ref', 'refs/remotes/origin/main', first])

const routes = []
const ctx = {
  get(name) {
    if (name === 'webServer') return { register: (route) => (routes.push(route), () => {}) }
    if (name === 'workingDirectory') return { defaultDirectory: repo, get: () => repo }
    if (name === 'sessions') return { get: (id) => ({ id }) }
    return undefined
  },
  effect: (fn) => fn(),
  logger: { info: () => {} },
}
apply(ctx)

const ask = (url) =>
  new Promise((done) => {
    const req = { url, method: 'GET', on: () => req }
    routes[0].handler(req, { writeHead() {}, end: (body) => done(JSON.parse(body)) })
  })

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail })

const untracked = await ask('/dsh-git-bar/state?session=s1')
check('branch detected', untracked.branch === 'main', untracked.branch)
check('upstream falls back to origin/main', untracked.upstream === 'origin/main', untracked.upstream)
check('ahead counts the local-only commit', untracked.ahead === 1, untracked.ahead)
check('behind is zero', untracked.behind === 0, untracked.behind)

// With tracking configured the value stays the same, proving the fallback is
// additive rather than a rewrite.
gitIn(['branch', '--set-upstream-to=origin/main', 'main'])
const tracked = await ask('/dsh-git-bar/state?session=s1')
check('configured upstream still origin/main', tracked.upstream === 'origin/main', tracked.upstream)
check('ahead still 1 when tracked', tracked.ahead === 1, tracked.ahead)

// No remote ref at all: empty upstream, zero counters, no crash.
gitIn(['update-ref', '-d', 'refs/remotes/origin/main'])
const bare = await ask('/dsh-git-bar/state?session=s1')
check('no upstream when nothing matches', bare.upstream === '', bare.upstream)
check('no phantom counters', bare.ahead === 0 && bare.behind === 0, `${bare.ahead}/${bare.behind}`)
check('state still ok', bare.ok === true)

console.log(JSON.stringify(checks, null, 2))
const failed = checks.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
rmSync(repo, { recursive: true, force: true })
process.exitCode = failed.length === 0 ? 0 : 1
