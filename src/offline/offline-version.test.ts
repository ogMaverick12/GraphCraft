import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OFFLINE_SHELL } from './policy.ts'
import { OFFLINE_VERSION } from './version.ts'

const swPath = join(process.cwd(), 'public', 'sw.js')
const manifestPath = join(process.cwd(), 'public', 'manifest.webmanifest')

describe('offline deployment wiring', () => {
  it('keeps the worker cache version in sync with the app', () => {
    const worker = readFileSync(swPath, 'utf8')
    expect(worker).toContain(OFFLINE_VERSION)
    for (const entry of OFFLINE_SHELL) {
      expect(worker).toContain(`'${entry}'`)
    }
    // Update hygiene markers: explicit activation and stale-cache purge.
    expect(worker).toContain('SKIP_WAITING')
    expect(worker).toContain('caches.delete')
  })

  it('ships an install manifest with a name, scope, and icon', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; start_url?: unknown; icons?: unknown[] }
    expect(typeof manifest.name).toBe('string')
    expect(typeof manifest.start_url).toBe('string')
    expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeGreaterThan(0)
  })

  it('wires the build to inject the full asset precache list', () => {
    const worker = readFileSync(swPath, 'utf8')
    // The marker scripts/inject-sw-assets.mjs replaces with dist/assets/**.
    expect(worker).toContain('const BUILD_ASSETS = []')
    expect(worker).toContain('SHELL.concat(BUILD_ASSETS)')
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.build ?? '').toContain('node scripts/inject-sw-assets.mjs')
    expect(existsSync(join(process.cwd(), 'scripts', 'inject-sw-assets.mjs'))).toBe(true)
  })

  it('degrades to plain networking when the cache is refused or corrupt', () => {
    const worker = readFileSync(swPath, 'utf8')
    // Guard for a refused Cache API; the corrupt-read fallback is exercised
    // against this exact file by sw.test.ts.
    expect(worker).toContain('typeof caches')
    expect(worker).toContain('function cachedMatch')
  })
})
