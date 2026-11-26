// Strip a half-populated GIT_CONFIG_* environment (the desktop process can export GIT_CONFIG_COUNT
// without the matching keys, which breaks every git child).
for (const key of Object.keys(process.env)) {
  if (key === 'GIT_CONFIG_COUNT' || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) delete process.env[key]
}

// Offline checks for the commit+push behaviour of POST /dsh-git-bar/auto-commit.
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
  const base = mkdtempSync(join(tmpdir(), 'dshgit-push-'))
  const dir = join(base, 'work')
  const bare = join(base, 'remote.git')
  execFileSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  sh(dir, ['config', 'user.name', 'T'])
  sh(dir, ['config', 'user.email', 't@l'])
  if (withBareRemote) {
    execFileSync('git', ['init', '--bare', bare], { encoding: 'utf8' })
    sh(dir, ['remote', 'add', 'origin', bare])
  }
  return { base, dir, bare }
}

async function askWith(repoDir, path, method = 'GET', body = null) {
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
    req.method = method
    req.url = path
    process.nextTick(() => {
      if (body !== null) req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

const seed = (dir) => {
  writeFileSync(join(dir, 'a.js'), 'one\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'base'])
}

// ── 1. configured upstream: commit then push ─────────────────────────────
{
  const { base, dir, bare } = makeRepo(true)
  seed(dir)
  sh(dir, ['push', '-u', 'origin', 'main'])
  writeFileSync(join(dir, 'b.js'), 'two\n')

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('upstream: commit ok', result.ok === true && result.committed === true, JSON.stringify(result).slice(0, 120))
  check('upstream: pushed', result.pushed === true, `${result.pushed} / ${result.pushReason} / ${result.pushDetail}`)
  check('upstream: reports origin/main', result.upstream === 'origin/main', result.upstream)
  check('upstream: remote advanced', sh(bare, ['rev-parse', 'main']).trim() === sh(dir, ['rev-parse', 'HEAD']).trim(), 'bare main vs HEAD')
  check('upstream: remote log has the commit', /auto-commit 1 file/.test(sh(bare, ['log', '-1', '--pretty=%s', 'main'])), sh(bare, ['log', '-1', '--pretty=%s', 'main']).trim())

  // ── 2. dirty again but the remote is unreachable → commit stays, push fails ──
  sh(dir, ['remote', 'set-url', 'origin', join(base, 'missing.git')])
  writeFileSync(join(dir, 'c.js'), 'three\n')
  const failing = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('unreachable: commit still ok', failing.ok === true && failing.committed === true, failing.ok)
  check('unreachable: not pushed', failing.pushed === false, failing.pushed)
  check('unreachable: reason push-failed', failing.pushReason === 'push-failed', failing.pushReason)
  check('unreachable: detail present', typeof failing.pushDetail === 'string' && failing.pushDetail.length > 0, (failing.pushDetail || '').slice(0, 80))
  check('unreachable: local commit exists', sh(dir, ['log', '-1', '--pretty=%s']).trim() === failing.subject, sh(dir, ['log', '-1', '--pretty=%s']).trim())
  rmSync(base, { recursive: true, force: true })
}

// ── 3. no remote at all ──────────────────────────────────────────────────
{
  const { base, dir } = makeRepo(false)
  seed(dir)
  writeFileSync(join(dir, 'b.js'), 'two\n')
  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('no-remote: commit ok', result.ok === true && result.committed === true, result.ok)
  check('no-remote: not pushed', result.pushed === false && result.pushReason === 'no-remote', `${result.pushed}/${result.pushReason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── 4. remote exists but the branch has no upstream → push -u ────────────
{
  const { base, dir, bare } = makeRepo(true)
  seed(dir)
  sh(dir, ['push', 'origin', 'main'])
  sh(dir, ['config', '--unset', 'branch.main.remote'], true)
  sh(dir, ['config', '--unset', 'branch.main.merge'], true)
  writeFileSync(join(dir, 'b.js'), 'two\n')

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('no-upstream: pushed with -u', result.pushed === true, `${result.pushed}/${result.pushReason}`)
  check('no-upstream: upstream reported', result.upstream === 'origin/main', result.upstream)
  check('no-upstream: tracking configured afterwards', sh(dir, ['config', '--get', 'branch.main.remote'], true).trim() === 'origin', sh(dir, ['config', '--get', 'branch.main.remote'], true).trim())
  check('no-upstream: remote advanced', sh(bare, ['rev-parse', 'main']).trim() === sh(dir, ['rev-parse', 'HEAD']).trim(), 'bare main vs HEAD')
  rmSync(base, { recursive: true, force: true })
}

// ── 5. remote moved ahead → non-fast-forward is reported as out-of-date ──
{
  const { base, dir, bare } = makeRepo(true)
  seed(dir)
  sh(dir, ['push', '-u', 'origin', 'main'])
  const other = join(base, 'other')
  execFileSync('git', ['clone', '-b', 'main', bare, other], { encoding: 'utf8' })
  sh(other, ['config', 'user.name', 'O'])
  sh(other, ['config', 'user.email', 'o@l'])
  writeFileSync(join(other, 'z.js'), 'z\n')
  sh(other, ['add', '-A'])
  sh(other, ['commit', '-m', 'from other'])
  sh(other, ['push', 'origin', 'main'])

  writeFileSync(join(dir, 'b.js'), 'two\n')
  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', { push: true })
  check('out-of-date: commit ok', result.ok === true && result.committed === true, result.ok)
  check('out-of-date: not pushed', result.pushed === false, result.pushed)
  check('out-of-date: classified', result.pushReason === 'out-of-date', `${result.pushReason} :: ${(result.pushDetail || '').slice(0, 90)}`)
  check('out-of-date: local commit kept', sh(dir, ['log', '-1', '--pretty=%s']).trim() === result.subject, sh(dir, ['log', '-1', '--pretty=%s']).trim())
  check('out-of-date: remote untouched', sh(bare, ['log', '-1', '--pretty=%s', 'main']).trim() === 'from other', sh(bare, ['log', '-1', '--pretty=%s', 'main']).trim())
  rmSync(base, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
