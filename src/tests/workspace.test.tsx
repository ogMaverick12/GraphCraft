import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

describe('Workspace shell interactions', () => {
  it('collapses and expands the side panels from the top bar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Collapse expression list' }))
    expect(screen.queryByRole('complementary', { name: 'Expressions' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand expression list' }))
    expect(screen.getByRole('complementary', { name: 'Expressions' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand inspector' }))
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument()
  })

  it('toggles grid visibility from the inspector and updates the viewport', async () => {
    const user = userEvent.setup()
    render(<App />)

    const viewport = screen.getByRole('img', { name: /viewport/i })
    expect(viewport.querySelectorAll('line').length).toBeGreaterThan(2)

    await user.click(screen.getByRole('checkbox', { name: /show grid/i }))
    expect(viewport.querySelectorAll('line').length).toBe(2) // axes only

    await user.click(screen.getByRole('checkbox', { name: /show grid/i }))
    expect(viewport.querySelectorAll('line').length).toBeGreaterThan(2)
  })

  it('opens the mobile drawer, keeps Tab inside it, and closes it with Escape, returning focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    const opener = screen.getByRole('button', { name: 'Open expression list' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Expression list' })
    expect(dialog).toBeInTheDocument()

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    last.focus()
    await user.keyboard('{Tab}')
    expect(first).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(last).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('selects a curve row from the keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)

    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.clear(box)
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    const editor = await screen.findByRole('textbox', { name: 'Expression' })

    const row = editor.closest('li')
    expect(row).not.toBeNull()
    row?.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText(/selected for inspection\./)).toBeInTheDocument()
    expect(row).toHaveAttribute('aria-current', 'true')
  })

  it('gives every button an accessible name and every icon-only button a tooltip', () => {
    render(<App />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? ''
      expect(name.trim()).not.toBe('')
      if ((button.textContent ?? '').trim() === '') {
        // Icon-only: native tooltip required alongside the accessible name.
        expect(button.getAttribute('title')).not.toBeNull()
      }
    }
  })

  it('persists the theme choice across mounts', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(window.localStorage.getItem('graphcraft-theme')).toBe('dark')
    first.unmount()

    render(<App />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
