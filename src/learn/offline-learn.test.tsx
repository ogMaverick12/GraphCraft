import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

// Simulates the Learn chunk (including row construction) never being
// downloaded: the dynamic import rejects. The graph and saved document
// must stay available behind an honest recoverable error.
vi.mock('./LearnLibrary.tsx', () => {
  throw new Error('offline: learn library chunk unavailable')
})

import { App } from '../app/App.tsx'

describe('offline Learn recovery', () => {
  it('keeps the project and explains when the Learn chunk cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    window.localStorage.setItem(
      'graphcraft-last-project',
      JSON.stringify({
        format: 'graphcraft-project',
        version: 6,
        title: 'Kept project',
        expressions: [{ kind: 'cartesian', id: 'kept', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }],
        viewport: { xMin: -4, xMax: 4, yMin: -4, yMax: 4, equalAspect: false, showGrid: true },
        parameters: [],
        dataLab: { datasets: [], analyses: {} },
        surfaces3d: [],
        fields2d: [],
        scatters3d: [],
      }),
    )
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Kept project')

    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Learn')
    expect(alert).toHaveTextContent(/reconnect and reload/i)
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Kept project')
  })
})
