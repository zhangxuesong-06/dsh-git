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
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, mkdtemp, writeFile, rm as rmPath, chmod, mkdir, readdir } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir, homedir } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import { connect as tlsConnect } from 'node:tls'

/**
 * Every route this plugin owns. The route table matches a prefix either
 * exactly or followed by `/`, so the registered prefix must carry no trailing
 * slash — `/dsh-git-bar/` would match nothing but itself.
 */
const PREFIX = '/dsh-git-bar'
/** Cap on one diff body; the browser renders text, not megabytes. */
const MAX_DIFF_CHARS = 400_000
/** Cap on a synthetic diff built for an untracked file. */
const MAX_UNTRACKED_CHARS = 60_000
/** Recent commits listed under the changes. */
const COMMIT_LIMIT = 12

/** Candidate executables, in order; the app process may not inherit the shell PATH. */
const GIT_CANDIDATES = [
  process.env.DSH_GIT_BIN,
  'git',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  '/usr/bin/git',
  '/usr/local/bin/git',
].filter((value) => typeof value === 'string' && value.length > 0)

let gitExecutable = null

/** Probe one candidate for a usable git, resolving to its path or null. */
function usableGit(candidate) {
  return new Promise((done) => {
    execFile(candidate, ['--version'], { timeout: 5000, windowsHide: true, encoding: 'utf8' }, (error) => {
      done(error ? null : candidate)
    })
  })
}

/** Resolve the git executable once, then reuse it for every call. */
async function resolveGit() {
  if (gitExecutable !== null) return gitExecutable
  for (const candidate of GIT_CANDIDATES) {
    const usable = await usableGit(candidate)
    if (usable !== null) {
      gitExecutable = usable
      return usable
    }
  }
  gitExecutable = 'git'
  return gitExecutable
}

/**
 * Run git without a shell and always resolve with a stable shape. `extraEnv`
 * is merged over the inherited environment; network commands use it to make
 * git fail fast instead of blocking on a credential prompt.
 */
function git(cwd, args, timeoutMs = 20_000, extraEnv = null) {
  return new Promise((done) => {
    resolveGit()
      .then((executable) => {
        execFile(
          executable,
          args,
          {
            cwd,
            encoding: 'utf8',
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 32 * 1024 * 1024,
            ...(extraEnv ? { env: { ...process.env, ...extraEnv } } : {}),
          },
          (error, stdout, stderr) => {
            const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
            const timedOut = Boolean(error && error.killed)
            done({
              code,
              failed: code !== 0,
              timedOut,
              out: typeof stdout === 'string' ? stdout : '',
              err: typeof stderr === 'string' ? stderr : '',
            })
          },
        )
      })
      .catch((error) => {
        done({ code: 1, failed: true, timedOut: false, out: '', err: String(error && error.message ? error.message : error) })
      })
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

/**
 * Parse `git log` output in the `%H %h %an %ar %aI %s` unit-separator format.
 * `iso` lets the client localise the relative time instead of printing git's
 * English "2 hours ago"; `when` stays as the fallback.
 */
function parseLog(raw) {
  const commits = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 5) continue
    if (cells.length >= 6) {
      commits.push({
        full: cells[0],
        hash: cells[1],
        author: cells[2],
        when: cells[3],
        iso: cells[4],
        subject: cells.slice(5).join('\u001f'),
      })
      continue
    }
    commits.push({
      full: cells[0],
      hash: cells[1],
      author: cells[2],
      when: cells[3],
      iso: '',
      subject: cells.slice(4).join('\u001f'),
    })
  }
  return commits
}

/** Count status entries per group; shared by the full and brief state paths. */
function countFiles(files) {
  const counts = { all: files.length, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }
  for (const file of files) {
    if (file.conflicted) counts.conflicted += 1
    else if (file.untracked) counts.untracked += 1
    else {
      if (file.staged) counts.staged += 1
      if (file.unstaged) counts.unstaged += 1
    }
  }
  return counts
}

/** Parse `for-each-ref` output for local branches. */
function parseBranches(raw) {
  const branches = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 5) continue
    branches.push({
      name: cells[0],
      head: cells[1],
      when: cells[2],
      upstream: cells[3],
      subject: cells.slice(4).join('\u001f'),
    })
  }
  return branches
}

/**
 * Resolve the directory whose git facts this request asks about, and say when
 * the Session is not ready yet: at startup the Session or its workspace can be
 * unresolved, and reporting that as `not-a-repository` would be wrong.
 */
function resolveWorkspace(ctx, url) {
  const sessionId = url.searchParams.get('session')
  const workingDirectory = ctx.get('workingDirectory')
  const fallback =
    workingDirectory && typeof workingDirectory.defaultDirectory === 'string'
      ? workingDirectory.defaultDirectory
      : process.cwd()
  if (!sessionId) return { cwd: fallback, pending: false }
  const sessions = ctx.get('sessions')
  if (!sessions || !workingDirectory) return { cwd: fallback, pending: false }
  try {
    const session = sessions.get(sessionId)
    if (!session) return { cwd: fallback, pending: true }
    const cwd = workingDirectory.get(session)
    if (typeof cwd !== 'string' || cwd.trim() === '') return { cwd: fallback, pending: true }
    return { cwd, pending: false }
  } catch {
    return { cwd: fallback, pending: true }
  }
}

/** Resolve the directory whose git facts this request asks about. */
function resolveCwd(ctx, url) {
  return resolveWorkspace(ctx, url).cwd
}

/** One comparable spelling: forward slashes, no trailing separator. */
function comparablePath(value) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Reject any path that is absolute or escapes the repository root. */
function relativePath(requested, root) {
  if (typeof requested !== 'string' || requested.length === 0) return null
  const normalized = requested.replace(/\\/g, '/')
  if (isAbsolute(requested) || /^[a-zA-Z]:/.test(requested)) return null
  if (normalized.split('/').some((segment) => segment === '..')) return null
  const absolute = comparablePath(resolvePath(comparablePath(root), normalized))
  const boundary = comparablePath(root)
  if (absolute !== boundary && !absolute.toLowerCase().startsWith(`${boundary.toLowerCase()}/`)) return null
  return normalized
}

/** Best-effort upstream for a branch that has no configured tracking ref. */
async function guessUpstream(root, branch) {
  const remotes = await git(root, ['remote'])
  if (remotes.failed) return ''
  const names = remotes.out
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  if (names.length === 0) return ''
  names.sort((left, right) => (left === 'origin' ? -1 : right === 'origin' ? 1 : 0))
  for (const remote of names) {
    const ref = `refs/remotes/${remote}/${branch}`
    const exists = await git(root, ['rev-parse', '--verify', '--quiet', ref])
    if (!exists.failed && exists.out.trim() !== '') return `${remote}/${branch}`
  }
  return ''
}

/** Read the complete state the capsule shows in one round trip. */
async function collectState(cwd, options = {}) {
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
  let upstream = upstreamResult.failed ? '' : upstreamResult.out.trim()
  // A branch without a configured upstream often still has a same-named
  // remote-tracking ref (fresh clones, re-initialised repositories). Showing
  // that keeps the ahead/behind counters meaningful instead of blank.
  if (upstream === '' && !detached && branch !== '') {
    upstream = await guessUpstream(root, branch)
  }

  let ahead = 0
  let behind = 0
  if (upstream !== '' && !upstream.startsWith('-') && /^[A-Za-z0-9._/-]+$/.test(upstream)) {
    const counts = await git(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])
    if (!counts.failed) {
      const [left, right] = counts.out.trim().split(/\s+/)
      ahead = Number(left) || 0
      behind = Number(right) || 0
    }
  }

  // The collapsed capsule only needs branch/upstream/counters, so `brief`
  // skips the two numstat diffs and the commit log (3 of the 4 subprocesses).
  if (options.brief === true) {
    const statusOnly = await git(root, ['status', '--porcelain=v1', '-z', '-uall'])
    const briefFiles = parseStatus(statusOnly.out)
    const briefCounts = countFiles(briefFiles)
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
      brief: true,
      files: [],
      counts: briefCounts,
      commits: [],
      generatedAt: Date.now(),
    }
  }

  const [statusResult, unstagedStats, stagedStats, logResult] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '-uall']),
    git(root, ['diff', '--numstat']),
    git(root, ['diff', '--cached', '--numstat']),
    git(root, ['log', '-n', String(COMMIT_LIMIT), '--pretty=format:%H\u001f%h\u001f%an\u001f%ar\u001f%aI\u001f%s']),
  ])

  const files = parseStatus(statusResult.out)
  const unstagedMap = parseNumstat(unstagedStats.out)
  const stagedMap = parseNumstat(stagedStats.out)
  for (const file of files) {
    const stats = (file.staged && stagedMap.get(file.path)) || unstagedMap.get(file.path) || null
    file.additions = stats ? stats.additions : null
    file.deletions = stats ? stats.deletions : null
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
    brief: false,
    files,
    counts: countFiles(files),
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

/** Read the repository root of `cwd`, or null when it is not a work tree. */
async function repositoryRoot(cwd) {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.failed || inside.out.trim() !== 'true') return null
  const top = await git(cwd, ['rev-parse', '--show-toplevel'])
  return top.failed ? null : top.out.trim() || cwd
}

/** Local branches, newest commit first, with the current one flagged. */
async function collectBranches(root) {
  const [currentResult, listResult] = await Promise.all([
    git(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(root, [
      'for-each-ref',
      'refs/heads',
      '--sort=-committerdate',
      '--count',
      '60',
      '--format=%(refname:short)\u001f%(objectname:short)\u001f%(committerdate:relative)\u001f%(upstream:short)\u001f%(contents:subject)',
    ]),
  ])
  const current = currentResult.failed ? '' : currentResult.out.trim()
  const branches = parseBranches(listResult.out).map((branch) => ({
    ...branch,
    current: branch.name === current,
  }))
  return { ok: true, root, current, detached: current === '', branches }
}

/** Switch the work tree to a local branch; every refusal carries its reason. */
async function switchBranch(root, requested) {
  if (typeof requested !== 'string' || requested.length === 0) return { ok: false, reason: 'missing-branch' }
  if (requested.startsWith('-')) return { ok: false, reason: 'invalid-branch' }

  const listing = await collectBranches(root)
  const known = listing.branches.some((branch) => branch.name === requested)
  if (!known) return { ok: false, reason: 'unknown-branch' }
  if (listing.branches.some((branch) => branch.current && branch.name === requested)) {
    return { ok: true, branch: requested, unchanged: true }
  }

  const status = await git(root, ['status', '--porcelain=v1', '-z', '-uall'])
  if (parseStatus(status.out).some((file) => file.conflicted)) {
    return { ok: false, reason: 'conflicts' }
  }

  const switched = await git(root, ['switch', requested], 60_000)
  if (switched.failed) {
    const detail = `${switched.err}\n${switched.out}`.trim().split('\n').filter(Boolean).slice(0, 6).join('\n')
    return { ok: false, reason: 'switch-failed', detail }
  }
  return { ok: true, branch: requested }
}

/** One commit: metadata, per-file stats, and its patch. */
async function collectCommit(root, requested) {
  const hash = typeof requested === 'string' ? requested.trim() : ''
  if (!/^[0-9a-fA-F]{4,64}$/.test(hash)) return { ok: false, reason: 'invalid-hash' }
  const verify = await git(root, ['rev-parse', '--verify', '--quiet', `${hash}^{commit}`])
  if (verify.failed) return { ok: false, reason: 'unknown-commit' }

  const [metaResult, numstatResult, patchResult] = await Promise.all([
    git(root, ['show', '-s', '--format=%H\u001f%h\u001f%an\u001f%ae\u001f%aI\u001f%ar\u001f%s\u001f%b', `${hash}^{commit}`]),
    git(root, ['show', '--numstat', '--format=', `${hash}^{commit}`]),
    git(root, ['show', '--format=', '--patch', '--no-color', '--unified=3', `${hash}^{commit}`], 30_000),
  ])
  if (metaResult.failed) return { ok: false, reason: 'unknown-commit' }

  const cells = metaResult.out.split('\u001f')
  const stats = parseNumstat(numstatResult.out)
  const files = [...stats.entries()].map(([path, stat]) => ({
    path,
    additions: stat.additions,
    deletions: stat.deletions,
  }))

  let diff = patchResult.out
  let truncated = false
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS)
    truncated = true
  }

  return {
    ok: true,
    commit: {
      full: cells[0] || '',
      hash: cells[1] || '',
      author: cells[2] || '',
      email: cells[3] || '',
      iso: cells[4] || '',
      when: cells[5] || '',
      subject: cells[6] || '',
      body: (cells[7] || '').trim(),
    },
    files,
    additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    diff,
    truncated,
  }
}

