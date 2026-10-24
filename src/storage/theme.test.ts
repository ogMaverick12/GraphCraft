import { describe, expect, it, vi } from 'vitest'
import { applyTheme } from './theme.ts'

describe('applyTheme', () => {
  it('applies and persists the requested mode', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('graphcraft-theme')).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('graphcraft-theme')).toBe('light')
  })

  it('suppresses transitions while the palette actually changes', async () => {
    document.documentElement.classList.remove('dark')
    applyTheme('dark')
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
    })
    applyTheme('dark')
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
  })
})
