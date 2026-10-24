import { useCallback, useState } from 'react'
import { clampWorldRect } from './coordinate.ts'
import type { WorldRect } from './coordinate.ts'

export const DEFAULT_WORLD: WorldRect = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }

const ZOOM_IN = 1 / 1.2
const ZOOM_OUT = 1.2

/**
 * Mathematical viewport state (GS-03 navigation-lite). Pan and zoom mutate
 * the world rectangle only; pixel size arrives separately from measurement,
 * so resize never corrupts the mathematical view. The initial rectangle
 * (restored session or opened project) and `reset` both run through
 * `clampWorldRect`, so no caller can seed the renderer with degenerate or
 * out-of-fence bounds.
 */
export function useViewport(initial: WorldRect = DEFAULT_WORLD): {
  world: WorldRect
  panByWorld: (dx: number, dy: number) => void
  zoomAtWorld: (centerX: number, centerY: number, factor: number) => void
  setView: (world: WorldRect) => void
  reset: () => void
} {
  const [world, setWorld] = useState<WorldRect>(() => clampWorldRect(initial))

  const panByWorld = useCallback((dx: number, dy: number) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return
    }
    setWorld((w) => clampWorldRect({ xMin: w.xMin + dx, xMax: w.xMax + dx, yMin: w.yMin + dy, yMax: w.yMax + dy }))
  }, [])

  const zoomAtWorld = useCallback((centerX: number, centerY: number, factor: number) => {
    if (!(factor > 0) || !Number.isFinite(factor) || !Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      return
    }
    setWorld((w) =>
      clampWorldRect({
        xMin: centerX - (centerX - w.xMin) * factor,
        xMax: centerX + (w.xMax - centerX) * factor,
        yMin: centerY - (centerY - w.yMin) * factor,
        yMax: centerY + (w.yMax - centerY) * factor,
      }),
    )
  }, [])

  const reset = useCallback(() => {
    setWorld(clampWorldRect(initial))
  }, [initial])

  const setView = useCallback((next: WorldRect) => {
    setWorld(clampWorldRect(next))
  }, [])

  return { world, panByWorld, zoomAtWorld, setView, reset }
}

export { ZOOM_IN, ZOOM_OUT }
