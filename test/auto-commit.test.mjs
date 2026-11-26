// Strip a half-populated GIT_CONFIG_* environment (the desktop process can export GIT_CONFIG_COUNT
// without the matching keys, which breaks every git child).
for (const key of Object.keys(process.env)) {
  if (key === 'GIT_CONFIG_COUNT' || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) delete process.env[key]
}

// Offline checks for POST /dsh-git-bar/auto-commit (Host half, index.js).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { apply } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'dshgit-commit-'))
  const run = (args, ignoreFailure = false) => {
    try {
      return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    } catch (error) {
      if (ignoreFailure) return String(error.stdout ?? '')
      throw error
    }
  }
  run(['init', '-b', 'main'])
  run(['config', 'user.name', 'T'])
  run(['config', 'user.email', 't@l'])
  return { dir, run }
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

// 鈹€鈹€ 1. dirty working tree: modified + untracked 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
{
  const { dir, run } = makeRepo()
  writeFileSync(join(dir, 'a.js'), 'one\n')
  run(['add', '-A'])
  run(['commit', '-m', 'base'])
  writeFileSync(join(dir, 'a.js'), 'one\ntwo\n')
  writeFileSync(join(dir, 'b.js'), 'new\n')

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('dirty: ok', result.ok === true, JSON.stringify(result))
  check('dirty: two files', result.files === 2, result.files)
  check('dirty: subject', /^chore: auto-commit 2 files$/.test(result.subject || ''), result.subject)
  check('dirty: short hash', /^[0-9a-f]{7,}$/.test(result.short || ''), result.short)
  check('dirty: message lists paths', /a\.js/.test(result.message || '') && /b\.js/.test(result.message || ''), result.message)
  check('dirty: real commit subject', run(['log', '-1', '--pretty=%s']).trim() === result.subject, run(['log', '-1', '--pretty=%s']).trim())

  const after = await askWith(dir, '/dsh-git-bar/state?session=s1')
  check('dirty: tree clean afterwards', after.ok === true && after.counts.all === 0, after.counts && after.counts.all)
  check('dirty: workspace commits only, none pushed', run(['rev-list', '--count', 'HEAD']).trim() === '2', run(['rev-list', '--count', 'HEAD']).trim())

  // 鈹€鈹€ 2. clean tree 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const again = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('clean: nothing-to-commit', again.ok === false && again.reason === 'nothing-to-commit', again.reason)
  rmSync(dir, { recursive: true, force: true })
}

// 鈹€鈹€ 3. docs-only change gets a docs: subject 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
{
  const { dir, run } = makeRepo()
  writeFileSync(join(dir, 'base.txt'), 'x\n')
  run(['add', '-A'])
  run(['commit', '-m', 'base'])
  writeFileSync(join(dir, 'README.md'), '# readme\n')
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'guide.md'), 'guide\n')

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('docs: ok', result.ok === true, JSON.stringify(result))
  check('docs: docs subject', /^docs: auto-commit 2 files$/.test(result.subject || ''), result.subject)
  rmSync(dir, { recursive: true, force: true })
}

// 鈹€鈹€ 4. conflicted tree is refused 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
{
  const { dir, run } = makeRepo()
  writeFileSync(join(dir, 'c.txt'), 'base\n')
  run(['add', '-A'])
  run(['commit', '-m', 'base'])
  run(['checkout', '-b', 'side'])
  writeFileSync(join(dir, 'c.txt'), 'side\n')
  run(['add', '-A'])
  run(['commit', '-m', 'side'])
  run(['checkout', 'main'])
  writeFileSync(join(dir, 'c.txt'), 'main\n')
  run(['add', '-A'])
  run(['commit', '-m', 'main'])
  run(['merge', 'side'], true)

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('conflict: refused', result.ok === false && result.reason === 'conflicted', result.reason)
  check('conflict: names the file', /c\.txt/.test(result.detail || ''), result.detail)
  check('conflict: no commit created', run(['rev-list', '--count', 'HEAD']).trim() === '2', run(['rev-list', '--count', 'HEAD']).trim())
  rmSync(dir, { recursive: true, force: true })
}

// 鈹€鈹€ 5. detached HEAD is refused 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
{
  const { dir, run } = makeRepo()
  writeFileSync(join(dir, 'd.txt'), 'one\n')
  run(['add', '-A'])
  run(['commit', '-m', 'base'])
  run(['checkout', '--detach', 'HEAD'])
  writeFileSync(join(dir, 'd.txt'), 'two\n')

  const result = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('detached: refused', result.ok === false && result.reason === 'detached', result.reason)
  rmSync(dir, { recursive: true, force: true })
}

// 鈹€鈹€ 6. method + repository guards 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
{
  const { dir } = makeRepo()
  const wrongMethod = await askWith(dir, '/dsh-git-bar/auto-commit?session=s1', 'GET', null)
  check('GET: method-not-allowed', wrongMethod.reason === 'method-not-allowed', wrongMethod.reason)

  const outside = mkdtempSync(join(tmpdir(), 'dshgit-norepo-'))
  const noRepo = await askWith(join(outside, '..'), '/dsh-git-bar/auto-commit?session=s1', 'POST', {})
  check('non-repo: not-a-repository', noRepo.ok === false && noRepo.reason === 'not-a-repository', noRepo.reason)
  rmSync(dir, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
