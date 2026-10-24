/**
 * Service-worker registration (production builds only). The worker owns
 * static assets; user project files never enter the Cache API. Every
 * failure path degrades to plain online loading — the app never depends
 * on the worker to start.
 *
 * Update model: a new worker installs in the background and waits. The
 * `onUpdate` callback surfaces an "Update available — Refresh" control;
 * only an explicit user action sends `SKIP_WAITING` and reloads, so a
 * running session is never swapped out from under the user and old and
 * new code never mix on one page. A controllerchange in a tab that had
 * an older controller (for example after another tab applied the update)
 * also surfaces the control there, so no tab keeps running stale code
 * without an obvious way forward.
 */

export type OfflineRegistration = 'registered' | 'unsupported' | 'unavailable'

let waitingWorker: ServiceWorker | null = null

function workerContainer(): ServiceWorkerContainer | null {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null
    }
    return navigator.serviceWorker
  } catch {
    return null
  }
}

export async function registerOffline(onUpdate: () => void): Promise<OfflineRegistration> {
  if (!import.meta.env.PROD) {
    return 'unsupported'
  }
  const container = workerContainer()
  if (container === null) {
    return 'unsupported'
  }
  try {
    // First-ever installs have no controller; a later controllerchange means
    // a new version took over (here or in another tab). Surface the Refresh
    // control so no tab keeps running stale code without an obvious way out.
    const hadController = container.controller !== null
    container.addEventListener('controllerchange', () => {
      if (hadController) {
        onUpdate()
      }
    })
    const registration = await container.register(`${import.meta.env.BASE_URL}sw.js`)
    const announceIfWaiting = (worker: ServiceWorker | null): void => {
      if (worker !== null && container.controller !== null) {
        waitingWorker = worker
        onUpdate()
      }
    }
    // A worker installed while the page was away.
    announceIfWaiting(registration.waiting)
    const track = (worker: ServiceWorker | null): void => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          announceIfWaiting(worker)
        }
      })
    }
    track(registration.installing)
    registration.addEventListener('updatefound', () => track(registration.installing))
    return 'registered'
  } catch {
    return 'unavailable'
  }
}

/**
 * Apply a waiting update: hand control to the new worker, then reload
 * once it takes over (with a timeout fallback so a failed worker can
 * never hang the refresh). Returns false when no update is waiting.
 */
export function applyOfflineUpdate(): boolean {
  const worker = waitingWorker
  if (worker === null) {
    return false
  }
  try {
    const container = workerContainer()
    let done = false
    const reload = (): void => {
      if (done) {
        return
      }
      done = true
      window.location.reload()
    }
    container?.addEventListener('controllerchange', reload, { once: true })
    worker.postMessage({ type: 'SKIP_WAITING' })
    window.setTimeout(reload, 2000)
    waitingWorker = null
    return true
  } catch {
    return false
  }
}
