import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The injector runs as part of `npm run build`; these tests run it against
 * synthetic dist fixtures (built from the real public/sw.js) so a broken
 * marker or a silent no-op fails the suite, not just the browser demo.
 */

const scriptPath = join(process.cwd(), 'scripts', 'inject-sw-assets.mjs')
const swSourcePath = join(process.cwd(), 'public', 'sw.js')

function makeTemp(): string {
  return mkdtempSync(join(tmpdir(), 'graphcraft-sw-'))
}

describe('service-worker asset injection', () => {
  it('replaces the marker with the built asset listing', () => {
    const dir = makeTemp()
    try {
      copyFileSync(swSourcePath, join(dir, 'sw.js'))
      mkdirSync(join(dir, 'assets'))
      writeFileSync(join(dir, 'assets', 'index-ABC123.js'), '// entry')
      writeFileSync(join(dir, 'assets', 'Calculator-DEF456.js'), '// lazy')
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(0)
      const worker = readFileSync(join(dir, 'sw.js'), 'utf8')
      expect(worker).not.toContain('const BUILD_ASSETS = []')
      expect(worker).toContain("'/assets/index-ABC123.js'")
      expect(worker).toContain("'/assets/Calculator-DEF456.js'")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly when the worker marker is missing', () => {
    const dir = makeTemp()
    try {
      writeFileSync(join(dir, 'sw.js'), '// no marker here')
      mkdirSync(join(dir, 'assets'))
      writeFileSync(join(dir, 'assets', 'a.js'), '//x')
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('marker')
      expect(readFileSync(join(dir, 'sw.js'), 'utf8')).toBe('// no marker here')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly when no assets were built', () => {
    const dir = makeTemp()
    try {
      copyFileSync(swSourcePath, join(dir, 'sw.js'))
      mkdirSync(join(dir, 'assets'))
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('no build assets')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
