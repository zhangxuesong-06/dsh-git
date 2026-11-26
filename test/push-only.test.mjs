// Strip a half-populated GIT_CONFIG_* environment (the desktop process can export GIT_CONFIG_COUNT
// without the matching keys, which breaks every git child).
for (const key of Object.keys(process.env)) {
  if (key === 'GIT_CONFIG_COUNT' || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) delete process.env[key]
}

// Offline checks for: session-pending state, and the "push" action degrading to
// a push-only operation when the working tree is already clean.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { apply } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

function sh(cwd, args, ignoreFailure = false) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (error) {
    if (ignoreFailure) return String(error.stdout ?? '')
    throw error
  }
}

function makeRepo(withBareRemote) {
  const base = mkdtempSync(join(tmpdir(), 'dshgit-pushonly-'))
  const dir = join(base, 'work')
  const bare = join(base, 'remote.git')
  execFileSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  sh(dir, ['config', 'user.name', 'T'])
  sh(dir, ['config', 'user.email', 't@l'])
  if (withBareRemote) {
    execFileSync('git', ['init', '--bare', bare], { encoding: 'utf8' })
    sh(dir, ['remote', 'add', 'origin', bare])
  }
  writeFileSync(join(dir, 'a.js'), 'one\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'base'])
  return { base, dir, bare }
}

async function askWith(repoDir, path, method = 'GET', body = null, opts = {}) {
  const routes = []
  const ctx = {
    get(name) {
      if (name === 'webServer') return { register: (route) => (routes.push(route), () => {}) }
      if (name === 'workingDirectory') return { defaultDirectory: repoDir, get: () => repoDir }
      if (name === 'sessions') {
        return { get: (id) => (opts.sessionMissing ? undefined : { id }) }
      }
      return undefined
    },
    effect: (fn) => fn(),
    logger: { info: () => {} },
  }
  apply(ctx)
  return new Promise((done) => {
    const req = new EventEmitter()
    req.method = method
    req.url = path
    process.nextTick(() => {
      if (body !== null) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

// ── 1. unresolved session reports session-pending, not not-a-repository ───
{
  const { base, dir } = makeRepo(false)
  const pending = await askWith(dir, '/dsh-git-bar/state?session=not-ready', 'GET', null, { sessionMissing: true })
  check('pending: reason', pending.ok === false && pending.reason === 'session-pending', `${pending.ok}/${pending.reason}`)
  check('pending: no bogus cwd leak', pending.cwd === undefined, JSON.stringify(pending).slice(0, 80))

  const ready = await askWith(dir, '/dsh-git-bar/state?session=ready', 'GET', null, {})
  check('pending: resolved session still works', ready.ok === true && ready.branch === 'main', `${ready.ok}/${ready.branch}`)

  const noSession = await askWith(join(base, 'nothing-here'), '/dsh-git-bar/state', 'GET', null, {})
  check('pending: no session param keeps old behaviour', noSession.ok === false, `${noSession.ok}/${noSession.reason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── 2. clean tree but unpushed commit → push-only ────────────────────────
{
  const { base, dir, bare } = makeRepo(true)
  sh(dir, ['push', '-u', 'origin', 'main'])
  writeFileSync(join(dir, 'b.js'), 'two\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'local only'])
  const headBefore = sh(dir, ['rev-parse', 'HEAD']).trim()
  const countBefore = sh(dir, ['rev-list', '--count', 'HEAD']).trim()

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('push-only: ok', result.ok === true, result.reason)
  check('push-only: not committed', result.committed === false && result.short === '', `${result.committed}/${result.short}`)
  check('push-only: pushed', result.pushed === true, `${result.pushed}/${result.pushReason}`)
  check('push-only: ahead reported', result.ahead === 1, result.ahead)
  check('push-only: no new commit', sh(dir, ['rev-parse', 'HEAD']).trim() === headBefore && sh(dir, ['rev-list', '--count', 'HEAD']).trim() === countBefore, 'HEAD moved')
  check('push-only: remote advanced', sh(bare, ['rev-parse', 'main']).trim() === headBefore, 'bare main')

  // ── 3. clean and in sync → nothing-to-push ─────────────────────────────
  const synced = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('in-sync: nothing-to-push', synced.ok === false && synced.reason === 'nothing-to-push', `${synced.ok}/${synced.reason}`)
  check('in-sync: upstream reported', synced.upstream === 'origin/main', synced.upstream)

  // ── 4. commit-only still refuses a clean tree ──────────────────────────
  const commitOnly = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: false })
  check('commit-only: nothing-to-commit', commitOnly.ok === false && commitOnly.reason === 'nothing-to-commit', `${commitOnly.ok}/${commitOnly.reason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── 5. push-only without a remote reports no-remote ──────────────────────
{
  const { base, dir } = makeRepo(false)
  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('no-remote push-only: ok true', result.ok === true && result.committed === false, `${result.ok}/${result.committed}`)
  check('no-remote push-only: not pushed', result.pushed === false && result.pushReason === 'no-remote', `${result.pushed}/${result.pushReason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── 6. push-only from a detached HEAD is refused ─────────────────────────
{
  const { base, dir } = makeRepo(false)
  sh(dir, ['checkout', '--detach', 'HEAD'])
  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('detached push-only: refused', result.ok === false && result.reason === 'detached', `${result.ok}/${result.reason}`)
  rmSync(base, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
