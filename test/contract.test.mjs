// Contract checks for the two plugin halves: the DSH client-loader shape, the
// "no persistence of secrets" rule, the route prefix rule and the manifest.
// These are static assertions over the shipped files; they catch the mistakes
// that no runtime test can (a bundled import, a trailing route slash, ...).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const read = (name) => readFileSync(join(repo, name), 'utf8')

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

const client = read('client.js')
const host = read('index.js')
const pkg = JSON.parse(read('package.json'))
const zh = JSON.parse(read('locale/zh.json'))
const en = JSON.parse(read('locale/en.json'))

// ── client half: loader shape and constraints ────────────────────────────
check('client: loads through the module loader', /window\.__ModuleLoader__\.load\(\{/.test(client), 'missing loader call')
check('client: id equals the package name', new RegExp(`id:\\s*'${pkg.name}'`).test(client), 'id mismatch')
check('client: no ES module statements', !/^\s*(?:import|export)\s/m.test(client), 'found import/export')
const requires = [...client.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((match) => match[1])
check('client: only requires react', requires.length > 0 && requires.every((name) => name === 'react'), requires.join(', '))
check('client: never touches document.body', !/document\.body/.test(client), 'found document.body')
check('client: never persists credentials', !/localStorage|sessionStorage|indexedDB/.test(client), 'found web storage')
check('client: no raw HTML injection', !/dangerouslySetInnerHTML/.test(client), 'found dangerouslySetInnerHTML')
check('client: renders its own <style>', /createElement\('style'|\bh\(\s*'style'/.test(client), 'no style element')
check('client: respects reduced motion', /prefers-reduced-motion/.test(client), 'missing media query')

const classLiterals = [...client.matchAll(/className:\s*'([^']+)'/g)].map((match) => match[1])
const unprefixed = classLiterals.filter((value) => !value.trim().startsWith('gitbar-'))
check(
  'client: every literal class is gitbar-prefixed',
  classLiterals.length > 50 && unprefixed.length === 0,
  `${classLiterals.length} literals, offenders: ${unprefixed.slice(0, 5).join(' | ')}`,
)

const hexColors = [...client.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0])
check('client: colours come from theme tokens', hexColors.length <= 8, `${hexColors.length} hex literals: ${[...new Set(hexColors)].join(', ')}`)
check('client: uses dsw theme tokens', (client.match(/--dsw-alias-/g) || []).length > 100, 'too few token references')

// ── host half: route family, no shell, real exports ──────────────────────
check('host: exports apply', /export function apply\s*\(/.test(host), 'missing apply')
check('host: waits for webServer', /export const inject = \['webServer'\]/.test(host), 'missing inject list')
check('host: prefix has no trailing slash', /const PREFIX = '\/dsh-git-bar'\r?\n/.test(host), 'prefix must be /dsh-git-bar without trailing slash')
check('host: registers a prefix route', /kind:\s*'prefix'/.test(host), 'missing prefix registration')
check('host: imports execFile and spawn only', /import \{ execFile, spawn \} from 'node:child_process'/.test(host), 'unexpected child_process import')
check('host: never enables a shell', !/shell:\s*true/.test(host) && !/\bexecSync\(/.test(host), 'found shell execution')
check('host: all git arguments are fixed argv', !/git\([^)]*`[^`]*\$\{[^}]*\}`[^)]*\)\s*,\s*\['/.test(host), 'suspicious interpolation')
for (const route of ['state', 'diff', 'branches', 'switch', 'graph', 'commit', 'commit-diff', 'auto-commit', 'push', 'health']) {
  check(`host: route "${route}" exists`, new RegExp(`action === '${route}'`).test(host), 'route missing')
}

// ── GitHub half: routes, identity, no secret in argv or patch ────────────
for (const step of ['status', 'login', 'logout', 'device/start', 'device/poll', 'repos', 'clone', 'config']) {
  check(`host: github "${step}" handled`, new RegExp(`step === '${step}'`).test(host), 'missing branch')
}
check('host: identity args derive from the account', /export function githubIdentityArgs/.test(host), 'missing identity helper')
check(
  'host: token push reuses the askpass helper',
  /createAskpass\(\{ username: 'x-access-token', password: (?:grant\.token|access\.token|token) \}\)/.test(host),
  'token not routed through askpass',
)
check('host: ssh remotes are rewritten per push', /url\.https:\/\/github\.com\/\.insteadOf=git@github\.com:/.test(host), 'missing insteadOf rewrite')
check(
  'host: token never embedded in a remote URL',
  !/https:\/\/[^'"\s`]*\$\{token\}/.test(host) && !/https:\/\/x-access-token:/.test(host),
  'token in a URL',
)
check('host: token reaches git through the askpass env', /GIT_ASKPASS: helper\.path/.test(host) && /SSH_ASKPASS_REQUIRE: 'force'/.test(host), 'env delivery missing')
check('host: grant prefers the credential store', /kind: 'grant', payload/.test(host) && /readRecord\(GITHUB_TOKEN_KEY\)/.test(host), 'credential seam unused')
check('client: device flow is rate limited by the host', /device\/poll/.test(client) && /slow-down/.test(client), 'poll handling missing')
check('client: PAT leaves the input after login', /setPat\(''\)/.test(client), 'token kept in state')
check('client: clone opens a real workspace', /workspaces[\s\S]{0,200}?create\(\{ path/.test(client) && /openWorkspace\(/.test(client), 'workspace wiring missing')

// Single slots belong to the shipped UI. A second registration shadows the
// shipped entry or makes it fail to activate, and one failed web-boot entry
// takes every plugin down with it (the v1.4.6 incident), so the client must
// stay on list slots only.
for (const owned of ['conversation.hero.workspace', 'sidebar.workspaces', 'main.conversation']) {
  check(`client: never registers into "${owned}"`, !client.includes(owned), 'single slot referenced')
}
// The panel lives in a non-modal <dialog>: the top layer escapes transformed
// ancestors while the page stays interactive.
check(
  'client: clone panel uses a non-modal native dialog',
  /h\(\s*'dialog'/.test(client) && /\.show\(\)/.test(client) && !/showModal/.test(client) && /pointerdown/.test(client),
  'dialog host missing',
)
check('client: clone entry lives in a list slot', /conversation\.hero\.options/.test(client), 'hero registration missing')

// ── manifest + locale metadata ───────────────────────────────────────────
check('manifest: bundle patch declared', pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml', JSON.stringify(pkg.dsh && pkg.dsh.bundle))
check('manifest: web client declared', pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web', JSON.stringify(pkg.dsh && pkg.dsh.client))
check('manifest: manifestVersion 1', pkg.dsh && pkg.dsh.manifestVersion === 1, pkg.dsh && pkg.dsh.manifestVersion)
check('manifest: injects the conversation UI', pkg.dsh && pkg.dsh.client && Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'), JSON.stringify(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject))
check('manifest: engines.dsh declared', Boolean(pkg.engines && pkg.engines.dsh), JSON.stringify(pkg.engines))
check('manifest: files whitelist covers the runtime', ['index.js', 'client.js', 'cordis.patch.yml'].every((name) => (pkg.files || []).includes(name)), JSON.stringify(pkg.files))
check('locale: zh meta', Boolean(zh.meta && zh.meta.title && zh.meta.description), JSON.stringify(zh))
check('locale: en meta', Boolean(en.meta && en.meta.title && en.meta.description), JSON.stringify(en))

// ── the patch file inserts our rows and never carries a secret ───────────
const patch = read('cordis.patch.yml')
check('patch: inserts rows', (patch.match(/- insert:/g) || []).length === 1, patch.trim())
check('patch: row id matches the package', new RegExp(`id:\\s*${pkg.name}`).test(patch), patch.trim())
check('patch: ships the github MCP row', /id:\s*dsh-git-bar\/github-mcp/.test(patch) && /name:\s*'@deepseek-ai\/dsh-mcp-client'/.test(patch), patch.trim())
check('patch: MCP row gated by the token variable', /disabled:\s*'!!js !process\.env\.DSH_GIT_BAR_GITHUB_TOKEN'/.test(patch), patch.trim())
check('patch: MCP header reads the variable', /Authorization:\s*'!!js `Bearer \$\{process\.env\.DSH_GIT_BAR_GITHUB_TOKEN \?\? ""\}`'/.test(patch), patch.trim())
check('patch: no token literal', !/gh[pousr]_[A-Za-z0-9]{10,}/.test(patch), 'secret in the patch')

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((entry) => entry.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
