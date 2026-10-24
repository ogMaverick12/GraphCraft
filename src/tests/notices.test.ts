import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LICENSE_TXT_FILE_NAME,
  buildNoticeBundle,
  collectBundledPackageNames,
  packageNameFromModuleId,
  validateDistribution,
  type NoticePackageRecord,
} from '../../scripts/notices.mjs'

const PROJECT_LICENSE = `MIT License

Copyright (c) 2026 ogMaverick12

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const PACKAGE_LICENSE = `MIT License

Copyright (c) 2026 Fixture Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

const RECORDS: NoticePackageRecord[] = [
  { name: 'alpha', license: 'MIT', licenseFile: 'LICENSE', purpose: 'Alpha fixture.' },
  {
    name: 'gamma',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'Gamma build-time fixture.',
    buildTime: true,
  },
]

const tempDirs: string[] = []

function makeTempFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'graphcraft-notices-'))
  tempDirs.push(root)
  writeFileSync(join(root, 'LICENSE'), PROJECT_LICENSE)
  writeJson(join(root, 'package.json'), { name: 'fixture', version: '1.0.0', license: 'MIT' })
  writeJson(join(root, 'package-lock.json'), {
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '1.0.0', license: 'MIT' },
      'node_modules/alpha': { version: '1.2.3', license: 'MIT' },
      'node_modules/gamma': { version: '2.0.0', license: 'MIT' },
    },
  })
  writePackage(root, 'alpha', '1.2.3', 'MIT', PACKAGE_LICENSE)
  writePackage(root, 'gamma', '2.0.0', 'MIT', PACKAGE_LICENSE)
  return root
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

function writePackage(root: string, name: string, version: string, license: string, licenseText: string): void {
  const packageDir = join(root, 'node_modules', name)
  writeJson(join(packageDir, 'package.json'), { name, version, license })
  writeFileSync(join(packageDir, 'LICENSE'), licenseText)
}

function writeDist(root: string): ReturnType<typeof buildNoticeBundle> {
  const result = buildNoticeBundle({ rootDir: root, bundledPackageNames: ['alpha'], records: RECORDS })
  const dist = join(root, 'dist')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'LICENSE'), result.license)
  writeFileSync(join(dist, LICENSE_TXT_FILE_NAME), result.license)
  writeFileSync(join(dist, 'THIRD_PARTY_NOTICES.txt'), result.notices)
  return result
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('production notice generation', () => {
  it('maps emitted module ids to npm package names, including scoped and nested packages', () => {
    expect(packageNameFromModuleId('C:\\repo\\node_modules\\react\\cjs\\react.js')).toBe('react')
    expect(packageNameFromModuleId('/repo/node_modules/@scope/pkg/index.js')).toBe('@scope/pkg')
    expect(packageNameFromModuleId('/repo/node_modules/alpha/node_modules/nested/index.js')).toBe('nested')
    expect(packageNameFromModuleId('/repo/src/App.tsx')).toBeNull()
    expect(packageNameFromModuleId('\0vite/preload-helper')).toBeNull()
  })

  it('collects only packages present in emitted chunks', () => {
    const bundle = {
      'index.js': {
        type: 'chunk',
        modules: {
          '/repo/src/main.tsx': {},
          '/repo/node_modules/alpha/index.js': {},
          '/repo/node_modules/@scope/pkg/index.js': {},
        },
      },
      'index.css': { type: 'asset', source: 'body{}' },
    }
    expect(collectBundledPackageNames(bundle)).toEqual(['@scope/pkg', 'alpha'])
  })

  it('renders deterministic notices with exact package texts and the project licence', () => {
    const root = makeTempFixture()
    const first = buildNoticeBundle({ rootDir: root, bundledPackageNames: ['alpha'], records: RECORDS })
    const second = buildNoticeBundle({ rootDir: root, bundledPackageNames: ['alpha'], records: RECORDS })

    expect(first.notices).toBe(second.notices)
    expect(Buffer.from(first.license).equals(readFileSync(join(root, 'LICENSE')))).toBe(true)
    expect(first.runtimePackages).toEqual([{ name: 'alpha', version: '1.2.3', license: 'MIT' }])
    expect(first.buildTimePackages).toEqual([{ name: 'gamma', version: '2.0.0', license: 'MIT' }])
    expect(first.notices).toContain('Bundled runtime packages (1):')
    expect(first.notices).toContain('Build-time CSS generation package (1):')
    expect(first.notices).toContain('- alpha@1.2.3 - MIT')
    expect(first.notices).toContain('- gamma@2.0.0 - MIT')
    expect(first.notices).toContain(PACKAGE_LICENSE)
    expect(first.notices).toContain('EMISSION: build-time CSS generation only')
    expect(first.notices).not.toContain('@tailwindcss/vite')
  })

  it('fails when a bundled package has no notice record', () => {
    const root = makeTempFixture()
    expect(() => buildNoticeBundle({ rootDir: root, bundledPackageNames: ['delta'], records: RECORDS })).toThrow(
      'no notice record',
    )
  })

  it('fails when a required licence file is missing', () => {
    const root = makeTempFixture()
    rmSync(join(root, 'node_modules', 'alpha', 'LICENSE'))
    expect(() => buildNoticeBundle({ rootDir: root, bundledPackageNames: ['alpha'], records: RECORDS })).toThrow(
      'Missing required license file',
    )
  })

  it('fails when a production package is marked dev-only in the lockfile', () => {
    const root = makeTempFixture()
    const lockPath = join(root, 'package-lock.json')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages: Record<string, { dev?: boolean }>
    }
    lock.packages['node_modules/gamma'].dev = true
    writeFileSync(lockPath, JSON.stringify(lock))
    expect(() => buildNoticeBundle({ rootDir: root, bundledPackageNames: ['alpha'], records: RECORDS })).toThrow(
      'marked dev-only',
    )
  })
})

