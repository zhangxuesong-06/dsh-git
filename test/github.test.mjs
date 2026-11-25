// Offline checks for the GitHub half of the Host routes (index.js).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import {
  apply,
  githubIdentityArgs,
  githubRewriteArgs,
  gitProxyArgs,
  gitTransportAttempts,
  isTransportFailure,
  parseGithubRepo,
  parseProxyResult,
  resolveDeviceClientId,
} from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const dataDir = mkdtempSync(join(tmpdir(), 'dshgit-gh-data-'))
process.env.DSH_GIT_BAR_DATA_DIR = dataDir
process.env.GIT_TERMINAL_PROMPT = '0'
// Deterministic networking: never inherit the machine's proxy in the unit run.
process.env.DSH_GIT_BAR_HTTP_PROXY = 'none'
// Stand in for the OAuth App the project ships, so the browser flow is
// exercisable without the real client id.
const SHIPPED_CLIENT_ID = 'Iv1shippedAppClient01'
process.env.DSH_GIT_BAR_OAUTH_CLIENT_ID = SHIPPED_CLIENT_ID

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
check('repo spec: https github url keeps owner/name', JSON.stringify(parseGithubRepo('https://github.com/octo/alpha.git')) === JSON.stringify({ kind: 'github', owner: 'octo', name: 'alpha' }), JSON.stringify(parseGithubRepo('https://github.com/octo/alpha.git')))
check('repo spec: ssh github url keeps owner/name', JSON.stringify(parseGithubRepo('git@github.com:octo/alpha.git')) === JSON.stringify({ kind: 'github', owner: 'octo', name: 'alpha' }), JSON.stringify(parseGithubRepo('git@github.com:octo/alpha.git')))
check('repo spec: ssh:// github url keeps owner/name', parseGithubRepo('ssh://git@github.com/octo/alpha.git')?.kind === 'github', 'ssh://')
check('repo spec: foreign url passes through', parseGithubRepo('https://gitlab.com/group/project.git')?.kind === 'url', 'gitlab')
check('repo spec: foreign ssh url passes through', parseGithubRepo('git@bitbucket.org:team/repo.git')?.kind === 'url', 'bitbucket')
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

  const fileUrl = `file://${bare.replace(/\\/g, '/')}`
  const again = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: fileUrl, root })
  check('clone: a second clone picks a free folder', again.ok === true && again.folder === `${first.folder}-2`, JSON.stringify(again.folder))

  const clash = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: fileUrl, root, folder: first.folder })
  check('clone: refuses a non-empty destination', clash.ok === false && clash.reason === 'target-exists', JSON.stringify(clash))

  const bad = await ask(repo, '/dsh-git-bar/github/clone', 'POST', { repo: '%%%', root })
  check('clone: bad spec', bad.ok === false && bad.reason === 'bad-repo', JSON.stringify(bad))
}

// ── 5b. background clone reports progress and outlives the request ───────
{
  const { bare } = makeBare()
  const root = mkdtempSync(join(tmpdir(), 'dshgit-gh-bg-'))
  const started = await ask(repo, '/dsh-git-bar/github/clone', 'POST', {
    repo: `file://${bare.replace(/\\/g, '/')}`,
    root,
    background: true,
  })
  check('clone job: accepted', started.ok === true && typeof started.id === 'string', JSON.stringify(started))

  let snapshot = started
  for (let attempt = 0; attempt < 80 && snapshot.state !== 'done' && snapshot.state !== 'failed'; attempt += 1) {
    await sleep(250)
    snapshot = await ask(repo, `/dsh-git-bar/github/clone/status?id=${started.id}`)
  }
  check('clone job: finishes', snapshot.state === 'done', JSON.stringify(snapshot))
  check('clone job: path reported', snapshot.path !== '' && existsSync(join(snapshot.path, '.git')), String(snapshot.path))
  check('clone job: result ok', snapshot.result && snapshot.result.ok === true && snapshot.percent === 100, JSON.stringify(snapshot.result))

  const missing = await ask(repo, '/dsh-git-bar/github/clone', 'POST', {
    repo: `file://${root.replace(/\\/g, '/')}/does-not-exist.git`,
    root: mkdtempSync(join(tmpdir(), 'dshgit-gh-bg2-')),
    background: true,
  })
  let failed = missing
  for (let attempt = 0; attempt < 80 && failed.state !== 'done' && failed.state !== 'failed'; attempt += 1) {
    await sleep(250)
    failed = await ask(repo, `/dsh-git-bar/github/clone/status?id=${missing.id}`)
  }
  check('clone job: failure is reported', failed.state === 'failed' && failed.reason !== '', JSON.stringify(failed))

  const unknown = await ask(repo, '/dsh-git-bar/github/clone/status?id=nope')
  check('clone job: unknown id', unknown.ok === false && unknown.reason === 'unknown-job', JSON.stringify(unknown))
}

