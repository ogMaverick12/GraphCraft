import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { OFFLINE_NOTICE_PATHS, OFFLINE_SHELL } from './policy.ts'
import { OFFLINE_VERSION } from './version.ts'

/**
 * Runs the real `public/sw.js` inside a sandbox with fake Cache/fetch so the
 * worker's lanes and its degraded paths (refused cache, corrupt cache reads,
 * offline without a shell) are exercised directly — not just its markers.
 */

interface ResponseLike {
  ok: boolean
  status: number
  headers: { get: (name: string) => string | null }
  clone: () => ResponseLike
  text: () => Promise<string>
}

interface CacheLike {
  match: (request: unknown, options?: unknown) => Promise<ResponseLike | undefined>
  open: (name: string) => Promise<{ add: (url: string) => Promise<void>; put: (request: unknown, response: ResponseLike) => Promise<void> }>
  keys: () => Promise<string[]>
  delete: (name: string) => Promise<boolean>
}

class FakeResponse implements ResponseLike {
  readonly body: string
  readonly status: number
  readonly ok: boolean
  readonly headers: { get: (name: string) => string | null }

  constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
    this.body = body
    this.status = init?.status ?? 200
    this.ok = this.status >= 200 && this.status < 300
    const headers = new Map(Object.entries(init?.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]))
    this.headers = { get: (name) => headers.get(name.toLowerCase()) ?? null }
  }

  clone(): FakeResponse {
    return new FakeResponse(this.body, { status: this.status })
  }

  text(): Promise<string> {
    return Promise.resolve(this.body)
  }
}

interface WorkerEvent {
  request: { url: string; method: string; mode: string }
  respondWith: (promise: Promise<ResponseLike>) => void
  waitUntil: (promise: Promise<unknown>) => void
  data?: unknown
}

interface LoadOptions {
  caches?: CacheLike | undefined
  fetchImpl?: (request: unknown) => Promise<ResponseLike>
}

function defaultCache(): CacheLike {
  return {
    match: () => Promise.resolve(undefined),
    open: () => Promise.resolve({ add: () => Promise.resolve(), put: () => Promise.resolve() }),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  }
}

function loadWorker(options: LoadOptions = {}) {
  const handlers = new Map<string, (event: WorkerEvent) => void>()
  const skipWaiting = vi.fn()
  const sandbox = {
    self: {
      location: { origin: 'https://app.example' },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void): void => {
        handlers.set(type, handler)
      },
      clients: { claim: (): Promise<void> => Promise.resolve() },
      skipWaiting,
    },
    caches: Object.hasOwn(options, 'caches') ? options.caches : defaultCache(),
    fetch: options.fetchImpl ?? ((): Promise<ResponseLike> => Promise.reject(new Error('network unavailable'))),
    Response: FakeResponse,
    URL,
    Promise,
    Error,
  }
  runInNewContext(readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8'), sandbox)
  return {
    fetch: (request: { url: string; method: string; mode: string }): Promise<ResponseLike> | undefined => {
      let result: Promise<ResponseLike> | undefined
      handlers.get('fetch')?.({
        request,
        respondWith: (promise) => {
          result = promise
        },
        waitUntil: () => undefined,
      })
      return result
    },
    install: (): Promise<unknown> => {
      let waited: Promise<unknown> = Promise.resolve()
      handlers.get('install')?.({
        request: { url: '', method: 'GET', mode: 'navigate' },
        respondWith: () => undefined,
        waitUntil: (promise) => {
          waited = promise
        },
      })
      return waited
    },
    activate: (): Promise<unknown> => {
      let waited: Promise<unknown> = Promise.resolve()
      handlers.get('activate')?.({
        request: { url: '', method: 'GET', mode: 'navigate' },
        respondWith: () => undefined,
        waitUntil: (promise) => {
          waited = promise
        },
      })
      return waited
    },
    message: (data: unknown): void => {
      handlers.get('message')?.({
        data,
        request: { url: '', method: 'GET', mode: 'navigate' },
        respondWith: () => undefined,
        waitUntil: () => undefined,
      })
    },
    skipWaiting,
  }
}

const assetRequest = { url: 'https://app.example/assets/index-ABC123.js', method: 'GET', mode: 'no-cors' }
const navigationRequest = { url: 'https://app.example/graph', method: 'GET', mode: 'navigate' }

