// Offline checks for the file-level operations: stage / unstage / discard /
// clean / resolve / undo-commit. Every case runs against a real temporary repo.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

function sh(cwd, args, allowFailure = false) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  } catch (error) {
    if (allowFailure) return `${error.stdout ?? ''}${error.stderr ?? ''}`
    throw error
  }
}

function makeRepo() {
  const base = mkdtempSync(join(tmpdir(), 'dshgit-ops-'))
  const dir = join(base, 'work')
  execFileSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  sh(dir, ['config', 'user.name', 'T'])
  sh(dir, ['config', 'user.email', 't@l'])
  writeFileSync(join(dir, 'a.js'), 'one\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'base'])
  return { base, dir }
}

async function ask(repoDir, path, method = 'GET', body = null) {
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
    // A Readable buffers its chunks, so a handler that starts reading after its
    // first await still receives the body (a bare EventEmitter would drop it).
    const req = new Readable({ read() {} })
    req.method = method
    req.url = path
    req.push(body === null ? '' : JSON.stringify(body))
    req.push(null)
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

const Q = '?session=s1'
// Windows git may check files out with CRLF (core.autocrlf), so compare text
// and porcelain output with line endings normalised.
const norm = (text) => String(text).replace(/\r\n/g, '\n')
const status = (dir) => norm(sh(dir, ['status', '--porcelain=v1'])).replace(/\n+$/, '')
const fileText = (dir, name) => norm(readFileSync(join(dir, name), 'utf8'))

// ── stage / unstage ──────────────────────────────────────────────────────
{
  const { base, dir } = makeRepo()
  writeFileSync(join(dir, 'a.js'), 'one\ntwo\n')
  writeFileSync(join(dir, 'b.js'), 'new\n')

  const staged = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { paths: ['a.js'] })
  check('stage: ok', staged.ok === true, staged.reason)
  check('stage: only the named file is staged', /^M  a\.js$/m.test(status(dir)), status(dir))
  check('stage: untracked left alone', /\?\? b\.js/.test(status(dir)), status(dir))

  const again = await ask(dir, `/dsh-git-bar/unstage${Q}`, 'POST', { paths: ['a.js'] })
  check('unstage: ok', again.ok === true, again.reason)
  check('unstage: back to unstaged', /^ M a\.js$/m.test(status(dir)), status(dir))

  const all = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { all: true })
  check('stage all: ok', all.ok === true && all.all === true, JSON.stringify(all))
  check('stage all: both files staged', /^A  b\.js$/m.test(status(dir)) && /^M  a\.js$/m.test(status(dir)), status(dir))

  const unstageNew = await ask(dir, `/dsh-git-bar/unstage${Q}`, 'POST', { paths: ['b.js'] })
  check('unstage: newly added file becomes untracked', unstageNew.ok === true && /\?\? b\.js/.test(status(dir)), `${unstageNew.ok}/${status(dir)}`)
  rmSync(base, { recursive: true, force: true })
}

