import { describe, expect, it } from 'vitest'
import { OFFLINE_NOTICE_PATHS, OFFLINE_SHELL, offlineLane } from './policy.ts'

describe('offline fetch lanes', () => {
  it('serves hashed build output cache-first', () => {
    expect(offlineLane(true, 'GET', '/assets/index-ABC123.js')).toBe('immutable-asset')
    expect(offlineLane(true, 'GET', '/assets/DataLab-xyz.css')).toBe('immutable-asset')
  })

  it('serves the shell and documents network-first with cache fallback', () => {
    for (const path of OFFLINE_SHELL) {
      expect(offlineLane(true, 'GET', new URL(path, 'https://app.example').pathname)).toBe('navigation')
    }
  })

  it('never caches anything else', () => {
    expect(offlineLane(true, 'POST', '/assets/index-ABC123.js')).toBe('passthrough')
    expect(offlineLane(false, 'GET', 'https://cdn.example/lib.js')).toBe('passthrough')
    expect(offlineLane(false, 'GET', '/assets/index-ABC123.js')).toBe('passthrough')
    expect(offlineLane(true, 'PUT', '/index.html')).toBe('passthrough')
  })

  it('keeps every notice file in the precached shell and navigation lane', () => {
    for (const path of OFFLINE_NOTICE_PATHS) {
      expect(OFFLINE_SHELL).toContain(path)
      expect(offlineLane(true, 'GET', path)).toBe('navigation')
    }
  })
})
