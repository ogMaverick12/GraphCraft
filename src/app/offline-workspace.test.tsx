import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Simulates the offline case where the Calculator chunk was never
// downloaded: the dynamic import rejects, exactly as it would with the
// network down and no cached chunk. The boundary must explain, not blank.
vi.mock('../calculator/Calculator.tsx', () => {
  throw new Error('offline: calculator chunk unavailable')
})

import { App } from './App.tsx'

describe('offline workspace recovery', () => {
  it('shows an honest message when a workspace chunk cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Show calculator' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Calculator')
    expect(alert).toHaveTextContent(/reconnect and reload/i)
  })
})
