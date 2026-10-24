import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'

vi.mock('./operations.ts', () => {
  throw new Error('operations chunk unavailable')
})

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

describe('lazy analysis operations', () => {
  it('keeps the graph usable and reports an accessible error when the chunk fails', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')
    await screen.findByRole('img', { name: /x\^2-4/ })

    await user.click(screen.getByRole('button', { name: 'Find roots' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Analysis tools could not be loaded/)
    expect(screen.getByRole('img', { name: /x\^2-4/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/root marker/i)).not.toBeInTheDocument()
  })
})
