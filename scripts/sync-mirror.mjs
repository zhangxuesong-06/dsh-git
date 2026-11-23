#!/usr/bin/env node
/**
 * Trigger an npmmirror sync for this package and wait until the mirror's
 * `latest` points at the version in package.json.
 *
 * Why: DSH's plugin manager (pnpm) falls back to https://registry.npmmirror.com
 * after the official registry. The mirror lags published versions, so users in
 * China can resolve an older version for hours or days. Running this right
 * after `npm publish` closes that gap. The mirror serves the same integrity
 * hash as the official registry once the sync lands, so nothing is rewritten.
 *
 * Usage: npm run sync-mirror [-- <version>] [--timeout <seconds>]
 */
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const MIRROR = 'https://registry.npmmirror.com'
const POLL_MS = 15_000

const args = process.argv.slice(2)
const versionArg = args.find((value) => !value.startsWith('--') && /^\d+\.\d+\.\d+/.test(value))
const version = versionArg ?? pkg.version
const timeoutArg = args[args.indexOf('--timeout') + 1]
const timeoutMs = (Number(timeoutArg) > 0 ? Number(timeoutArg) : 900) * 1000

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function fetchPackument() {
  const response = await fetch(`${MIRROR}/${pkg.name}`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`mirror responded ${response.status}`)
  return response.json()
}

async function main() {
  console.log(`[sync-mirror] ${pkg.name}@${version} -> ${MIRROR}`)
  const trigger = await fetch(`${MIRROR}/-/package/${pkg.name}/syncs`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!trigger.ok) throw new Error(`sync request failed: ${trigger.status}`)
  const job = await trigger.json().catch(() => ({}))
  console.log(`[sync-mirror] sync queued${job.id ? ` (id ${job.id})` : ''}, waiting...`)

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const packument = await fetchPackument()
    const latest = packument['dist-tags']?.latest
    const has = Boolean(packument.versions?.[version])
    console.log(`[sync-mirror] latest=${latest} has${version}=${has}`)
    if (latest === version && has) {
      const mirrorIntegrity = packument.versions[version]?.dist?.integrity
      const official = await fetch(`https://registry.npmjs.org/${pkg.name}/${version}`).then((r) =>
        r.ok ? r.json() : null,
      )
      const match = Boolean(official?.dist?.integrity) && official.dist.integrity === mirrorIntegrity
      console.log(`[sync-mirror] done: mirror latest is ${version}, integrity matches official: ${match}`)
      return
    }
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s; run the sync again or check https://npmmirror.com/package/${pkg.name}`)
}

main().catch((error) => {
  console.error(`[sync-mirror] ${error.message}`)
  process.exitCode = 1
})