// ── 5c. clone preview names the destination before cloning ───────────────
{
  const previewRoot = mkdtempSync(join(tmpdir(), 'dshgit-gh-preview-'))
  const preview = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: 'octo/alpha', root: previewRoot })
  check('preview: defaults to the bare repository name', preview.ok === true && preview.folder === 'alpha' && preview.path === join(previewRoot, 'alpha'), JSON.stringify(preview))
  check('preview: not occupied yet', preview.exists === false, String(preview.exists))
  check('preview: reports the sign-in state', preview.signedIn === true, String(preview.signedIn))

  const custom = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: 'octo/alpha', root: previewRoot, folder: '我的 项目' })
  check('preview: custom folder wins', custom.ok === true && custom.folder === '我的 项目' && custom.folderIsCustom === true && custom.path === join(previewRoot, '我的 项目'), JSON.stringify(custom))

  const unsafe = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: 'octo/alpha', root: previewRoot, folder: '../escape' })
  check('preview: unsafe folder is sanitised', unsafe.ok === true && unsafe.folder === '-escape' && unsafe.path === join(previewRoot, '-escape'), JSON.stringify(unsafe.folder))

  mkdirSync(join(previewRoot, 'alpha'))
  writeFileSync(join(previewRoot, 'alpha', 'README.md'), 'x\n')
  const occupied = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: 'octo/alpha', root: previewRoot })
  check('preview: occupied destination gets a free suffix', occupied.exists === false && occupied.folder === 'alpha-2', JSON.stringify(occupied.folder))

  const forced = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: 'octo/alpha', root: previewRoot, folder: 'alpha' })
  check('preview: explicit occupied folder is flagged', forced.exists === true && forced.folder === 'alpha', JSON.stringify(forced.folder))

  const foreign = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', {
    repo: 'https://gitlab.com/group/project.git',
    root: previewRoot,
  })
  check('preview: foreign url gets a folder', foreign.ok === true && foreign.folder === 'project' && foreign.kind === 'url', JSON.stringify(foreign))

  const badPreview = await ask(repo, '/dsh-git-bar/github/clone/preview', 'POST', { repo: '%%%' })
  check('preview: bad spec', badPreview.ok === false && badPreview.reason === 'bad-repo', JSON.stringify(badPreview))
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

