/**
 * Learn bookmarks (Stage 5 LEARN-01): template ids the user starred,
 * in guarded browser storage. Same contract as UI prefs: unavailable,
 * quota-exceeded, or corrupt storage degrades to an empty set with no
 * crash — documents (and the library) keep working regardless.
 */

const BOOKMARKS_KEY = 'graphcraft-learn-bookmarks'
const MAX_BOOKMARKS = 200

function readKey(): string | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null
    }
    return window.localStorage.getItem(BOOKMARKS_KEY)
  } catch {
    return null
  }
}

/** Load the bookmarked ids, silently dropping anything malformed. */
export function loadBookmarks(): string[] {
  let parsed: unknown = null
  try {
    const text = readKey()
    parsed = text === null ? null : (JSON.parse(text) as unknown)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  const ids = parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).slice(0, MAX_BOOKMARKS)
  return [...new Set(ids)]
}

/** Persist ids; false means storage refused (caller shows a notice). */
export function saveBookmarks(ids: string[]): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false
    }
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids.slice(0, MAX_BOOKMARKS)))
    return true
  } catch {
    return false
  }
}
