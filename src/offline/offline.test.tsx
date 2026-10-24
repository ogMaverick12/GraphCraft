import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applyOfflineUpdate, registerOffline } from './register.ts'
import { useOnlineStatus } from './useOnlineStatus.ts'

function Probe(): React.JSX.Element {
  const online = useOnlineStatus()
  return <p data-testid="online-probe">{online ? 'online' : 'offline'}</p>
}

describe('offline registration', () => {
  it('stays inert outside production builds', async () => {
    await expect(registerOffline(() => {})).resolves.toBe('unsupported')
  })

  it('reports no pending update when none is waiting', () => {
    expect(applyOfflineUpdate()).toBe(false)
  })
})

describe('online status', () => {
  it('tracks browser online/offline events', () => {
    render(<Probe />)
    expect(screen.getByTestId('online-probe')).toHaveTextContent('online')

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('online-probe')).toHaveTextContent('offline')

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByTestId('online-probe')).toHaveTextContent('online')
  })
})