// ── discard ──────────────────────────────────────────────────────────────
{
  const { base, dir } = makeRepo()
  writeFileSync(join(dir, 'a.js'), 'changed\n')
  const discarded = await ask(dir, `/dsh-git-bar/discard${Q}`, 'POST', { paths: ['a.js'] })
  check('discard: ok', discarded.ok === true, discarded.reason)
  check('discard: content restored', fileText(dir, 'a.js') === 'one\n', JSON.stringify(fileText(dir, 'a.js')))
  check('discard: tree clean', status(dir) === '', status(dir))

  writeFileSync(join(dir, 'c.js'), 'untracked\n')
  const untracked = await ask(dir, `/dsh-git-bar/discard${Q}`, 'POST', { paths: ['c.js'] })
  check('discard: untracked refused', untracked.ok === false && untracked.reason === 'untracked-needs-clean', `${untracked.ok}/${untracked.reason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── clean ────────────────────────────────────────────────────────────────
{
  const { base, dir } = makeRepo()
  writeFileSync(join(dir, 'junk.log'), 'x\n')
  const cleaned = await ask(dir, `/dsh-git-bar/clean${Q}`, 'POST', { paths: ['junk.log'] })
  check('clean: ok', cleaned.ok === true, cleaned.reason)
  check('clean: file removed from disk', !existsSync(join(dir, 'junk.log')), 'file still there')

  writeFileSync(join(dir, 'a.js'), 'changed\n')
  const tracked = await ask(dir, `/dsh-git-bar/clean${Q}`, 'POST', { paths: ['a.js'] })
  check('clean: tracked refused', tracked.ok === false && tracked.reason === 'tracked-needs-discard', `${tracked.ok}/${tracked.reason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── resolve ──────────────────────────────────────────────────────────────
function makeConflict() {
  const { base, dir } = makeRepo()
  sh(dir, ['checkout', '-b', 'side'])
  writeFileSync(join(dir, 'a.js'), 'side\n')
  sh(dir, ['commit', '-am', 'side'])
  sh(dir, ['checkout', 'main'])
  writeFileSync(join(dir, 'a.js'), 'main\n')
  sh(dir, ['commit', '-am', 'main'])
  sh(dir, ['merge', 'side'], true)
  return { base, dir }
}

{
  const { base, dir } = makeConflict()
  const notYet = await ask(dir, `/dsh-git-bar/resolve${Q}`, 'POST', { paths: ['a.js'] })
  check('resolve: side is required', notYet.ok === false && notYet.reason === 'missing-side', `${notYet.ok}/${notYet.reason}`)

  const ours = await ask(dir, `/dsh-git-bar/resolve${Q}`, 'POST', { paths: ['a.js'], side: 'ours' })
  check('resolve ours: ok', ours.ok === true && ours.side === 'ours', JSON.stringify(ours))
  check('resolve ours: content is ours', fileText(dir, 'a.js') === 'main\n', JSON.stringify(fileText(dir, 'a.js')))
  check('resolve ours: no conflict markers', !status(dir).startsWith('UU') && !/^U/.test(status(dir)), status(dir))
  check('resolve ours: ours matched HEAD so nothing is staged', !/a\.js/.test(status(dir)), status(dir))
  rmSync(base, { recursive: true, force: true })
}

{
  const { base, dir } = makeConflict()
  const theirs = await ask(dir, `/dsh-git-bar/resolve${Q}`, 'POST', { paths: ['a.js'], side: 'theirs' })
  check('resolve theirs: ok', theirs.ok === true, theirs.reason)
  check('resolve theirs: content is theirs', fileText(dir, 'a.js') === 'side\n', JSON.stringify(fileText(dir, 'a.js')))

  writeFileSync(join(dir, 'z.js'), 'z\n')
  const notConflicted = await ask(dir, `/dsh-git-bar/resolve${Q}`, 'POST', { paths: ['z.js'], side: 'ours' })
  check('resolve: non-conflicted refused', notConflicted.ok === false && notConflicted.reason === 'not-conflicted', `${notConflicted.ok}/${notConflicted.reason}`)
  rmSync(base, { recursive: true, force: true })
}

// ── undo-commit ──────────────────────────────────────────────────────────
{
  const { base, dir } = makeRepo()
  writeFileSync(join(dir, 'b.js'), 'b\n')
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '-m', 'second commit'])
  const before = sh(dir, ['rev-list', '--count', 'HEAD']).trim()
  const undone = await ask(dir, `/dsh-git-bar/undo-commit${Q}`, 'POST', {})
  check('undo: ok', undone.ok === true, undone.reason)
  check('undo: commit removed', sh(dir, ['rev-list', '--count', 'HEAD']).trim() === String(Number(before) - 1), sh(dir, ['rev-list', '--count', 'HEAD']).trim())
  check('undo: subject reported', undone.undone === 'second commit', undone.undone)
  check('undo: changes kept staged', /^A  b\.js$/m.test(status(dir)), status(dir))
  rmSync(base, { recursive: true, force: true })

  const single = makeRepo()
  const refused = await ask(single.dir, `/dsh-git-bar/undo-commit${Q}`, 'POST', {})
  check('undo: single commit refused', refused.ok === false && refused.reason === 'no-previous-commit', `${refused.ok}/${refused.reason}`)
  rmSync(single.base, { recursive: true, force: true })
}

// ── guards ───────────────────────────────────────────────────────────────
{
  const { base, dir } = makeRepo()
  writeFileSync(join(dir, 'a.js'), 'changed\n')
  const traversal = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { paths: ['../outside.js'] })
  check('paths: traversal refused', traversal.ok === false && traversal.reason === 'missing-paths', `${traversal.ok}/${traversal.reason}`)
  const absolute = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { paths: ['C:\\Windows\\win.ini'] })
  check('paths: absolute refused', absolute.ok === false && absolute.reason === 'missing-paths', `${absolute.ok}/${absolute.reason}`)
  const dash = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { paths: ['-f'] })
  check('paths: dash-prefixed refused', dash.ok === false && dash.reason === 'missing-paths', `${dash.ok}/${dash.reason}`)
  const empty = await ask(dir, `/dsh-git-bar/stage${Q}`, 'POST', { paths: [] })
  check('paths: empty refused', empty.ok === false && empty.reason === 'missing-paths', `${empty.ok}/${empty.reason}`)
  const wrongMethod = await ask(dir, `/dsh-git-bar/stage${Q}`, 'GET', null)
  check('stage: GET refused', wrongMethod.reason === 'method-not-allowed', wrongMethod.reason)
  rmSync(base, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
