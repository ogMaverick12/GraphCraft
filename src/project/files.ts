/**
 * File helpers: the user owns their documents as files. Download never
 * executes content; upload is text-in, validated elsewhere before use.
 */

/** Windows device names a download must never use as a bare stem (case-insensitive). */
const RESERVED_STEMS: ReadonlySet<string> = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

export function sanitizeFilename(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  // The export helpers append `-graph`/`-figure`, so only this stem can
  // collide with a reserved device name once the extension is added.
  const stem = cleaned === '' ? 'graphcraft-project' : RESERVED_STEMS.has(cleaned) ? `${cleaned}-project` : cleaned
  return `${stem}.graphcraft.json`
}

/** Refuse absurd uploads before reading bytes into memory (validated caps apply after). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Pure size check (unit-tested without allocating giant files). */
export function uploadTooLarge(sizeBytes: number, maxBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes > maxBytes
}

/** Trigger a browser download of text content. No-ops where unavailable. */
export function downloadTextFile(filename: string, text: string): boolean {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false
    }
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

/** Read a user-picked file as text. Rejects on read errors (and oversized files, before allocating). */
export function readFileText(file: File): Promise<string> {
  if (uploadTooLarge(file.size, MAX_UPLOAD_BYTES)) {
    return Promise.reject(new Error(`That file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB). Split it first.`))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read file as text.'))
      }
    }
    reader.onerror = (): void => {
      reject(new Error('Could not read file.'))
    }
    reader.readAsText(file)
  })
}
