#!/usr/bin/env node
/**
 * Injects the hashed dist/assets listing into the copied service worker so
 * install precaches every chunk — including the lazy Calculator / Data Lab /
 * Learn / Viz3D chunks — before they are ever opened.
 *
 * Usage: node scripts/inject-sw-assets.mjs [distDir]   (default: dist)
 *
 * Fails loudly (non-zero exit) when the worker or its BUILD_ASSETS marker is
 * missing, or when no assets were produced: shipping a worker that silently
 * precaches nothing would make "offline after first load" a lie.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const distDir = process.argv[2] ?? 'dist'
const swPath = join(distDir, 'sw.js')
const assetsDir = join(distDir, 'assets')
const MARKER = 'const BUILD_ASSETS = []'

function collect(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    found.push(
      ...(statSync(full).isDirectory()
        ? collect(full)
        : ['/' + relative(distDir, full).split(sep).join('/')]),
    )
  }
  return found.sort()
}

let worker
try {
  worker = readFileSync(swPath, 'utf8')
} catch {
  console.error(`inject-sw-assets: ${swPath} not found — run vite build first`)
  process.exit(1)
}

if (!worker.includes(MARKER)) {
  console.error(`inject-sw-assets: marker "${MARKER}" missing in ${swPath}`)
  process.exit(1)
}

let assets
try {
  assets = collect(assetsDir)
} catch {
  console.error(`inject-sw-assets: no ${assetsDir} directory — check the vite build output`)
  process.exit(1)
}

if (assets.length === 0) {
  console.error(`inject-sw-assets: no build assets found in ${assetsDir}`)
  process.exit(1)
}

const listing = `const BUILD_ASSETS = [\n${assets.map((asset) => `  '${asset}',`).join('\n')}\n]`
writeFileSync(swPath, worker.replace(MARKER, listing))
console.log(`inject-sw-assets: precaching shell + ${assets.length} build asset${assets.length === 1 ? '' : 's'}`)
