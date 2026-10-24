# GraphCraft — Offline support

After the first online load of a production build (`dist/` served over
HTTP(S)), all core functionality works with the network disabled. There
is no backend, account, sync, or telemetry; offline is a deployment
property, not a feature flag.

## Network audit

- `src/` makes zero runtime requests: no `fetch`, `WebSocket`,
  `EventSource`, `sendBeacon`, remote fonts, or analytics (re-verified
  by grep; the only `fetch(` hits are hostile-input test strings).
- The single first-load dependency is the static host serving `dist/`.
  Fonts are the system stack; math, plots, and exports compute locally.

## Caching strategy (`public/sw.js`, no new dependency)

- Versioned cache `graphcraft-offline-v3`, pinned to
  `src/offline/version.ts` by test — releases bump both, so stale code
  can never mix with a fresh page.
- Install precaches the shell (`/`, `index.html`, manifest, icons), the
  licence/notice files (`/LICENSE`, `/LICENSE.txt`,
  `/THIRD_PARTY_NOTICES.txt`), and every hashed build bundle under
  `/assets/*`. The asset list is not hand-maintained: `npm run build` runs
  `scripts/inject-sw-assets.mjs`, which replaces a `BUILD_ASSETS` marker in
  the worker source with the real output list and fails the build loudly if
  the marker, `dist/`, or the asset list is missing. One online load
  therefore makes all workspaces — including lazily split ones — and the
  notices available offline.
- Precaching is best-effort: one bad entry degrades, never fails, the
  install.
- Fetch lanes (tested in `src/offline/policy.test.ts` and, against the
  real worker source, in `src/offline/sw.test.ts`): hashed `/assets/*`
  cache-first (filenames change with bytes, so hits cannot be stale);
  navigations network-first with cache fallback (newest shell online,
  last-known shell offline); everything else (non-GET, cross-origin,
  `blob:`/`data:` downloads) passes through uncached.
- All worker cache reads use `{ ignoreVary: true }`. Vite preview (and
  some hosts) send `Vary: Origin` on assets; without the flag, entries
  stored by the worker's own fetches (no `Origin` header) were missed
  by module-script requests (which send one) — lazy chunks failed
  offline despite being cached. Found live in this pass, fixed, pinned
  by regression test.
- Navigations treat an HTTP 5xx response as an outage: gateways often
  report a down origin as 502/503/504 rather than a failed fetch, so a
  5xx navigation falls back to the cached shell the same way a
  rejection does. Non-navigation requests pass 5xx through unchanged.
  With no shell cached at all, the worker answers with honest 503 text:
  “GraphCraft is offline and its cached shell is unavailable. Reconnect
  and reload once to restore offline use.”
- Licence and notice routes are not SPA routes. If one cannot be fetched
  as a successful non-HTML response (or is missing from the cache), the
  worker returns plain-text 503 naming the requested path instead of
  `index.html`. The footer links to `/LICENSE.txt` because the legacy
  extensionless `/LICENSE` does not receive a Content-Type from every
  static host.
- Activate deletes every non-current cache and claims clients: corrupt
  or outdated caches are dropped, never preferred (the v1→v2 purge was
  observed live).
- The worker guards `typeof caches` and catches cache read/write
  failures, so a storage-refusing browser degrades to online-first
  behaviour instead of erroring.
- User data boundary: project files travel as file downloads/uploads;
  preferences, history, and session backup live in guarded
  `localStorage`. Neither enters the Cache API.

## Updates and recovery

- A new worker installs in the background and waits. `registerOffline`
  surfaces `onUpdate`; the status bar shows **Update available —
  Refresh**. Only that click posts `SKIP_WAITING` and reloads on
  `controllerchange` (2 s fallback reload so a dead worker cannot hang
  the refresh; if the worker vanished between click and activation, the
  app falls back to a plain reload).
- `controllerchange` surfaces the Refresh control only when the page
  already had a controller: a fresh first-ever load that just gains its
  controller is not interrupted with an update prompt (a sibling tab
  applying an update still offers Refresh here).
