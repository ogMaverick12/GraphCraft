#!/usr/bin/env node
/**
 * Validates the distribution notice artifacts written by `npm run build`.
 *
 * Checks:
 * - dist/LICENSE and dist/LICENSE.txt exist and are byte-identical to the
 *   root LICENSE;
 * - dist/THIRD_PARTY_NOTICES.txt is nonempty and parseable;
 * - every inventory entry revalidates against package-lock.json, installed
 *   metadata, and the installed full licence/NOTICE files;
 * - the notice text is identical to a fresh deterministic render.
 *
 * Usage: node scripts/check-notices.mjs [root-dir]
 */
import { LICENSE_FILE_NAME, LICENSE_TXT_FILE_NAME, NOTICE_FILE_NAME, validateDistribution } from './notices.mjs'

const rootDir = process.argv[2] ?? process.cwd()

try {
  const result = validateDistribution({ rootDir })
  console.log(
    `check-notices: dist/${LICENSE_FILE_NAME} and dist/${LICENSE_TXT_FILE_NAME} match root LICENSE; ` +
      `${result.runtimePackages.length} bundled runtime package(s) and ` +
      `${result.buildTimePackages.length} build-time package(s) verified; ` +
      `dist/${NOTICE_FILE_NAME} is deterministic.`,
  )
} catch (error) {
  console.error(`check-notices: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
