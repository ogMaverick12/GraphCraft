import { worldToScreen, type ScreenPoint, type ViewTransform } from '../graph/coordinate.ts'
import type { PlotSeries } from './plots.ts'

/**
 * Data Lab line-run geometry. Splits resolved points at recorded gaps and
 * serializes each contiguous run with the established 0.01px path convention.
 * Pure data -> SVG strings; no React, DOM, or rendering state.
 */
export interface LineRunGeometry {
  readonly d: string
  readonly title: string
}

export function pathFrom(points: ReadonlyArray<ScreenPoint>): string {
  const first = points[0]
  if (first === undefined) {
    return ''
  }
  let d = `M ${first.px.toFixed(2)} ${first.py.toFixed(2)}`
  for (const point of points.slice(1)) {
    d += ` L ${point.px.toFixed(2)} ${point.py.toFixed(2)}`
  }
  return d
}

/**
 * Split a series at recorded gaps, then transform and serialize every
 * contiguous run. Missing measurements are never bridged, and points keep
 * their original order and full-precision source coordinates.
 */
export function buildLineRunGeometry(series: PlotSeries, transform: ViewTransform, xLog: boolean, yLog: boolean): LineRunGeometry[] {
  const runs: PlotSeries['points'][] = []
  let current: PlotSeries['points'] = []
  for (const point of series.points) {
    const previous = current[current.length - 1]
    if (previous !== undefined && series.gapXs.some((gap) => gap > Math.min(previous.x, point.x) && gap < Math.max(previous.x, point.x))) {
      runs.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length > 0) {
    runs.push(current)
  }
  return runs.map((run, runIndex) => {
    const points = run.map((point) => worldToScreen(transform, xLog ? Math.log10(point.x) : point.x, yLog ? Math.log10(point.y) : point.y))
    const title = runs.length === 1 ? `${series.label} (${run.length} points)` : `${series.label} segment ${runIndex + 1} of ${runs.length}`
    return { d: pathFrom(points), title }
  })
}
