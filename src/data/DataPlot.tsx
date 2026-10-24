import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  axisScreenPosition,
  createTransform,
  ticksForRange,
  worldToScreen,
  type SizePx,
  type WorldRect,
} from '../graph/coordinate.ts'
import { curveStyle } from '../graph/palette.ts'
import { IconButton } from '../components/ui/IconButton.tsx'
import { logTicks, seriesShape, type PlotConfig, type PlotSeries, type ResolvedPlot } from './plots.ts'
import { selectCategoricalTicks } from './category-ticks.ts'
import { buildScatterSeriesMark, POINT_RADIUS, SCATTER_HIT_RADIUS, type ScatterScreenPoint, type ScatterSeriesMark } from './scatter-marks.ts'
import { buildMarkerHitIndex, findNearestMarker } from './marker-hit-index.ts'
import { buildBarSeriesMark, type BarScreenRect, type BarSeriesMark } from './bar-marks.ts'
import { buildBarHitIndex, findBarHit } from './bar-hit-index.ts'
import { buildErrorBarPaths, type ErrorBarPaths, type ErrorBarScreenPoint } from './error-bars.ts'
import { buildLineRunGeometry, pathFrom, type LineRunGeometry } from './line-runs.ts'

interface DataPlotProps {
  plot: ResolvedPlot
  config: PlotConfig
  world: WorldRect | null
  /** Fitted curve overlay (dashed accent line, never a data series). */
  fitLine?: Array<{ x: number; y: number }> | null
  /** Horizontal reference levels in data Y units (e.g. residual zero). */
  referenceLines?: number[]
  /** Compact height for embedded panels (residuals). */
  compact?: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
}

const FALLBACK_SIZE: SizePx = { width: 640, height: 400 }

interface MarkerHover extends ScatterScreenPoint {
  /** Geometry that produced this hover; a new batch invalidates it. */
  readonly marks: ReadonlyArray<ScatterSeriesMark>
}

interface BarHover {
  readonly bar: BarScreenRect
  /** Geometry that produced this hover; a new batch invalidates it. */
  readonly marks: ReadonlyArray<BarSeriesMark>
  readonly px: number
  readonly py: number
}

/**
 * Data-plot renderer (Stage 4 DATA-02): scatter points, line runs,
 * and bars/histogram rectangles over the shared coordinate layer.
 * Logically separate from equation plotting — series come from
 * resolved datasets, never samplers — but transforms, ticks, grid,
 * palette, and zoom controls follow the same contracts. Bars are
 * never connected as lines; hidden series never draw.
 */
