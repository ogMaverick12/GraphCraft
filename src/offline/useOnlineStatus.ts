import { useEffect, useState } from 'react'

/**
 * Browser connectivity flag. `navigator.onLine` reflects the network
 * stack, not reachability: `true` does not prove the server answers,
 * and `false` is the honest offline signal. All core workflows treat
 * `false` as "working locally" — files and storage keep working.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine !== false)

  useEffect(() => {
    const update = (): void => {
      setOnline(navigator.onLine)
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
