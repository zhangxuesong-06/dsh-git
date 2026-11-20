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
import { readFile, mkdtemp, writeFile, rm as rmPath, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'

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

/** Parse `git log` output produced with the unit-separator format below. */
function parseLog(raw) {
  const commits = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 5) continue
    commits.push({
      full: cells[0],
      hash: cells[1],
      author: cells[2],
      when: cells[3],
      subject: cells.slice(4).join('\u001f'),
    })
  }
  return commits
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

  const [statusResult, unstagedStats, stagedStats, logResult] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '-uall']),
    git(root, ['diff', '--numstat']),
    git(root, ['diff', '--cached', '--numstat']),
    git(root, ['log', '-n', String(COMMIT_LIMIT), '--pretty=format:%H\u001f%h\u001f%an\u001f%ar\u001f%s']),
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
async function collectGraph(root, requestedLimit) {
  const limit = Math.min(Math.max(Number(requestedLimit) || GRAPH_LIMIT, 10), 300)
  const [logResult, refsResult, headResult, shortHeadResult] = await Promise.all([
    git(root, [
      'log',
      '--all',
      '--topo-order',
      '-n',
      String(limit),
      '--date=format:%m/%d %H:%M',
      '--pretty=format:%H\u001f%h\u001f%P\u001f%an\u001f%ad\u001f%ar\u001f%s',
    ]),
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
    return { ok: true, root, current: '', detached: true, head: '', columns: 1, commits: [], empty: true }
  }

  const current = headResult.failed ? '' : headResult.out.trim()
  const refsByCommit = parseRefs(refsResult.out)
  const rows = []
  for (const line of logResult.out.split('\n')) {
    if (!line) continue
    const cells = line.split('\u001f')
    if (cells.length < 7) continue
    const full = cells[0]
    rows.push({
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
  for (const row of rows) {
    const refs = refsByCommit.get(row.full) ?? []
    const decorated = refs.slice(0, 6)
    const isCurrent = decorated.some((ref) => ref.kind === 'branch' && ref.current)
    if (isCurrent) decorated.unshift({ name: 'HEAD', kind: 'head', current: true })
    row.refs = decorated
  }
  const columns = assignLanes(rows)
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

  const conflicted = (state.files ?? []).filter((file) => file.conflicted).map((file) => file.path)
  if (conflicted.length > 0) {
    return { ok: false, reason: 'conflicted', detail: clipText(conflicted.slice(0, 20).join(', ')) }
  }
  const paths = (state.files ?? []).map((file) => file.path).filter(Boolean)
  if (paths.length === 0 && wantedMessage === '') return { ok: false, reason: 'nothing-to-commit' }

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

  const commitArgs = ['commit', '-m', subject]
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
    ? await pushCommitted(root, branch, credentials)
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
  const dir = await mkdtemp(join(tmpdir(), 'dsh-git-bar-askpass-'))
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

/**
 * Push a branch. Never force-pushes. Without credentials git is told to fail
 * instead of prompting; with a one-shot password a temporary askpass helper
 * answers the prompt, and the directory is removed before returning.
 */
async function pushCommitted(root, branch, credentials = null) {
  const target = await pushTarget(root, branch)
  if (target.reason === 'no-remote') {
    return { pushed: false, pushReason: 'no-remote', pushDetail: 'no git remote is configured' }
  }
  const args = target.setTracking ? ['push', '--set-upstream', target.remote, branch] : ['push']

  let helper = null
  try {
    if (credentials) {
      helper = await createAskpass(credentials)
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
    const pushed = await git(root, args, 120_000, env)
    if (pushed.failed) {
      const detail = clipText(pushed.err || pushed.out)
      const outOfDate = /non-fast-forward|fetch first|rejected|updates were rejected/i.test(detail)
      return {
        pushed: false,
        pushReason: outOfDate ? 'out-of-date' : 'push-failed',
        pushDetail: detail,
        upstream: target.upstream,
        needsCredentials: credentials === null && isAuthFailure(detail),
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
      const state = await collectState(resolveCwd(ctx, url))
      if (!state.ok) {
        send(200, { ok: false, reason: state.reason ?? 'not-a-repository', detail: state.detail ?? '' })
        return
      }
      send(200, await autoCommit(state.root, state, payload))
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
      const result = await pushCommitted(state.root, state.branch.trim(), normaliseCredentials(payload))
      const failed = result.pushed !== true
      send(200, {
        ...result,
        ok: !failed,
        reason: failed ? result.pushReason ?? 'push-failed' : '',
      })
      return
    }

    if (action === 'graph') {
      const root = await repositoryRoot(resolveCwd(ctx, url))
      if (!root) {
        send(200, { ok: false, reason: 'not-a-repository' })
        return
      }
      send(200, await collectGraph(root, url.searchParams.get('limit') ?? ''))
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
