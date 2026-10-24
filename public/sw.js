/* GraphCraft offline service worker (plain JS — no app build step).
 *
 * Version: graphcraft-offline-v3
 * This string MUST equal OFFLINE_VERSION in src/offline/version.ts; the
 * offline-version test fails the suite if they drift. Bump it on every
 * release that ships different static assets.
 *
 * Lanes mirror src/offline/policy.ts (reviewed copy, not imported):
 * - /assets/* (hashed, immutable): cache-first.
 * - navigations and other same-origin GET: network-first, cache fallback.
 * - everything else (non-GET, cross-origin, blob:/data:): network only,
 *   never cached. User project files are downloads/storage, never here.
 *
 * Precaching: install caches the shell, the licence/notice files, and every
 * hashed build asset. `npm run build` runs scripts/inject-sw-assets.mjs,
 * which replaces the BUILD_ASSETS marker below with the full dist/assets
 * listing — so the lazy Calculator / Data Lab / Learn / Viz3D chunks are
 * cached during install, before they are ever opened. One online load is
 * enough.
 *
 * Updates: install precaches best-effort (a single bad entry never fails
 * the install), the new worker WAITS, and only an explicit SKIP_WAITING
 * message from the page activates it — old and new code never mix on one
 * page. Activate deletes every non-current cache, so a corrupted or stale
 * cache is dropped, never served preferentially.
 *
 * Resilience: cache reads and writes are best-effort. If the Cache API is
 * blocked, refused, or corrupt, requests degrade to ordinary networking,
 * and an offline navigation without a cached shell gets an honest 503
 * text instead of a hang or a half-rendered page. Navigations also treat
 * a 5xx answer (proxy/gateway outage, captive portal) as the network
 * being unavailable and serve the last-known shell.
 *
 * Licence and notice routes are special: a missing file or an HTML SPA
 * fallback must never masquerade as a successful notice. They fall back
 * to their cached text, then to an honest plain-text 503.
 */

const OFFLINE_VERSION = 'graphcraft-offline-v3'
const OFFLINE_NOTICE_PATHS = ['/LICENSE', '/LICENSE.txt', '/THIRD_PARTY_NOTICES.txt']
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', ...OFFLINE_NOTICE_PATHS]
/* Replaced by scripts/inject-sw-assets.mjs during `npm run build`. */
const BUILD_ASSETS = []

/** Cache reads are best-effort: a refused or broken cache must never fail the request.
 *  `ignoreVary` is essential: servers add `Vary: Origin`, install-time worker
 *  fetches store entries without an `Origin` header, and module-script
 *  requests send one — without this, every lazy chunk would miss offline. */
function cachedMatch(request) {
  return caches.match(request, { ignoreVary: true }).catch(() => undefined)
}

/** Stores a copy of an ok response, best-effort; user files never reach this path. */
function storeCopy(request, response) {
  if (!response.ok) {
    return
  }
  const copy = response.clone()
  caches
    .open(OFFLINE_VERSION)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_VERSION)
      .then((cache) => Promise.allSettled(SHELL.concat(BUILD_ASSETS).map((url) => cache.add(url))))
      .then(() => undefined),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE_VERSION).map((key) => caches.delete(key))))
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data !== null && typeof event.data === 'object' && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function sameOrigin(url) {
  return url.origin === self.location.origin
}

function offlinePlaceholder() {
  return new Response('GraphCraft is offline and its cached shell is unavailable. Reconnect and reload once to restore offline use.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  })
}

function isNoticePath(pathname) {
  return OFFLINE_NOTICE_PATHS.includes(pathname)
}

function isHtmlResponse(response) {
  const contentType = response.headers?.get?.('content-type') ?? ''
  return contentType.toLowerCase().includes('text/html')
}

function noticeUnavailable(pathname) {
  return new Response(
    `GraphCraft could not load ${pathname} from the network or its offline cache. ` +
      'Reconnect and reload; if the problem persists, this distribution is missing the file.',
    {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (typeof caches === 'undefined') {
    return // Cache API refused: leave the request to ordinary browser networking.
  }
  const url = new URL(request.url)
  if (request.method !== 'GET' || !sameOrigin(url)) {
    return
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      cachedMatch(request).then((hit) => {
        if (hit !== undefined) {
          return hit
        }
        return fetch(request).then((response) => {
          storeCopy(request, response)
          return response
        })
      }),
    )
    return
  }
  const notice = isNoticePath(url.pathname)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (notice && (!response.ok || isHtmlResponse(response))) {
          // A missing file or the host's SPA fallback is not a notice.
          throw new Error(`notice unavailable: ${response.status}`)
        }
        if (request.mode === 'navigate' && response.status >= 500) {
          // Gateway/server outage (proxy 502, captive-portal 503, …): treat
          // it like a network failure and serve the last-known shell.
          throw new Error(`upstream status ${response.status}`)
        }
        if (request.mode === 'navigate') {
          storeCopy(request, response)
        }
        return response
      })
      .catch(() =>
        cachedMatch(request).then((hit) => {
          if (hit !== undefined && (!notice || (hit.ok && !isHtmlResponse(hit)))) {
            return hit
          }
          if (notice) {
            return noticeUnavailable(url.pathname)
          }
          if (request.mode === 'navigate') {
            return cachedMatch('/index.html').then((shell) => shell ?? offlinePlaceholder())
          }
          return Promise.reject(new Error('offline and not cached'))
        }),
      ),
  )
})
