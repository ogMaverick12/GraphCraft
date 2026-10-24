import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  axisScreenPosition,
  clipPolyline,
  createTransform,
  formatReadout,
  screenToWorld,
  ticksForRange,
  worldToScreen,
  type ScreenPoint,
  type SizePx,
  type WorldPoint,
  type WorldRect,
} from './coordinate.ts'
import { curveStyle } from './palette.ts'
import type { AnalysisMarker } from './markers.ts'
import { IconButton } from '../components/ui/IconButton.tsx'

export interface GraphCurveInput {
  readonly id: string
  readonly label: string
  readonly styleIndex: number
  /** World-space segments; separation is preserved end to end. */
  readonly segments: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  /** World-space filled regions (inequalities only). */
  readonly regions: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>
  /** Boundary dash override (strict inequalities render dashed). */
  readonly dash?: string
}

interface GraphViewProps {
  world: WorldRect
  curves: GraphCurveInput[]
  showGrid: boolean
  equalAspect: boolean
  crosshair: boolean
  onPanByWorld: (dx: number, dy: number) => void
  onZoomAtWorld: (centerX: number, centerY: number, factor: number) => void
  onResetView: () => void
  onViewportSizeChange: (size: SizePx) => void
  /** Analysis result points (roots, intersections, extrema); omitted when none. */
  markers?: AnalysisMarker[]
  /** Test/SSR override for the measured box. */
  measuredSize?: SizePx
}

const FALLBACK_SIZE: SizePx = { width: 800, height: 600 }
const ZOOM_STEP = 1.2

/** Box measurement without set-state-in-effect (ResizeObserver as external store). */
function useElementSize(ref: React.RefObject<HTMLDivElement | null>, override?: SizePx): SizePx {
  const sizeRef = useRef<SizePx>(FALLBACK_SIZE)
  const subscribe = useCallback(
    (notify: () => void): (() => void) => {
      const element = ref.current
      if (element === null || override !== undefined || typeof ResizeObserver === 'undefined') {
        return () => {}
      }
      const observer = new ResizeObserver(() => {
        const rect = element.getBoundingClientRect()
        const next = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) }
        if (next.width !== sizeRef.current.width || next.height !== sizeRef.current.height) {
          sizeRef.current = next
          notify()
        }
      })
      observer.observe(element)
      return () => observer.disconnect()
    },
    [ref, override],
  )
  const getSnapshot = useCallback(() => sizeRef.current, [])
  const size = useSyncExternalStore(subscribe, getSnapshot)
  return override ?? size
}

function pathFromPoints(points: ReadonlyArray<{ px: number; py: number }>): string {
  const first = points[0]
  if (first === undefined) {
    return ''
  }
  let d = `M ${first.px.toFixed(2)} ${first.py.toFixed(2)}`
  for (const p of points.slice(1)) {
    d += ` L ${p.px.toFixed(2)} ${p.py.toFixed(2)}`
  }
  return d
}

/** Compact bound text for the screen-reader viewport announcement. */
function formatBound(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1e5 || (magnitude !== 0 && magnitude < 1e-3)) {
    return value.toExponential(2)
  }
  return String(Number(value.toPrecision(4)))
}

const CurvePaths = memo(function CurvePaths({
  curve,
  runs,
  clipId,
}: {
  curve: GraphCurveInput
  runs: Array<Array<{ px: number; py: number }>>
  clipId: string
}): React.JSX.Element {
  const style = curveStyle(curve.styleIndex)
  const dash = curve.dash ?? style.dash
  return (
    <g clipPath={`url(#${clipId})`}>
      {runs.map((run, index) => (
        <path
          key={`${curve.id}-${index}`}
          d={pathFromPoints(run)}
          fill="none"
          stroke={style.color}
          strokeWidth={style.width}
          strokeLinejoin="round"
          strokeLinecap="round"
          {...(dash === '' ? {} : { strokeDasharray: dash })}
        >
          <title>{`${curve.label} (part ${index + 1})`}</title>
        </path>
      ))}
    </g>
  )
})

/**
 * SVG Cartesian viewport (GS-03 + navigation). Renders grid, axes, ticks,
 * labels, and sampled curves; drag-pan, cursor-anchored wheel/pinch zoom,
 * keyboard navigation, visible zoom controls, and an optional crosshair
 * readout. Pan deltas coalesce in one animation frame so rapid pointer
 * events resample once per frame, not once per event.
 */
