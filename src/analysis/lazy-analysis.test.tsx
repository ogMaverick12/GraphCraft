import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'

const gate = vi.hoisted(() => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
})

vi.mock('./operations.ts', async () => {
  const [roots, extrema, integral, derivative, intersections] = await Promise.all([
    import('./roots.ts'),
    import('./extrema.ts'),
    import('./integral.ts'),
    import('./derivative.ts'),
    import('./intersections.ts'),
  ])
  await gate.promise
  return {
    findRoots: roots.findRoots,
    findExtrema: extrema.findExtrema,
    integrate: integral.integrate,
    tangent: derivative.tangent,
    findIntersections: intersections.findIntersections,
  }
})

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

describe('lazy analysis operations', () => {
  it('does not draw a result when the view changes while the operations chunk loads', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')
    await screen.findByRole('img', { name: /x\^2-4/ })

    await user.click(screen.getByRole('button', { name: 'Find roots' }))
    expect(screen.getByText(/Loading analysis tools/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    await act(async () => {
      gate.release()
      await Promise.resolve()
    })

    expect(await screen.findByText(/recompute for current results/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/root marker/i)).not.toBeInTheDocument()
  })
})
