// Offline checks for the GitHub half of the Host routes (index.js).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { apply, githubIdentityArgs, githubRewriteArgs, parseGithubRepo } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const dataDir = mkdtempSync(join(tmpdir(), 'dshgit-gh-data-'))
process.env.DSH_GIT_BAR_DATA_DIR = dataDir
process.env.GIT_TERMINAL_PROMPT = '0'

// ── mocked GitHub API ────────────────────────────────────────────────────
const realFetch = globalThis.fetch
let fetchQueue = []
const queued = (handler) => fetchQueue.push(handler)
const respond = (body, init = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-oauth-scopes': 'repo, read:user', ...(init.headers ?? {}) },
  })
globalThis.fetch = async (url, init) => {
  const handler = fetchQueue.shift()
  if (!handler) throw new Error(`unexpected fetch: ${String(url)}`)
  return handler(String(url), init ?? {})
}

// ── fake git repositories ────────────────────────────────────────────────
function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'dshgit-gh-repo-'))
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.name', 'T'])
  git(dir, ['config', 'user.email', 't@local.invalid'])
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-m', 'base'])
  return dir
}

function makeBare() {
  const source = makeRepo()
  const bare = mkdtempSync(join(tmpdir(), 'dshgit-gh-bare-'))
  git(bare, ['init', '--bare', '-b', 'main'])
  git(source, ['push', '--quiet', '--', bare, 'main'])
  return { bare, source }
}

// ── route caller ─────────────────────────────────────────────────────────
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

const repo = makeRepo()
const USER = {
  login: 'octo',
  id: 42,
  name: 'Octo Cat',
  avatar_url: 'https://avatars.example/octo.png',
  html_url: 'https://github.com/octo',
  email: 'octo@example.com',
}
const TOKEN = 'ghp_secret_token_value'

// ── 1. pure helpers ──────────────────────────────────────────────────────
check('repo spec: owner/name', JSON.stringify(parseGithubRepo('octo/alpha')) === JSON.stringify({ kind: 'github', owner: 'octo', name: 'alpha' }), JSON.stringify(parseGithubRepo('octo/alpha')))
check('repo spec: github.com prefix', parseGithubRepo('github.com/octo/alpha.git')?.kind === 'github', 'prefix')
check('repo spec: https url passes through', parseGithubRepo('https://github.com/octo/alpha').kind === 'url', 'url')
check('repo spec: ssh url passes through', parseGithubRepo('git@github.com:octo/alpha.git').kind === 'url', 'ssh')
check('repo spec: rejects garbage', parseGithubRepo('not a repo') === null && parseGithubRepo('') === null, 'garbage')
check('identity: name + noreply email', JSON.stringify(githubIdentityArgs(USER)) === JSON.stringify(['-c', 'user.name=Octo Cat', '-c', 'user.email=42+octo@users.noreply.github.com']), JSON.stringify(githubIdentityArgs(USER)))
check('identity: empty without account', githubIdentityArgs(null).length === 0, 'empty')
check('rewrite: ssh remote gets https rewrite', githubRewriteArgs('git@github.com:octo/alpha.git').length === 4, githubRewriteArgs('git@github.com:octo/alpha.git').length)
check('rewrite: ssh:// form supported', githubRewriteArgs('ssh://git@github.com/octo/alpha.git').length === 4, 'ssh://')
check('rewrite: https remote untouched', githubRewriteArgs('https://github.com/octo/alpha.git').length === 0, 'https')

// ── 2. signed out status ─────────────────────────────────────────────────
{
  const status = await ask(repo, '/dsh-git-bar/github/status')
  check('status: signed out', status.ok === true && status.signedIn === false && status.account === null, JSON.stringify(status))
  check('status: default clone root', /dsh-workspaces$/.test(status.config.cloneRoot), status.config.cloneRoot)
  check('status: identity defaults on', status.config.useGithubIdentity === true, String(status.config.useGithubIdentity))
}

// ── 3. login with a personal access token ────────────────────────────────
{
  queued(() => respond(USER))
  const login = await ask(repo, '/dsh-git-bar/github/login', 'POST', { token: TOKEN })
  check('login: signed in', login.ok === true && login.signedIn === true && login.account.login === 'octo', JSON.stringify(login))
  check('login: token kind pat', login.tokenKind === 'pat', login.tokenKind)
  check('login: scopes reported', Array.isArray(login.scopes) && login.scopes.includes('repo'), JSON.stringify(login.scopes))
  check('login: token never echoed', !JSON.stringify(login).includes(TOKEN), 'token leaked')

  const status = await ask(repo, '/dsh-git-bar/github/status')
  check('status: still signed in, token absent', status.signedIn === true && !JSON.stringify(status).includes(TOKEN), 'leak')
}