/** One file's patch inside one commit. */
async function collectCommitDiff(root, requestedHash, requestedPath) {
  const hash = typeof requestedHash === 'string' ? requestedHash.trim() : ''
  if (!/^[0-9a-fA-F]{4,64}$/.test(hash)) return { ok: false, reason: 'invalid-hash' }
  const relative = relativePath(requestedPath, root)
  if (relative === null) return { ok: false, reason: 'invalid-path' }

  const verify = await git(root, ['rev-parse', '--verify', '--quiet', `${hash}^{commit}`])
  if (verify.failed) return { ok: false, reason: 'unknown-commit' }

  const [patchResult, numstatResult] = await Promise.all([
    git(root, ['show', '--format=', '--patch', '--no-color', '--unified=3', `${hash}^{commit}`, '--', relative], 30_000),
    git(root, ['show', '--numstat', '--format=', `${hash}^{commit}`, '--', relative]),
  ])
  const stat = parseNumstat(numstatResult.out).get(relative)
  let diff = patchResult.out
  let truncated = false
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS)
    truncated = true
  }
  return {
    ok: true,
    path: relative,
    hash,
    additions: stat ? stat.additions : null,
    deletions: stat ? stat.deletions : null,
    diff,
    truncated,
  }
}

/** Commits drawn by one graph request. */
const GRAPH_LIMIT = 120
/** Upper bound for one page when the browser asks for more. */
const GRAPH_MAX_LIMIT = 500
/** How many recent commits a search scans (message / author / hash). */
const GRAPH_SEARCH_WINDOW = 1000
/** Lanes beyond this are folded so a wide history cannot squeeze the rows. */
const MAX_GRAPH_COLUMNS = 8

/**
 * Assign a lane to every commit in display order: a commit lands on the lane
 * already waiting for it, otherwise on the first free lane, and its parents
 * then claim lanes of their own (the first parent keeps the child's lane).
 */
function assignLanes(rows) {
  const lanes = []
  for (const row of rows) {
    const waiting = lanes.indexOf(row.full)
    let lane
    if (waiting === -1) {
      const free = lanes.indexOf(null)
      if (free === -1) {
        lane = lanes.length
        lanes.push(null)
      } else {
        lane = free
      }
    } else {
      lane = waiting
    }
    // The commit leaves its lane before its parents claim one, so a linear
    // history keeps every commit on the same lane.
    lanes[lane] = null
    row.lane = lane
    for (let at = 0; at < row.parents.length; at += 1) {
      const parent = row.parents[at]
      if (lanes.indexOf(parent) !== -1) continue
      if (at === 0 && lanes[lane] === null) {
        lanes[lane] = parent
        continue
      }
      const free = lanes.indexOf(null)
      if (free === -1) lanes.push(parent)
      else lanes[free] = parent
    }
  }
  let columns = 1
  for (const row of rows) columns = Math.max(columns, row.lane + 1)
  return Math.min(columns, MAX_GRAPH_COLUMNS)
}

/** Parse `for-each-ref` rows into commit keyed decorations. */
function parseRefs(raw) {
  const byCommit = new Map()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    const refname = cells[0] ?? ''
    const objectname = cells[1] ?? ''
    const short = cells[2] ?? ''
    const peeled = cells[3] ?? ''
    const refHead = cells[4] ?? ''
    if (!refname || !short) continue
    let kind = ''
    if (refname.startsWith('refs/heads/')) kind = 'branch'
    else if (refname.startsWith('refs/remotes/')) kind = 'remote'
    else if (refname.startsWith('refs/tags/')) kind = 'tag'
    else continue
    if (kind === 'remote' && short.endsWith('/HEAD')) continue
    const target = peeled || objectname
    if (!target) continue
    const list = byCommit.get(target) ?? []
    list.push({ name: short, kind, current: refHead === '*' })
    byCommit.set(target, list)
  }
  return byCommit
}

/** The commit graph the Sidebar's graph tab draws. */
/**
 * Read the commit graph. `options.skip` paginates (the browser appends pages),
 * and `options.q` switches to search over the most recent GRAPH_SEARCH_WINDOW
 * commits (message / author / hash, case-insensitive); search results carry no
 * meaningful lanes, so the caller renders them as a flat list.
 */
async function collectGraph(root, requestedLimit, options = {}) {
  const limit = Math.min(Math.max(Number(requestedLimit) || GRAPH_LIMIT, 10), GRAPH_MAX_LIMIT)
  const skip = Math.max(Number(options.skip) || 0, 0)
  const query = typeof options.q === 'string' ? options.q.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  const filtered = query !== ''
  const fetchCount = filtered ? Math.min(GRAPH_SEARCH_WINDOW, Math.max(limit + skip + 200, 400)) : limit
  const logArgs = ['log', '--all', '--topo-order', '-n', String(fetchCount + 1)]
  if (!filtered && skip > 0) logArgs.push('--skip', String(skip))
  // `%aI` is a strict ISO timestamp so the browser can localise it. `%ad` with
  // a custom --date format would leave "11/22 10:56" year-less, which
  // Date.parse() reads as 2001.
  logArgs.push('--pretty=format:%H\u001f%h\u001f%P\u001f%an\u001f%aI\u001f%ar\u001f%s')

  const [logResult, refsResult, headResult, shortHeadResult] = await Promise.all([
    git(root, logArgs),
    git(root, [
      'for-each-ref',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
      '--format=%(refname)\u001f%(objectname)\u001f%(refname:short)\u001f%(*objectname)\u001f%(HEAD)',
    ]),
    git(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(root, ['rev-parse', '--short', 'HEAD']),
  ])

  if (logResult.failed && logResult.out.trim() === '') {
    return {
      ok: true,
      root,
      current: '',
      detached: true,
      head: '',
      columns: 1,
      commits: [],
      empty: true,
      filtered,
      query,
      skip,
      limit,
      hasMore: false,
    }
  }

  const current = headResult.failed ? '' : headResult.out.trim()
  const refsByCommit = parseRefs(refsResult.out)
  const fetched = []
  for (const line of logResult.out.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 7) continue
    const full = cells[0]
    fetched.push({
      full,
      hash: cells[1],
      parents: (cells[2] ?? '').trim() ? cells[2].trim().split(' ') : [],
      author: cells[3],
      iso: cells[4],
      when: cells[5],
      subject: cells.slice(6).join('\u001f'),
      lane: 0,
      refs: [],
    })
  }

  const windowTruncated = fetched.length > fetchCount
  const inWindow = windowTruncated ? fetched.slice(0, fetchCount) : fetched
  let rows = inWindow
  let total
  if (filtered) {
    const needle = query.toLowerCase()
    const matched = inWindow.filter((row) =>
      `${row.subject}\n${row.author}\n${row.full}\n${row.hash}`.toLowerCase().includes(needle),
    )
    total = matched.length
    rows = matched.slice(skip, skip + limit)
  }

  for (const row of rows) {
    const refs = refsByCommit.get(row.full) ?? []
    const decorated = refs.slice(0, 6)
    const isCurrent = decorated.some((ref) => ref.kind === 'branch' && ref.current)
    if (isCurrent) decorated.unshift({ name: 'HEAD', kind: 'head', current: true })
    row.refs = decorated
  }
  // Lanes only make sense over contiguous history; a filtered list is flat.
  const columns = filtered ? 1 : assignLanes(rows)
  const shortHead = shortHeadResult.failed ? '' : shortHeadResult.out.trim()
  const headFullResult = await git(root, ['rev-parse', 'HEAD'])
  const headFull = headFullResult.failed ? '' : headFullResult.out.trim()
  for (const row of rows) {
    // `head` marks the commit the work tree is on, detached or not, so the
    // browser can highlight it and refuse to "check out" the same commit.
    row.isHead = headFull !== '' && row.full === headFull
  }

  // A detached HEAD has no branch of its own, so offer the one the user came
  // from: the last reflog entry names it ("checkout: moving from main to …").
  let previousBranch = current
  if (current === '') {
    const reflog = await git(root, ['reflog', '-n', '1', '--format=%gs'])
    const moved = /moving from (\S+) to /.exec(reflog.out.trim())
    const candidate = moved ? moved[1] : ''
    const localNames = new Set()
    for (const line of refsResult.out.split('\n')) {
      const cells = line.split('\u001f')
      if ((cells[0] ?? '').startsWith('refs/heads/') && cells[2]) localNames.add(cells[2])
    }
    if (localNames.has(candidate)) previousBranch = candidate
  }

  return {
    ok: true,
    root,
    current,
    detached: current === '',
    head: shortHead || (rows.length > 0 ? rows[0].hash : ''),
    headFull,
    previousBranch,
    columns,
    commits: rows,
    filtered,
    query,
    skip,
    limit,
    hasMore: filtered
      ? total > skip + rows.length || windowTruncated
      : windowTruncated || inWindow.length > rows.length,
    total,
  }
}

/** Check out one commit or ref, detached; the working tree is protected first. */
async function detachTo(root, requested) {
  const target = typeof requested === 'string' ? requested.trim() : ''
  if (target.startsWith('-')) return { ok: false, reason: 'invalid-target' }
  if (!/^([0-9a-fA-F]{4,64}|[A-Za-z0-9._/-]{1,200})$/.test(target)) return { ok: false, reason: 'invalid-target' }

  let rev = target
  if (!/^[0-9a-fA-F]{4,64}$/.test(target)) {
    const refs = await git(root, ['for-each-ref', 'refs/tags', 'refs/remotes', '--format=%(refname:short)\u001f%(objectname)\u001f%(*objectname)'])
    const line = refs.out.split('\n').find((entry) => entry.startsWith(`${target}\u001f`))
    if (!line) return { ok: false, reason: 'unknown-target' }
    const cells = line.split('\u001f')
    rev = cells[2] || cells[1] || ''
    if (!rev) return { ok: false, reason: 'unknown-target' }
  }

  const verify = await git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`])
  if (verify.failed) return { ok: false, reason: 'unknown-target' }
  const full = verify.out.trim()

  const status = await git(root, ['status', '--porcelain=v1', '-z', '-uall'])
  if (parseStatus(status.out).some((file) => file.conflicted)) {
    return { ok: false, reason: 'conflicts' }
  }

  const detached = await git(root, ['switch', '--detach', full], 60_000)
  if (detached.failed) {
    const detail = `${detached.err}\n${detached.out}`.trim().split('\n').filter(Boolean).slice(0, 6).join('\n')
    return { ok: false, reason: 'switch-failed', detail }
  }
  return { ok: true, detach: full, hash: full.slice(0, 7) }
}

/** Collect one request body as UTF-8 text, bounded. */
function readBody(req, limit = 64 * 1024) {
  return new Promise((done) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= limit) chunks.push(chunk)
    })
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => done(''))
  })
}

/** Keep an error message useful in one line without echoing a whole log. */
function clipText(text, limit = 400) {
  const value = String(text ?? '')
    .replace(/\r/g, '')
    .trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…`
}

/** Conventional-Commit type derived from the paths being committed. */
function commitType(paths) {
  if (paths.length === 0) return 'chore'
  const list = paths.map((value) => value.toLowerCase().replace(/\\/g, '/'))
  const isDoc = (path) => /\.(md|mdx|txt|rst|adoc)$/.test(path) || /(^|\/)docs?\//.test(path)
  const isTest = (path) => /(^|\/)(test|tests|__tests__|spec)\//.test(path) || /\.(test|spec)\.[^/]+$/.test(path)
  if (list.every(isDoc)) return 'docs'
  if (list.every(isTest)) return 'test'
  return 'chore'
}

/**
 * Commit every working-tree change, optionally pushing afterwards. Deliberately
 * user-triggered only: no background timer ever calls this, it never amends or
 * rewrites history, and a detached HEAD is only committed after the caller
 * names the branch that will hold the commit.
 */
