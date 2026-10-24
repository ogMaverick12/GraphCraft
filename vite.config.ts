import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import {
  LICENSE_FILE_NAME,
  LICENSE_TXT_FILE_NAME,
  NOTICE_FILE_NAME,
  buildNoticeBundle,
  collectBundledPackageNames,
} from './scripts/notices.mjs'

/**
 * Emits the project licence and a full third-party notice bundle from the
 * actual production module graph. Unknown packages, missing files, or
 * metadata drift fail the build rather than silently shipping incomplete
 * attribution.
 */
function distributionNotices(): Plugin {
  let rootDir = process.cwd()
  return {
    name: 'graphcraft-distribution-notices',
    apply: 'build',
    configResolved(config) {
      rootDir = config.root
    },
    generateBundle(_options, bundle) {
      const hasCss = Object.values(bundle).some(
        (output) => output.type === 'asset' && output.fileName.endsWith('.css') && String(output.source).length > 0,
      )
      if (!hasCss) {
        this.error('distribution notices: no generated CSS asset found; cannot classify the Tailwind build-time dependency')
      }
      try {
        const result = buildNoticeBundle({
          rootDir,
          bundledPackageNames: collectBundledPackageNames(bundle),
        })
        this.emitFile({ type: 'asset', fileName: LICENSE_FILE_NAME, source: result.license })
        this.emitFile({ type: 'asset', fileName: LICENSE_TXT_FILE_NAME, source: result.license })
        this.emitFile({ type: 'asset', fileName: NOTICE_FILE_NAME, source: result.notices })
        this.info(
          `distribution notices: ${result.runtimePackages.length} bundled runtime package(s), ` +
            `${result.buildTimePackages.length} build-time package(s)`,
        )
      } catch (error) {
        this.error(`distribution notices: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), distributionNotices()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    // Math-heavy UI suites contend on small machines: bound parallelism and
    // allow generous per-test timeouts rather than weakening assertions.
    maxWorkers: 2,
    testTimeout: 30000,
  },
})