// ── 4. repositories ──────────────────────────────────────────────────────
{
  queued(() =>
    respond([
      { full_name: 'octo/alpha', name: 'alpha', owner: { login: 'octo' }, private: false, default_branch: 'main', description: 'Alpha project', updated_at: '2026-01-01T00:00:00Z', clone_url: 'https://github.com/octo/alpha.git' },
      { full_name: 'octo/beta', name: 'beta', owner: { login: 'octo' }, private: true, default_branch: 'trunk', description: 'Beta service', updated_at: '2026-01-02T00:00:00Z', clone_url: 'https://github.com/octo/beta.git' },
    ]),
  )
  const all = await ask(repo, '/dsh-git-bar/github/repos')
  check('repos: two rows', all.ok === true && all.repos.length === 2, all.repos?.length)
  check('repos: mapped fields', all.repos[1].fullName === 'octo/beta' && all.repos[1].private === true && all.repos[1].defaultBranch === 'trunk', JSON.stringify(all.repos[1]))

  queued(() => respond([{ full_name: 'octo/alpha', name: 'alpha', owner: { login: 'octo' }, private: false, default_branch: 'main', description: '', updated_at: '', clone_url: '' }]))
  const filtered = await ask(repo, '/dsh-git-bar/github/repos?q=ALPHA')
  check('repos: query filters', filtered.repos.length === 1 && filtered.repos[0].fullName === 'octo/alpha', filtered.repos.length)
}

// ── 5. clone into a fresh folder ─────────────────────────────────────────
{
  const { bare } = makeBare()
  const root = mkdtempSync(join(tmpdir(), 'dshgit-gh-clone-'))
  const first = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: `file://${bare.replace(/\\/g, '/')}`, root })
  check('clone: ok', first.ok === true, JSON.stringify(first))
  check('clone: directory exists', first.ok === true && existsSync(join(first.path, '.git')), String(first.path))
  check('clone: branch resolved', typeof first.branch === 'string' && first.branch !== '', String(first.branch))

  const again = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: `file://${bare.replace(/\\/g, '/')}`, root })
  check('clone: refuses a non-empty destination', again.ok === false && again.reason === 'target-exists', JSON.stringify(again))

  const bad = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: '%%%', root })
  check('clone: bad spec', bad.ok === false && bad.reason === 'bad-repo', JSON.stringify(bad))
}

// ── 6. config patch ──────────────────────────────────────────────────────
{
  const cloneRoot = mkdtempSync(join(tmpdir(), 'dshgit-gh-root-'))
  const patched = await ask(repo, '/dsh-git-bar/github/config', 'POST', {
    cloneRoot,
    deviceClientId: 'Iv1abcDEF234567',
    useGithubIdentity: false,
  })
  check('config: patched', patched.ok === true && patched.config.cloneRoot === cloneRoot && patched.config.useGithubIdentity === false, JSON.stringify(patched.config))
  const invalid = await ask(repo, '/dsh-git-bar/github/config', 'POST', { deviceClientId: 'not a client id' })
  check('config: invalid client id refused', invalid.ok === false && invalid.reason === 'invalid-config', JSON.stringify(invalid))
  // Leave a clean slate for the device-flow checks below.
  await ask(repo, '/dsh-git-bar/github/config', 'POST', { deviceClientId: '', useGithubIdentity: true })
}

// ── 7. device flow: pending, then approved ───────────────────────────────
{
  const missing = await ask(repo, '/dsh-git-bar/github/device/start', 'POST', {})
  check('device: needs a client id', missing.ok === false && missing.reason === 'missing-client-id', JSON.stringify(missing))

  await ask(repo, '/dsh-git-bar/github/config', 'POST', { deviceClientId: 'Iv1device0001' })
  queued(() =>
    respond({ device_code: 'device_secret', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 }),
  )
  const started = await ask(repo, '/dsh-git-bar/github/device/start', 'POST', {})
  check('device: start returns a code', started.ok === true && started.userCode === 'ABCD-1234', JSON.stringify(started))
  check('device: device secret stays host-side', !JSON.stringify(started).includes('device_secret'), 'leak')
  check('device: verification uri', started.verificationUri === 'https://github.com/login/device', started.verificationUri)

  const gated = await ask(repo, '/dsh-git-bar/github/device/poll', 'POST', { id: started.id })
  check('device: poll is rate limited', gated.ok === true && gated.state === 'pending' && gated.retryAfter >= 1, JSON.stringify(gated))

  await sleep(1100)
  queued(() => respond({ error: 'authorization_pending' }))
  const pending = await ask(repo, '/dsh-git-bar/github/device/poll', 'POST', { id: started.id })
  check('device: pending state', pending.ok === true && pending.state === 'pending', JSON.stringify(pending))

  await sleep(1100)
  queued(() => respond({ access_token: 'gho_device_token' }))
  queued(() => respond(USER))
  const done = await ask(repo, '/dsh-git-bar/github/device/poll', 'POST', { id: started.id })
  check('device: approved', done.ok === true && done.state === 'done' && done.account.login === 'octo', JSON.stringify(done))
  check('device: token never echoed', !JSON.stringify(done).includes('gho_device_token'), 'leak')

  const status = await ask(repo, '/dsh-git-bar/github/status')
  check('device: grant stored as device token', status.tokenKind === 'device' && status.signedIn === true, JSON.stringify(status.tokenKind))

  const unknown = await ask(repo, '/dsh-git-bar/github/device/poll', 'POST', { id: 'nope' })
  check('device: unknown flow', unknown.ok === false && unknown.reason === 'unknown-flow', JSON.stringify(unknown))
}