function noticeRequest(path: string): { url: string; method: string; mode: string } {
  return { url: `https://app.example${path}`, method: 'GET', mode: 'navigate' }
}

describe('offline worker fetch lanes', () => {
  it('serves hashed assets cache-first without touching the network', async () => {
    const cached = new FakeResponse('cached-js')
    const fetchImpl = vi.fn()
    const match = vi.fn(() => Promise.resolve(cached))
    const worker = loadWorker({ caches: { ...defaultCache(), match }, fetchImpl })
    const result = worker.fetch(assetRequest)
    await expect(result).resolves.toBe(cached)
    expect(fetchImpl).not.toHaveBeenCalled()
    // Module-script requests carry an Origin header while install-time worker
    // fetches do not: matching must ignore Vary or every lazy chunk misses.
    expect(match).toHaveBeenCalledWith(assetRequest, { ignoreVary: true })
  })

  it('falls back to the network when the cache read itself fails (corrupt cache)', async () => {
    const fresh = new FakeResponse('fresh-js')
    const fetchImpl = vi.fn(() => Promise.resolve(fresh))
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.reject(new Error('cache corrupt')) }, fetchImpl })
    const result = worker.fetch(assetRequest)
    await expect(result).resolves.toBe(fresh)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('stores freshly fetched ok assets for later offline loads', async () => {
    const put = vi.fn(() => Promise.resolve())
    const open = vi.fn(() => Promise.resolve({ add: () => Promise.resolve(), put }))
    const fetchImpl = vi.fn(() => Promise.resolve(new FakeResponse('fresh-js')))
    const worker = loadWorker({ caches: { ...defaultCache(), open }, fetchImpl })
    await worker.fetch(assetRequest)
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith(OFFLINE_VERSION)
      expect(put).toHaveBeenCalledTimes(1)
    })
  })

  it('serves the last-known shell for an offline navigation', async () => {
    const shell = new FakeResponse('last-known-shell')
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.resolve(shell) } })
    await expect(worker.fetch(navigationRequest)).resolves.toBe(shell)
  })

  it('falls back to the cached index.html for other offline navigations', async () => {
    const shell = new FakeResponse('index-shell')
    const worker = loadWorker({
      caches: { ...defaultCache(), match: (request) => Promise.resolve(request === '/index.html' ? shell : undefined) },
    })
    await expect(worker.fetch(navigationRequest)).resolves.toBe(shell)
  })

  it.each(OFFLINE_NOTICE_PATHS)('serves the cached %s text when offline', async (path) => {
    const cached = new FakeResponse(`${path} text`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.resolve(cached) } })
    const result = await worker.fetch(noticeRequest(path))
    expect(result).toBe(cached)
    expect(result?.headers.get('content-type')).toContain('text/plain')
  })

  it.each(OFFLINE_NOTICE_PATHS)('never returns the app shell when %s is missing from the cache', async (path) => {
    const shell = new FakeResponse('<!doctype html><title>GraphCraft</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    const worker = loadWorker({
      caches: { ...defaultCache(), match: (request) => Promise.resolve(request === '/index.html' ? shell : undefined) },
    })
    const result = await worker.fetch(noticeRequest(path))
    expect(result?.status).toBe(503)
    expect(result?.headers.get('content-type')).toContain('text/plain')
    expect(await result?.text()).toContain(path)
    expect(await result?.text()).not.toContain('GraphCraft</title>')
  })

  it.each(OFFLINE_NOTICE_PATHS)('does not serve a cached HTML shell for %s', async (path) => {
    const html = new FakeResponse('<!doctype html><title>GraphCraft</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.resolve(html) } })
    const result = await worker.fetch(noticeRequest(path))
    expect(result?.status).toBe(503)
    expect(result?.headers.get('content-type')).toContain('text/plain')
    expect(await result?.text()).toContain(path)
  })

  it('rejects a successful HTML fallback for a notice and prefers the cached text', async () => {
    const cached = new FakeResponse('MIT License\n\nPermission is hereby granted...', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
    const html = new FakeResponse('<!doctype html><title>GraphCraft</title>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    const fetchImpl = vi.fn(() => Promise.resolve(html))
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.resolve(cached) }, fetchImpl })
    await expect(worker.fetch(noticeRequest('/LICENSE.txt'))).resolves.toBe(cached)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each(OFFLINE_NOTICE_PATHS)('returns an honest 503 for a missing %s without a cached shell', async (path) => {
    const worker = loadWorker()
    const result = await worker.fetch(noticeRequest(path))
    expect(result?.status).toBe(503)
    expect(result?.headers.get('content-type')).toContain('text/plain')
    expect(await result?.text()).toContain(path)
  })

  it('serves the last-known shell when the server answers 5xx for a navigation', async () => {
    const shell = new FakeResponse('last-known-shell')
    const fetchImpl = vi.fn(() => Promise.resolve(new FakeResponse('502 Bad Gateway', { status: 502 })))
    const worker = loadWorker({ caches: { ...defaultCache(), match: () => Promise.resolve(shell) }, fetchImpl })
    await expect(worker.fetch(navigationRequest)).resolves.toBe(shell)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('passes a 5xx through for non-navigation requests instead of inventing a cache hit', async () => {
    const upstream = new FakeResponse('bad gateway', { status: 502 })
    const worker = loadWorker({ fetchImpl: () => Promise.resolve(upstream) })
    await expect(worker.fetch({ url: 'https://app.example/status', method: 'GET', mode: 'cors' })).resolves.toBe(upstream)
  })

  it('prefers a healthy navigation response and stores it for later', async () => {
    const fresh = new FakeResponse('fresh-shell')
    const put = vi.fn(() => Promise.resolve())
    const worker = loadWorker({
      caches: { ...defaultCache(), open: () => Promise.resolve({ add: () => Promise.resolve(), put }) },
      fetchImpl: () => Promise.resolve(fresh),
    })
    await expect(worker.fetch(navigationRequest)).resolves.toBe(fresh)
    await vi.waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
    })
  })

  it('answers an honest 503 when offline with no cached shell at all', async () => {
    const worker = loadWorker()
    const result = await worker.fetch(navigationRequest)
    expect(result?.status).toBe(503)
    expect(await result?.text()).toContain('offline')
  })

  it('rejects uncached data requests when offline instead of inventing a response', async () => {
    const worker = loadWorker()
    await expect(worker.fetch({ url: 'https://app.example/data.json', method: 'GET', mode: 'cors' })).rejects.toThrow('offline and not cached')
  })

  it('never intercepts non-GET or cross-origin requests', () => {
    const match = vi.fn(() => Promise.resolve(undefined))
    const worker = loadWorker({ caches: { ...defaultCache(), match } })
    expect(worker.fetch({ url: 'https://app.example/assets/a.js', method: 'POST', mode: 'cors' })).toBeUndefined()
    expect(worker.fetch({ url: 'https://cdn.example/lib.js', method: 'GET', mode: 'cors' })).toBeUndefined()
    expect(match).not.toHaveBeenCalled()
  })

  it('degrades to plain networking when the Cache API is unavailable', () => {
    const worker = loadWorker({ caches: undefined })
    expect(worker.fetch(assetRequest)).toBeUndefined()
  })
})

