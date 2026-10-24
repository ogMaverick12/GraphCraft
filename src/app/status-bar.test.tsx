import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StatusBar } from './StatusBar.tsx'

function renderStatusBar(): void {
  render(
    <StatusBar
      expressionCount={0}
      theme="light"
      viewLabel="x [-10, 10] · y [-7, 7]"
      notice={null}
      online
      updateAvailable={false}
      onApplyUpdate={vi.fn()}
    />,
  )
}

describe('status bar licence links', () => {
  it('offers separate same-origin destinations for the project licence and third-party notices', () => {
    renderStatusBar()

    const nav = screen.getByRole('navigation', { name: 'Licence and notices' })
    const licence = screen.getByRole('link', { name: 'Licence' })
    const notices = screen.getByRole('link', { name: 'Third-party notices' })

    expect(nav).toContainElement(licence)
    expect(nav).toContainElement(notices)
    expect(licence).toHaveAttribute('href', '/LICENSE.txt')
    expect(notices).toHaveAttribute('href', '/THIRD_PARTY_NOTICES.txt')
    expect(licence).not.toHaveAttribute('target')
    expect(notices).not.toHaveAttribute('target')
    expect(screen.getByRole('contentinfo', { name: 'Status' })).toContainElement(nav)
  })

  it('keeps both destinations reachable in keyboard order', async () => {
    const user = userEvent.setup()
    renderStatusBar()

    await user.tab()
    expect(screen.getByRole('link', { name: 'Licence' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('link', { name: 'Third-party notices' })).toHaveFocus()
  })
})
