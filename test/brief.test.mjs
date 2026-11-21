// Offline checks for /state?brief=1 (collapsed-pill polling) and the ISO
// timestamp added to commits for client-side localisation.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { apply } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
}

function makeRepo() {
  const base = mkdtempSync(join(tmpdir(), 'dshgit-brief-'))
  const dir = join(base, 'work')
  execFileSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  sh(dir, ['config', 'user.name', 'T'])
  sh(dir, ['config', 'user.email', 't@l'])
  writeFileSync(join(dir, 'a.js'), 'one\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'first commit'])
  writeFileSync(join(dir, 'a.js'), 'one\ntwo\n')
  writeFileSync(join(dir, 'b.js'), 'new\n')
  runGitAddUntrackedNothing()
  return { base, dir }
}

function runGitAddUntrackedNothing() {
  /* b.js stays untracked on purpose */
}

async function askWith(repoDir, path) {
  const routes = []
  const ctx = {
    get(name) {
      if (name === 'webServer') return { register: (route) => (routes.push(route), () => {}) }
      if (name === 'workingDirectory') return { defaultDirectory: repoDir, get: () => repoDir }
      if (name === 'sessions') return { get: (id) => ({ id }) }
      return undefined
    },
    effect: (fn) => fn(),
    logger: { info: () => {} },
  }
  apply(ctx)
  return new Promise((done) => {
    const req = new EventEmitter()
    req.method = 'GET'
    req.url = path
    process.nextTick(() => req.emit('end'))
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

const { base, dir } = makeRepo()
const full = await askWith(dir, '/dsh-git-bar/state?session=s1')
const brief = await askWith(dir, '/dsh-git-bar/state?session=s1&brief=1')

check('full: files present', Array.isArray(full.files) && full.files.length === 2, full.files && full.files.length)
check('full: numstat attached', full.files.some((file) => typeof file.additions === 'number'), JSON.stringify(full.files.map((f) => f.additions)))
check('full: commits present', Array.isArray(full.commits) && full.commits.length >= 1, full.commits && full.commits.length)
check('full: brief flag false', full.brief === false, full.brief)
check('full: commit iso timestamp', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(full.commits[0].iso || ''), full.commits[0].iso)
check('full: commit keeps english fallback', typeof full.commits[0].when === 'string' && full.commits[0].when.length > 0, full.commits[0].when)
check('full: commit subject', full.commits[0].subject === 'first commit', full.commits[0].subject)

check('brief: flag true', brief.brief === true, brief.brief)
check('brief: no files shipped', Array.isArray(brief.files) && brief.files.length === 0, brief.files && brief.files.length)
check('brief: no commits shipped', Array.isArray(brief.commits) && brief.commits.length === 0, brief.commits && brief.commits.length)
check('brief: same counts', JSON.stringify(brief.counts) === JSON.stringify(full.counts), `${JSON.stringify(brief.counts)} vs ${JSON.stringify(full.counts)}`)
check('brief: same branch/head', brief.branch === full.branch && brief.head === full.head, `${brief.branch}/${brief.head}`)
check('brief: still ok', brief.ok === true && brief.root === full.root, `${brief.ok}/${brief.root}`)

// A brief request on a clean tree reports zero changes without listing files.
sh(dir, ['add', '-A'])
sh(dir, ['commit', '-m', 'second commit'])
const cleanBrief = await askWith(dir, '/dsh-git-bar/state?session=s1&brief=1')
check('brief clean: zero counts', cleanBrief.counts.all === 0 && cleanBrief.counts.untracked === 0, JSON.stringify(cleanBrief.counts))
check('brief clean: no commits list', cleanBrief.commits.length === 0, cleanBrief.commits.length)

rmSync(base, { recursive: true, force: true })

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