export const GraphView = memo(function GraphView({
  world,
  curves,
  showGrid,
  equalAspect,
  crosshair,
  onPanByWorld,
  onZoomAtWorld,
  onResetView,
  onViewportSizeChange,
  markers = [],
  measuredSize,
}: GraphViewProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const [viewportAnnouncement, setViewportAnnouncement] = useState('')
  // Coalesced screen-reader feedback: announce once the view settles.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setViewportAnnouncement(
        `Viewport: x ${formatBound(world.xMin)} to ${formatBound(world.xMax)}, y ${formatBound(world.yMin)} to ${formatBound(world.yMax)}.`,
      )
    }, 350)
    return () => window.clearTimeout(handle)
  }, [world])
  const size = useElementSize(boxRef, measuredSize)
  const clipId = useId().replace(/:/g, '')
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null)
  const panAccum = useRef({ dx: 0, dy: 0 })
  const panRaf = useRef(0)
  const [hover, setHover] = useState<ScreenPoint | null>(null)
  const liveRef = useRef({ world, size, equalAspect, onPanByWorld, onZoomAtWorld })
  useEffect(() => {
    liveRef.current = { world, size, equalAspect, onPanByWorld, onZoomAtWorld }
  })

  useEffect(() => {
    onViewportSizeChange(size)
  }, [size, onViewportSizeChange])

  useEffect(
    () => () => {
      if (panRaf.current !== 0) {
        cancelAnimationFrame(panRaf.current)
      }
    },
    [],
  )

  function flushPan(): void {
    panRaf.current = 0
    const { dx, dy } = panAccum.current
    panAccum.current = { dx: 0, dy: 0 }
    if (dx === 0 && dy === 0) {
      return
    }
    const live = liveRef.current
    const t = createTransform(live.world, live.size, live.equalAspect)
    live.onPanByWorld(-dx / t.scaleX, dy / t.scaleY)
  }

  function schedulePan(dx: number, dy: number): void {
    panAccum.current = { dx: panAccum.current.dx + dx, dy: panAccum.current.dy + dy }
    if (panRaf.current === 0) {
      panRaf.current = requestAnimationFrame(flushPan)
    }
  }

  // Non-passive wheel zoom (cursor-anchored; trackpads emit the same events).
  useEffect(() => {
    const svg = svgRef.current
    if (svg === null) {
      return
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const live = liveRef.current
      const t = createTransform(live.world, live.size, live.equalAspect)
      const rect = svg.getBoundingClientRect()
      const cursor = screenToWorld(t, event.clientX - rect.left, event.clientY - rect.top)
      live.onZoomAtWorld(cursor.x, cursor.y, event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const transform = useMemo(() => createTransform(world, size, equalAspect), [world, size, equalAspect])
  const { xAxisPy, yAxisPx } = useMemo(() => axisScreenPosition(transform), [transform])
  const xTicks = useMemo(
    () => ticksForRange(transform.visible.xMin, transform.visible.xMax, Math.max(2, Math.round(size.width / 90))),
    [transform, size.width],
  )
  const yTicks = useMemo(
    () => ticksForRange(transform.visible.yMin, transform.visible.yMax, Math.max(2, Math.round(size.height / 70))),
    [transform, size.height],
  )

  const clipped = useMemo(
    () =>
      curves.map((curve) => ({
        curve,
        runs: curve.segments.flatMap((segment) => clipPolyline(transform, segment)),
        fills: curve.regions.map((region) => {
          const topLeft = worldToScreen(transform, region.x0, region.y1)
          const bottomRight = worldToScreen(transform, region.x1, region.y0)
          return {
            x: Math.max(0, topLeft.px),
            y: Math.max(0, topLeft.py),
            width: Math.max(0, Math.min(size.width, bottomRight.px) - Math.max(0, topLeft.px)),
            height: Math.max(0, Math.min(size.height, bottomRight.py) - Math.max(0, topLeft.py)),
          }
        }),
      })),
    [curves, transform, size.width, size.height],
  )

  const placedMarkers = useMemo(
    () =>
      markers.flatMap((marker, index) => {
        if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
          return []
        }
        if (
          marker.x < transform.visible.xMin ||
          marker.x > transform.visible.xMax ||
          marker.y < transform.visible.yMin ||
          marker.y > transform.visible.yMax
        ) {
          return []
        }
        const { px, py } = worldToScreen(transform, marker.x, marker.y)
        return [{ marker, index, px, py }]
      }),
    [markers, transform],
  )

  const curveCount = curves.length
  const summary = useMemo(
    () =>
      curveCount === 0
        ? 'Empty graph viewport. No curves loaded.'
        : `Graph viewport showing ${curveCount} ${curveCount === 1 ? 'curve' : 'curves'}: ${curves.map((c) => c.label).join(', ')}${placedMarkers.length > 0 ? `, ${placedMarkers.length} ${placedMarkers.length === 1 ? 'marker' : 'markers'} on the plot` : ''}.`,
    [curveCount, curves, placedMarkers],
  )

  const hoverWorld: WorldPoint | null = hover === null ? null : screenToWorld(transform, hover.px, hover.py)
  const readoutX = hoverWorld === null ? '' : formatReadout(hoverWorld.x, transform.visible.xMax - transform.visible.xMin)
  const readoutY = hoverWorld === null ? '' : formatReadout(hoverWorld.y, transform.visible.yMax - transform.visible.yMin)
  const readoutLeft = hover === null ? 0 : Math.min(Math.max(hover.px + 12, 4), Math.max(4, size.width - 150))

  function zoomAtCenter(factor: number): void {
    const cx = (transform.visible.xMin + transform.visible.xMax) / 2
    const cy = (transform.visible.yMin + transform.visible.yMax) / 2
    onZoomAtWorld(cx, cy, factor)
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // jsdom and detached nodes: capture unavailable, deltas still work.
      }
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      const [p, q] = [...pointersRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      if (p !== undefined && q !== undefined) {
        pinchRef.current = {
          distance: Math.hypot(q.x - p.x, q.y - p.y),
          midX: (p.x + q.x) / 2,
          midY: (p.y + q.y) / 2,
        }
      }
      dragRef.current = null
    } else {
      dragRef.current = { x: event.clientX, y: event.clientY }
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const pointers = pointersRef.current
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (pointers.size >= 2) {
      const [p, q] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const pinch = pinchRef.current
      if (p !== undefined && q !== undefined && pinch !== null && pinch.distance > 0) {
        const distance = Math.hypot(q.x - p.x, q.y - p.y)
        const rect = svgRef.current?.getBoundingClientRect()
        const live = liveRef.current
        const t = createTransform(live.world, live.size, live.equalAspect)
        const midWorld = rect
          ? screenToWorld(t, (p.x + q.x) / 2 - rect.left, (p.y + q.y) / 2 - rect.top)
          : screenToWorld(t, pinch.midX, pinch.midY)
        if (distance > 0) {
          live.onZoomAtWorld(midWorld.x, midWorld.y, pinch.distance / distance)
        }
        pinchRef.current = { distance, midX: (p.x + q.x) / 2, midY: (p.y + q.y) / 2 }
      }
      return
    }
    const last = dragRef.current
    if (last !== null) {
      schedulePan(event.clientX - last.x, event.clientY - last.y)
      dragRef.current = { x: event.clientX, y: event.clientY }
      return
    }
    if (event.buttons === 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      setHover({ px: event.clientX - rect.left, py: event.clientY - rect.top })
    }
  }

  function endPointer(event: React.PointerEvent<SVGSVGElement>): void {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 0) {
      dragRef.current = null
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const t = createTransform(world, size, equalAspect)
    const cx = (t.visible.xMin + t.visible.xMax) / 2
    const cy = (t.visible.yMin + t.visible.yMax) / 2
    if (event.key === '+' || event.key === '=') {
      onZoomAtWorld(cx, cy, 1 / ZOOM_STEP)
    } else if (event.key === '-') {
      onZoomAtWorld(cx, cy, ZOOM_STEP)
    } else if (event.key === '0') {
      onResetView()
    } else if (event.key === 'ArrowLeft') {
      onPanByWorld(-(t.visible.xMax - t.visible.xMin) / 20, 0)
    } else if (event.key === 'ArrowRight') {
      onPanByWorld((t.visible.xMax - t.visible.xMin) / 20, 0)
    } else if (event.key === 'ArrowUp') {
      onPanByWorld(0, (t.visible.yMax - t.visible.yMin) / 20)
    } else if (event.key === 'ArrowDown') {
      onPanByWorld(0, -(t.visible.yMax - t.visible.yMin) / 20)
    } else {
      return
    }
    event.preventDefault()
  }

  return (
    <div className="relative h-full w-full">
      <p aria-live="polite" className="sr-only">
        {viewportAnnouncement}
      </p>
      <div
        ref={boxRef}
        tabIndex={0}
        role="application"
        aria-label="Graph viewport. Drag to pan, scroll to zoom, plus and minus to zoom, zero to reset."
        onKeyDown={onKeyDown}
        className="h-full w-full bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={summary}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={() => setHover(null)}
          className="block touch-none select-none"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={size.width} height={size.height} />
            </clipPath>
          </defs>
          {showGrid && (
            <g aria-hidden="true">
              {xTicks.map((tick) => {
                const { px } = worldToScreen(transform, tick.value, 0)
                return <line key={`gx-${tick.value}`} x1={px} y1={0} x2={px} y2={size.height} className="stroke-grid" strokeWidth={1} />
              })}
              {yTicks.map((tick) => {
                const { py } = worldToScreen(transform, 0, tick.value)
                return <line key={`gy-${tick.value}`} x1={0} y1={py} x2={size.width} y2={py} className="stroke-grid" strokeWidth={1} />
              })}
            </g>
          )}
          {clipped.map(({ curve, fills }) => (
            <g key={`fill-${curve.id}`} aria-hidden="true">
              {fills.map((rect, index) =>
                rect.width > 0 && rect.height > 0 ? (
                  <rect key={index} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={curveStyle(curve.styleIndex).color} fillOpacity={0.15} />
                ) : null,
              )}
            </g>
          ))}
          <line x1={0} y1={xAxisPy} x2={size.width} y2={xAxisPy} className="stroke-axis" strokeWidth={1.5} />
          <line x1={yAxisPx} y1={0} x2={yAxisPx} y2={size.height} className="stroke-axis" strokeWidth={1.5} />
          <g aria-hidden="true" fontSize={11} className="fill-muted">
            {xTicks.map((tick) => {
              const { px } = worldToScreen(transform, tick.value, 0)
              const x = Math.min(Math.max(px, 20), size.width - 4)
              return (
                <text key={`tx-${tick.value}`} x={x} y={size.height - 6} textAnchor="middle">
                  {tick.label}
                </text>
              )
            })}
            {yTicks.map((tick) => {
              const { py } = worldToScreen(transform, 0, tick.value)
              const y = Math.min(Math.max(py + 4, 12), size.height - 4)
              return (
                <text key={`ty-${tick.value}`} x={6} y={y} textAnchor="start">
                  {tick.label}
                </text>
              )
            })}
          </g>
          {transform.visible.xMin <= 0 && 0 <= transform.visible.xMax && transform.visible.yMin <= 0 && 0 <= transform.visible.yMax && (
            <circle cx={worldToScreen(transform, 0, 0).px} cy={worldToScreen(transform, 0, 0).py} r={3.5} className="fill-accent" aria-hidden="true" />
          )}
          {crosshair && hover !== null && (
            <g aria-hidden="true">
              <line x1={hover.px} y1={0} x2={hover.px} y2={size.height} className="stroke-accent" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
              <line x1={0} y1={hover.py} x2={size.width} y2={hover.py} className="stroke-accent" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
            </g>
          )}
          {clipped.map(({ curve, runs }) => (
            <CurvePaths key={curve.id} curve={curve} runs={runs} clipId={clipId} />
          ))}
          {placedMarkers.length > 0 && (
            <g clipPath={`url(#${clipId})`}>
              {placedMarkers.map(({ marker, index, px, py }) => (
                <g key={`${marker.kind}-${index}`} aria-label={`${marker.kind} marker: ${marker.label}`}>
                  <title>{`${marker.kind}: ${marker.label}`}</title>
                  {marker.kind === 'root' && <circle cx={px} cy={py} r={5.5} className="fill-surface stroke-accent" strokeWidth={2} />}
                  {marker.kind === 'intersection' && (
                    <path d={`M ${px} ${(py - 7).toFixed(2)} L ${(px + 7).toFixed(2)} ${py} L ${px} ${(py + 7).toFixed(2)} L ${(px - 7).toFixed(2)} ${py} Z`} className="fill-accent" />
                  )}
                  {marker.kind === 'extremum' && (
                    <path d={`M ${px} ${(py - 7).toFixed(2)} L ${(px + 7).toFixed(2)} ${(py + 5).toFixed(2)} L ${(px - 7).toFixed(2)} ${(py + 5).toFixed(2)} Z`} className="fill-surface stroke-accent" strokeWidth={2} strokeLinejoin="round" />
                  )}
                  <text x={px + 9} y={py - 9} fontSize={10} className="fill-muted">
                    {marker.label}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
      {crosshair && hover !== null && (
        <div
          data-testid="crosshair-readout"
          aria-hidden="true"
          style={{ left: readoutLeft, top: Math.max(hover.py - 44, 4) }}
          className="pointer-events-none absolute rounded-md border border-line bg-elevated px-2 py-1 font-mono text-xs text-ink shadow-panel"
        >
          x {readoutX}, y {readoutY}
        </div>
      )}
      <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-surface p-0.5 shadow-panel">
        <IconButton label="Zoom in" title="Zoom in" onClick={() => zoomAtCenter(1 / ZOOM_STEP)}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Zoom out" title="Zoom out" onClick={() => zoomAtCenter(ZOOM_STEP)}>
          <Minus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Reset view" title="Reset view" onClick={onResetView}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
})
