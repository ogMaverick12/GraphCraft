/**
 * Non-sensitive UI preferences in browser storage. Graph documents stay
 * files; only chrome (panels, crosshair) lives here. Every access is
 * guarded: unavailable/quota-exceeded/corrupt storage degrades to
 * defaults with a visible notice, never a crash.
 */

const PREFS_KEY = 'graphcraft-prefs'
const BACKUP_KEY = 'graphcraft-last-project'

export interface UiPreferences {
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  crosshair: boolean
}

export const DEFAULT_PREFS: UiPreferences = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 256,
  crosshair: true,
}

function readKey(key: string): { text: string | null; failed: boolean } {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return { text: null, failed: true }
    }
    return { text: window.localStorage.getItem(key), failed: false }
  } catch {
    return { text: null, failed: true }
  }
}

function writeKey(key: string, text: string): boolean {
  try {
    window.localStorage.setItem(key, text)
    return true
  } catch {
    return false
  }
}

function parsePrefs(text: string | null): UiPreferences | null {
  if (text === null) {
    return null
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    if (typeof data !== 'object' || data === null) {
      return null
    }
    return {
      leftOpen: data['leftOpen'] !== false,
      rightOpen: data['rightOpen'] !== false,
      leftWidth: typeof data['leftWidth'] === 'number' && Number.isFinite(data['leftWidth']) ? Math.min(384, Math.max(192, data['leftWidth'])) : 256,
      crosshair: data['crosshair'] !== false,
    }
  } catch {
    return null
  }
}

export function loadPreferences(): { prefs: UiPreferences; storageNotice: string | null } {
  const { text, failed } = readKey(PREFS_KEY)
  if (failed) {
    return { prefs: DEFAULT_PREFS, storageNotice: 'Browser storage is unavailable; preferences will not persist, but files still work.' }
  }
  const prefs = parsePrefs(text)
  if (text !== null && prefs === null) {
    return { prefs: DEFAULT_PREFS, storageNotice: 'Stored preferences were corrupted and were reset to defaults.' }
  }
  return { prefs: prefs ?? DEFAULT_PREFS, storageNotice: null }
}

export function savePreferences(prefs: UiPreferences): boolean {
  return writeKey(PREFS_KEY, JSON.stringify(prefs))
}

export function loadBackup(): { text: string | null; storageFailed: boolean } {
  const { text, failed } = readKey(BACKUP_KEY)
  return { text, storageFailed: failed }
}

/** Best-effort session backup. Returns false on quota/unavailable storage. */
export function saveBackup(text: string): boolean {
  return writeKey(BACKUP_KEY, text)
}