// ── 8. commits use the signed-in identity ────────────────────────────────
{
  writeFileSync(join(repo, 'b.txt'), 'two\n')
  const committed = await ask(repo, '/dsh-git-bar/auto-commit?session=s1', 'POST', { message: 'feat: from github identity' })
  check('identity: commit ok', committed.ok === true && committed.committed === true, JSON.stringify(committed))
  check('identity: author name', git(repo, ['log', '-1', '--pretty=%an']).trim() === 'Octo Cat', git(repo, ['log', '-1', '--pretty=%an']).trim())
  check('identity: author email', git(repo, ['log', '-1', '--pretty=%ae']).trim() === '42+octo@users.noreply.github.com', git(repo, ['log', '-1', '--pretty=%ae']).trim())

  await ask(repo, '/dsh-git-bar/github/config', 'POST', { useGithubIdentity: false })
  writeFileSync(join(repo, 'c.txt'), 'three\n')
  const plain = await ask(repo, '/dsh-git-bar/auto-commit?session=s1', 'POST', { message: 'chore: local identity' })
  check('identity: switch off keeps local config', plain.ok === true && git(repo, ['log', '-1', '--pretty=%an']).trim() === 'T', git(repo, ['log', '-1', '--pretty=%an']).trim())
  await ask(repo, '/dsh-git-bar/github/config', 'POST', { useGithubIdentity: true })
}

// ── 9. push uses the token ───────────────────────────────────────────────
{
  const bare = mkdtempSync(join(tmpdir(), 'dshgit-gh-bare2-'))
  git(bare, ['init', '--bare', '-b', 'main'])
  const work = makeRepo()
  git(work, ['remote', 'add', 'origin', bare])
  git(work, ['push', '--quiet', '--set-upstream', 'origin', 'main'])
  writeFileSync(join(work, 'd.txt'), 'four\n')
  const committed = await ask(work, '/dsh-git-bar/auto-commit?session=s1', 'POST', { message: 'feat: push with token', push: true })
  check('push: commit + push ok', committed.ok === true && committed.pushed === true, JSON.stringify(committed))
  check('push: no credential prompt needed', committed.needsCredentials === false, String(committed.needsCredentials))
  check('push: remote received the commit', git(bare, ['log', '-1', '--pretty=%s']).trim() === 'feat: push with token', git(bare, ['log', '-1', '--pretty=%s']).trim())

  const pushOnly = await ask(work, '/dsh-git-bar/push?session=s1', 'POST', {})
  check('push: standalone route', pushOnly.ok === true && pushOnly.pushed === true, JSON.stringify(pushOnly))
}

// ── 10. logout clears the grant ──────────────────────────────────────────
{
  const out = await ask(repo, '/dsh-git-bar/github/logout', 'POST', {})
  check('logout: ok', out.ok === true, JSON.stringify(out))
  const status = await ask(repo, '/dsh-git-bar/github/status')
  check('logout: signed out', status.signedIn === false && status.account === null, JSON.stringify(status))

  const cloneWithout = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: 'octo/alpha' })
  check('clone: refuses when signed out', cloneWithout.ok === false && cloneWithout.reason === 'not-signed-in', JSON.stringify(cloneWithout))
  const reposWithout = await ask(repo, '/dsh-git-bar/github/repos')
  check('repos: refuses when signed out', reposWithout.ok === false && reposWithout.reason === 'not-signed-in', JSON.stringify(reposWithout))
}

// ── 11. bad credentials are rejected ─────────────────────────────────────
{
  queued(() => respond({ message: 'Bad credentials' }, { status: 401 }))
  const bad = await ask(repo, '/dsh-git-bar/github/login', 'POST', { token: 'nope' })
  check('login: bad token rejected', bad.ok === false && bad.reason === 'bad-credentials', JSON.stringify(bad))
  const missing = await ask(repo, '/dsh-git-bar/github/login', 'POST', {})
  check('login: missing token', missing.ok === false && missing.reason === 'missing-token', JSON.stringify(missing))
  const wrongMethod = await ask(repo, '/dsh-git-bar/github/logout', 'GET', null)
  check('route: method guard', wrongMethod.ok === false && wrongMethod.reason === 'method-not-allowed', JSON.stringify(wrongMethod))
}

globalThis.fetch = realFetch
rmSync(dataDir, { recursive: true, force: true })
delete process.env.DSH_GIT_BAR_DATA_DIR

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((entry) => entry.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