// ── 6b. the shipped app is always available, and its chain is pure ───────
{
  const shipped = await ask(repo, '/dsh-git-bar/github/status')
  check('device: shipped app always available', shipped.device.ready === true && shipped.device.shipped === true, JSON.stringify(shipped.device))

  check('device chain: profile app wins', resolveDeviceClientId('Iv1own', 'Iv1env', 'Iv1ship') === 'Iv1own', 'config')
  check('device chain: env overrides the shipped app', resolveDeviceClientId('', 'Iv1env', 'Iv1ship') === 'Iv1env', 'env')
  check('device chain: shipped app is the last resort', resolveDeviceClientId('', '', 'Iv1ship') === 'Iv1ship', 'shipped')
  check('device chain: no app at all', resolveDeviceClientId('', '', '') === '', 'empty')
  check('device chain: whitespace is empty', resolveDeviceClientId('  ', '  ', '  ') === '', 'whitespace')

  delete process.env.DSH_GIT_BAR_OAUTH_CLIENT_ID
  let seenBody = ''
  queued((url, init) => {
    seenBody = String(init.body ?? '')
    return respond({ device_code: 'device_secret_baked', user_code: 'BAKE-0001', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
  })
  const baked = await ask(repo, '/dsh-git-bar/github/device/start', 'POST', {})
  check('device: baked app starts the flow', baked.ok === true && baked.userCode === 'BAKE-0001', JSON.stringify(baked))
  check('device: baked client id sent', /client_id=[A-Za-z0-9]+/.test(seenBody) && !seenBody.includes(SHIPPED_CLIENT_ID), seenBody.slice(0, 120))
  process.env.DSH_GIT_BAR_OAUTH_CLIENT_ID = SHIPPED_CLIENT_ID
}

// ── 7a. shipped client id (device flow works for every user) ─────────────
{
  const before = await ask(repo, '/dsh-git-bar/github/status')
  check('device: shipped id makes the browser flow ready', before.device.shipped === true && before.device.ready === true, JSON.stringify(before.device))
  check('device: profile has no custom app', before.device.custom === false, JSON.stringify(before.device))

  let seenBody = ''
  queued((url, init) => {
    seenBody = String(init.body ?? '')
    return respond({ device_code: 'device_secret_shipped', user_code: 'WXYZ-0001', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
  })
  const shipped = await ask(repo, '/dsh-git-bar/github/device/start', 'POST', {})
  check('device: starts with the shipped id', shipped.ok === true && shipped.userCode === 'WXYZ-0001', JSON.stringify(shipped))
  check('device: shipped id sent to GitHub', seenBody.includes(`client_id=${SHIPPED_CLIENT_ID}`), seenBody.slice(0, 120))
}

// ── 7b. a profile-supplied app overrides the shipped one ─────────────────
{
  await ask(repo, '/dsh-git-bar/github/config', 'POST', { deviceClientId: 'Iv1device0001' })
  let seenBody = ''
  queued((url, init) => {
    seenBody = String(init.body ?? '')
    return respond({ device_code: 'device_secret', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 })
  })
  const started = await ask(repo, '/dsh-git-bar/github/device/start', 'POST', {})
  check('device: start returns a code', started.ok === true && started.userCode === 'ABCD-1234', JSON.stringify(started))
  check('device: custom app wins', seenBody.includes('client_id=Iv1device0001'), seenBody.slice(0, 120))
  check('device: device secret stays host-side', !JSON.stringify(started).includes('device_secret"'), 'leak')
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

// ── 7c. expiring grants refresh automatically ────────────────────────────
{
  const grantFile = join(dataDir, 'github-token.json')
  const seed = (patch) =>
    writeFileSync(
      grantFile,
      JSON.stringify({
        token: 'gho_expired',
        tokenKind: 'device',
        account: { login: 'octo', name: 'Octo Cat', id: 42, avatarUrl: '', htmlUrl: '', email: '' },
        scopes: ['repo', 'read:user'],
        connectedAt: Date.now() - 9 * 3600_000,
        refreshToken: 'ghr_old',
        expiresAt: Date.now() - 1000,
        ...patch,
      }),
      'utf8',
    )
  seed({})

  const status = await ask(repo, '/dsh-git-bar/github/status')
  check('refresh: status reports the dead token', status.expired === true && status.refreshable === true, JSON.stringify(status))

  queued(() => respond({ access_token: 'gho_fresh', refresh_token: 'ghr_new', expires_in: 3600, scope: 'repo, read:user' }))
  queued(() => respond([]))
  const repos = await ask(repo, '/dsh-git-bar/github/repos')
  check('refresh: call succeeds after refresh', repos.ok === true && Array.isArray(repos.repos), JSON.stringify(repos))
  const stored = JSON.parse(readFileSync(grantFile, 'utf8'))
  check('refresh: new access token stored', stored.token === 'gho_fresh', stored.token)
  check('refresh: rotated refresh token stored', stored.refreshToken === 'ghr_new', stored.refreshToken)
  check('refresh: new deadline stored', typeof stored.expiresAt === 'number' && stored.expiresAt > Date.now(), String(stored.expiresAt))

  seed({})
  queued(() => respond({ error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' }, { status: 400 }))
  const dead = await ask(repo, '/dsh-git-bar/github/repos')
  check('refresh: dead refresh token asks for re-auth', dead.ok === false && dead.reason === 'reauth-required', JSON.stringify(dead))

  // Restore a healthy grant for the identity/push checks below.
  seed({ refreshToken: undefined, expiresAt: undefined, token: 'gho_healthy' })
}

// ── 7d. expiring personal access tokens record their deadline ────────────
{
  const soon = new Date(Date.now() + 20 * 3600_000).toUTCString()
  queued(() => respond(USER, { headers: { 'github-authentication-token-expiration': soon } }))
  const login = await ask(repo, '/dsh-git-bar/github/login', 'POST', { token: 'ghp_expiring_token' })
  check('pat: expiring token accepted', login.ok === true && login.signedIn === true, JSON.stringify(login))
  check('pat: deadline recorded', typeof login.expiresAt === 'number' && login.expired === false, JSON.stringify(login))

  // Back to the device grant the later checks expect.
  const grantFile = join(dataDir, 'github-token.json')
  const current = JSON.parse(readFileSync(grantFile, 'utf8'))
  writeFileSync(grantFile, JSON.stringify({ ...current, tokenKind: 'device', token: 'gho_healthy' }), 'utf8')
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

  // Public repositories clone without signing in; a private one fails and asks
  // for a sign-in instead of pretending the user is unauthorized.
  {
    const { bare } = makeBare()
    const anonymousRoot = mkdtempSync(join(tmpdir(), 'dshgit-gh-anon-'))
    const anonymous = await ask(repo, '/dsh-git-bar/github/clone', 'POST', {
      repo: `file://${bare.replace(/\\/g, '/')}`,
      root: anonymousRoot,
    })
    check('clone: works without sign-in', anonymous.ok === true && existsSync(join(anonymous.path, '.git')), JSON.stringify(anonymous))
  }
  const blocked = await ask(repo, '/dsh-git-bar/github/clone', 'POST', {
    repo: 'http://127.0.0.1:9/private.git',
    root: mkdtempSync(join(tmpdir(), 'dshgit-gh-anon2-')),
  })
  check(
    'clone: failure without sign-in asks for it',
    blocked.ok === false && blocked.needsSignIn === true && blocked.reason !== 'not-signed-in',
    JSON.stringify(blocked),
  )
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

// ── 12. connectivity: proxy detection and the network route ──────────────
{
  check('proxy: electron PROXY spec', JSON.stringify(parseProxyResult('PROXY 127.0.0.1:7897; DIRECT')) === JSON.stringify({ mode: 'proxy', url: 'http://127.0.0.1:7897' }), parseProxyResult('PROXY 127.0.0.1:7897; DIRECT').url)
  check('proxy: DIRECT', parseProxyResult('DIRECT').mode === 'direct', parseProxyResult('DIRECT').mode)
  check('proxy: socks', parseProxyResult('SOCKS5 127.0.0.1:1080').url === 'socks5://127.0.0.1:1080', parseProxyResult('SOCKS5 127.0.0.1:1080').url)
  check('proxy: bare host:port', parseProxyResult('127.0.0.1:7897').url === 'http://127.0.0.1:7897', parseProxyResult('127.0.0.1:7897').url)
  check('proxy: empty is unknown', parseProxyResult('').mode === 'unknown', parseProxyResult('').mode)
  check('proxy args: proxy mode', gitProxyArgs({ mode: 'proxy', url: 'http://p:1' }).length === 4, gitProxyArgs({ mode: 'proxy', url: 'http://p:1' }).join(' '))
  check('proxy args: direct is empty', gitProxyArgs({ mode: 'direct', url: '' }).length === 0, 'direct')
  // A TUN-mode client makes direct the working transport while the proxy breaks
  // TLS, so the direct attempt always comes first and the proxy is the fallback.
  const attemptsWithProxy = gitTransportAttempts({ mode: 'proxy', url: 'http://p:1' })
  check('transport: direct attempt first, proxy second', attemptsWithProxy.length === 2 && attemptsWithProxy[0].length === 0 && attemptsWithProxy[1].length === 4, JSON.stringify(attemptsWithProxy))
  check('transport: no proxy means one attempt', gitTransportAttempts({ mode: 'direct', url: '' }).length === 1, 'direct')
  check('transport: network failures retry', isTransportFailure('fatal: unable to access: TLS handshake failed') === true && isTransportFailure('fatal: Authentication failed for repo') === false, 'classification')

  // Deterministic proxy override, then a reachability probe through mocked fetch.
  process.env.DSH_GIT_BAR_HTTP_PROXY = '127.0.0.1:7897'
  queued(() => respond('', { status: 200 }))
  const network = await ask(repo, '/dsh-git-bar/github/network?session=s1')
  check('network: proxy reported', network.ok === true && network.proxy.mode === 'proxy' && network.proxy.url === 'http://127.0.0.1:7897', JSON.stringify(network.proxy))
  check('network: github reachable', network.github.reachable === true && network.github.status === 200, JSON.stringify(network.github))
  check('network: git uses the proxy', network.git.usesProxyForPush === true, JSON.stringify(network.git))
  check('network: push transport detected', network.push.transport === 'none' || network.push.transport === 'ssh' || network.push.transport === 'https', JSON.stringify(network.push))

  process.env.DSH_GIT_BAR_HTTP_PROXY = 'none'
  queued(() => respond('', { status: 200 }))
  const direct = await ask(repo, '/dsh-git-bar/github/network?session=s1')
  check('network: direct mode honoured', direct.proxy.mode === 'direct' && direct.git.usesProxyForPush === false, JSON.stringify(direct.proxy))

  // Diagnostics channel: the browser posts what it measured, the Host keeps it.
  const posted = await ask(repo, '/dsh-git-bar/github/client-log', 'POST', { tag: 'clone-panel-open', mode: 'dialog', stack: [{ tag: 'body' }] })
  check('client-log: accepts a report', posted.ok === true && typeof posted.file === 'string' && posted.file.endsWith('client-log.jsonl'), JSON.stringify(posted))
  const log = await ask(repo, '/dsh-git-bar/github/client-log')
  const lastEntry = (log.entries || [])[log.entries.length - 1] || {}
  check('client-log: round-trips the payload', log.ok === true && lastEntry.tag === 'clone-panel-open' && lastEntry.mode === 'dialog', JSON.stringify(lastEntry))
}

globalThis.fetch = realFetch
delete process.env.DSH_GIT_BAR_OAUTH_CLIENT_ID
process.env.DSH_GIT_BAR_HTTP_PROXY = 'none'
rmSync(dataDir, { recursive: true, force: true })
delete process.env.DSH_GIT_BAR_DATA_DIR

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((entry) => entry.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
