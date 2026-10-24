export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'graphcraft-theme'

function prefersDark(): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Read the persisted theme, falling back to the OS preference (light default). */
export function readTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // Private-mode / blocked storage: fall through to OS preference.
  }
  return prefersDark() ? 'dark' : 'light'
}

/**
 * Persist the theme and apply it to the document root.
 *
 * While the palette swaps, a `theme-switching` class disables transitions
 * for two frames: a cross-fade would otherwise interpolate text and
 * surface colours between the two palettes and pass through low-contrast
 * midpoints (recorded in `docs/a11y/AUDIT.md`, S7.2 pass). The class is
 * removed automatically; nothing depends on it being present.
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  const wantsDark = mode === 'dark'
  const changed = root.classList.contains('dark') !== wantsDark
  if (changed) {
    root.classList.add('theme-switching')
  }
  root.classList.toggle('dark', wantsDark)
  if (changed) {
    const clear = (): void => root.classList.remove('theme-switching')
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(clear)
      })
    } else {
      setTimeout(clear, 0)
    }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage unavailable: theme still applies for this session.
  }
}
