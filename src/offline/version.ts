/**
 * Offline cache version — bump on every release that ships different
 * static assets. `public/sw.js` carries the same string; the parity
 * test (`offline-version.test.ts`) fails the suite if they drift apart,
 * so a release can never silently mix stale code with fresh data.
 */
export const OFFLINE_VERSION = 'graphcraft-offline-v3'