export function DataPlot({ plot, config, world, fitLine = null, referenceLines = [], compact = false, onZoomIn, onZoomOut, onResetView }: DataPlotProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<SizePx>(FALLBACK_SIZE)
  const [markerHover, setMarkerHover] = useState<MarkerHover | null>(null)
  const [barHover, setBarHover] = useState<BarHover | null>(null)
  const clipId = useId().replace(/:/g, '')

  useEffect(() => {
    const element = boxRef.current
    if (element === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const transform = useMemo(() => (world === null ? null : createTransform(world, size, false)), [world, size])
  const axes = useMemo(() => (transform === null ? null : axisScreenPosition(transform)), [transform])

  const visible = useMemo(() => plot.series.filter((s) => !(config.hiddenSeries.includes(s.key) || s.points.length === 0)), [plot.series, config.hiddenSeries])

  const markerKind = config.kind === 'scatter' || config.kind === 'line'
  const lineKind = config.kind === 'line'
  const isBar = config.kind === 'bar' || config.kind === 'histogram'
  const xLog = markerKind && config.xScale === 'log'
  const yLog = markerKind && config.yScale === 'log'

  function toDisplayX(x: number): number {
    return xLog ? Math.log10(x) : x
  }

  function toDisplayY(y: number): number {
    return yLog ? Math.log10(y) : y
  }

  const xTicks = useMemo(() => {
    if (transform === null) {
      return []
    }
    if (plot.xMode === 'categorical') {
      const labels = new Map<number, string>()
      for (const s of visible) {
        for (const p of s.points) {
          if (!labels.has(p.x)) {
            labels.set(p.x, p.label)
          }
        }
      }
      // Every bar remains rendered; only the categorical labels and major
      // gridlines are thinned to the readable capacity of the plot width.
      const candidates = [...labels.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([value, label]) => ({ value, label, px: worldToScreen(transform, value, 0).px }))
      return selectCategoricalTicks(candidates, size.width)
    }
    if (xLog) {
      return logTicks(transform.visible.xMin, transform.visible.xMax)
    }
    const target = config.tickX ?? Math.max(2, Math.round(size.width / 90))
    return ticksForRange(transform.visible.xMin, transform.visible.xMax, Math.min(12, Math.max(2, target)))
  }, [transform, plot.xMode, visible, size.width, xLog, config.tickX])

  const yTicks = useMemo(() => {
    if (transform === null) {
      return []
    }
    if (yLog) {
      return logTicks(transform.visible.yMin, transform.visible.yMax)
    }
    const target = config.tickY ?? Math.max(2, Math.round(size.height / 70))
    return ticksForRange(transform.visible.yMin, transform.visible.yMax, Math.min(12, Math.max(2, target)))
  }, [transform, size.height, yLog, config.tickY])

  // Scatter and line point markers are batched into one path per series.
  // Screen positions are computed once per data/world/size change; hovering
  // only changes tooltip state and never rebuilds the point geometry or the
  // path string. Line markers use full-precision coordinates, matching their
  // former individual element attributes.
  const markerSeriesMarks = useMemo(() => {
    if (!markerKind || transform === null) {
      return []
    }
    return visible.map((s) => {
      const style = curveStyle(s.colorIndex)
      const points: ScatterScreenPoint[] = []
      for (const p of s.points) {
        if ((xLog && p.x <= 0) || (yLog && p.y <= 0)) {
          continue
        }
        const screen = worldToScreen(transform, xLog ? Math.log10(p.x) : p.x, yLog ? Math.log10(p.y) : p.y)
        if (!Number.isFinite(screen.px) || !Number.isFinite(screen.py)) {
          continue
        }
        points.push({ px: screen.px, py: screen.py, title: `${s.label}: (${p.x}, ${p.y})` })
      }
      return buildScatterSeriesMark({
        key: s.key,
        color: style.color,
        shape: seriesShape(s.colorIndex),
        points,
        fullPrecision: config.kind === 'line',
      })
    })
  }, [markerKind, config.kind, transform, visible, xLog, yLog])

  const markerMarksByKey = useMemo(() => new Map(markerSeriesMarks.map((mark) => [mark.key, mark])), [markerSeriesMarks])

  // Line-run geometry is independent of tooltip, title, and other Inspector
  // state. Rebuild only when the resolved series, viewport/size, or log-axis
  // mapping changes; marker batching and hit testing stay separate above.
  const lineRunGeometryByKey = useMemo(() => {
    if (!lineKind || transform === null) {
      return new Map<string, LineRunGeometry[]>()
    }
    return new Map(visible.map((s) => [s.key, buildLineRunGeometry(s, transform, xLog, yLog)]))
  }, [lineKind, transform, visible, xLog, yLog])

  // Bar and histogram rectangles are batched into one path per series. The
  // rectangle records retain each bar's title for area-aware hover; no
  // rectangle geometry is recomputed for hover or unrelated config changes.
  const barSeriesMarks = useMemo(() => {
    if (!isBar || transform === null) {
      return []
    }
    const zero = worldToScreen(transform, 0, 0)
    return visible.map((s, si) => {
      const style = curveStyle(s.colorIndex)
      const span = visible.length
      const rects: BarScreenRect[] = []
      for (const p of s.points) {
        const lo = p.lo ?? p.x - 0.3
        const hi = p.hi ?? p.x + 0.3
        const slot = (hi - lo) / span
        const x0 = lo + si * slot
        const x1 = lo + (si + 1) * slot
        const a = worldToScreen(transform, x0, p.y)
        const b = worldToScreen(transform, x1, 0)
        const yTop = Math.min(a.py, zero.py)
        const yBottom = Math.max(a.py, zero.py)
        rects.push({
          x: a.px,
          y: yTop,
          width: Math.max(0, b.px - a.px),
          height: Math.max(0, yBottom - yTop),
          title: `${s.label}: ${p.label} = ${p.y}`,
        })
      }
      return buildBarSeriesMark({ key: s.key, color: style.color, rects })
    })
  }, [isBar, transform, visible])

  const barMarksByKey = useMemo(() => new Map(barSeriesMarks.map((mark) => [mark.key, mark])), [barSeriesMarks])
  const barHitRects = useMemo(
    () => barSeriesMarks.flatMap((mark) => mark.rects.filter((rect) => rect.width > 0 && rect.height > 0)),
    [barSeriesMarks],
  )
  // The index is derived from the exact hit-eligible rectangle snapshot and
  // rebuilt only when that snapshot changes, never for hover state.
  const barHitIndex = useMemo(() => (barHitRects.length === 0 ? null : buildBarHitIndex(barHitRects)), [barHitRects])

  // A bar hover belongs to the exact batch that produced it, just like marker
  // hover. Zero-area rectangles are omitted from hit testing because the former
  // unpainted <rect> elements could not be hovered either.
  const activeBarHover = barHover !== null && barHover.marks === barSeriesMarks ? barHover : null

  function handleBarPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!isBar || barHitIndex === null) {
      setBarHover(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (rect.width > 0 ? size.width / rect.width : 1)
    const y = (event.clientY - rect.top) * (rect.height > 0 ? size.height / rect.height : 1)
    // Inclusive edges and later candidates win: a shared grouped/bar-bin
    // boundary resolves to the later series/bin, matching paint order.
    const hit = findBarHit(barHitIndex, x, y)
    const best: BarHover | null = hit === null ? null : { bar: hit, marks: barSeriesMarks, px: x, py: y }
    setBarHover((current) => {
      if (best === null) {
        return current === null ? current : null
      }
      if (current !== null && current.marks === best.marks && current.bar === best.bar) {
        return current
      }
      return best
    })
  }

  // Error-bar whiskers are non-interactive and carry no per-point title, so a
  // whole series/axis batch is visually equivalent to the former line groups.
  // Geometry is recomputed only for data, transform, or error-axis changes —
  // not for marker hover or unrelated config changes.
  const errorBarPathsByKey = useMemo(() => {
    const marks = new Map<string, ErrorBarPaths>()
    if (transform === null) {
      return marks
    }
    const showX = config.kind !== 'bar' && config.kind !== 'histogram'
    for (const s of visible) {
      const points: ErrorBarScreenPoint[] = []
      for (const p of s.points) {
        const { px, py } = worldToScreen(transform, xLog ? Math.log10(p.x) : p.x, yLog ? Math.log10(p.y) : p.y)
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          continue
        }
        let yTop: number | undefined
        let yBottom: number | undefined
        let xLeft: number | undefined
        let xRight: number | undefined
        if (p.yErr !== undefined) {
          const top = worldToScreen(transform, xLog ? Math.log10(p.x) : p.x, yLog ? Math.log10(p.y + p.yErr[1]) : p.y + p.yErr[1]).py
          const bottom = worldToScreen(transform, xLog ? Math.log10(p.x) : p.x, yLog ? Math.log10(p.y - p.yErr[0]) : p.y - p.yErr[0]).py
          // On log scales an end can leave the visible domain; a whisker
          // that cannot be placed is omitted, never faked.
          if (Number.isFinite(top) && Number.isFinite(bottom)) {
            yTop = top
            yBottom = bottom
          }
        }
        if (showX && p.xErr !== undefined) {
          const left = worldToScreen(transform, xLog ? Math.log10(p.x - p.xErr[0]) : p.x - p.xErr[0], yLog ? Math.log10(p.y) : p.y).px
          const right = worldToScreen(transform, xLog ? Math.log10(p.x + p.xErr[1]) : p.x + p.xErr[1], yLog ? Math.log10(p.y) : p.y).px
          if (Number.isFinite(left) && Number.isFinite(right)) {
            xLeft = left
            xRight = right
          }
        }
        if (yTop !== undefined || xLeft !== undefined) {
          points.push({ px, py, yTop, yBottom, xLeft, xRight })
        }
      }
      marks.set(s.key, buildErrorBarPaths(points))
    }
    return marks
  }, [transform, visible, xLog, yLog, config.kind])

  // The grid is rebuilt only with the marker batch and viewport size, never
  // for a hover. Its points are the same full-precision records that produced
  // the paths; the margin only omits points no inside-pointer query can reach.
  const markerHitIndex = useMemo(() => {
    if (!markerKind) {
      return null
    }
    const points: ScatterScreenPoint[] = []
    const margin = POINT_RADIUS + SCATTER_HIT_RADIUS
    for (const mark of markerSeriesMarks) {
      for (const point of mark.points) {
        if (point.px >= -margin && point.px <= size.width + margin && point.py >= -margin && point.py <= size.height + margin) {
          points.push(point)
        }
      }
    }
    return points.length === 0 ? null : buildMarkerHitIndex(points)
  }, [markerKind, markerSeriesMarks, size.width, size.height])

  // A hover belongs to the geometry that produced it. Deriving this during
  // render avoids an effect and guarantees a data/viewport/visibility change
  // can never leave a tooltip pointing at a stale mark.
  const activeMarkerHover = markerHover !== null && markerHover.marks === markerSeriesMarks ? markerHover : null

  function handleMarkerPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!markerKind || markerHitIndex === null) {
      setMarkerHover(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (rect.width > 0 ? size.width / rect.width : 1)
    const y = (event.clientY - rect.top) * (rect.height > 0 ? size.height / rect.height : 1)
    const nearest = findNearestMarker(markerHitIndex, x, y)
    const best: MarkerHover | null = nearest === null ? null : { ...nearest, marks: markerSeriesMarks }
    setMarkerHover((current) => {
      if (best === null) {
        return current === null ? current : null
      }
      if (current !== null && current.marks === best.marks && current.px === best.px && current.py === best.py && current.title === best.title) {
        return current
      }
      return best
    })
  }

  function clearHovers(): void {
    setMarkerHover(null)
    setBarHover(null)
  }

  const summary = useMemo(() => {
    if (world === null || plot.totalPoints === 0) {
      return 'Empty data plot. No plottable points.'
    }
    return `${config.title}: ${config.kind} plot with ${visible.length} visible series and ${plot.totalPoints} points. ${plot.totalSkipped > 0 ? `${plot.totalSkipped} rows skipped.` : ''}`
  }, [world, plot, visible.length, config.title, config.kind])

  if (world === null || transform === null || axes === null) {
    return (
      <div ref={boxRef} className="flex h-64 items-center justify-center rounded-md border border-line bg-bg">
        <p className="px-4 text-center text-sm text-muted">{plot.notes[0] ?? 'No plottable points.'}</p>
      </div>
    )
  }

  return (
    <div className={`relative w-full ${compact ? 'h-48' : 'h-80 w-full md:h-96'}`}>
      <div ref={boxRef} className="h-full w-full">
        <svg
          role="img"
          aria-label={summary}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="block select-none"
          onPointerMove={isBar ? handleBarPointerMove : markerKind ? handleMarkerPointerMove : undefined}
          onPointerLeave={isBar || markerKind ? clearHovers : undefined}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={size.width} height={size.height} />
            </clipPath>
          </defs>
          {config.showGrid && (
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
          <line x1={0} y1={axes.xAxisPy} x2={size.width} y2={axes.xAxisPy} className="stroke-axis" strokeWidth={1.5} />
          <line x1={axes.yAxisPx} y1={0} x2={axes.yAxisPx} y2={size.height} className="stroke-axis" strokeWidth={1.5} />
          <g aria-hidden="true" fontSize={11} className="fill-muted">
            {xTicks.map((tick) => {
              const { px } = worldToScreen(transform, tick.value, 0)
              const x = Math.min(Math.max(px, 20), size.width - 4)
              return (
                <text key={`tx-${tick.value}-${tick.label}`} x={x} y={size.height - 22} textAnchor="middle">
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
          <g clipPath={`url(#${clipId})`}>
            {visible.map((s) => renderSeries(s))}
            {referenceLines.map((level, i) => {
              const a = worldToScreen(transform, transform.visible.xMin, level)
              const b = worldToScreen(transform, transform.visible.xMax, level)
              return <line key={`ref-${i}`} x1={a.px} y1={a.py} x2={b.px} y2={b.py} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" aria-hidden="true" />
            })}
            {(() => {
              if (fitLine === null || fitLine.length < 2) {
                return null
              }
              // Same log mapping as series points: non-positive values have
              // no log position and are dropped, never faked or bridged.
              const screened: Array<{ px: number; py: number }> = []
              for (const p of fitLine) {
                if ((xLog && p.x <= 0) || (yLog && p.y <= 0)) {
                  continue
                }
                const s = worldToScreen(transform, toDisplayX(p.x), toDisplayY(p.y))
                if (Number.isFinite(s.px) && Number.isFinite(s.py)) {
                  screened.push(s)
                }
              }
              if (screened.length < 2) {
                return null
              }
              return (
                <path
                  d={pathFrom(screened)}
                  fill="none"
                  className="stroke-accent"
                  strokeWidth={2}
                  strokeDasharray="7 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                >
                  <title>Fitted model curve</title>
                </path>
              )
            })()}
          </g>
          {(config.title !== '' || config.xLabel !== '' || config.yLabel !== '') && (
            <g aria-hidden="true" className="fill-ink" fontSize={12}>
              {config.title !== '' && (
                <text x={size.width / 2} y={16} textAnchor="middle" fontWeight={600}>
                  {config.title}
                </text>
              )}
              {config.xLabel !== '' && (
                <text x={size.width / 2} y={size.height - 6} textAnchor="middle">
                  {config.xLabel}
                </text>
              )}
              {config.yLabel !== '' && (
                <text x={12} y={size.height / 2} textAnchor="middle" transform={`rotate(-90 12 ${size.height / 2})`}>
                  {config.yLabel}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-surface p-0.5 shadow-panel">
        <IconButton label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          <Minus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Reset view" title="Reset view" onClick={onResetView}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
      </div>
      {activeMarkerHover !== null && markerKind && (
        <div
          data-testid="scatter-tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute z-10 max-w-xs -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow-panel"
          style={{
            left: Math.min(Math.max(activeMarkerHover.px, 8), Math.max(8, size.width - 8)),
            top: Math.max(8, activeMarkerHover.py - 8),
          }}
        >
          {activeMarkerHover.title}
        </div>
      )}
      {activeBarHover !== null && isBar && (
        <div
          data-testid="bar-tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute z-10 max-w-xs -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow-panel"
          style={{
            left: Math.min(Math.max(activeBarHover.px, 8), Math.max(8, size.width - 8)),
            top: Math.max(8, activeBarHover.py - 8),
          }}
        >
          {activeBarHover.bar.title}
        </div>
      )}
    </div>
  )

  function renderSeries(s: PlotSeries): React.JSX.Element {
    const style = curveStyle(s.colorIndex)
    const dash = style.dash === '' ? undefined : style.dash
    function whiskers(): React.JSX.Element[] {
      const bars = errorBarPathsByKey.get(s.key)
      if (bars === undefined) {
        return []
      }
      const elements: React.JSX.Element[] = []
      if (bars.y !== '') {
        elements.push(<path key="y" d={bars.y} fill="none" stroke={style.color} strokeWidth={1.25} aria-hidden="true" />)
      }
      if (bars.x !== '') {
        elements.push(<path key="x" d={bars.x} fill="none" stroke={style.color} strokeWidth={1.25} aria-hidden="true" />)
      }
      return elements
    }
    if (isBar) {
      const mark = barMarksByKey.get(s.key)
      return (
        <g key={s.key}>
          {whiskers()}
          {mark !== undefined && mark.d !== '' && <path d={mark.d} fill={mark.color} fillOpacity={0.75} aria-hidden="true" />}
        </g>
      )
    }
    if (lineKind) {
      const runs = lineRunGeometryByKey.get(s.key) ?? []
      const mark = markerMarksByKey.get(s.key)
      return (
        <g key={s.key}>
          {whiskers()}
          {runs.map((run, ri) => {
            return (
              <path key={ri} d={run.d} fill="none" stroke={style.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" {...(dash === undefined ? {} : { strokeDasharray: dash })}>
                <title>{run.title}</title>
              </path>
            )
          })}
          {mark !== undefined && mark.d !== '' && <path d={mark.d} fill={mark.color} aria-hidden="true" />}
        </g>
      )
    }
    const mark = markerMarksByKey.get(s.key)
    return (
      <g key={s.key}>
        {whiskers()}
        {mark !== undefined && mark.d !== '' && <path d={mark.d} fill={mark.color} aria-hidden="true" />}
      </g>
    )
  }
}
