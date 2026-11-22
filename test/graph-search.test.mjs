// Offline checks for /graph search (q) and pagination (skip/limit).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const results = []
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: detail === undefined ? '' : String(detail) })

/**
 * CI used to export GIT_AUTHOR_ / GIT_COMMITTER_ environment variables for git
 * identity, and an env var beats `-c user.name=…`. Strip them so the
 * per-commit authors this test relies on actually apply.
 */
function cleanEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  for (const key of [
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_AUTHOR_DATE',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
    'GIT_COMMITTER_DATE',
  ]) {
    delete env[key]
  }
  return env
}

function makeRepo(count) {
  const base = mkdtempSync(join(tmpdir(), 'dshgit-graph-'))
  const dir = join(base, 'work')
  execFileSync('git', ['init', '-b', 'main', dir], { encoding: 'utf8' })
  const run = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: cleanEnv() })
  run(['config', 'user.name', 'Seed'])
  run(['config', 'user.email', 'seed@example.invalid'])
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  run(['add', '-A'])
  run(['commit', '-m', 'chore: base commit'])
  const shas = []
  for (let at = 1; at <= count; at += 1) {
    writeFileSync(join(dir, `f${at}.txt`), `${at}\n`)
    run(['add', '-A'])
    const author = at % 2 === 0 ? 'Alice' : 'Bob'
    run(['-c', `user.name=${author}`, '-c', `user.email=${author.toLowerCase()}@example.invalid`, 'commit', '-m', `feat: item ${at} alpha`])
    shas.push(run(['rev-parse', 'HEAD']).trim())
  }
  return { base, dir, shas }
}

async function ask(repoDir, path) {
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
    const req = new Readable({ read() {} })
    req.method = 'GET'
    req.url = path
    req.push('')
    req.push(null)
    routes[0].handler(req, { writeHead() {}, end: (raw) => done(JSON.parse(raw)) })
  })
}

const { base, dir, shas } = makeRepo(25)
const total = 26 // 25 feature commits + the base commit
const G = (query) => ask(dir, `/dsh-git-bar/graph${query}`)

// ── baseline ─────────────────────────────────────────────────────────────
const plain = await G('?session=s1')
check('plain: 26 commits', plain.commits.length === total, plain.commits.length)
check('plain: lanes assigned', plain.columns >= 1 && plain.commits[0].lane === 0, `${plain.columns}/${plain.commits[0].lane}`)
check('plain: not filtered', plain.filtered === false && plain.hasMore === false, `${plain.filtered}/${plain.hasMore}`)
check('plain: refs decorated', Array.isArray(plain.commits[0].refs), JSON.stringify(plain.commits[0].refs).slice(0, 80))
// Regression: `%ad` with a custom --date format produced "11/22 10:56", which
// Date.parse() turns into the year 2001 in the browser.
check(
  'plain: commit time is a real ISO timestamp',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(plain.commits[0].iso || ''),
  plain.commits[0].iso,
)
check(
  'plain: commit time parses to a plausible year',
  Number.isFinite(Date.parse(plain.commits[0].iso)) && new Date(plain.commits[0].iso).getFullYear() >= 2020,
  String(new Date(plain.commits[0].iso).getFullYear()),
)
check('plain: relative fallback still present', typeof plain.commits[0].when === 'string' && plain.commits[0].when.length > 0, plain.commits[0].when)

// ── search by message ────────────────────────────────────────────────────
const byMessage = await G('?session=s1&q=item%2017')
check('search message: filtered', byMessage.filtered === true && byMessage.query === 'item 17', `${byMessage.filtered}/${byMessage.query}`)
check('search message: one hit', byMessage.commits.length === 1 && byMessage.total === 1, `${byMessage.commits.length}/${byMessage.total}`)
check('search message: matched subject', /item 17/.test(byMessage.commits[0].subject), byMessage.commits[0].subject)
check('search message: no lanes', byMessage.columns === 1, byMessage.columns)

// ── case-insensitive ─────────────────────────────────────────────────────
const upper = await G('?session=s1&q=ALPHA')
check('search: case-insensitive', upper.filtered === true && upper.total === 25, upper.total)

// ── search by author ─────────────────────────────────────────────────────
const byAuthor = await G('?session=s1&q=alice')
check('search author: all alice', byAuthor.total === 12 && byAuthor.commits.every((commit) => commit.author === 'Alice'), `${byAuthor.total}`)

// ── search by hash ───────────────────────────────────────────────────────
const short = shas[7].slice(0, 8)
const byHash = await G(`?session=s1&q=${short}`)
check('search hash: found', byHash.total === 1 && byHash.commits[0].full === shas[7], `${byHash.total}/${byHash.commits[0] && byHash.commits[0].full}`)

// ── no match ─────────────────────────────────────────────────────────────
const none = await G('?session=s1&q=definitely-not-a-commit')
check('search: no match', none.ok === true && none.filtered === true && none.commits.length === 0 && none.total === 0, `${none.ok}/${none.total}`)

// ── pagination without a query ───────────────────────────────────────────
const page1 = await G('?session=s1&limit=10')
const page2 = await G('?session=s1&limit=10&skip=10')
const page3 = await G('?session=s1&limit=10&skip=20')
check('page 1: ten rows, more', page1.commits.length === 10 && page1.hasMore === true, `${page1.commits.length}/${page1.hasMore}`)
check('page 2: ten rows, more', page2.commits.length === 10 && page2.hasMore === true, `${page2.commits.length}/${page2.hasMore}`)
check('page 3: six rows, end', page3.commits.length === 6 && page3.hasMore === false, `${page3.commits.length}/${page3.hasMore}`)
const p1Hashes = new Set(page1.commits.map((commit) => commit.full))
check('pages do not overlap', page2.commits.every((commit) => !p1Hashes.has(commit.full)), 'overlap detected')
check('pages stay in order', page1.commits[0].full === plain.commits[0].full && page2.commits[0].full === plain.commits[10].full, 'order mismatch')

// ── pagination with a query ──────────────────────────────────────────────
const searchPage1 = await G('?session=s1&q=alpha&limit=10')
const searchPage2 = await G('?session=s1&q=alpha&limit=10&skip=10')
check('search page 1', searchPage1.commits.length === 10 && searchPage1.total === 25 && searchPage1.hasMore === true, `${searchPage1.commits.length}/${searchPage1.total}/${searchPage1.hasMore}`)
check('search page 2', searchPage2.commits.length === 10 && searchPage2.skip === 10 && searchPage2.hasMore === true, `${searchPage2.commits.length}/${searchPage2.skip}/${searchPage2.hasMore}`)
check('search pages differ', searchPage1.commits[0].full !== searchPage2.commits[0].full, 'same first row')

// ── limit clamping ───────────────────────────────────────────────────────
const clamped = await G('?session=s1&limit=9999')
check('limit: clamped to the cap', clamped.limit === 500, clamped.limit)
const clampedLow = await G('?session=s1&limit=1')
check('limit: minimum ten', clampedLow.limit === 10, clampedLow.limit)

rmSync(base, { recursive: true, force: true })

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((entry) => !entry.ok)
console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.name).join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
