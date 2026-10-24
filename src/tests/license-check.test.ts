import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The licence guard runs in CI (`node scripts/check-licenses.mjs`); these
 * tests drive it against synthetic installs, so a loosened allowlist, a
 * silent skip, or a swallowed failure breaks the suite — not just CI.
 */

const scriptPath = join(process.cwd(), 'scripts', 'check-licenses.mjs')

function makeTemp(): string {
  return mkdtempSync(join(tmpdir(), 'graphcraft-lic-'))
}

function writeFixturePackage(dir: string, dependencies: Record<string, string>): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies }))
}

function writeInstalled(dir: string, name: string, meta: Record<string, unknown>): void {
  const depDir = join(dir, 'node_modules', name)
  mkdirSync(depDir, { recursive: true })
  writeFileSync(join(depDir, 'package.json'), JSON.stringify(meta))
}

describe('direct-dependency licence guard', () => {
  it('passes when every installed dependency is allowlisted', () => {
    const dir = makeTemp()
    try {
      writeFixturePackage(dir, { alpha: '1.0.0', beta: '2.0.0' })
      writeInstalled(dir, 'alpha', { name: 'alpha', version: '1.0.0', license: 'MIT' })
      writeInstalled(dir, 'beta', { name: 'beta', version: '2.0.0', license: 'Apache-2.0' })
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(0)
      expect(run.stdout).toContain('ok   alpha@1.0.0 MIT')
      expect(run.stdout).toContain('ok   beta@2.0.0 Apache-2.0')
      expect(run.stdout).toContain('2 direct dependencies checked; 0 problem(s)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when a dependency licence is outside the allowlist', () => {
    const dir = makeTemp()
    try {
      writeFixturePackage(dir, { gamma: '1.0.0' })
      writeInstalled(dir, 'gamma', { name: 'gamma', version: '1.0.0', license: 'GPL-3.0' })
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('NOT ALLOWED gamma')
      expect(run.stdout).toContain('1 problem(s)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when a declared dependency is not installed', () => {
    const dir = makeTemp()
    try {
      writeFixturePackage(dir, { delta: '1.0.0' })
      const run = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('not installed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
