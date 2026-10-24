/**
 * Learn progress (Stage 5 S5.4): last-used topic plus per-item practice
 * state (answered correctly / answer revealed), in guarded browser
 * storage. Same contract as bookmarks: storage may refuse or corrupt —
 * practice then runs stateless with no crash. Nothing identifies the
 * user; nothing leaves the machine.
 */

const PROGRESS_KEY = 'graphcraft-learn-progress'
const MAX_ITEMS = 200

export type PracticeItemState = 'unseen' | 'correct' | 'revealed'

export interface LearnProgress {
  lastTopicId: string | null
  items: Record<string, PracticeItemState>
}

const EMPTY: LearnProgress = { lastTopicId: null, items: {} }

function readKey(): string | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null
    }
    return window.localStorage.getItem(PROGRESS_KEY)
  } catch {
    return null
  }
}

function isItemState(value: unknown): value is PracticeItemState {
  return value === 'unseen' || value === 'correct' || value === 'revealed'
}

/** Load progress, dropping anything malformed (never a crash, never a block). */
export function loadProgress(): LearnProgress {
  let parsed: unknown = null
  try {
    const text = readKey()
    parsed = text === null ? null : (JSON.parse(text) as unknown)
  } catch {
    return { ...EMPTY, items: {} }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...EMPTY, items: {} }
  }
  const record = parsed as Record<string, unknown>
  const lastTopicId = typeof record['lastTopicId'] === 'string' ? (record['lastTopicId'] as string) : null
  const items: Record<string, PracticeItemState> = {}
  if (record['items'] !== null && typeof record['items'] === 'object' && !Array.isArray(record['items'])) {
    for (const [key, value] of Object.entries(record['items'] as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      if (isItemState(value)) {
        items[key] = value
      }
    }
  }
  return { lastTopicId, items }
}

/** Persist progress; false means storage refused (practice runs stateless). */
export function saveProgress(progress: LearnProgress): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false
    }
    const items = Object.fromEntries(Object.entries(progress.items).slice(0, MAX_ITEMS))
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ lastTopicId: progress.lastTopicId, items }))
    return true
  } catch {
    return false
  }
}
