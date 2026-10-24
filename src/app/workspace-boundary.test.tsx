import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphStudioBoundary, WorkspaceBoundary } from './WorkspaceBoundary.tsx'

function Bomb(): React.JSX.Element {
  throw new Error('chunk load failed')
}

describe('workspace boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children while nothing fails', () => {
    render(
      <WorkspaceBoundary workspace="Calculator">
        <p>healthy workspace</p>
      </WorkspaceBoundary>,
    )
    expect(screen.getByText('healthy workspace')).toBeInTheDocument()
  })

  it('explains a failed workspace load and offers a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const onReload = vi.fn()
    render(
      <WorkspaceBoundary workspace="Calculator" onReload={onReload}>
        <Bomb />
      </WorkspaceBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Calculator')
    expect(alert).toHaveTextContent(/reconnect and reload/i)
    await user.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})

describe('graph studio boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children while nothing fails', () => {
    render(
      <GraphStudioBoundary onRestoreView={() => undefined}>
        <p>healthy graph</p>
      </GraphStudioBoundary>,
    )
    expect(screen.getByText('healthy graph')).toBeInTheDocument()
  })

  it('keeps sibling project content mounted and retries after restoring the view', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const onRestoreView = vi.fn()
    function Harness(): React.JSX.Element {
      const [healthy, setHealthy] = useState(false)
      return (
        <div>
          <p>expression rows intact</p>
          <GraphStudioBoundary
            onRestoreView={() => {
              onRestoreView()
              setHealthy(true)
            }}
          >
            {healthy ? <p>graph rendered</p> : <Bomb />}
          </GraphStudioBoundary>
        </div>
      )
    }
    render(<Harness />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not render this view/i)
    // The boundary isolates the failure: sibling project content stays up.
    expect(screen.getByText('expression rows intact')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore view' }))
    expect(onRestoreView).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('graph rendered')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
