import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The graph viewport is replaced by a component that always throws, so this
// suite can prove the boundary catches a Graph Studio render failure and the
// surrounding project stays alive. App's real GraphView is exercised by the
// graph, navigation, and persistence suites.
vi.mock('../graph/GraphView.tsx', () => ({
  GraphView: function GraphView(): never {
    throw new Error('synthetic render failure')
  },
}))

import { App } from './App.tsx'

const BACKUP = {
  format: 'graphcraft-project',
  version: 1,
  title: 'Boundary session',
  expressions: [{ id: 'brk-1', source: 'x^3', visible: true, colorIndex: 2 }],
  viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, equalAspect: false, showGrid: true },
}

describe('graph studio render boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a fallback, preserves the project, and retries on demand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    window.localStorage.setItem('graphcraft-last-project', JSON.stringify(BACKUP))
    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not render this view/i)

    // Project UI and the stored backup survive the render failure.
    expect(screen.getByRole('textbox', { name: 'New expression' })).toBeInTheDocument()
    const stored = window.localStorage.getItem('graphcraft-last-project')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ title: 'Boundary session' })

    // Recovery is explicit and viewport-only; the mocked viewport still
    // throws, so the fallback returns — with the project still intact.
    await user.click(screen.getByRole('button', { name: 'Restore view' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not render this view/i)
    const afterRetry = window.localStorage.getItem('graphcraft-last-project')
    expect(JSON.parse(afterRetry ?? '{}')).toMatchObject({
      title: 'Boundary session',
      expressions: [{ id: 'brk-1' }],
    })
  })
})
