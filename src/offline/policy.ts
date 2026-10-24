/**
 * Fetch-lane policy for the offline worker. This is the tested,
 * reviewable copy of the rules embedded in `public/sw.js` (plain JS —
 * the worker cannot import TypeScript). Keep the two in sync by review;
 * the version string is pinned by test, the lanes by the tests below.
 *
 * The worker additionally precaches every hashed build asset: `npm run
 * build` injects the dist/assets listing into its BUILD_ASSETS marker
 * (scripts/inject-sw-assets.mjs), so the lazy workspace chunks are cached
 * during install rather than when first opened. Cache lookups pass
 * `ignoreVary: true`: servers send `Vary: Origin`, install-time worker
 * fetches store entries without an `Origin` header, and module-script
 * requests include one — plain matching would miss every lazy chunk.
 *
 * - `immutable-asset`: hashed build output (`/assets/*`). Cache-first:
 *   the filename changes when the bytes change, so stale hits are
 *   impossible by construction.
 * - `navigation`: app shell and documents. Network-first with cache
 *   fallback: the user always sees the newest shell when online, and the
 *   last-known shell when offline or when the server answers 5xx
 *   (proxy/gateway outages, captive portals). The licence and notice
 *   files are precached here too, but their failed requests return honest
 *   plain-text 503 responses instead of the app shell.
 * - `passthrough`: everything else (non-GET, cross-origin, `blob:` /
 *   `data:` downloads). Never cached. User project files travel as
 *   downloads/uploads and browser storage — never the Cache API — so
 *   private data is never written to a shared HTTP cache.
 */

export type OfflineLane = 'immutable-asset' | 'navigation' | 'passthrough'

/** Licence and attribution files that must remain readable offline. */
export const OFFLINE_NOTICE_PATHS: readonly string[] = [
  '/LICENSE',
  '/LICENSE.txt',
  '/THIRD_PARTY_NOTICES.txt',
]

/** App-shell entries precached on worker install (best-effort). */
export const OFFLINE_SHELL: readonly string[] = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  ...OFFLINE_NOTICE_PATHS,
]

export function offlineLane(sameOrigin: boolean, method: string, pathname: string): OfflineLane {
  if (!sameOrigin || method !== 'GET') {
    return 'passthrough'
  }
  if (pathname.includes('/assets/')) {
    return 'immutable-asset'
  }
  return 'navigation'
}