async function autoCommit(root, state, options = {}) {
  const wantedMessage = typeof options.message === 'string' ? options.message.replace(/\r/g, '').trim() : ''
  const wantedPush = options.push === true
  const credentials = normaliseCredentials(options)
  let createdBranch = ''

  const conflicted = (state.files ?? []).filter((file) => file.conflicted).map((file) => file.path)
  const paths = (state.files ?? []).map((file) => file.path).filter(Boolean)
  const hasChanges = paths.length > 0
  const ahead = Number.isFinite(Number(state.ahead)) ? Number(state.ahead) : 0
  const upstream = typeof state.upstream === 'string' ? state.upstream : ''

  // Nothing to commit: "push" degrades to pushing whatever is already ahead,
  // and reports plainly when there is nothing to push either.
  if (!hasChanges) {
    if (!wantedPush) return { ok: false, reason: 'nothing-to-commit' }
    if (state.detached) {
      return { ok: false, reason: 'detached', detail: 'HEAD is detached; nothing can be pushed' }
    }
    if (upstream !== '' && ahead <= 0) {
      return { ok: false, reason: 'nothing-to-push', upstream, ahead }
    }
    const pushOnly = await pushCommitted(root, state.branch, credentials, { token: options.token })
    return {
      ok: true,
      committed: false,
      root,
      short: '',
      hash: '',
      subject: '',
      message: '',
      files: 0,
      branch: state.branch,
      createdBranch: '',
      ahead,
      pushed: pushOnly.pushed === true,
      skipped: false,
      pushReason: pushOnly.pushReason ?? '',
      pushDetail: pushOnly.pushDetail ?? '',
      upstream: pushOnly.upstream ?? upstream,
      needsCredentials: pushOnly.needsCredentials === true,
    }
  }

  if (conflicted.length > 0) {
    return { ok: false, reason: 'conflicted', detail: clipText(conflicted.slice(0, 20).join(', ')) }
  }

  if (state.detached) {
    const branchName = typeof options.branch === 'string' ? options.branch.trim() : ''
    if (branchName === '') {
      return {
        ok: false,
        reason: 'detached',
        needsBranch: true,
        detail: 'HEAD is detached; name a branch to hold the commit',
      }
    }
    if (branchName.startsWith('-') || branchName.length > 200) {
      return { ok: false, reason: 'invalid-branch', detail: clipText(branchName) }
    }
    const valid = await git(root, ['check-ref-format', '--branch', branchName])
    if (valid.failed) return { ok: false, reason: 'invalid-branch', detail: clipText(valid.err || branchName) }
    const exists = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`])
    if (!exists.failed && exists.out.trim() !== '') {
      return { ok: false, reason: 'branch-exists', detail: branchName }
    }
  }

  if (state.detached) {
    const branchName = options.branch.trim()
    const created = await git(root, ['switch', '-c', branchName])
    if (created.failed) return { ok: false, reason: 'git-error', detail: clipText(created.err || created.out) }
    createdBranch = branchName
  }

  const generatedSubject = `${commitType(paths)}: auto-commit ${paths.length} file${paths.length === 1 ? '' : 's'}`
  const listed = paths.slice(0, 25).join('\n')
  const generatedBody = paths.length > 25 ? `${listed}\n... and ${paths.length - 25} more` : listed
  let subject = generatedSubject
  let body = generatedBody
  if (wantedMessage !== '') {
    const lines = wantedMessage.split('\n')
    subject = (lines.shift() ?? '').trim().slice(0, 200)
    if (subject === '') subject = generatedSubject
    body = lines.join('\n').trim()
  }

  const staged = await git(root, ['add', '-A'])
  if (staged.failed) {
    return { ok: false, reason: 'git-error', detail: clipText(staged.err || staged.out) }
  }

  const commitArgs = [...(Array.isArray(options.identity) ? options.identity : []), 'commit', '-m', subject]
  if (body !== '') commitArgs.push('-m', body)
  const committed = await git(root, commitArgs, 60_000)
  if (committed.failed) {
    const detail = clipText(committed.err || committed.out)
    if (/nothing to commit|no changes added to commit/i.test(detail)) {
      return { ok: false, reason: 'nothing-to-commit', detail }
    }
    return { ok: false, reason: 'git-error', detail }
  }

  const [shortResult, fullResult, branchResult] = await Promise.all([
    git(root, ['rev-parse', '--short', 'HEAD']),
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
  ])
  const branch = branchResult.failed ? createdBranch : branchResult.out.trim() || createdBranch
  const push = wantedPush
    ? await pushCommitted(root, branch, credentials, { token: options.token })
    : { pushed: false, skipped: true }

  return {
    ok: true,
    committed: true,
    root,
    short: shortResult.out.trim(),
    hash: fullResult.out.trim(),
    subject,
    message: body === '' ? subject : `${subject}\n\n${body}`,
    files: paths.length,
    branch,
    createdBranch,
    pushed: push.pushed === true,
    skipped: push.skipped === true,
    pushReason: push.pushReason ?? '',
    pushDetail: push.pushDetail ?? '',
    upstream: push.upstream ?? '',
    needsCredentials: push.needsCredentials === true,
  }
}

/** Username/password pair from a request body, or null when absent. */
function normaliseCredentials(options) {
  const password = typeof options.password === 'string' ? options.password : ''
  if (password === '') return null
  const username = typeof options.username === 'string' && options.username.trim() !== '' ? options.username.trim() : 'git'
  return { username, password }
}

/** Environment that makes network git fail fast instead of prompting. */
const NETWORK_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo',
  GCM_INTERACTIVE: 'never',
})

/** True when a failed push most likely only needs credentials. */
function isAuthFailure(detail) {
  return /could not read Username|terminal prompts disabled|Authentication failed|Invalid username or password|Permission denied \(publickey\)|Support for password authentication was removed|fatal: Authentication|403 Forbidden|401 Unauthorized/i.test(
    detail,
  )
}

/**
 * Write a throw-away askpass helper (plus the two answers it echoes) so a single
 * push can use a one-shot password. The secret reaches git through a helper
 * process and never through argv; the directory is deleted by the caller.
 *
 * Exported for the self-tests only; the plugin itself never calls it directly.
 */
export async function createAskpass(credentials) {
  // The pid keeps concurrent test processes (and parallel pushes) from counting
  // each other's helper directories.
  const dir = await mkdtemp(join(tmpdir(), `dsh-git-bar-askpass-${process.pid}-`))
  try {
    await writeFile(join(dir, 'username.txt'), credentials.username, 'utf8')
    await writeFile(join(dir, 'password.txt'), credentials.password, 'utf8')
    if (process.platform === 'win32') {
      const script = [
        '@echo off',
        'echo %~1 | findstr /I "username" >nul',
        'if errorlevel 1 (',
        '  type "%~dp0password.txt"',
        ') else (',
        '  type "%~dp0username.txt"',
        ')',
        '',
      ].join('\r\n')
      const path = join(dir, 'askpass.cmd')
      await writeFile(path, script, 'utf8')
      return { dir, path }
    }
    const path = join(dir, 'askpass.sh')
    await writeFile(
      path,
      ['#!/bin/sh', 'case "$1" in', '  *[Uu]sername*) cat "$(dirname "$0")/username.txt" ;;', '  *) cat "$(dirname "$0")/password.txt" ;;', 'esac', ''].join('\n'),
      'utf8',
    )
    await chmod(path, 0o755)
    return { dir, path }
  } catch (error) {
    await rmPath(dir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/** Where a push would go: the configured upstream, else origin/first remote. */
async function pushTarget(root, branch) {
  const upstreamResult = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  const configured = upstreamResult.failed ? '' : upstreamResult.out.trim()
  if (configured !== '' && !configured.startsWith('-')) {
    return { upstream: configured, remote: '', branch, setTracking: false }
  }
  const remotes = await git(root, ['remote'])
  const names = remotes.failed
    ? []
    : remotes.out
        .split('\n')
        .map((value) => value.trim())
        .filter((value) => value !== '' && !value.startsWith('-'))
  if (names.length === 0) return { upstream: '', remote: '', branch, setTracking: false, reason: 'no-remote' }
  const remote = names.includes('origin') ? 'origin' : names[0]
  return { upstream: `${remote}/${branch}`, remote, branch, setTracking: true }
}

/** Read a JSON object body; an empty or broken body becomes `{}`. */
async function readPayload(req) {
  try {
    const raw = await readBody(req)
    const parsed = raw.trim() === '' ? {} : JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Validate the `paths` array of a file-operation request against the repo. */
function requestPaths(root, payload, limit = 500) {
  const raw = Array.isArray(payload?.paths) ? payload.paths : []
  if (raw.length === 0 || raw.length > limit) return null
  const paths = []
  for (const entry of raw) {
    const safe = relativePath(entry, root)
    if (!safe || safe.startsWith('-')) return null
    if (!paths.includes(safe)) paths.push(safe)
  }
  return paths
}

/** Current status keyed by path, for validating file operations. */
async function statusByPath(root) {
  const result = await git(root, ['status', '--porcelain=v1', '-z', '-uall'])
  const files = parseStatus(result.out)
  return { files, map: new Map(files.map((file) => [file.path, file])) }
}

/** Stage the given paths (or everything with `all: true`). */
async function stagePaths(root, payload) {
  if (payload?.all === true) {
    const added = await git(root, ['add', '-A'])
    if (added.failed) return { ok: false, reason: 'git-error', detail: clipText(added.err || added.out) }
    const state = await statusByPath(root)
    return { ok: true, staged: state.files.filter((file) => file.staged).map((file) => file.path), all: true }
  }
  const paths = requestPaths(root, payload)
  if (!paths) return { ok: false, reason: 'missing-paths' }
  const added = await git(root, ['add', '--', ...paths])
  if (added.failed) return { ok: false, reason: 'git-error', detail: clipText(added.err || added.out) }
  return { ok: true, staged: paths }
}

/** Move the given paths back out of the index. */
async function unstagePaths(root, payload) {
  if (payload?.all === true) {
    const reset = await git(root, ['reset', '-q', 'HEAD', '--', '.'])
    if (reset.failed) return { ok: false, reason: 'git-error', detail: clipText(reset.err || reset.out) }
    return { ok: true, unstaged: [], all: true }
  }
  const paths = requestPaths(root, payload)
  if (!paths) return { ok: false, reason: 'missing-paths' }
  const reset = await git(root, ['restore', '--staged', '--', ...paths])
  if (reset.failed) return { ok: false, reason: 'git-error', detail: clipText(reset.err || reset.out) }
  return { ok: true, unstaged: paths }
}

/**
 * Throw away working-tree changes of tracked paths (restores both index and
 * worktree from HEAD, so an added-then-edited file goes back to its committed
 * content). Untracked files are refused here — they need `clean`, which the
 * client only offers after its own confirmation.
 */
async function discardPaths(root, payload) {
  const paths = requestPaths(root, payload)
  if (!paths) return { ok: false, reason: 'missing-paths' }
  const state = await statusByPath(root)
  const untracked = paths.filter((path) => state.map.get(path)?.untracked)
  if (untracked.length > 0) {
    return { ok: false, reason: 'untracked-needs-clean', detail: clipText(untracked.join(', ')) }
  }
  const conflicted = paths.filter((path) => state.map.get(path)?.conflicted)
  if (conflicted.length > 0) {
    return { ok: false, reason: 'conflicted-needs-resolve', detail: clipText(conflicted.join(', ')) }
  }
  const restored = await git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths])
  if (restored.failed) {
    return { ok: false, reason: 'git-error', detail: clipText(restored.err || restored.out) }
  }
  return { ok: true, discarded: paths }
}

/** Delete untracked paths from disk (git clean, files only). */
async function cleanPaths(root, payload) {
  const paths = requestPaths(root, payload)
  if (!paths) return { ok: false, reason: 'missing-paths' }
  const state = await statusByPath(root)
  const tracked = paths.filter((path) => !state.map.get(path)?.untracked)
  if (tracked.length > 0) {
    return { ok: false, reason: 'tracked-needs-discard', detail: clipText(tracked.join(', ')) }
  }
  const cleaned = await git(root, ['clean', '-f', '--', ...paths])
  if (cleaned.failed) return { ok: false, reason: 'git-error', detail: clipText(cleaned.err || cleaned.out) }
  return { ok: true, cleaned: paths }
}

/** Resolve conflicted paths by taking one side wholesale. */
async function resolvePaths(root, payload) {
  const side = payload?.side === 'ours' ? 'ours' : payload?.side === 'theirs' ? 'theirs' : ''
  if (side === '') return { ok: false, reason: 'missing-side' }
  const paths = requestPaths(root, payload)
  if (!paths) return { ok: false, reason: 'missing-paths' }
  const state = await statusByPath(root)
  const notConflicted = paths.filter((path) => !state.map.get(path)?.conflicted)
  if (notConflicted.length > 0) {
    return { ok: false, reason: 'not-conflicted', detail: clipText(notConflicted.join(', ')) }
  }
  const checkout = await git(root, ['checkout', `--${side}`, '--', ...paths])
  if (checkout.failed) {
    return { ok: false, reason: 'git-error', detail: clipText(checkout.err || checkout.out) }
  }
  const added = await git(root, ['add', '--', ...paths])
  if (added.failed) return { ok: false, reason: 'git-error', detail: clipText(added.err || added.out) }
  return { ok: true, resolved: paths, side }
}

/** Undo the last commit, keeping its changes staged (`reset --soft`). */
async function undoCommit(root) {
  const previous = await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD~1'])
  if (previous.failed || previous.out.trim() === '') {
    return { ok: false, reason: 'no-previous-commit' }
  }
  const subject = await git(root, ['log', '-1', '--pretty=%s'])
  const reset = await git(root, ['reset', '--soft', 'HEAD~1'])
  if (reset.failed) return { ok: false, reason: 'git-error', detail: clipText(reset.err || reset.out) }
  const head = await git(root, ['rev-parse', '--short', 'HEAD'])
  return { ok: true, undone: clipText(subject.out.trim(), 200), short: head.out.trim() }
}

/** Why a push was refused, from git's own message. Pure so tests can cover it. */
export function classifyPushFailure(detail) {
  const text = String(detail ?? '')
  if (/refusing to allow an OAuth App|workflow scope|create or update workflow/i.test(text)) return 'workflow-scope'
  if (/non-fast-forward|fetch first|! \[rejected\]/i.test(text)) return 'out-of-date'
  return 'push-failed'
}

/**
 * Push a branch. Never force-pushes. Without credentials git is told to fail
 * instead of prompting; with a one-shot password a temporary askpass helper
 * answers the prompt, and the directory is removed before returning.
 */
async function pushCommitted(root, branch, credentials = null, options = {}) {
  const target = await pushTarget(root, branch)
  if (target.reason === 'no-remote') {
    return { pushed: false, pushReason: 'no-remote', pushDetail: 'no git remote is configured' }
  }
  const token = typeof options.token === 'string' ? options.token : ''
  const effective = credentials ?? (token !== '' ? { username: 'x-access-token', password: token } : null)
  const transport = token === '' ? [] : await githubTransportArgs(root, target)
  const attempts = gitTransportAttempts(await detectProxy())
  const pushArgs = target.setTracking ? ['push', '--set-upstream', target.remote, branch] : ['push']

  let helper = null
  try {
    if (effective) {
      helper = await createAskpass(effective)
    }
    const env = helper
      ? {
          ...NETWORK_ENV,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: helper.path,
          GCM_INTERACTIVE: 'never',
          SSH_ASKPASS: helper.path,
          SSH_ASKPASS_REQUIRE: 'force',
        }
      : NETWORK_ENV
    let pushed = null
    let lastDetail = ''
    for (const attempt of attempts) {
      pushed = await git(root, [...attempt, ...transport, ...pushArgs], 120_000, env)
      if (!pushed.failed) break
      lastDetail = clipText(pushed.err || pushed.out)
      // Retry only when the transport itself looks broken; auth/ref conflicts are final.
      if (!isTransportFailure(lastDetail) || attempt === attempts[attempts.length - 1]) break
    }
    if (pushed && pushed.failed) {
      const detail = lastDetail
      return {
        pushed: false,
        pushReason: classifyPushFailure(detail),
        pushDetail: detail,
        upstream: target.upstream,
        needsCredentials: effective === null && isAuthFailure(detail),
      }
    }
    return { pushed: true, upstream: target.upstream, needsCredentials: false }
  } catch (error) {
    return {
      pushed: false,
      pushReason: 'push-failed',
      pushDetail: clipText(error && error.message ? error.message : error),
      upstream: target.upstream,
    }
  } finally {
    if (helper) await rmPath(helper.dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ─────────────────────────────── GitHub ───────────────────────────────
/**
 * GitHub support inside the Host half.
 *
 * Three jobs: keep a user token (DSH credential store first, an owner-only file
 * as fallback), answer the profile and repository questions the browser half
 * needs, and make the existing commit/push paths run as that account. The token
 * never reaches the browser, argv, the repository config or a log line: it
 * travels through a throw-away askpass helper (deleted before returning) and
 * through an `Authorization` header only.
 */
const GITHUB_API = 'https://api.github.com'
const GITHUB_WEB = 'https://github.com'
const GITHUB_USER_AGENT = 'dsh-git-bar'
/**
 * Scopes the browser sign-in asks for. `workflow` is included because a push
 * that touches `.github/workflows/*` is refused by GitHub without it, and this
 * plugin is used to push exactly those files.
 */
const GITHUB_DEVICE_SCOPE = 'repo read:user workflow'
const GITHUB_TOKEN_KEY = 'dsh-git-bar/github-token'
const GITHUB_TIMEOUT_MS = 20_000
const GITHUB_DEVICE_TTL_MS = 15 * 60_000
const GITHUB_REPO_LIMIT = 100
const GITHUB_CLONE_TIMEOUT_MS = 300_000
/**
 * Client id of the OAuth App this project ships for device-flow sign-in.
 *
 * A device-flow client id is public by design: the flow exchanges it for a
 * user code and never uses a client secret, so baking one into a distributed
 * plugin is how every desktop tool offers "sign in with GitHub". Users can
 * still point the plugin at their own OAuth App through `deviceClientId`.
 * Keep this empty until the project-owned app exists; `missing-client-id`
 * then tells the panel to explain the two options instead of failing silently.
 */
const DEFAULT_DEVICE_CLIENT_ID = 'Ov23liMkw1wzdh9gZdHU'
/** Host-held device-flow attempts, keyed by an opaque id handed to the browser. */
const deviceFlows = new Map()

/**
 * Which OAuth App a device-flow attempt uses. Pure so the self-tests can cover
 * the whole priority chain without rewriting the shipped constant.
 * @param configClientId - the profile's own app from `github.json`
 * @param envClientId - the operator/test override
 * @param shippedClientId - the app baked into this release
 * @returns the client id, or '' when no app is available at all
 */
export function resolveDeviceClientId(configClientId, envClientId, shippedClientId = DEFAULT_DEVICE_CLIENT_ID) {
  const own = typeof configClientId === 'string' ? configClientId.trim() : ''
  if (own !== '') return own
  const env = typeof envClientId === 'string' ? envClientId.trim() : ''
  if (env !== '') return env
  return typeof shippedClientId === 'string' ? shippedClientId.trim() : ''
}

/** The client id a device-flow attempt uses: the profile's own app, else the shipped one. */
function effectiveDeviceClientId(config) {
  return resolveDeviceClientId(config && config.deviceClientId, process.env.DSH_GIT_BAR_OAUTH_CLIENT_ID)
}

/** Directory this plugin owns for its own small state files. */
function githubDataDir() {
  const override = process.env.DSH_GIT_BAR_DATA_DIR
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  const profile = process.env.DSH_PROFILE_DIR
  if (typeof profile === 'string' && profile.trim() !== '') return join(profile.trim(), 'data', 'dsh-git-bar')
  return join(homedir(), '.dsh-git-bar')
}

/**
 * Client diagnostics channel: the browser half posts one JSON blob when the
 * clone panel opens, so a rendering problem can be inspected from disk instead
 * of guessed at. Capped so a runaway client cannot fill the disk.
 */
const CLIENT_LOG_MAX_BYTES = 256 * 1024

async function appendClientLog(entry) {
  const dir = githubDataDir()
  await mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => {})
  const file = join(dir, 'client-log.jsonl')
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
  const existing = await readFile(file, 'utf8').catch(() => '')
  const next = existing.length + line.length > CLIENT_LOG_MAX_BYTES ? line : existing + line
  await writeFile(file, next, { encoding: 'utf8', mode: 0o600 })
  return file
}

async function readClientLog() {
  const file = join(githubDataDir(), 'client-log.jsonl')
  const text = await readFile(file, 'utf8').catch(() => '')
  const lines = text.trim() === '' ? [] : text.trim().split('\n').slice(-20)
  return { ok: true, file, entries: lines.map((line) => { try { return JSON.parse(line) } catch { return { raw: line } } }) }
}

/** Settings the browser half may read and patch. */
function githubDefaultConfig() {
  return { cloneRoot: join(homedir(), 'dsh-workspaces'), deviceClientId: '', useGithubIdentity: true }
}

function normaliseGithubConfig(raw) {
  const config = githubDefaultConfig()
  if (!raw || typeof raw !== 'object') return config
  if (typeof raw.cloneRoot === 'string' && raw.cloneRoot.trim() !== '') config.cloneRoot = raw.cloneRoot.trim()
  if (typeof raw.deviceClientId === 'string') config.deviceClientId = raw.deviceClientId.trim()
  if (typeof raw.useGithubIdentity === 'boolean') config.useGithubIdentity = raw.useGithubIdentity
  return config
}

async function readGithubConfig() {
  try {
    return normaliseGithubConfig(JSON.parse(await readFile(join(githubDataDir(), 'github.json'), 'utf8')))
  } catch {
    return normaliseGithubConfig(null)
  }
}

async function writeGithubConfig(patch) {
  const current = await readGithubConfig()
  const next = normaliseGithubConfig({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) })
  if (next.deviceClientId !== '' && !/^[A-Za-z0-9_-]{8,80}$/.test(next.deviceClientId)) {
    throw new Error('deviceClientId must look like a GitHub OAuth App client id')
  }
  await mkdir(githubDataDir(), { recursive: true })
  await writeFile(join(githubDataDir(), 'github.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/** The Node fetch captured before anything could replace it (the self-tests do). */
const nodeFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null
let electronFetchPromise = null

/**
 * fetch that honours the desktop app's network stack.
 *
 * Node's fetch dials directly: behind a system proxy (the common Windows setup,
 * and the only way to reach `github.com` on many networks) every request times
 * out. Electron's `net.fetch` runs on Chromium's stack, which reads the system
 * proxy settings, so the Host half prefers it and falls back to Node fetch when
 * the module or the API is unavailable (CLI runs, tests).
 */
function electronFetch() {
  if (electronFetchPromise) return electronFetchPromise
  electronFetchPromise = (async () => {
    try {
      const mod = await import('electron')
      const net = (mod && mod.net) ?? (mod && mod.default && mod.default.net)
      if (net && typeof net.fetch === 'function') return (url, init) => net.fetch(url, init)
    } catch {
      // Not running inside Electron, or `net` is not exposed: use Node fetch.
    }
    return null
  })()
  return electronFetchPromise
}

/** One HTTP call for the GitHub integration, proxy-aware and abortable. */
async function githubFetch(url, init) {
  // A replaced global fetch means a test harness owns the network.
  if (typeof globalThis.fetch === 'function' && globalThis.fetch !== nodeFetch) return globalThis.fetch(url, init)
  const viaElectron = await electronFetch()
  if (viaElectron) return viaElectron(url, init)
  if (nodeFetch) return nodeFetch(url, init)
  throw new Error('no fetch implementation is available')
}
function credentialsService(ctx) {
  try {
    return ctx.get('credentials')
  } catch {
    return undefined
  }
}

/**
 * The stored grant: `{ token, tokenKind, account, scopes, connectedAt }`.
 * The credential store keeps it as a `grant` record; without that service the
 * same document lives in an owner-only file inside this plugin's data dir.
 */
async function readGithubGrant(ctx) {
  const store = credentialsService(ctx)
  if (store && typeof store.readRecord === 'function') {
    try {
      const record = await store.readRecord(GITHUB_TOKEN_KEY)
      const payload = record && record.kind === 'grant' ? record.payload : null
      if (payload && typeof payload.token === 'string' && payload.token !== '') return payload
      return null
    } catch {
      // Fall through to the file store rather than reporting "signed out" on a
      // store hiccup that a working fallback can cover.
    }
  }
  try {
    const parsed = JSON.parse(await readFile(join(githubDataDir(), 'github-token.json'), 'utf8'))
    return parsed && typeof parsed.token === 'string' && parsed.token !== '' ? parsed : null
  } catch {
    return null
  }
}

async function writeGithubGrant(ctx, payload) {
  const store = credentialsService(ctx)
  if (store && typeof store.modifyRecord === 'function') {
    await store.modifyRecord(GITHUB_TOKEN_KEY, () => ({ kind: 'grant', payload }))
    return
  }
  await mkdir(githubDataDir(), { recursive: true })
  const file = join(githubDataDir(), 'github-token.json')
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await chmod(file, 0o600).catch(() => {})
}

async function clearGithubGrant(ctx) {
  const store = credentialsService(ctx)
  if (store && typeof store.deleteRecord === 'function') {
    try {
      await store.deleteRecord(GITHUB_TOKEN_KEY)
    } catch {
      // A store that cannot delete still gets the file fallback removed.
    }
  }
  await rmPath(join(githubDataDir(), 'github-token.json'), { force: true }).catch(() => {})
}

/** Plain string field from an untrusted API object. */
function asText(value) {
  return typeof value === 'string' ? value : ''
}

/** Trim a GitHub user document down to what the browser half may see. */
function githubAccountOf(user) {
  if (!user || typeof user !== 'object') return null
  const login = asText(user.login)
  if (login === '') return null
  const id = Number(user.id)
  return {
    login,
    name: asText(user.name),
    id: Number.isFinite(id) ? id : 0,
    avatarUrl: asText(user.avatar_url),
    htmlUrl: asText(user.html_url),
    email: asText(user.email),
  }
}

/**
 * `-c` arguments that make a plugin-created commit author *and* committer the
 * signed-in account, using the address GitHub keeps stable across account
 * renames. Empty when no account is known.
 */
export function githubIdentityArgs(account) {
  if (!account || typeof account.login !== 'string' || account.login === '') return []
  const login = account.login.replace(/[<>\s]/g, '')
  const name = (typeof account.name === 'string' && account.name.trim() !== '' ? account.name : login)
    .replace(/[<>\n]/g, '')
    .trim()
  const email = account.id > 0 ? `${account.id}+${login}@users.noreply.github.com` : `${login}@users.noreply.github.com`
  return ['-c', `user.name=${name === '' ? login : name}`, '-c', `user.email=${email}`]
}

/** GitHub URL shapes that still name an owner and a repository. */
const GITHUB_URL_PATTERNS = [
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i,
  /^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i,
]

/**
 * Accept `owner/name`, `github.com/owner/name`, a GitHub URL (https, `git@`,
 * `ssh://`), or any other concrete git URL. GitHub shapes keep owner and name so
 * the target folder and metadata stay meaningful; everything else is passed
 * through untouched, which lets users clone a repository they do not own.
 */
export function parseGithubRepo(spec) {
  const text = String(spec ?? '').trim()
  if (text === '') return null
  for (const pattern of GITHUB_URL_PATTERNS) {
    const found = text.match(pattern)
    if (found) return { kind: 'github', owner: found[1], name: found[2] }
  }
  if (/^(?:file:|git@|ssh:|git:|https?:|[A-Za-z]:[\\/]|\/)/.test(text)) return { kind: 'url', url: text }
  const match = text.replace(/^github\.com\//i, '').match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (!match) return null
  const owner = match[1]
  const name = match[2]
  if (owner === '.' || name === '.' || name === '..') return null
  return { kind: 'github', owner, name }
}

/** Target folder name for a parsed repository spec: the bare repository name. */
export function cloneFolderFor(parsed) {
  if (parsed.kind === 'github') return sanitizeCloneFolder(parsed.name) || 'repository'
  const tail = String(parsed.url).replace(/[/\\]+$/, '').replace(/\.git$/, '')
  const base = tail.split(/[/:]/).filter(Boolean).pop() ?? ''
  return sanitizeCloneFolder(base) || 'repository'
}

/** A folder name the filesystem accepts, or '' when nothing usable is left. */
export function sanitizeCloneFolder(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim()
  if (text === '' || text === '.' || text === '..') return ''
  return text.slice(0, 80)
}

/** First free `<base>`, `<base>-2`, `<base>-3`, … under `root`. */
async function uniqueCloneFolder(root, base) {
  const start = sanitizeCloneFolder(base) || 'repository'
  for (let attempt = 1; attempt <= 99; attempt += 1) {
    const name = attempt === 1 ? start : `${start}-${attempt}`
    const listing = await readdir(join(root, name)).catch(() => null)
    if (listing === null || listing.length === 0) return name
  }
  return `${start}-${Date.now().toString(36)}`
}

/** Absolute clone root: the request's, else the profile's, else the default. */
function cloneRootFor(payload, config) {
  const requested =
    typeof payload.root === 'string' && payload.root.trim() !== '' ? payload.root.trim() : config.cloneRoot
  return isAbsolute(requested) ? resolvePath(requested) : join(homedir(), requested)
}

/**
 * Where a clone would land, without cloning. The panel shows this before the
 * user confirms: the folder name is editable, so a requested one wins, and an
 * occupied destination gets a free `-2` suffix instead of failing the preview.
 */
async function githubClonePreview(ctx, payload = {}) {
  const parsed = parseGithubRepo(payload.repo)
  if (!parsed) return { ok: false, reason: 'bad-repo' }
  const config = await readGithubConfig()
  const root = cloneRootFor(payload, config)
  const requested = sanitizeCloneFolder(payload.folder)
  const suggested = cloneFolderFor(parsed)
  const folder = requested !== '' ? requested : await uniqueCloneFolder(root, suggested)
  const target = join(root, folder)
  const existing = await readdir(target).catch(() => null)
  const access = await githubAccessToken(ctx)
  return {
    ok: true,
    repo: parsed.kind === 'github' ? `${parsed.owner}/${parsed.name}` : parsed.url,
    kind: parsed.kind,
    root,
    folder,
    suggested,
    folderIsCustom: requested !== '',
    path: target,
    exists: existing !== null && existing.length > 0,
    signedIn: Boolean(access.token),
  }
}

/** One GitHub REST call; failures become `{ ok: false, reason }` rather than throwing. */
async function githubRequest(path, options = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-git-bar',
    'x-github-api-version': '2022-11-28',
  }
  if (typeof options.token === 'string' && options.token !== '') headers.authorization = `Bearer ${options.token}`
  const init = { method: options.method ?? 'GET', headers, signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  let response
  try {
    response = await githubFetch(`${GITHUB_API}${path}`, init)
  } catch (error) {
    return { ok: false, reason: 'network', detail: clipText(error && error.message ? error.message : error) }
  }
  const scopes = (response.headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
  // Expiring personal access tokens report their deadline through this header.
  const tokenExpiration = response.headers.get('github-authentication-token-expiration') ?? ''
  const text = await response.text().catch(() => '')
  let data = null
  try {
    data = text === '' ? null : JSON.parse(text)
  } catch {
    data = null
  }
  if (!response.ok) {
    const reason =
      response.status === 401
        ? 'bad-credentials'
        : response.status === 404
          ? 'not-found'
          : response.status === 403
            ? 'forbidden'
            : 'http-error'
    return { ok: false, reason, status: response.status, detail: clipText((data && data.message) ?? text), scopes }
  }
  return { ok: true, data, scopes, tokenExpiration }
}

/** Whether a stored grant is close enough to its deadline to refresh first. */
function githubGrantExpiring(grant) {
  if (!grant || typeof grant.expiresAt !== 'number' || !Number.isFinite(grant.expiresAt)) return false
  return grant.expiresAt - Date.now() < 60_000
}

/**
 * Trade a stored refresh token for a fresh access token. GitHub rotates the
 * refresh token on every use, so the new pair replaces the whole grant.
 */
async function githubRefreshGrant(ctx, grant) {
  const config = await readGithubConfig()
  const clientId = effectiveDeviceClientId(config)
  if (!grant || typeof grant.refreshToken !== 'string' || grant.refreshToken === '' || clientId === '') {
    return { ok: false, reason: 'reauth-required' }
  }
  let response
  try {
    response = await githubFetch(`${GITHUB_WEB}/login/oauth/access_token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: grant.refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, reason: 'network', detail: clipText(error && error.message ? error.message : error) }
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || typeof data.access_token !== 'string' || data.access_token === '') {
    return { ok: false, reason: 'reauth-required', detail: clipText((data && data.error_description) ?? `HTTP ${response.status}`) }
  }
  const next = {
    ...grant,
    token: data.access_token,
    tokenKind: 'device',
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token !== '' ? data.refresh_token : grant.refreshToken,
    expiresAt: Number.isFinite(Number(data.expires_in)) ? Date.now() + Number(data.expires_in) * 1000 : grant.expiresAt,
    scopes: data.scope ? String(data.scope).split(',').map((value) => value.trim()).filter(Boolean) : grant.scopes,
    refreshedAt: Date.now(),
  }
  await writeGithubGrant(ctx, next)
  await writeGithubEnvToken(next.token)
  return { ok: true, grant: next }
}

/**
 * The access token for one API call, refreshed when the grant is near its
 * deadline. Returns `{ token }` or `{ reason }` so callers can answer
 * `reauth-required` instead of failing with a bare 401.
 */
async function githubAccessToken(ctx) {
  const grant = await readGithubGrant(ctx)
  if (!grant) return { reason: 'not-signed-in' }
  if (!githubGrantExpiring(grant)) return { grant, token: grant.token }
  const refreshed = await githubRefreshGrant(ctx, grant)
  if (!refreshed.ok) return { reason: refreshed.reason ?? 'reauth-required', detail: refreshed.detail ?? '' }
  return { grant: refreshed.grant, token: refreshed.grant.token }
}

/**
 * Environment name the shipped MCP row reads. The row itself stays disabled
 * until the variable exists, so a signed-out profile never tries to connect.
 */
const GITHUB_MCP_ENV = 'DSH_GIT_BAR_GITHUB_TOKEN'

/** Harness home, where the boot-time `.env` layer lives. */
function dshHome() {
  const explicit = process.env.DSH_HOME
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim()
  return join(homedir(), '.dsh')
}

/**
 * Upsert (or remove) the GitHub token line in the Harness-home `.env`, which
 * DSH loads at boot. This is what lets the declarative MCP row authenticate
 * without the token ever appearing in a patch file or a settings document.
 */
async function writeGithubEnvToken(token) {
  const file = join(dshHome(), '.env')
  let lines = []
  try {
    lines = (await readFile(file, 'utf8')).split('\n')
  } catch {
    lines = []
  }
  const kept = lines.filter((line) => !line.startsWith(`${GITHUB_MCP_ENV}=`))
  if (typeof token === 'string' && token !== '') kept.push(`${GITHUB_MCP_ENV}=${token}`)
  const text = `${kept.join('\n').replace(/\n+$/, '')}\n`
  await mkdir(dshHome(), { recursive: true }).catch(() => {})
  if (kept.length === 0) {
    await rmPath(file, { force: true }).catch(() => {})
  } else {
    await writeFile(file, text, { encoding: 'utf8', mode: 0o600 })
    await chmod(file, 0o600).catch(() => {})
  }
  if (typeof token === 'string' && token !== '') process.env[GITHUB_MCP_ENV] = token
  else delete process.env[GITHUB_MCP_ENV]
}

/**
 * Connectivity for pushes and clones.
 *
 * `git` does not read the desktop app's network stack, so behind a system proxy
 * every https remote times out while the GitHub REST calls (which go through
 * Electron's fetch) work fine. These helpers detect the proxy once, hand it to
 * git as `-c http.proxy=… -c https.proxy=…` for one command, and answer a
 * reachability probe the panel can show.
 */
const PROXY_CACHE_MS = 60_000
const REACHABILITY_CACHE_MS = 15_000
const proxyCache = { at: 0, value: null }
const reachabilityCache = { at: 0, value: null }

/** Turn one proxy specifier into a URL git accepts. */
export function normalizeProxyUrl(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return ''
  if (/^[a-z0-9+.-]+:\/\//i.test(text)) return text
  return `http://${text}`
}

/**
 * Parse Electron's `resolveProxy` answer ("PROXY host:port; DIRECT") or a bare
 * host:port into `{ mode, url }`. Pure so the self-tests cover every shape.
 */
export function parseProxyResult(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return { mode: 'unknown', url: '' }
  const parts = text
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  // A concrete proxy outranks the trailing DIRECT fallback in Electron's answer.
  for (const part of parts) {
    const match = part.match(/^(PROXY|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+([^\s]+)$/i)
    if (!match) continue
    const scheme = /^socks/i.test(match[1]) ? match[1].toLowerCase() : 'http'
    return { mode: 'proxy', url: `${scheme}://${match[2]}` }
  }
  for (const part of parts) {
    if (/^direct$/i.test(part)) return { mode: 'direct', url: '' }
  }
  if (/^[^\s/;]+:\d+$/.test(text)) return { mode: 'proxy', url: `http://${text}` }
  return { mode: 'unknown', url: '' }
}

/** `-c` arguments that make one git command honour the detected proxy. */
export function gitProxyArgs(proxy) {
  if (!proxy || proxy.mode !== 'proxy' || typeof proxy.url !== 'string' || proxy.url === '') return []
  return ['-c', `http.proxy=${proxy.url}`, '-c', `https.proxy=${proxy.url}`]
}

/**
 * Argument sets to try, in order. A detected proxy is not always right: with a
 * TUN-mode client git reaches GitHub directly while forcing the proxy breaks the
 * TLS handshake, so the direct attempt goes first and the proxy is the fallback.
 */
export function gitTransportAttempts(proxy) {
  const proxied = gitProxyArgs(proxy)
  return proxied.length === 0 ? [[]] : [[], proxied]
}

/** Failures worth retrying through the other transport. */
export function isTransportFailure(detail) {
  const text = String(detail ?? '')
  if (text === '') return false
  return /unable to access|Could not resolve|timed out|timed? ?out|TLS|handshake|SSL|Connection (refused|reset|closed)|Failed to connect|network/i.test(text)
}

/** Windows registry proxy, used when the Electron network service is absent. */
async function readWindowsProxy() {
  if (process.platform !== 'win32') return null
  try {
    const enabled = await new Promise((done) => {
      execFile(
        'reg.exe',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'],
        { timeout: 4000, windowsHide: true, encoding: 'utf8' },
        (error, stdout) => done(error ? '' : String(stdout)),
      )
    })
    if (!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(enabled)) return null
    const server = await new Promise((done) => {
      execFile(
        'reg.exe',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'],
        { timeout: 4000, windowsHide: true, encoding: 'utf8' },
        (error, stdout) => done(error ? '' : String(stdout)),
      )
    })
    const match = server.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)
    if (!match) return null
    // "host:port" or "http=host:port;https=host:port"
    const perScheme = match[1].match(/https?=([^;]+)/i)
    const candidate = perScheme ? perScheme[1] : match[1].split(';')[0]
    const url = normalizeProxyUrl(candidate)
    return url === '' ? null : { mode: 'proxy', url }
  } catch {
    return null
  }
}

/** Electron's Chromium-stack proxy resolution, matching what `net.fetch` uses. */
async function readElectronProxy() {
  try {
    const mod = await import('electron')
    const session = (mod && mod.session) || (mod && mod.default && mod.default.session)
    const target = session && session.defaultSession
    if (!target || typeof target.resolveProxy !== 'function') return null
    const resolved = await target.resolveProxy('https://github.com')
    const parsed = parseProxyResult(resolved)
    return parsed.mode === 'unknown' ? null : parsed
  } catch {
    return null
  }
}

/** The proxy git should use; `none` in DSH_GIT_BAR_HTTP_PROXY forces direct. */
async function detectProxy() {
  const override = process.env.DSH_GIT_BAR_HTTP_PROXY
  if (typeof override === 'string' && override.trim() !== '') {
    const text = override.trim()
    if (/^(none|direct|off)$/i.test(text)) return { mode: 'direct', url: '' }
    return { mode: 'proxy', url: normalizeProxyUrl(text) }
  }
  if (proxyCache.value && Date.now() - proxyCache.at < PROXY_CACHE_MS) return proxyCache.value
  const electron = await readElectronProxy()
  const registry = electron ? null : await readWindowsProxy()
  const envProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.http_proxy ?? process.env.HTTP_PROXY
  const value = electron ?? registry ?? (envProxy ? { mode: 'proxy', url: normalizeProxyUrl(envProxy) } : { mode: 'unknown', url: '' })
  proxyCache.at = Date.now()
  proxyCache.value = value
  return value
}

/** Probe GitHub once per 15s; clone requests should not depend on it. */
async function probeGithubReachability() {
  if (reachabilityCache.value && Date.now() - reachabilityCache.at < REACHABILITY_CACHE_MS) return reachabilityCache.value
  const started = Date.now()
  // The API endpoint answers in one small GET and needs a User-Agent; the HTML
  // endpoint is the fallback for networks that filter api.github.com.
  const targets = [
    { url: `${GITHUB_API}/rate_limit`, via: 'api' },
    { url: GITHUB_WEB, via: 'html' },
  ]
  let value = { reachable: false, status: 0, latencyMs: 0, via: '' }
  let detail = ''
  for (const target of targets) {
    try {
      const response = await githubFetch(target.url, {
        method: 'GET',
        headers: { 'User-Agent': GITHUB_USER_AGENT, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000),
      })
      // Any HTTP answer below 500 proves the network path works; 401/403 just
      // means the probe is not authenticated.
      value = { reachable: response.status < 500, status: response.status, latencyMs: Date.now() - started, via: target.via }
      break
    } catch (error) {
      detail = clipText(error && error.message ? error.message : error)
      value = { reachable: false, status: 0, latencyMs: Date.now() - started, via: target.via }
    }
  }
  if (!value.reachable && detail !== '') value.detail = detail
  reachabilityCache.at = Date.now()
  reachabilityCache.value = value
  return value
}

/** How this workspace would push right now (transport + remote URL). */
async function pushTransportOf(root) {
  const remote = await git(root, ['remote', 'get-url', 'origin'])
  const url = remote.failed ? '' : remote.out.trim()
  if (url === '') return { transport: 'none', remote: '', url: '' }
  return { transport: /^https?:\/\//i.test(url) ? 'https' : 'ssh', remote: 'origin', url }
}

/** Everything the panel needs to show connectivity honestly. */
async function githubNetwork(ctx, url) {
  const proxy = await detectProxy()
  const [github, root] = await Promise.all([
    probeGithubReachability(),
    (async () => {
      try {
        return await repositoryRoot(resolveCwd(ctx, url))
      } catch {
        return null
      }
    })(),
  ])
  const push = root ? await pushTransportOf(root) : { transport: 'none', remote: '', url: '' }
  return {
    ok: true,
    proxy,
    github,
    git: { usesProxyForPush: proxy.mode === 'proxy' },
    push,
  }
}

/** Everything the browser half may know about the current sign-in. */
async function githubStatus(ctx) {
  const [config, grant] = await Promise.all([readGithubConfig(), readGithubGrant(ctx)])
  const shipped = DEFAULT_DEVICE_CLIENT_ID.trim()
  return {
    ok: true,
    signedIn: Boolean(grant && grant.token),
    account: (grant && grant.account) || null,
    tokenKind: (grant && grant.tokenKind) || null,
    connectedAt: grant && typeof grant.connectedAt === 'number' ? grant.connectedAt : null,
    scopes: grant && Array.isArray(grant.scopes) ? grant.scopes : null,
    expiresAt: grant && typeof grant.expiresAt === 'number' ? grant.expiresAt : null,
    expired: Boolean(grant && typeof grant.expiresAt === 'number' && grant.expiresAt <= Date.now()),
    refreshable: Boolean(grant && typeof grant.refreshToken === 'string' && grant.refreshToken !== ''),
    mcp: { configured: Boolean(process.env[GITHUB_MCP_ENV]), envName: GITHUB_MCP_ENV },
    device: {
      ready: effectiveDeviceClientId(config) !== '',
      custom: config.deviceClientId !== '',
      shipped: shipped !== '',
    },
    config,
  }
}

/** Verify a token and persist it as a personal access token grant. */
async function githubLogin(ctx, token) {
  const verified = await githubRequest('/user', { token })
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === 'network' ? 'network' : 'bad-credentials', detail: verified.detail ?? '' }
  }
  const account = githubAccountOf(verified.data)
  if (!account) return { ok: false, reason: 'bad-credentials' }
  const expiresAt = Date.parse(verified.tokenExpiration ?? '')
  await writeGithubGrant(ctx, {
    token,
    tokenKind: 'pat',
    account,
    scopes: verified.scopes,
    connectedAt: Date.now(),
    ...(Number.isFinite(expiresAt) ? { expiresAt } : {}),
  })
  await writeGithubEnvToken(token)
  return githubStatus(ctx)
}

/**
 * Open a URL in the user's default browser. Electron's shell is the proper way;
 * the per-platform launchers are the fallback for a plain Node host. Only the
 * device-verification page is ever allowed through here.
 */
export async function openExternalUrl(rawUrl) {
  let parsed = null
  try {
    parsed = new URL(String(rawUrl ?? ''))
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !parsed.pathname.startsWith('/login/device')) {
    return { ok: false, reason: 'bad-url' }
  }
  const url = parsed.toString()
  try {
    const mod = await import('electron')
    const shell = (mod && mod.shell) || (mod && mod.default && mod.default.shell)
    if (shell && typeof shell.openExternal === 'function') {
      await shell.openExternal(url)
      return { ok: true, opened: 'electron', url }
    }
  } catch {
    // Fall through to the platform launcher.
  }
  try {
    if (process.platform === 'win32') {
      spawn('rundll32', ['url.dll,FileProtocolHandler', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref()
      return { ok: true, opened: 'rundll32', url }
    }
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
      return { ok: true, opened: 'open', url }
    }
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true, opened: 'xdg-open', url }
  } catch (error) {
    return { ok: false, reason: 'open-failed', detail: clipText(error && error.message ? error.message : error) }
  }
}

/** Decode an HTTP/1.1 chunked body (the OAuth endpoints answer chunked). */
export function dechunkBody(raw) {
  const text = String(raw ?? '')
  let index = 0
  let out = ''
  while (index < text.length) {
    const lineEnd = text.indexOf('\r\n', index)
    if (lineEnd < 0) break
    const size = Number.parseInt(text.slice(index, lineEnd).trim().split(';')[0], 16)
    if (!Number.isFinite(size) || size < 0) break
    if (size === 0) break
    out += text.slice(lineEnd + 2, lineEnd + 2 + size)
    index = lineEnd + 2 + size + 2
  }
  return out
}

/**
 * One HTTPS request through the system proxy's CONNECT tunnel, hand-rolled on
 * node:http + node:tls.
 *
 * Electron's fetch shares Chromium's network stack with the app; through this
 * machine's proxy it drops the connection to github.com's OAuth endpoints every
 * few calls ("fetch failed"), which used to break the browser sign-in. A private
 * tunnel is deterministic, cheap, and keeps the token request off that stack.
 */
async function proxyTunnelRequest(urlString, options = {}) {
  const proxy = await detectProxy()
  if (!proxy || proxy.mode !== 'proxy' || proxy.url === '') return null
  let proxyUrl = null
  try {
    proxyUrl = new URL(proxy.url)
  } catch {
    return null
  }
  if (!/^https?:$/.test(proxyUrl.protocol)) return null
  const target = new URL(urlString)
  const method = options.method ?? 'GET'
  const body = options.body ?? ''
  const timeoutMs = options.timeoutMs ?? 12_000
  const headers = { host: target.hostname, 'user-agent': GITHUB_USER_AGENT, ...(options.headers ?? {}) }
  if (body !== '') headers['content-length'] = String(Buffer.byteLength(body))
  headers.connection = 'close'

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }
    const tunnel = httpRequest({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port) || 80,
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      timeout: timeoutMs,
      headers: { host: `${target.hostname}:443` },
    })
    tunnel.setTimeout(timeoutMs, () => {
      tunnel.destroy()
      finish(reject, new Error('proxy connect timeout'))
    })
    tunnel.on('error', (error) => finish(reject, error))
    tunnel.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        finish(reject, new Error(`proxy CONNECT ${response.statusCode}`))
        return
      }
      const secure = tlsConnect({ socket, servername: target.hostname })
      const timer = setTimeout(() => {
        secure.destroy()
        finish(reject, new Error('tls timeout'))
      }, timeoutMs)
      secure.on('error', (error) => {
        clearTimeout(timer)
        finish(reject, error)
      })
      secure.on('close', () => clearTimeout(timer))
      secure.once('secureConnect', () => {
        const requestLine = `${method} ${target.pathname}${target.search} HTTP/1.1`
        const head = [requestLine, ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`)]
        secure.write(`${head.join('\r\n')}\r\n\r\n${body}`)
      })
      let raw = ''
      secure.setEncoding('latin1')
      secure.on('data', (chunk) => {
        raw += chunk
      })
      secure.on('end', () => {
        clearTimeout(timer)
        const split = raw.indexOf('\r\n\r\n')
        if (split < 0) {
          finish(reject, new Error('malformed response'))
          return
        }
        const headLines = raw.slice(0, split).split('\r\n')
        const status = Number.parseInt(headLines[0].split(' ')[1] ?? '', 10) || 0
        const responseHeaders = {}
        for (const line of headLines.slice(1)) {
          const colon = line.indexOf(':')
          if (colon > 0) responseHeaders[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
        }
        let text = Buffer.from(raw.slice(split + 4), 'latin1').toString('utf8')
        if (/chunked/i.test(responseHeaders['transfer-encoding'] ?? '')) text = dechunkBody(text)
        finish(resolve, { status, headers: responseHeaders, text })
      })
    })
    tunnel.end()
  })
}

/** POST to a github.com OAuth endpoint: proxy tunnel first, Electron fetch second. */
export async function githubOauthPost(path, params) {
  const body = new URLSearchParams(params).toString()
  const headers = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }
  try {
    const tunneled = await proxyTunnelRequest(`${GITHUB_WEB}${path}`, { method: 'POST', headers, body, timeoutMs: 10_000 })
    if (tunneled) return { ok: true, status: tunneled.status, text: tunneled.text }
  } catch {
    // Fall through to the app's own fetch.
  }
  try {
    const response = await githubFetch(`${GITHUB_WEB}${path}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(12_000),
    })
    return { ok: true, status: response.status, text: await response.text() }
  } catch (error) {
    return { ok: false, reason: 'network', detail: clipText(error && error.message ? error.message : error) }
  }
}

/** Begin an OAuth device-flow attempt; the device code never leaves the Host. */
async function githubDeviceStart() {
  const config = await readGithubConfig()
  const clientId = effectiveDeviceClientId(config)
  if (clientId === '') return { ok: false, reason: 'missing-client-id' }
  const response = await githubOauthPost('/login/device/code', { client_id: clientId, scope: GITHUB_DEVICE_SCOPE })
  if (response.ok !== true) return { ok: false, reason: 'network', detail: response.detail ?? '' }
  let data = null
  try {
    data = JSON.parse(response.text)
  } catch {
    data = null
  }
  if (response.status >= 400 || !data || typeof data.device_code !== 'string') {
    return { ok: false, reason: 'device-start-failed', detail: clipText((data && data.error_description) ?? `HTTP ${response.status}`) }
  }
  const id = randomBytes(12).toString('hex')
  const interval = Math.max(1, Number(data.interval) || 5)
  const expiresAt = Date.now() + (Number(data.expires_in) || 900) * 1000
  // Keep the client id with the attempt so a later config edit cannot make the
  // token exchange disagree with the code request that produced it.
  deviceFlows.set(id, { clientId, deviceCode: data.device_code, interval, expiresAt, nextPollAt: Date.now() + interval * 1000 })
  return {
    ok: true,
    id,
    userCode: asText(data.user_code),
    verificationUri: asText(data.verification_uri) || `${GITHUB_WEB}/login/device`,
    // GitHub's own deep link pre-fills the code, so the browser never asks the
    // user to type it.
    verificationUriComplete: asText(data.verification_uri_complete) || '',
    interval,
    expiresAt,
  }
}

/** Poll one device-flow attempt; resolves to `pending` until the user approves. */
async function githubDevicePoll(ctx, id) {
  const flow = deviceFlows.get(id)
  if (!flow) return { ok: false, reason: 'unknown-flow' }
  if (Date.now() > flow.expiresAt) {
    deviceFlows.delete(id)
    return { ok: false, reason: 'expired' }
  }
  if (Date.now() < flow.nextPollAt) {
    return { ok: true, state: 'pending', retryAfter: Math.max(1, Math.ceil((flow.nextPollAt - Date.now()) / 1000)) }
  }
  flow.nextPollAt = Date.now() + flow.interval * 1000
  let response = await githubOauthPost('/login/oauth/access_token', {
    client_id: flow.clientId,
    device_code: flow.deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  if (response.ok !== true) {
    // Retry once immediately: a dropped tunnel here must not end the sign-in.
    await new Promise((done) => setTimeout(done, 500))
    response = await githubOauthPost('/login/oauth/access_token', {
      client_id: flow.clientId,
      device_code: flow.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
  }
  if (response.ok !== true) {
    flow.nextPollAt = Date.now()
    return { ok: false, reason: 'network', detail: response.detail ?? '' }
  }
  let data = null
  try {
    data = JSON.parse(response.text)
  } catch {
    data = null
  }
  const error = asText(data && data.error)
  if (error === 'authorization_pending') return { ok: true, state: 'pending', retryAfter: flow.interval }
  if (error === 'slow_down') {
    flow.interval = Math.max(flow.interval + 5, Number(data && data.interval) || 0)
    return { ok: true, state: 'slow-down', retryAfter: flow.interval }
  }
  if (error === 'expired_token') {
    deviceFlows.delete(id)
    return { ok: false, reason: 'expired' }
  }
  if (error === 'access_denied') {
    deviceFlows.delete(id)
    return { ok: false, reason: 'denied' }
  }
  if (error !== '' || !data || typeof data.access_token !== 'string' || data.access_token === '') {
    deviceFlows.delete(id)
    return { ok: false, reason: 'device-failed', detail: clipText(error || `HTTP ${response.status}`) }
  }
  const verified = await githubRequest('/user', { token: data.access_token })
  const account = verified.ok ? githubAccountOf(verified.data) : null
  if (!account) {
    deviceFlows.delete(id)
    return { ok: false, reason: 'bad-credentials' }
  }
  await writeGithubGrant(ctx, {
    token: data.access_token,
    tokenKind: 'device',
    account,
    scopes: verified.scopes,
    connectedAt: Date.now(),
    ...(typeof data.refresh_token === 'string' && data.refresh_token !== '' ? { refreshToken: data.refresh_token } : {}),
    ...(Number.isFinite(Number(data.expires_in)) ? { expiresAt: Date.now() + Number(data.expires_in) * 1000 } : {}),
  })
  await writeGithubEnvToken(data.access_token)
  deviceFlows.delete(id)
  return { ok: true, state: 'done', account }
}

/** Repositories the signed-in account can push to, newest first. */
async function githubRepos(ctx, query, limit) {
  const access = await githubAccessToken(ctx)
  if (!access.token) return { ok: false, reason: access.reason ?? 'not-signed-in', detail: access.detail ?? '' }
  const size = Math.min(GITHUB_REPO_LIMIT, Math.max(1, Number(limit) || 50))
  const result = await githubRequest(
    `/user/repos?sort=updated&direction=desc&per_page=${size}&affiliation=owner,collaborator,organization_member`,
    { token: access.token },
  )
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail ?? '' }
  const needle = String(query ?? '').trim().toLowerCase()
  const repos = (Array.isArray(result.data) ? result.data : [])
    .map((repo) => ({
      fullName: asText(repo.full_name),
      name: asText(repo.name),
      owner: asText(repo.owner && repo.owner.login),
      private: repo.private === true,
      defaultBranch: asText(repo.default_branch),
      description: asText(repo.description),
      updatedAt: asText(repo.updated_at),
      cloneUrl: asText(repo.clone_url),
    }))
    .filter((repo) => repo.fullName !== '')
    .filter(
      (repo) =>
        needle === '' ||
        repo.fullName.toLowerCase().includes(needle) ||
        repo.description.toLowerCase().includes(needle),
    )
  return { ok: true, repos }
}

/**
 * Clones that outlive one HTTP request. The browser may close the panel while a
 * large repository is still downloading, so the job keeps its own state and the
 * panel reads it back with `GET github/clone/status`.
 */
const cloneJobs = new Map()
const CLONE_JOB_TTL_MS = 30 * 60_000

/** Drop finished jobs nobody came back for. */
function pruneCloneJobs() {
  const now = Date.now()
  for (const [id, job] of cloneJobs) {
    if (job.finishedAt && now - job.finishedAt > CLONE_JOB_TTL_MS) cloneJobs.delete(id)
  }
}

/** The JSON shape one clone job reports. */
function cloneJobSnapshot(job) {
  return {
    ok: true,
    id: job.id,
    state: job.state,
    repo: job.repo,
    root: job.root ?? '',
    path: job.path ?? '',
    folder: job.folder ?? '',
    percent: Math.max(0, Math.min(100, Math.round(job.percent ?? 0))),
    stage: job.stage ?? '',
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
    result: job.result ?? null,
    reason: job.reason ?? '',
    detail: job.detail ?? '',
  }
}

/**
 * Run `git clone --progress` and stream the percentages git prints on stderr
 * into the job, so the browser can show real progress instead of a spinner.
 */
function runCloneWithProgress(cwd, args, extraEnv, job = null) {
  return new Promise((done) => {
    resolveGit()
      .then((executable) => {
        const child = spawn(executable, args, {
          cwd,
          windowsHide: true,
          env: { ...process.env, ...extraEnv },
        })
        let stderr = ''
        const timer = setTimeout(() => {
          child.kill()
          done({ ok: false, detail: 'clone timed out' })
        }, GITHUB_CLONE_TIMEOUT_MS)
        const collect = (chunk) => {
          stderr += chunk
          if (stderr.length > 200_000) stderr = stderr.slice(-200_000)
          for (const line of String(chunk).split(/\r|\n/)) {
            const stage = /(Counting objects|Compressing objects|Receiving objects|Resolving deltas|Updating files|Checking out files)/i.exec(line)
            const percent = /(\d{1,3})%/.exec(line)
            if (stage && percent && job) {
              job.stage = stage[1].toLowerCase()
              job.percent = Math.min(100, Number(percent[1]))
            }
          }
        }
        child.stderr.on('data', (chunk) => collect(chunk))
        child.stdout.on('data', (chunk) => collect(chunk))
        child.on('error', (error) => {
          clearTimeout(timer)
          done({ ok: false, detail: String(error && error.message ? error.message : error) })
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          done({ ok: code === 0, detail: clipText(stderr) })
        })
      })
      .catch((error) => done({ ok: false, detail: String(error && error.message ? error.message : error) }))
  })
}

/**
 * Start a clone without waiting for it; the caller gets an id immediately.
 */
function startCloneJob(ctx, payload) {
  pruneCloneJobs()
  const id = randomBytes(9).toString('hex')
  const job = {
    id,
    state: 'queued',
    repo: typeof payload.repo === 'string' ? payload.repo : '',
    percent: 0,
    stage: 'starting',
    startedAt: Date.now(),
    result: null,
    reason: '',
    detail: '',
  }
  cloneJobs.set(id, job)
  void (async () => {
    try {
      const result = await githubClone(ctx, payload, job)
      job.result = result
      if (result.ok) {
        job.state = 'done'
        job.percent = 100
        job.stage = 'done'
      } else {
        job.state = 'failed'
        job.reason = result.reason ?? 'clone-failed'
        job.detail = result.detail ?? ''
      }
    } catch (error) {
      job.state = 'failed'
      job.reason = 'clone-failed'
      job.detail = clipText(error && error.message ? error.message : error)
    } finally {
      job.finishedAt = Date.now()
    }
  })()
  return { ok: true, id, state: job.state, path: job.path ?? '', root: job.root ?? '', repo: job.repo }
}

/**
 * Clone a repository into a fresh folder under the configured root. The token
 * reaches git only through the temporary askpass helper, and a destination that
 * already holds files is refused instead of merged into.
 */
async function githubClone(ctx, payload = {}, job = null) {
  const parsed = parseGithubRepo(payload.repo)
  if (!parsed) return { ok: false, reason: 'bad-repo' }
  // Public repositories clone anonymously; a private one needs a token and
  // fails with `auth-failed`, which the panel turns into "sign in first".
  const access = await githubAccessToken(ctx)
  const token = typeof access.token === 'string' ? access.token : ''
  const config = await readGithubConfig()
  const root = cloneRootFor(payload, config)
  await mkdir(root, { recursive: true })

  const requested = sanitizeCloneFolder(payload.folder)
  const folder = requested !== '' ? requested : await uniqueCloneFolder(root, cloneFolderFor(parsed))
  const target = join(root, folder)
  if (job) {
    job.root = root
    job.path = target
    job.folder = folder
    job.state = 'checking'
  }
  const existing = await readdir(target).catch(() => null)
  if (existing !== null && existing.length > 0) {
    return { ok: false, reason: 'target-exists', detail: target }
  }
  if (existing !== null) await rmPath(target, { recursive: true, force: true }).catch(() => {})

  const url =
    parsed.kind === 'github' ? `${GITHUB_WEB}/${parsed.owner}/${parsed.name}.git` : parsed.url
  let helper = null
  try {
    if (token !== '') helper = await createAskpass({ username: 'x-access-token', password: token })
    const env = {
      ...NETWORK_ENV,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      ...(helper
        ? {
            GIT_ASKPASS: helper.path,
            SSH_ASKPASS: helper.path,
            SSH_ASKPASS_REQUIRE: 'force',
          }
        : {}),
    }
    const attempts = gitTransportAttempts(await detectProxy())
    const requestedBranch = typeof payload.branch === 'string' ? payload.branch.trim() : ''
    if (job) job.state = 'cloning'
    let cloned = { ok: true, detail: '' }
    for (const attempt of attempts) {
      const args = [...attempt, 'clone', '--progress']
      if (requestedBranch !== '') args.push('--branch', requestedBranch)
      args.push('--', url, target)
      cloned = await runCloneWithProgress(root, args, env, job)
      if (cloned.ok) break
      await rmPath(target, { recursive: true, force: true }).catch(() => {})
      if (!isTransportFailure(cloned.detail) || attempt === attempts[attempts.length - 1]) break
      if (job) {
        job.stage = 'retrying'
        job.percent = 0
      }
    }
    if (!cloned.ok) {
      const detail = clipText(cloned.detail)
      return {
        ok: false,
        reason: /Authentication failed|could not read Username|terminal prompts disabled|403|401|Permission denied/i.test(detail)
          ? 'auth-failed'
          : /not found|Repository not found|does not appear to be a git repository/i.test(detail)
            ? 'not-found'
            : 'clone-failed',
        detail,
        needsSignIn: token === '',
      }
    }
  } finally {
    if (helper) await rmPath(helper.dir, { recursive: true, force: true }).catch(() => {})
  }
  if (job) {
    job.percent = 100
    job.stage = 'finishing'
    job.state = 'metadata'
  }

  let defaultBranch = ''
  let isPrivate = false
  if (parsed.kind === 'github' && token !== '') {
    const info = await githubRequest(`/repos/${parsed.owner}/${parsed.name}`, { token })
    if (info.ok && info.data) {
      defaultBranch = asText(info.data.default_branch)
      isPrivate = info.data.private === true
    }
  }
  const branchResult = await git(target, ['symbolic-ref', '--short', '-q', 'HEAD'])
  const branch = branchResult.failed ? '' : branchResult.out.trim()
  return {
    ok: true,
    root,
    path: target,
    folder,
    branch: branch || defaultBranch,
    defaultBranch,
    private: isPrivate,
    repo: parsed.kind === 'github' ? `${parsed.owner}/${parsed.name}` : url,
  }
}

/** The sign-in facts a commit or push needs, resolved once per request. */
async function githubRuntime(ctx) {
  const config = await readGithubConfig()
  const access = await githubAccessToken(ctx)
  const account = (access.grant && access.grant.account) || null
  return {
    config,
    grant: access.grant ?? null,
    account,
    token: access.token ?? '',
    identity: config.useGithubIdentity && account ? githubIdentityArgs(account) : [],
  }
}

/**
 * `-c` arguments that let a GitHub SSH remote authenticate with a token over
 * HTTPS. Pure so the self-tests can cover every URL shape.
 */
export function githubRewriteArgs(url) {
  const text = typeof url === 'string' ? url.trim() : ''
  if (!/^git@github\.com:/i.test(text) && !/^ssh:\/\/git@github\.com\//i.test(text)) return []
  return ['-c', 'url.https://github.com/.insteadOf=git@github.com:', '-c', 'url.https://github.com/.insteadOf=ssh://git@github.com/']
}

/**
 * `-c` arguments that let a configured SSH GitHub remote authenticate with the
 * token over HTTPS. This changes one invocation only: the remote stays SSH.
 */
async function githubTransportArgs(root, target) {
  const remoteName = target.remote !== '' ? target.remote : String(target.upstream ?? '').split('/')[0]
  if (remoteName === '') return []
  const urlResult = await git(root, ['remote', 'get-url', remoteName])
  return githubRewriteArgs(urlResult.failed ? '' : urlResult.out)
}

/**
 * Payload plus the sign-in facts a commit needs, so the caller can keep using
 * the plain request body: `identity` (author/committer `-c` arguments) and
 * `token` (push authentication) are added here and never come from the browser.
 */
async function withGithubRuntime(ctx, payload) {
  const github = await githubRuntime(ctx)
  if (github.identity.length === 0 && github.token === '') return payload
  return { ...payload, identity: github.identity, token: github.token }
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
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
    send(404, { ok: false, reason: 'not-found' })
    return
  }
  const action = url.pathname.slice(PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '')

  try {
    if (action === '' || action === 'health') {
      send(200, { ok: true, name: 'dsh-git-bar' })
      return
    }

    // GitHub sign-in, repository browsing and clone-to-workspace. These routes
    // never need a Session workspace: they answer from the stored grant alone.
    if (action.startsWith('github/')) {
      const step = action.slice('github/'.length)
      if (step === 'status') {
        send(200, await githubStatus(ctx))
        return
      }
      if (req.method !== 'POST' && step !== 'repos' && step !== 'clone/status' && step !== 'network' && step !== 'client-log') {
        send(405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      if (step === 'login') {
        const payload = await readPayload(req)
        const token = typeof payload.token === 'string' ? payload.token.trim() : ''
        if (token === '') {
          send(200, { ok: false, reason: 'missing-token' })
          return
        }
        send(200, await githubLogin(ctx, token))
        return
      }
      if (step === 'logout') {
        await clearGithubGrant(ctx)
        await writeGithubEnvToken('')
        send(200, { ok: true })
        return
      }
      if (step === 'device/start') {
        await readPayload(req)
        send(200, await githubDeviceStart())
        return
      }
      if (step === 'device/open') {
        const payload = await readPayload(req)
        send(200, await openExternalUrl(payload.url))
        return
      }
      if (step === 'device/poll') {
        const payload = await readPayload(req)
        const id = typeof payload.id === 'string' ? payload.id : ''
        if (id === '') {
          send(200, { ok: false, reason: 'missing-id' })
          return
        }
        send(200, await githubDevicePoll(ctx, id))
        return
      }
      if (step === 'client-log') {
        if (req.method === 'POST') {
          const payload = await readPayload(req)
          const file = await appendClientLog(payload && typeof payload === 'object' ? payload : { raw: payload })
          send(200, { ok: true, file })
        } else {
          send(200, await readClientLog())
        }
        return
      }
      if (step === 'network') {
        send(200, await githubNetwork(ctx, url))
        return
      }
      if (step === 'repos') {
        send(
          200,
          await githubRepos(ctx, url.searchParams.get('q') ?? '', url.searchParams.get('limit') ?? ''),
        )
        return
      }
      if (step === 'clone/preview') {
        send(200, await githubClonePreview(ctx, await readPayload(req)))
        return
      }
      if (step === 'clone') {
        const payload = await readPayload(req)
        if (payload.background === true) {
          send(200, startCloneJob(ctx, payload))
          return
        }
        send(200, await githubClone(ctx, payload))
        return
      }
      if (step === 'clone/status') {
        pruneCloneJobs()
        const job = cloneJobs.get(url.searchParams.get('id') ?? '')
        if (!job) {
          send(200, { ok: false, reason: 'unknown-job' })
          return
        }
        send(200, cloneJobSnapshot(job))
        return
      }
      if (step === 'config') {
        const payload = await readPayload(req)
        try {
          send(200, { ok: true, config: await writeGithubConfig(payload) })
        } catch (error) {
          send(200, { ok: false, reason: 'invalid-config', detail: clipText(error && error.message ? error.message : error) })
        }
        return
      }
      send(404, { ok: false, reason: 'unknown-action' })
      return
    }

    if (action === 'state') {
      const workspace = resolveWorkspace(ctx, url)
      if (workspace.pending) {
        send(200, { ok: false, reason: 'session-pending', detail: 'the Session workspace is not resolved yet' })
        return
      }
      send(200, await collectState(workspace.cwd, { brief: url.searchParams.get('brief') === '1' }))
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

    if (action === 'branches') {
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      send(200, await collectBranches(root))
      return
    }

    if (action === 'switch') {
      if (req.method !== 'POST') {
        send(405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      let payload = null
      try {
        payload = JSON.parse(await readBody(req))
      } catch {
        payload = null
      }
      if (!payload || (typeof payload.branch !== 'string' && typeof payload.detach !== 'string')) {
        send(200, { ok: false, reason: 'missing-target' })
        return
      }
      if (typeof payload.branch === 'string' && payload.branch.length > 0) {
        send(200, await switchBranch(root, payload.branch))
        return
      }
      send(200, await detachTo(root, payload.detach))
      return
    }

    if (action === 'auto-commit') {
      if (req.method !== 'POST') {
        send(405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      let payload = {}
      try {
        const raw = await readBody(req)
        const parsed = raw.trim() === '' ? {} : JSON.parse(raw)
        payload = parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        payload = {}
      }
      const workspace = resolveWorkspace(ctx, url)
      if (workspace.pending) {
        send(200, { ok: false, reason: 'session-pending', detail: 'the Session workspace is not resolved yet' })
        return
      }
      const state = await collectState(workspace.cwd)
      if (!state.ok) {
        send(200, { ok: false, reason: state.reason ?? 'not-a-repository', detail: state.detail ?? '' })
        return
      }
      send(200, await autoCommit(state.root, state, await withGithubRuntime(ctx, payload)))
      return
    }

    if (action === 'push') {
      if (req.method !== 'POST') {
        send(405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      let payload = {}
      try {
        const raw = await readBody(req)
        const parsed = raw.trim() === '' ? {} : JSON.parse(raw)
        payload = parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        payload = {}
      }
      const state = await collectState(resolveCwd(ctx, url))
      if (!state.ok) {
        send(200, { ok: false, reason: state.reason ?? 'not-a-repository', detail: state.detail ?? '' })
        return
      }
      if (state.detached || typeof state.branch !== 'string' || state.branch.trim() === '') {
        send(200, { ok: false, reason: 'detached', detail: 'HEAD is detached' })
        return
      }
      const github = await githubRuntime(ctx)
      const result = await pushCommitted(state.root, state.branch.trim(), normaliseCredentials(payload), {
        token: github.token,
      })
      const failed = result.pushed !== true
      send(200, {
        ...result,
        ok: !failed,
        reason: failed ? result.pushReason ?? 'push-failed' : '',
      })
      return
    }

    // File-level operations. Every one of them is user-triggered, works on
    // repo-relative paths only, and refuses anything the current status does
    // not support (untracked paths need `clean`, conflicts need `resolve`).
    if (
      action === 'stage' ||
      action === 'unstage' ||
      action === 'discard' ||
      action === 'clean' ||
      action === 'resolve' ||
      action === 'undo-commit'
    ) {
      if (req.method !== 'POST') {
        send(405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      // Read the body before any git work: an unconsumed request body must not
      // have to wait for a subprocess.
      const payload = await readPayload(req)
      const workspace = resolveWorkspace(ctx, url)
      if (workspace.pending) {
        send(200, { ok: false, reason: 'session-pending', detail: 'the Session workspace is not resolved yet' })
        return
      }
      const root = await repositoryRoot(workspace.cwd)
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      if (action === 'stage') send(200, await stagePaths(root, payload))
      else if (action === 'unstage') send(200, await unstagePaths(root, payload))
      else if (action === 'discard') send(200, await discardPaths(root, payload))
      else if (action === 'clean') send(200, await cleanPaths(root, payload))
      else if (action === 'resolve') send(200, await resolvePaths(root, payload))
      else send(200, await undoCommit(root))
      return
    }

    if (action === 'graph') {
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      send(
        200,
        await collectGraph(root, url.searchParams.get('limit') ?? '', {
          skip: url.searchParams.get('skip') ?? '',
          q: url.searchParams.get('q') ?? '',
        }),
      )
      return
    }

    if (action === 'commit') {
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      send(200, await collectCommit(root, url.searchParams.get('hash') ?? ''))
      return
    }

    if (action === 'commit-diff') {
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      send(
        200,
        await collectCommitDiff(root, url.searchParams.get('hash') ?? '', url.searchParams.get('path') ?? ''),
      )
      return
    }

    send(404, { ok: false, reason: 'unknown-action' })
  } catch (error) {
    send(500, { ok: false, reason: 'internal-error', detail: String(error && error.message ? error.message : error) })
  }
}

/**
 * Wait for the HTTP carrier before applying: a plugin that only reads
 * `ctx.get('webServer')` can run before that service is mounted and then
 * silently own no route.
 */
export const inject = ['webServer']

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
