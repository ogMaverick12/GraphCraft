#!/usr/bin/env node
/**
 * Direct-dependency licence guard (CI quality gate).
 *
 * Reads `dependencies` + `devDependencies` from package.json and verifies
 * every installed package (node_modules metadata) declares exactly one of
 * the project's allowed licences. Dependency-free (Node stdlib only).
 *
 * Scope note: DIRECT dependencies only — the full tree is pinned by the
 * lockfile and covered by `npm audit`; new direct deps must already be
 * justified + licence-recorded in docs/DEPENDENCIES.md before install.
 *
 * Usage: node scripts/check-licenses.mjs [root-dir]
 * Exits 0 when clean, 1 on any disallowed or missing licence metadata.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0'])
const root = process.argv[2] ?? process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function licenseOf(meta) {
  if (typeof meta.license === 'string') {
    return meta.license
  }
  if (typeof meta.license === 'object' && meta.license !== null && typeof meta.license.type === 'string') {
    return meta.license.type
  }
  if (Array.isArray(meta.licenses)) {
    const types = meta.licenses.map((entry) => (typeof entry?.type === 'string' ? entry.type : null)).filter(Boolean)
    if (types.length > 0) {
      return types.join(' OR ')
    }
  }
  return null
}

function main() {
  const pkg = readJson(join(root, 'package.json'))
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  console.log(`Licence check: ${names.length} direct dependencies (allowlist: ${[...ALLOWED].join(', ')})`)
  let failures = 0
  for (const name of names) {
    let meta
    try {
      meta = readJson(join(root, 'node_modules', name, 'package.json'))
    } catch {
      console.error(`MISSING ${name}: declared but not installed — run npm ci`)
      failures += 1
      continue
    }
    const license = licenseOf(meta)
    const ok = typeof license === 'string' && ALLOWED.has(license.trim())
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}@${meta.version ?? '?'} ${license ?? '(no licence field)'}`)
    if (!ok) {
      console.error(
        `NOT ALLOWED ${name}: licence "${license ?? 'unknown'}" is outside {${[...ALLOWED].join(', ')}} — ` +
          'replace it with a compatibly-licensed package, or record a reviewed exception in docs/DEPENDENCIES.md first',
      )
      failures += 1
    }
  }
  console.log(`${names.length} direct dependencies checked; ${failures} problem(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

try {
  main()
} catch (error) {
  console.error(`check-licenses failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