describe('offline worker lifecycle', () => {
  it('precaches the shell best-effort on install — one bad entry never fails it', async () => {
    const add = vi.fn((url: string) => (url === '/favicon.svg' ? Promise.reject(new Error('missing')) : Promise.resolve()))
    const worker = loadWorker({ caches: { ...defaultCache(), open: () => Promise.resolve({ add, put: () => Promise.resolve() }) } })
    await expect(worker.install()).resolves.toBeUndefined()
    expect(add).toHaveBeenCalledTimes(OFFLINE_SHELL.length)
    expect(add.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([...OFFLINE_NOTICE_PATHS]))
  })

  it('drops every non-current cache on activate', async () => {
    const remove = vi.fn(() => Promise.resolve(true))
    const worker = loadWorker({
      caches: { ...defaultCache(), keys: () => Promise.resolve([OFFLINE_VERSION, 'graphcraft-offline-obsolete']), delete: remove },
    })
    await worker.activate()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('graphcraft-offline-obsolete')
  })

  it('activates only on an explicit SKIP_WAITING message', () => {
    const worker = loadWorker()
    worker.message({ type: 'OTHER' })
    expect(worker.skipWaiting).not.toHaveBeenCalled()
    worker.message({ type: 'SKIP_WAITING' })
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1)
  })
})
