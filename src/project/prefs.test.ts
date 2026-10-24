import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, loadBackup, loadPreferences, saveBackup, savePreferences } from './prefs.ts'

/**
 * Preferences storage guards (S7.1 checklist item 6): corrupted JSON,
 * blocked reads, missing storage, and failed writes must degrade to
 * defaults with an honest notice — never a crash and never silently.
 */
describe('preferences storage guards', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('round-trips preferences and clamps the stored panel width', () => {
    expect(savePreferences({ leftOpen: false, rightOpen: true, leftWidth: 999, crosshair: false })).toBe(true)
    const loaded = loadPreferences()
    expect(loaded.storageNotice).toBeNull()
    expect(loaded.prefs).toEqual({ leftOpen: false, rightOpen: true, leftWidth: 384, crosshair: false })

    // Out-of-range and non-numeric widths fall back to the documented clamp.
    window.localStorage.setItem('graphcraft-prefs', JSON.stringify({ leftWidth: 5 }))
    expect(loadPreferences().prefs.leftWidth).toBe(192)
    window.localStorage.setItem('graphcraft-prefs', JSON.stringify({ leftWidth: 'wide' }))
    expect(loadPreferences().prefs.leftWidth).toBe(DEFAULT_PREFS.leftWidth)
  })

  it('resets corrupted preferences to defaults with a visible notice', () => {
    window.localStorage.setItem('graphcraft-prefs', '{not json')
    const loaded = loadPreferences()
    expect(loaded.prefs).toEqual(DEFAULT_PREFS)
    expect(loaded.storageNotice).toMatch(/corrupted/)
  })

  it('falls back to defaults when storage reads are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const loaded = loadPreferences()
    expect(loaded.prefs).toEqual(DEFAULT_PREFS)
    expect(loaded.storageNotice).toMatch(/unavailable/)
    expect(loadBackup()).toEqual({ text: null, storageFailed: true })
  })

  it('falls back to defaults when localStorage is missing entirely', () => {
    vi.stubGlobal('localStorage', undefined)
    const loaded = loadPreferences()
    expect(loaded.prefs).toEqual(DEFAULT_PREFS)
    expect(loaded.storageNotice).toMatch(/unavailable/)
    expect(savePreferences(DEFAULT_PREFS)).toBe(false)
  })

  it('reports failed writes instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(savePreferences(DEFAULT_PREFS)).toBe(false)
    expect(saveBackup('{"format":"graphcraft-project"}')).toBe(false)
  })
})