describe('distribution notice validation', () => {
  it('accepts byte-identical project licence and deterministic notices', () => {
    const root = makeTempFixture()
    const result = writeDist(root)
    const rootLicense = readFileSync(join(root, 'LICENSE'))
    expect(readFileSync(join(root, 'dist', 'LICENSE')).equals(rootLicense)).toBe(true)
    expect(readFileSync(join(root, 'dist', LICENSE_TXT_FILE_NAME)).equals(rootLicense)).toBe(true)
    expect(validateDistribution({ rootDir: root, records: RECORDS })).toEqual({
      runtimePackages: result.runtimePackages,
      buildTimePackages: result.buildTimePackages,
    })
  })

  it('rejects a changed distribution licence', () => {
    const root = makeTempFixture()
    writeDist(root)
    writeFileSync(join(root, 'dist', 'LICENSE'), PROJECT_LICENSE.replace('ogMaverick12', 'Someone Else'))
    expect(() => validateDistribution({ rootDir: root, records: RECORDS })).toThrow('byte-identical')
  })

  it('rejects a missing text-typed licence alias', () => {
    const root = makeTempFixture()
    writeDist(root)
    rmSync(join(root, 'dist', LICENSE_TXT_FILE_NAME))
    expect(() => validateDistribution({ rootDir: root, records: RECORDS })).toThrow(
      `dist/${LICENSE_TXT_FILE_NAME} is missing`,
    )
  })

  it('rejects a changed text-typed licence alias', () => {
    const root = makeTempFixture()
    writeDist(root)
    writeFileSync(join(root, 'dist', LICENSE_TXT_FILE_NAME), PROJECT_LICENSE.replace('ogMaverick12', 'Someone Else'))
    expect(() => validateDistribution({ rootDir: root, records: RECORDS })).toThrow(
      `dist/${LICENSE_TXT_FILE_NAME} is not byte-identical`,
    )
  })

  it('rejects manually edited notices', () => {
    const root = makeTempFixture()
    writeDist(root)
    const noticePath = join(root, 'dist', 'THIRD_PARTY_NOTICES.txt')
    writeFileSync(noticePath, readFileSync(noticePath, 'utf8').replace('PACKAGE 1:', 'PACKAGE 9:'))
    expect(() => validateDistribution({ rootDir: root, records: RECORDS })).toThrow('deterministic render')
  })
})