- Failed workspace code: if a lazily loaded workspace chunk cannot be
  fetched (cache evicted or corrupt, offline), an in-app boundary shows
  “The {workspace} workspace could not load its code… reconnect and
  reload the page once” with a **Reload page** control. The rest of the
  app keeps working and saved work is untouched; only a page reload
  retries the import (React caches the failed module chunk).
- Worker evicted, refused, registration throwing, or non-production:
  the app loads online-only from the network; nothing breaks, nothing
  claims otherwise. The next load re-registers, installs, and
  reprecaches automatically (observed: active again in under a second,
  with the full shell, notice, and asset entries restored).
- Cache corrupt: lanes fall back to network, then to the cached shell,
  then to the honest 503 text for navigations. Fix path: reload once
  online — on-demand lanes repopulate what they serve, and a new worker
  version reprecaches everything at install; delete site data if a
  reload is not enough.
- Storage full: prefs/backup writes already degrade to notices
  (`prefs.ts` — “Local backup unavailable (storage full or blocked).
  Use Save to file.”); the worker's `cache.put` failures are caught and
  ignored — offline degrades to online-first, the session continues.

## Manual test protocol (browser, not jsdom)

1. Fresh online load: `npm run build && npm run preview`, hard-reload,
   confirm all five workspaces render, the worker is **activated**, the
   cache holds the shell, both licence files, the notice bundle, and
   every bundle, and no console errors.
2. Offline load: DevTools → Network → Offline, reload, repeat the tour
   (plot, calculate, import CSV, open a Learn template, orbit a
   surface, open a project file, toggle theme, export), then open the
   footer's **Licence** and **Third-party notices** links — both must
   show their text, not the app shell.
3. Update: bump `OFFLINE_VERSION` + worker string, rebuild, reload with
   network on — expect the Refresh control; click it — expect reload
   onto the new version with only the new cache remaining and no
   mixed-asset errors.
4. Corrupted cache: Application → Cache Storage → delete a lazy-chunk
   entry, reload, open that workspace — expect the boundary message and
   **Reload page**, not a blank app. Delete a notice entry, reload
   offline, open that notice — expect plain-text 503 naming the path,
   not `index.html`. Delete all caches, reload offline — expect the
   honest 503 text, not a hang.
5. Unavailable storage: fill `localStorage` to its quota, then edit the
   graph — expect the app to keep working and the notice “Local backup
   unavailable (storage full or blocked). Use Save to file.” (Full
   storage denial is also covered by unit test
   (`persistence.test.tsx`: storage-throw degradation).)
6. Worker removal: Application → Service Workers → Unregister, reload —
   expect the app to load from the network and re-register itself.

## Honest limitations

- No service worker on `npm run dev`, `file://`, or browsers that
  refuse registration — online loading only, stated in-app by absence
  of offline claims (no banner is shown for a state the user cannot act
  on, except the Offline indicator when connectivity drops).
- Manifest ships an SVG icon only, so some browsers will not offer OS
  install prompts (which require PNG sizes) — not claimed as supported.
- `navigator.onLine` reports the stack, not reachability; behind a
  proxy that answers for a dead origin (an HTTP 502 in the verifying
  session), it stays `true` and the Offline indicator cannot show — the
  5xx navigation fallback above still recovers the cached shell. Every
  workflow keeps working regardless of the indicator's value.
- Service-worker behaviour is covered by unit tests that execute the
  real `public/sw.js` in a sandbox (lane policy, install/activate,
  `SKIP_WAITING`, 5xx fallback, corrupt entries, `ignoreVary`), but
  those tests use stubbed Cache API/fetch — the browser's real Cache
  API remains covered by the manual protocol only.
- Evidence is Windows + Chromium from the verifying pass; no mobile or
  PWA-install testing. Screenshots were not captured — evidence is
  DOM/ARIA state, Cache Storage counts, and console output.
