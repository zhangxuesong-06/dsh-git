/**
 * Host half of the git capsule.
 *
 * It owns exactly one job: read the Session workspace's git facts with the local
 * `git` executable and answer them as JSON from a private route family. The
 * browser half (client.js) renders the capsule in the Session header and calls
 * these routes. Mapping a Session to its directory stays in the Host services
 * that already own it (`workingDirectory`), so no path policy is duplicated
 * here and the browser never names a directory.
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, resolve as resolvePath } from 'node:path'

/** Every route this plugin owns. Prefix matching keeps one registration. */
const PREFIX = '/dsh-git-bar/'
/** Cap on one diff body; the browser renders text, not megabytes. */
const MAX_DIFF_CHARS = 400_000
/** Cap on a synthetic diff built for an untracked file. */
const MAX_UNTRACKED_CHARS = 60_000
/** Recent commits listed under the changes. */
const COMMIT_LIMIT = 12

/** Run git without a shell and always resolve with a stable shape. */
function git(cwd, args, timeoutMs = 20_000) {
  return new Promise((done) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        done({
          code,
          failed: code !== 0,
          out: typeof stdout === 'string' ? stdout : '',
          err: typeof stderr === 'string' ? stderr : '',
        })
      },
    )
  })
}

/** Parse `git status --porcelain=v1 -z` into plain file records. */
function parseStatus(raw) {
  const files = []
  const parts = raw.split('\0')
  for (let at = 0; at < parts.length; at += 1) {
    const entry = parts[at]
    if (!entry || entry.length < 4) continue
    const index = entry[0]
    const worktree = entry[1]
    const path = entry.slice(3)
    let originalPath = null
    if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') {
      originalPath = parts[at + 1] ?? null
      at += 1
    }
    const untracked = index === '?' && worktree === '?'
    const conflicted = index === 'U' || worktree === 'U' || `${index}${worktree}` === 'AA' || `${index}${worktree}` === 'DD'
    files.push({
      path,
      originalPath,
      index: index === ' ' ? null : index,
      worktree: worktree === ' ' ? null : worktree,
      untracked,
      conflicted,
      // A file never staged and only touched in the working tree.
      staged: !untracked && !conflicted && index !== ' ',
      unstaged: !untracked && !conflicted && worktree !== ' ',
    })
  }
  return files
}

/** Parse `git diff --numstat` (one line per file) into a path-keyed map. */
function parseNumstat(raw) {
  const stats = new Map()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const cells = line.split('\t')
    if (cells.length < 3) continue
    const path = cells.slice(2).join('\t')
    stats.set(path, {
      additions: cells[0] === '-' ? null : Number(cells[0]) || 0,
      deletions: cells[1] === '-' ? null : Number(cells[1]) || 0,
    })
  }
  return stats
}

/** Parse `git log` output produced with the unit-separator format below. */
function parseLog(raw) {
  const commits = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 4) continue
    commits.push({ hash: cells[0], author: cells[1], when: cells[2], subject: cells.slice(3).join('\u001f') })
  }
  return commits
}

/** Resolve the directory whose git facts this request asks about. */
function resolveCwd(ctx, url) {
  const sessionId = url.searchParams.get('session')
  if (sessionId) {
    const sessions = ctx.get('sessions')
    const workingDirectory = ctx.get('workingDirectory')
    if (sessions && workingDirectory) {
      try {
        const session = sessions.get(sessionId)
        if (session) return workingDirectory.get(session)
      } catch {
        /* a stale Session id falls through to the process default */
      }
    }
  }
  const workingDirectory = ctx.get('workingDirectory')
  if (workingDirectory && typeof workingDirectory.defaultDirectory === 'string') {
    return workingDirectory.defaultDirectory
  }
  return process.cwd()
}

/** Reject any path that is absolute or escapes the repository root. */
function relativePath(requested, root) {
  if (typeof requested !== 'string' || requested.length === 0) return null
  const normalized = requested.replace(/\\/g, '/')
  if (isAbsolute(requested) || /^[a-zA-Z]:/.test(requested)) return null
  if (normalized.split('/').some((segment) => segment === '..')) return null
  const absolute = resolvePath(root, normalized)
  const rootWithSep = root.endsWith('/') || root.endsWith('\\') ? root : `${root}${separatorOf(root)}`
  if (absolute !== root && !absolute.startsWith(rootWithSep)) return null
  return normalized
}

/** The platform path separator of `root`, inferred from its own spelling. */
function separatorOf(root) {
  return root.includes('\\') ? '\\' : '/'
}

