// Offline checks for the reworked commit panel contract:
// custom message, commit-only, detached-HEAD branch creation and one-shot creds.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readdirSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { apply, createAskpass } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

function sh(cwd, args, options = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (error) {
    if (options.ignoreFailure) return String(error.stdout ?? '')
    if (options.allowFailure) return `FAILED: ${(error.stderr || '').trim()}`
    throw error
  }
}

function makeRepo(withBareRemote) {
  const base = mkdtempSync(join(tmpdir(), 'dshgit-panel-'))
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
      if (body !== null) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      req.emit('end')
    })
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

const POST = '/dsh-git-bar/auto-commit?session=s1'

// ── 1. custom message, commit only ───────────────────────────────────────
{
  const { base, dir, bare } = makeRepo(true)
  sh(dir, ['push', '-u', 'origin', 'main'])
  const remoteBefore = sh(bare, ['rev-parse', 'main']).trim()
  writeFileSync(join(dir, 'b.js'), 'two\n')

  const result = await askWith(dir, POST, 'POST', { message: 'feat: keep it short\n\nlonger body line', push: false })
  check('message: ok', result.ok === true, result.reason)
  check('message: custom subject', result.subject === 'feat: keep it short', result.subject)
  check('message: body kept', /longer body line/.test(result.message || ''), result.message)
  check('message: git body matches', sh(dir, ['log', '-1', '--pretty=%B']).replace(/\n+$/, '') === 'feat: keep it short\n\nlonger body line', JSON.stringify(sh(dir, ['log', '-1', '--pretty=%B'])))
  check('message: commit-only skips push', result.pushed === false && result.skipped === true, `${result.pushed}/${result.skipped}`)
  check('message: remote untouched', sh(bare, ['rev-parse', 'main']).trim() === remoteBefore, 'bare main')
  rmSync(base, { recursive: true, force: true })
}

// ── 2. empty message falls back to the generated subject ─────────────────
{
  const { base, dir } = makeRepo(false)
  writeFileSync(join(dir, 'b.js'), 'two\n')
  const result = await askWith(dir, POST, 'POST', { message: '   ', push: false })
  check('generated: ok', result.ok === true, result.reason)
  check('generated: subject', /^chore: auto-commit 1 file$/.test(result.subject || ''), result.subject)
  rmSync(base, { recursive: true, force: true })
}

// ── 3. detached HEAD needs a branch name, then creates it ────────────────
{
  const { base, dir } = makeRepo(false)
  const mainTip = sh(dir, ['rev-parse', 'main']).trim()
  sh(dir, ['checkout', '--detach', 'HEAD'])
  writeFileSync(join(dir, 'c.js'), 'three\n')

  const refused = await askWith(dir, POST, 'POST', { push: false })
  check('detached: needs branch', refused.ok === false && refused.reason === 'detached' && refused.needsBranch === true, `${refused.reason}/${refused.needsBranch}`)

  const existing = await askWith(dir, POST, 'POST', { branch: 'main', push: false })
  check('detached: existing branch refused', existing.ok === false && existing.reason === 'branch-exists', existing.reason)

  const invalid = await askWith(dir, POST, 'POST', { branch: 'bad name', push: false })
  check('detached: invalid branch refused', invalid.ok === false && invalid.reason === 'invalid-branch', invalid.reason)

  const result = await askWith(dir, POST, 'POST', { branch: 'wip/test-one', push: false, message: 'wip: detached work' })
  check('detached: created branch', result.ok === true && result.createdBranch === 'wip/test-one', `${result.ok}/${result.createdBranch}`)
  check('detached: head moved to the new branch', sh(dir, ['symbolic-ref', '--short', 'HEAD']).trim() === 'wip/test-one', sh(dir, ['symbolic-ref', '--short', 'HEAD']).trim())
  check('detached: original branch untouched', sh(dir, ['rev-parse', 'main']).trim() === mainTip, 'main tip')
  check('detached: commit landed on the new branch', sh(dir, ['log', '-1', '--pretty=%s', 'wip/test-one']).trim() === 'wip: detached work', sh(dir, ['log', '-1', '--pretty=%s', 'wip/test-one']).trim())
  check('detached: working tree clean after', sh(dir, ['status', '--porcelain=v1']).trim() === '', JSON.stringify(sh(dir, ['status', '--porcelain=v1'])))
  rmSync(base, { recursive: true, force: true })
}

// ── 4. /push route: success, out-of-date, no-remote ──────────────────────
{
  const { base, dir, bare } = makeRepo(true)
  sh(dir, ['push', '-u', 'origin', 'main'])
  const okPush = await askWith(dir, '/dsh-git-bar/push?session=s1', 'POST', {})
  check('push route: up-to-date ok', okPush.ok === true && okPush.pushed === true, JSON.stringify(okPush).slice(0, 120))

  const other = join(base, 'other')
  execFileSync('git', ['clone', '-b', 'main', bare, other], { encoding: 'utf8' })
  sh(other, ['config', 'user.name', 'O'])
  sh(other, ['config', 'user.email', 'o@l'])
  writeFileSync(join(other, 'z.js'), 'z\n')
  sh(other, ['add', '-A'])
  sh(other, ['commit', '-m', 'other'])
  sh(other, ['push', 'origin', 'main'])
  const behind = await askWith(dir, '/dsh-git-bar/push?session=s1', 'POST', {})
  check('push route: out-of-date', behind.ok === false && behind.reason === 'out-of-date', `${behind.ok}/${behind.reason}`)

  const bareless = makeRepo(false)
  const noRemote = await askWith(bareless.dir, '/dsh-git-bar/push?session=s1', 'POST', {})
  check('push route: no-remote', noRemote.ok === false && noRemote.reason === 'no-remote', `${noRemote.ok}/${noRemote.reason}`)
  rmSync(base, { recursive: true, force: true })
  rmSync(bareless.base, { recursive: true, force: true })
}

// ── 5. credentials: helper shape, special chars, cleanup ─────────────────
{
  const helper = await createAskpass({ username: 'alice', password: 's3cr&t|x%! "q"' })
  check('askpass: created', typeof helper.path === 'string' && helper.path.length > 0, helper.path)
  const filled = spawnSync('git', ['-c', 'credential.helper=', 'credential', 'fill'], {
    input: 'protocol=https\nhost=example.com\n\n',
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GIT_ASKPASS: helper.path,
      SSH_ASKPASS: helper.path,
      SSH_ASKPASS_REQUIRE: 'force',
    },
  })
  const out = String(filled.stdout || '')
  check('askpass: git filled username', /username=alice/.test(out), out.replace(/\n/g, ' | ').slice(0, 160))
  check('askpass: git filled password verbatim', /password=s3cr&t\|x%! "q"/.test(out), out.replace(/\n/g, ' | ').slice(0, 160))
  rmSync(helper.dir, { recursive: true, force: true })

  const before = readdirSync(tmpdir()).filter((name) => name.startsWith(`dsh-git-bar-askpass-${process.pid}-`)).length
  const { base, dir } = makeRepo(true)
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'second'], { allowFailure: true })
  writeFileSync(join(dir, 'c.js'), 'three\n')
  sh(dir, ['remote', 'set-url', 'origin', join(base, 'missing.git')])
  const failing = await askWith(dir, POST, 'POST', { push: true, password: 'not-a-real-token', username: 'alice' })
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith(`dsh-git-bar-askpass-${process.pid}-`)).length
  check('askpass: push failed as expected', failing.ok === true && failing.pushed === false, `${failing.ok}/${failing.pushed}`)
  check('askpass: temp directory removed', after === before, `${before} -> ${after}`)
  rmSync(base, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
