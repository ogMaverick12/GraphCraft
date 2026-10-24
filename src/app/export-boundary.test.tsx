import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Simulates the offline case where the export chunk was never downloaded:
// the lazy import rejects, exactly as it would with no cached chunk. The
// boundary must explain the failure and keep the graph usable.
vi.mock('../export/ExportDialog.tsx', () => {
  throw new Error('offline: export chunk unavailable')
})

import { App } from './App.tsx'

describe('export dialog load boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('explains a failed export chunk load and allows closing it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'Export graph as image' }))
    const alert = await screen.findByRole('alertdialog', { name: 'Export graph unavailable' })
    expect(alert).toHaveTextContent(/could not load/i)
    expect(alert).toHaveTextContent(/graph and saved work are unaffected/i)
    expect(screen.getByRole('textbox', { name: 'New expression' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alertdialog', { name: 'Export graph unavailable' })).not.toBeInTheDocument()
  })
})