/** Read the complete state the capsule shows in one round trip. */
async function collectState(cwd) {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.failed || inside.out.trim() !== 'true') {
    return {
      ok: false,
      reason: 'not-a-repository',
      detail: (inside.err || inside.out).trim().split('\n')[0] ?? '',
      cwd,
      generatedAt: Date.now(),
    }
  }

  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).out.trim() || cwd
  const [refResult, headResult, upstreamResult] = await Promise.all([
    git(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(root, ['rev-parse', '--short', 'HEAD']),
    git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
  ])
  const detached = refResult.failed || refResult.out.trim() === ''
  const branch = detached ? '' : refResult.out.trim()
  const head = headResult.out.trim()
  const upstream = upstreamResult.failed ? '' : upstreamResult.out.trim()

  let ahead = 0
  let behind = 0
  if (upstream) {
    const counts = await git(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
    if (!counts.failed) {
      const [left, right] = counts.out.trim().split(/\s+/)
      ahead = Number(left) || 0
      behind = Number(right) || 0
    }
  }

  const [statusResult, unstagedStats, stagedStats, logResult] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '-uall']),
    git(root, ['diff', '--numstat']),
    git(root, ['diff', '--cached', '--numstat']),
    git(root, ['log', '-n', String(COMMIT_LIMIT), '--pretty=format:%h\u001f%an\u001f%ar\u001f%s']),
  ])

  const files = parseStatus(statusResult.out)
  const unstagedMap = parseNumstat(unstagedStats.out)
  const stagedMap = parseNumstat(stagedStats.out)
  for (const file of files) {
    const stats = (file.staged && stagedMap.get(file.path)) || unstagedMap.get(file.path) || null
    file.additions = stats ? stats.additions : null
    file.deletions = stats ? stats.deletions : null
  }

  const counts = { all: files.length, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }
  for (const file of files) {
    if (file.conflicted) counts.conflicted += 1
    else if (file.untracked) counts.untracked += 1
    else {
      if (file.staged) counts.staged += 1
      if (file.unstaged) counts.unstaged += 1
    }
  }

  return {
    ok: true,
    cwd,
    root,
    branch,
    detached,
    head,
    upstream,
    ahead,
    behind,
    files,
    counts,
    commits: parseLog(logResult.out),
    generatedAt: Date.now(),
  }
}

/** Read one file's diff, or synthesize one for an untracked file. */
async function collectDiff(root, requestedPath, staged) {
  const relative = relativePath(requestedPath, root)
  if (relative === null) return { ok: false, reason: 'invalid-path' }
  const absolute = resolvePath(root, relative)

  const probe = await git(root, ['ls-files', '--error-unmatch', '--', relative])
  const tracked = !probe.failed

  if (!tracked) {
    try {
      const content = await readFile(absolute, 'utf8')
      const truncatedFile = content.length > MAX_UNTRACKED_CHARS
      const body = truncatedFile ? content.slice(0, MAX_UNTRACKED_CHARS) : content
      const lines = body.split('\n')
      const synthetic = [
        `diff --git a/${relative} b/${relative}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relative}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
      ].join('\n')
      return {
        ok: true,
        path: relative,
        staged: false,
        untracked: true,
        diff: synthetic,
        truncated: truncatedFile,
        additions: lines.length,
        deletions: 0,
      }
    } catch (error) {
      return { ok: false, reason: 'unreadable-file', detail: String(error && error.message ? error.message : error) }
    }
  }

  const args = ['diff', '--no-color']
  if (staged) args.push('--cached')
  args.push('--', relative)
  const result = await git(root, args)
  let diff = result.out
  let truncated = false
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS)
    truncated = true
  }
  return { ok: true, path: relative, staged, untracked: false, diff, truncated }
}

/** Answer one HTTP request from this plugin's route family. */
async function handle(ctx, req, res) {
  const send = (status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith(PREFIX)) {
    send(404, { ok: false, reason: 'not-found' })
    return
  }
  const action = url.pathname.slice(PREFIX.length).replace(/\/+$/, '')

  try {
    if (action === '' || action === 'health') {
      send(200, { ok: true, name: '@local/dsh-git-bar' })
      return
    }

    if (action === 'probe') {
      // Diagnostics: the browser half reports the props it receives once per mount.
      const chunks = []
      let size = 0
      await new Promise((done) => {
        req.on('data', (chunk) => {
          size += chunk.length
          if (size <= 200_000) chunks.push(chunk)
        })
        req.on('end', done)
        req.on('error', done)
      })
      const text = Buffer.concat(chunks).toString('utf8')
      const cwd = resolveCwd(ctx, url)
      const target = resolvePath(cwd, '.dsh-git-bar-probe.json')
      try {
        await writeFile(target, JSON.stringify({ at: new Date().toISOString(), cwd, text }, null, 2), 'utf8')
        send(200, { ok: true, written: target })
      } catch (error) {
        send(200, { ok: false, detail: String(error && error.message ? error.message : error) })
      }
      return
    }

    if (action === 'state') {
      const cwd = resolveCwd(ctx, url)
      send(200, await collectState(cwd))
      return
    }

    if (action === 'diff') {
      const cwd = resolveCwd(ctx, url)
      const state = await collectState(cwd)
      if (!state.ok) {
        send(200, { ok: false, reason: state.reason })
        return
      }
      const staged = url.searchParams.get('staged') === '1'
      send(200, await collectDiff(state.root, url.searchParams.get('path') ?? '', staged))
      return
    }

    send(404, { ok: false, reason: 'unknown-action' })
  } catch (error) {
    send(500, { ok: false, reason: 'internal-error', detail: String(error && error.message ? error.message : error) })
  }
}

/** Register the route family; without a Web carrier the plugin stays UI-only. */
export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (!webServer) {
    ctx.logger?.info?.('dsh-git-bar: no webServer in this composition; host routes are unavailable')
    return
  }
  ctx.effect(() =>
    webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: (req, res) => handle(ctx, req, res),
    }),
  )
}
