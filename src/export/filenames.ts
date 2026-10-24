/** Sanitized `title-graph.ext` filenames for exported figures. */
export function sanitizeExportFilename(title: string, extension: 'svg' | 'png'): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${cleaned === '' ? 'graphcraft-graph' : cleaned}-graph.${extension}`
}

/** Sanitized `title-figure.ext` filenames for Data Lab figures and tables. */
export function sanitizeFigureFilename(title: string, extension: 'svg' | 'png' | 'csv'): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${cleaned === '' ? 'graphcraft-data' : cleaned}-figure.${extension}`
}

/** Trigger a browser download of a Blob. Returns false where unavailable. */
export function downloadBlob(filename: string, blob: Blob): boolean {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false
    }
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
