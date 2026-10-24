#!/usr/bin/env node
/**
 * Production-notice source of truth.
 *
 * The Vite plugin in vite.config.ts feeds this module the package names found
 * in the actual Rollup output. Only those packages are described as bundled
 * runtime code. `tailwindcss` is listed separately because it runs at build
 * time to generate the shipped CSS; dev-only tooling (including
 * @tailwindcss/vite) is deliberately absent.
 *
 * License texts are read from the installed packages, never transcribed here.
 * A missing package, mismatched version/licence, missing file, or package with
 * no record fails the production build.
 *
 * `node scripts/check-notices.mjs` revalidates the written dist/ artifacts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const LICENSE_FILE_NAME = 'LICENSE'
export const LICENSE_TXT_FILE_NAME = 'LICENSE.txt'
export const NOTICE_FILE_NAME = 'THIRD_PARTY_NOTICES.txt'
export const PROJECT_LICENSE = 'MIT'
export const PROJECT_COPYRIGHT = 'Copyright (c) 2026 ogMaverick12'

const RUNTIME_HEADING = 'Bundled runtime packages'
const BUILD_TIME_HEADING = 'Build-time CSS generation package'

/**
 * Maintained mapping for third-party software that can appear in production.
 * Versions are read from node_modules + package-lock.json at build time, so
 * this file cannot silently drift to a different installed version.
 */
export const PACKAGE_RECORDS = [
  {
    name: '@babel/runtime',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'Runtime helpers used by transpiled dependencies.',
  },
  {
    name: 'decimal.js',
    license: 'MIT',
    licenseFile: 'LICENCE.md',
    purpose: 'Arbitrary-precision decimal arithmetic used by mathjs.',
  },
  {
    name: 'escape-latex',
    license: 'MIT',
    licenseFile: 'LICENSE.md',
    purpose: 'LaTeX escaping used by mathjs.',
  },
  {
    name: 'lucide-react',
    license: 'ISC',
    licenseFile: 'LICENSE',
    purpose: 'Icon components used by the application UI.',
    licenseNote:
      'The package LICENSE also contains the MIT notice for Feather-derived portions; both notices are reproduced in this section.',
  },
  {
    name: 'mathjs',
    license: 'Apache-2.0',
    licenseFile: 'LICENSE',
    noticeFiles: ['NOTICE'],
    purpose: 'Expression parsing and evaluation behind the AST allowlist.',
  },
  {
    name: 'react',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'User-interface library.',
  },
  {
    name: 'react-dom',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'React DOM renderer.',
  },
  {
    name: 'scheduler',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'React scheduling runtime.',
  },
  {
    name: 'tailwindcss',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'Build-time utility CSS generation; the generated CSS is shipped.',
    buildTime: true,
    licenseNote:
      'Tailwind CSS is not a bundled JavaScript module. Its full MIT text is included as a conservative attribution measure. This does not resolve any separate legal question about copyright in generated CSS.',
  },
  {
    name: 'tiny-emitter',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'Small event emitter used by mathjs.',
  },
  {
    name: 'typed-function',
    license: 'MIT',
    licenseFile: 'LICENSE',
    purpose: 'Typed function dispatch used by mathjs.',
  },
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

/** Normalises line endings only; licence wording and indentation are preserved. */
function normaliseText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '') + '\n'
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

function assertLicenseBody(license, text, packageName, file) {
  const checks = {
    MIT: [
      /Permission is hereby granted, free of charge/i,
      /THE SOFTWARE IS PROVIDED ["']?AS IS["']?/i,
    ],
    ISC: [
      /Permission to use, copy, modify, and\/or distribute/i,
      /THE SOFTWARE IS PROVIDED ["']?AS IS["']?/i,
    ],
    'Apache-2.0': [/Apache License/i, /Version 2\.0/i],
  }
  const markers = checks[license]
  if (markers === undefined) {
    throw new Error(`No license-text validation rule exists for "${license}" (${packageName}).`)
  }
  if (!markers.every((marker) => marker.test(text))) {
    throw new Error(
      `The installed ${packageName} license file ${file} does not contain the expected ${license} wording. ` +
        'Inspect the package and update the notice record only after verifying the new terms.',
    )
  }
}

/**
 * Maps a Rollup module id to its npm package name. Source files and virtual
 * modules return null. A nested node_modules path resolves to the innermost
 * package, which is the code actually emitted.
 */
export function packageNameFromModuleId(moduleId) {
  if (typeof moduleId !== 'string' || moduleId.startsWith('\0')) {
    return null
  }
  const normalised = moduleId.split('?', 1)[0].replace(/\\/g, '/')
  const marker = 'node_modules/'
  const markerIndex = normalised.lastIndexOf(marker)
  if (markerIndex === -1) {
    return null
  }
  const segments = normalised.slice(markerIndex + marker.length).split('/')
  if (segments.length === 0 || segments[0] === '') {
    return null
  }
  if (segments[0].startsWith('@')) {
    return segments[1] === undefined ? null : `${segments[0]}/${segments[1]}`
  }
  return segments[0]
}

/** Collects only third-party packages represented in emitted chunks. */
export function collectBundledPackageNames(bundle) {
  const names = new Set()
  for (const output of Object.values(bundle)) {
    if (output === null || typeof output !== 'object' || output.type !== 'chunk' || output.modules === undefined) {
      continue
    }
    for (const moduleId of Object.keys(output.modules)) {
      const name = packageNameFromModuleId(moduleId)
      if (name !== null) {
        names.add(name)
      }
    }
  }
  return [...names].sort()
}

function readProjectLicense(rootDir) {
  const packageJson = readJson(join(rootDir, 'package.json'))
  if (packageJson.license !== PROJECT_LICENSE) {
    throw new Error(`Root package.json declares licence "${packageJson.license ?? 'missing'}"; expected "${PROJECT_LICENSE}".`)
  }

  let license
  try {
    license = readFileSync(join(rootDir, LICENSE_FILE_NAME))
  } catch {
    throw new Error(`Project ${LICENSE_FILE_NAME} is missing or unreadable at the repository root.`)
  }
  const text = license.toString('utf8')
  if (!/MIT License/.test(text)) {
    throw new Error(`Project ${LICENSE_FILE_NAME} is not the expected MIT licence text.`)
  }
  if (!text.includes(PROJECT_COPYRIGHT)) {
    throw new Error(`Project ${LICENSE_FILE_NAME} does not contain "${PROJECT_COPYRIGHT}".`)
  }
  return license
}

function packageDirectories(packageName) {
  return packageName.split('/')
}

function loadPackageRecord(record, rootDir, lock) {
  const packageDir = join(rootDir, 'node_modules', ...packageDirectories(record.name))
  const packageJsonPath = join(packageDir, 'package.json')

  let meta
  try {
    meta = readJson(packageJsonPath)
  } catch {
    throw new Error(`Bundled package "${record.name}" has no readable installed package.json; run npm ci.`)
  }
  if (meta.name !== record.name) {
    throw new Error(`Installed package at node_modules/${record.name} reports name "${meta.name}".`)
  }

  const lockEntry = lock.packages?.[`node_modules/${record.name}`]
  if (lockEntry === undefined) {
    throw new Error(`Bundled package "${record.name}" has no top-level package-lock entry; regenerate the lockfile.`)
  }
  if (lockEntry.dev === true) {
    throw new Error(
      `Package "${record.name}" is marked dev-only in package-lock.json but appeared in production output. ` +
        'Remove it from the runtime graph or justify and reclassify it before shipping.',
    )
  }
  if (lockEntry.version !== meta.version) {
    throw new Error(
      `Version mismatch for "${record.name}": package-lock.json has ${lockEntry.version ?? 'missing'}, ` +
        `node_modules has ${meta.version ?? 'missing'}. Run npm ci before building.`,
    )
  }
  if (lockEntry.license !== record.license) {
    throw new Error(
      `License mismatch for "${record.name}": package-lock.json has ${lockEntry.license ?? 'missing'}, ` +
        `notice record expects ${record.license}. Verify the new terms before updating the record.`,
    )
  }

  const metadataLicense = licenseOf(meta)
  if (metadataLicense !== record.license) {
    throw new Error(
      `License mismatch for "${record.name}": installed metadata has ${metadataLicense ?? 'missing'}, ` +
        `notice record expects ${record.license}. Verify the new terms before updating the record.`,
    )
  }

  const licensePath = join(packageDir, ...record.licenseFile.split('/'))
  let licenseText
  try {
    licenseText = normaliseText(readText(licensePath))
  } catch {
    let available
    try {
      available = readdirSync(packageDir).filter((name) => /^(licen[cs]e|notice|copying)/i.test(name)).sort()
    } catch {
      available = []
    }
    throw new Error(
      `Missing required license file "${record.licenseFile}" for ${record.name}@${meta.version}. ` +
        `Available candidate files: ${available.length > 0 ? available.join(', ') : '(none)'}.`,
    )
  }
  if (licenseText.trim() === '') {
    throw new Error(`License file "${record.licenseFile}" for ${record.name}@${meta.version} is empty.`)
  }
  assertLicenseBody(record.license, licenseText, record.name, record.licenseFile)

  const notices = (record.noticeFiles ?? []).map((noticeFile) => {
    const noticePath = join(packageDir, ...noticeFile.split('/'))
    let noticeText
    try {
      noticeText = normaliseText(readText(noticePath))
    } catch {
      throw new Error(`Missing required NOTICE file "${noticeFile}" for ${record.name}@${meta.version}.`)
    }
    if (noticeText.trim() === '') {
      throw new Error(`NOTICE file "${noticeFile}" for ${record.name}@${meta.version} is empty.`)
    }
    return { file: noticeFile, text: noticeText }
  })

  return {
    name: record.name,
    version: meta.version,
    license: record.license,
    purpose: record.purpose,
    licenseNote: record.licenseNote,
    buildTime: record.buildTime === true,
    licenseFile: record.licenseFile,
    licenseText,
    notices,
  }
}

function inventoryLine(pkg) {
  return `- ${pkg.name}@${pkg.version} - ${pkg.license}`
}

function renderSection(pkg, index) {
  const lines = [
    '='.repeat(80),
    `PACKAGE ${index + 1}: ${pkg.name}@${pkg.version}`,
    `LICENSE: ${pkg.license}`,
    `EMISSION: ${
      pkg.buildTime
        ? 'build-time CSS generation only (not a bundled JavaScript module; generated CSS is shipped)'
        : 'bundled runtime JavaScript'
    }`,
    `PURPOSE: ${pkg.purpose}`,
  ]
  if (pkg.licenseNote !== undefined) {
    lines.push(`NOTE: ${pkg.licenseNote}`)
  }
  lines.push('-'.repeat(80), `LICENSE TEXT (${pkg.licenseFile})`, '', pkg.licenseText)
  for (const notice of pkg.notices) {
    lines.push(`NOTICE TEXT (${notice.file})`, '', notice.text)
  }
  return lines.join('\n')
}

function renderNoticeBundle(runtimePackages, buildTimePackages) {
  const lines = [
    'GraphCraft third-party notices',
    '================================',
    '',
    'This file is generated by `npm run build` from the production Vite/Rollup',
    'module graph and the installed package licence files. Do not edit it by hand.',
    'Source mapping: scripts/notices.mjs.',
    '',
    'GraphCraft is licensed under the MIT License. See the adjacent LICENSE file.',
    'This inventory is a technical attribution record, not a legal opinion.',
    '',
    `${RUNTIME_HEADING} (${runtimePackages.length}):`,
    ...runtimePackages.map(inventoryLine),
    '',
    `${BUILD_TIME_HEADING} (${buildTimePackages.length}):`,
    ...buildTimePackages.map(inventoryLine),
    '',
    'Tailwind CSS is not a bundled JavaScript module. Its generated CSS is part',
    'of the production assets. The full MIT text below is included conservatively',
    'and does not resolve any separate legal question about generated CSS.',
    '',
    'License texts',
    '=============',
    '',
  ]

  for (const [index, pkg] of [...runtimePackages, ...buildTimePackages].entries()) {
    lines.push(renderSection(pkg, index))
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n'
}

function validateRequestedNames(runtimeNames, buildTimeNames, records) {
  const recordMap = new Map(records.map((record) => [record.name, record]))
  const runtime = [...new Set(runtimeNames)].sort()
  const buildTime = [...new Set(buildTimeNames)].sort()

  for (const name of runtime) {
    const record = recordMap.get(name)
    if (record === undefined) {
      throw new Error(
        `Bundled package "${name}" has no notice record. Add its exact installed license file and notice metadata to scripts/notices.mjs.`,
      )
    }
    if (record.buildTime === true) {
      throw new Error(`Package "${name}" is marked build-time but was reported as bundled runtime JavaScript.`)
    }
  }
  for (const name of buildTime) {
    const record = recordMap.get(name)
    if (record === undefined) {
      throw new Error(`Build-time package "${name}" has no notice record in scripts/notices.mjs.`)
    }
    if (record.buildTime !== true) {
      throw new Error(`Package "${name}" is reported as build-time but its notice record is runtime-only.`)
    }
  }
  return { recordMap, runtime, buildTime }
}

/**
 * Builds the distribution assets from the actual bundle package names.
 * Returns the project licence bytes and the complete deterministic notice text.
 */
export function buildNoticeBundle({
  rootDir = process.cwd(),
  bundledPackageNames,
  buildTimePackageNames,
  records = PACKAGE_RECORDS,
} = {}) {
  if (!Array.isArray(bundledPackageNames)) {
    throw new Error('buildNoticeBundle requires the bundledPackageNames collected from the production bundle.')
  }
  const resolvedBuildTimePackageNames =
    buildTimePackageNames ?? records.filter((record) => record.buildTime === true).map((record) => record.name)
  if (!Array.isArray(resolvedBuildTimePackageNames)) {
    throw new Error('buildNoticeBundle requires a buildTimePackageNames array.')
  }

  const { recordMap, runtime, buildTime } = validateRequestedNames(
    bundledPackageNames,
    resolvedBuildTimePackageNames,
    records,
  )
  const lock = readJson(join(rootDir, 'package-lock.json'))
  const selected = [...runtime, ...buildTime].map((name) => loadPackageRecord(recordMap.get(name), rootDir, lock))
  if (selected.length === 0) {
    throw new Error('No production packages were identified for the notice bundle.')
  }

  const byName = new Map(selected.map((pkg) => [pkg.name, pkg]))
  const runtimePackages = runtime.map((name) => byName.get(name))
  const buildTimePackages = buildTime.map((name) => byName.get(name))

  return {
    license: readProjectLicense(rootDir),
    notices: renderNoticeBundle(runtimePackages, buildTimePackages),
    runtimePackages: runtimePackages.map((pkg) => ({ name: pkg.name, version: pkg.version, license: pkg.license })),
    buildTimePackages: buildTimePackages.map((pkg) => ({ name: pkg.name, version: pkg.version, license: pkg.license })),
  }
}

function parseInventory(noticeText) {
  const inventoryEnd = noticeText.indexOf('\nLicense texts\n')
  if (inventoryEnd === -1) {
    throw new Error(`"${NOTICE_FILE_NAME}" is missing its License texts marker.`)
  }

  const inventoryText = noticeText.slice(0, inventoryEnd)
  const runtime = []
  const buildTime = []
  let section = null

  for (const line of inventoryText.split('\n')) {
    if (line.startsWith(`${RUNTIME_HEADING} (`)) {
      section = runtime
      continue
    }
    if (line.startsWith(`${BUILD_TIME_HEADING} (`)) {
      section = buildTime
      continue
    }
    if (!line.startsWith('- ')) {
      continue
    }
    if (section === null) {
      throw new Error(`"${NOTICE_FILE_NAME}" contains an inventory entry before a package heading.`)
    }
    const match = /^- (.+)@([^@]+) - (MIT|ISC|Apache-2\.0)$/.exec(line)
    if (match === null) {
      throw new Error(`"${NOTICE_FILE_NAME}" contains an unreadable inventory entry: ${line}`)
    }
    section.push({ name: match[1], version: match[2], license: match[3] })
  }

  if (runtime.length === 0) {
    throw new Error(`"${NOTICE_FILE_NAME}" has no bundled runtime packages; refusing an empty inventory.`)
  }
  if (new Set(runtime.map((pkg) => pkg.name)).size !== runtime.length) {
    throw new Error(`"${NOTICE_FILE_NAME}" lists a runtime package more than once.`)
  }
  if (new Set(buildTime.map((pkg) => pkg.name)).size !== buildTime.length) {
    throw new Error(`"${NOTICE_FILE_NAME}" lists a build-time package more than once.`)
  }

  return { runtime, buildTime }
}

/**
 * Revalidates dist/ against the root licence and the installed package files.
 * Equality with a fresh rendering catches manual edits and nondeterminism.
 */
export function validateDistribution({
  rootDir = process.cwd(),
  distDir = join(rootDir, 'dist'),
  records = PACKAGE_RECORDS,
} = {}) {
  const projectLicense = readProjectLicense(rootDir)
  let distLicense
  try {
    distLicense = readFileSync(join(distDir, LICENSE_FILE_NAME))
  } catch {
    throw new Error(`dist/${LICENSE_FILE_NAME} is missing; run npm run build.`)
  }
  if (!projectLicense.equals(distLicense)) {
    throw new Error(`dist/${LICENSE_FILE_NAME} is not byte-identical to the root ${LICENSE_FILE_NAME}.`)
  }

  let distLicenseText
  try {
    distLicenseText = readFileSync(join(distDir, LICENSE_TXT_FILE_NAME))
  } catch {
    throw new Error(`dist/${LICENSE_TXT_FILE_NAME} is missing; run npm run build.`)
  }
  if (!projectLicense.equals(distLicenseText)) {
    throw new Error(`dist/${LICENSE_TXT_FILE_NAME} is not byte-identical to the root ${LICENSE_FILE_NAME}.`)
  }

  let notices
  try {
    notices = readFileSync(join(distDir, NOTICE_FILE_NAME), 'utf8')
  } catch {
    throw new Error(`dist/${NOTICE_FILE_NAME} is missing; run npm run build.`)
  }
  if (notices.trim() === '') {
    throw new Error(`dist/${NOTICE_FILE_NAME} is empty.`)
  }

  const inventory = parseInventory(notices)
  const rebuilt = buildNoticeBundle({
    rootDir,
    bundledPackageNames: inventory.runtime.map((pkg) => pkg.name),
    buildTimePackageNames: inventory.buildTime.map((pkg) => pkg.name),
    records,
  })
  if (rebuilt.notices !== notices) {
    throw new Error(
      `dist/${NOTICE_FILE_NAME} differs from a fresh deterministic render. Re-run npm run build; ` +
        'if the difference remains, inspect scripts/notices.mjs and the installed licence files.',
    )
  }

  return {
    runtimePackages: rebuilt.runtimePackages,
    buildTimePackages: rebuilt.buildTimePackages,
  }
}
