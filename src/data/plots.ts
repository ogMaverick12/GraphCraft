import type { CellValue, Dataset } from './dataset.ts'
import type { WorldRect } from '../graph/coordinate.ts'

/**
 * Data-plot model (Stage 4 DATA-02): dataset columns mapped to series
 * of plottable points. Pure data shaping — no React, no SVG. Raw rows
 * are never mutated: sorting and filtering produce new arrays, and
 * every skipped row is counted, never hidden.
 */

export type PlotKind = 'scatter' | 'line' | 'bar' | 'histogram'
export type PlotSort = 'row-order' | 'x-ascending'
export type AxisScale = 'linear' | 'log'

/** Uncertainty source. Columns live in the same dataset (row-matched by
 *  position — no cross-table joins exist to misalign); fixed values must
 *  be nonnegative and finite. Invalid per-point values draw no bar and
 *  are counted, never fabricated. */
export type ErrorSource =
  | { mode: 'none' }
  | { mode: 'column'; column: string }
  | { mode: 'asymmetric'; upper: string; lower: string }
  | { mode: 'fixed'; value: number }

export type XErrorSource = { mode: 'none' } | { mode: 'column'; column: string } | { mode: 'fixed'; value: number }

export interface PlotConfig {
  kind: PlotKind
  /** X column id; null means row index (line/scatter) or unused (histogram). */
  xColumn: string | null
  /** Y column id (values for histogram). */
  yColumn: string | null
  /** Categorical split column id, or null for one series. */
  seriesColumn: string | null
  title: string
  xLabel: string
  yLabel: string
  sort: PlotSort
  showGrid: boolean
  hiddenSeries: string[]
  xMin: number | null
  xMax: number | null
  yMin: number | null
  yMax: number | null
  xScale: AxisScale
  yScale: AxisScale
  /** Target tick counts; null means automatic. */
  tickX: number | null
  tickY: number | null
  yError: ErrorSource
  xError: XErrorSource
}

export interface PlotPoint {
  /** Numeric position (or category index for bars). */
  x: number
  y: number
  /** Category label for bar/histogram points. */
  label: string
  /** Bin edges for histogram bars (exact widths, no inference). */
  lo?: number
  hi?: number
  /** Y error magnitudes [down, up] in data units; absent when none/invalid. */
  yErr?: readonly [number, number]
  /** X error magnitudes [down, up] in data units; absent when none/invalid. */
  xErr?: readonly [number, number]
}

export interface PlotSeries {
  key: string
  label: string
  colorIndex: number
  points: PlotPoint[]
  skipped: number
  /** Finite skipped X values: line segments break across them, never bridging missing measurements. */
  gapXs: number[]
}

export interface ResolvedPlot {
  series: PlotSeries[]
  /** Numeric when every point is numeric; categorical for bars. */
  xMode: 'numeric' | 'categorical'
  totalPoints: number
  totalSkipped: number
  notes: string[]
}

export interface HistogramBin {
  x0: number
  x1: number
  count: number
}

function isPlottableNumber(value: CellValue): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function columnIndexOf(columns: Array<{ id: string }>, id: string | null): number {
  if (id === null) {
    return -1
  }
  return columns.findIndex((col) => col.id === id)
}

function validMagnitude(value: CellValue): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

interface RowErrors {
  yErr?: readonly [number, number]
  xErr?: readonly [number, number]
  /** True when an uncertainty was requested but unusable for this row. */
  missingBar: boolean
}

/** Resolve one row's error bars; invalid values draw nothing and count. */
function errorsForRow(
  row: CellValue[],
  columns: Array<{ id: string }>,
  yError: ErrorSource,
  xError: XErrorSource,
): RowErrors {
  let yErr: readonly [number, number] | undefined
  let xErr: readonly [number, number] | undefined
  let missingBar = false
  const at = (id: string): CellValue => {
    const index = columnIndexOf(columns, id)
    return index < 0 ? null : (row[index] ?? null)
  };
  if (yError.mode === 'column') {
    const v = validMagnitude(at(yError.column))
    if (v === null) {
      missingBar = true
    } else {
      yErr = [v, v]
    }
  } else if (yError.mode === 'asymmetric') {
    const up = validMagnitude(at(yError.upper))
    const down = validMagnitude(at(yError.lower))
    if (up === null || down === null) {
      missingBar = true
    } else {
      yErr = [down, up]
    }
  } else if (yError.mode === 'fixed') {
    if (Number.isFinite(yError.value) && yError.value >= 0) {
      yErr = [yError.value, yError.value]
    }
  }
  if (xError.mode === 'column') {
    const v = validMagnitude(at(xError.column))
    if (v === null) {
      missingBar = true
    } else {
      xErr = [v, v]
    }
  } else if (xError.mode === 'fixed') {
    if (Number.isFinite(xError.value) && xError.value >= 0) {
      xErr = [xError.value, xError.value]
    }
  }
  return { yErr, xErr, missingBar }
}

/** Series glyphs: shape distinguishes series beyond colour (legend + points). */
export const SERIES_GLYPHS = ['●', '■', '▲', '◆'] as const

export type GlyphShape = 'circle' | 'square' | 'triangle' | 'diamond'

export function seriesShape(colorIndex: number): GlyphShape {
  return (['circle', 'square', 'triangle', 'diamond'] as const)[((colorIndex % 4) + 4) % 4] ?? 'circle'
}

/** Log-axis ticks at powers of ten across a log10-space range. */
export function logTicks(lo: number, hi: number): Array<{ value: number; label: string }> {
  const ticks: Array<{ value: number; label: string }> = []
  for (let k = Math.ceil(lo - 1e-9); k <= hi + 1e-9; k += 1) {
    const whole = k === 0 ? 0 : k
    const power = 10 ** whole
    ticks.push({ value: whole, label: whole === 0 ? '1' : (whole > 0 && whole <= 6) || (whole < 0 && whole >= -3) ? String(power) : `1e${whole}` })
  }
  return ticks
}

/** Sturges' rule, clamped to a sane bin count and documented. */
export function sturgesBins(n: number): number {
  if (n <= 0) {
    return 1
  }
  return Math.min(50, Math.max(1, Math.ceil(Math.log2(n) + 1)))
}

export function histogramBins(values: number[]): HistogramBin[] {
  if (values.length === 0) {
    return []
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bins = sturgesBins(values.length)
  if (min === max) {
    return [{ x0: min - 0.5, x1: max + 0.5, count: values.length }]
  }
  const width = (max - min) / bins
  const counts = Array.from({ length: bins }, () => 0)
  for (const value of values) {
    const slot = Math.min(bins - 1, Math.floor((value - min) / width))
    counts[slot] = (counts[slot] ?? 0) + 1
  }
  return counts.map((count, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count }))
}

/**
 * Map dataset rows to series per the config. Rules, all stated in notes:
 * scatter/line need numeric X (row index when unmapped); bar needs a
 * categorical X (numeric X coerces to text labels); histogram bins the Y
 * column and ignores X. Rows with missing/non-finite mapped values skip
 * with a count; finite skipped X values are recorded as gaps so line
 * segments break across them instead of bridging missing measurements.
 * Log scales (scatter/line numeric axes only) exclude non-positive
 * values with their own count. Sorting copies, never mutates.
 */
export function resolvePlot(dataset: Dataset, config: PlotConfig): ResolvedPlot {
  const notes: string[] = []
  const yIndex = columnIndexOf(dataset.columns, config.yColumn)
  if (yIndex < 0) {
    return { series: [], xMode: 'numeric', totalPoints: 0, totalSkipped: 0, notes: ['Choose a Y column to plot.'] }
  }
  const xIndex = columnIndexOf(dataset.columns, config.xColumn)
  const seriesIndex = columnIndexOf(dataset.columns, config.seriesColumn)
  const lineLike = config.kind === 'scatter' || config.kind === 'line'
  const xLog = lineLike && config.xScale === 'log'
  const yLog = lineLike && config.yScale === 'log'
  if ((config.xScale === 'log' || config.yScale === 'log') && !lineLike) {
    notes.push('Log scales apply to scatter/line axes; bars and histograms stay linear.')
  }
  if ((config.kind === 'bar' || config.kind === 'histogram') && config.xError.mode !== 'none') {
    notes.push('X error bars draw on scatter/line points, not on bars.')
  }

  if (config.kind === 'histogram') {
    const values: number[] = []
    let skipped = 0
    for (const row of dataset.rows) {
      const cell = row[yIndex]
      if (isPlottableNumber(cell)) {
        values.push(cell)
      } else {
        skipped += 1
      }
    }
    if (values.length === 0) {
      return { series: [], xMode: 'numeric', totalPoints: 0, totalSkipped: skipped, notes: ['No plottable values: every row is missing or non-numeric.'] }
    }
    const bins = histogramBins(values)
    notes.push(`Sturges bins (${bins.length}); X column ignored.`)
    if (skipped > 0) {
      notes.push(`${skipped} rows skipped (missing or non-numeric).`)
    }
    return {
      series: [{ key: 'hist', label: dataset.columns[yIndex]?.name ?? 'values', colorIndex: 0, points: bins.map((bin) => ({ x: (bin.x0 + bin.x1) / 2, y: bin.count, label: `${bin.x0}–${bin.x1}`, lo: bin.x0, hi: bin.x1 })), skipped, gapXs: [] }],
      xMode: 'numeric',
      totalPoints: values.length,
      totalSkipped: skipped,
      notes,
    }
  }

  const xIsCategorical = config.kind === 'bar'
  const groups = new Map<string, { rows: number[]; label: string }>()
  const singleKey = '\u0000single'
  dataset.rows.forEach((_, i) => {
    const key = seriesIndex >= 0 ? String(dataset.rows[i]?.[seriesIndex] ?? '∅') : singleKey
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { rows: [i], label: seriesIndex >= 0 ? key : (dataset.columns[yIndex]?.name ?? 'series') })
    } else {
      group.rows.push(i)
    }
  })

  const series: PlotSeries[] = []
  let totalPoints = 0
  let totalSkipped = 0
  let logExcluded = 0
  let barsMissing = 0
  let colorIndex = 0
  const fixedYInvalid = config.yError.mode === 'fixed' && !(Number.isFinite(config.yError.value) && config.yError.value >= 0)
  const fixedXInvalid = config.xError.mode === 'fixed' && !(Number.isFinite(config.xError.value) && config.xError.value >= 0)
  if (fixedYInvalid || fixedXInvalid) {
    notes.push('Fixed uncertainty must be a finite number ≥ 0; the invalid side is ignored.')
  }
  for (const [key, group] of groups) {
    const points: PlotPoint[] = []
    const gapXs: number[] = []
    let skipped = 0
    group.rows.forEach((rowIndex) => {
      const row = dataset.rows[rowIndex] ?? []
      const y = row[yIndex]
      if (!isPlottableNumber(y)) {
        skipped += 1
        const gx = xIndex >= 0 ? row[xIndex] : rowIndex
        if (typeof gx === 'number' && Number.isFinite(gx) && (!xLog || gx > 0)) {
          gapXs.push(gx)
        }
        return
      }
      if (yLog && y <= 0) {
        skipped += 1
        logExcluded += 1
        const gx = xIndex >= 0 ? row[xIndex] : rowIndex
        if (typeof gx === 'number' && Number.isFinite(gx) && (!xLog || gx > 0)) {
          gapXs.push(gx)
        }
        return
      }
      const errs = errorsForRow(row, dataset.columns, fixedYInvalid ? { mode: 'none' } : config.yError, fixedXInvalid ? { mode: 'none' } : config.xError)
      if (errs.missingBar) {
        barsMissing += 1
      }
      if (xIsCategorical) {
        const raw = xIndex >= 0 ? row[xIndex] : rowIndex
        points.push({ x: points.length, y, label: raw === null || raw === undefined ? '∅' : String(raw), yErr: errs.yErr, xErr: errs.xErr })
      } else {
        const x = xIndex >= 0 ? row[xIndex] : rowIndex
        if (!isPlottableNumber(x)) {
          skipped += 1
          return
        }
        if (xLog && x <= 0) {
          skipped += 1
          logExcluded += 1
          return
        }
        points.push({ x, y, label: '', yErr: errs.yErr, xErr: errs.xErr })
      }
    })
    if (config.sort === 'x-ascending' && !xIsCategorical) {
      points.sort((a, b) => a.x - b.x)
    }
    totalPoints += points.length
    totalSkipped += skipped
    series.push({ key, label: group.label, colorIndex: colorIndex % 6, points, skipped, gapXs })
    colorIndex += 1
  }

  if (logExcluded > 0) {
    notes.push(`${logExcluded} non-positive values excluded by the log scale.`)
  }
  if (barsMissing > 0) {
    notes.push(`${barsMissing} points draw without error bars (missing or invalid uncertainty).`)
  }

  if (xIsCategorical && xIndex >= 0 && dataset.columns[xIndex]?.type === 'numeric') {
    notes.push('Numeric X shown as text labels; bars keep row order within each series.')
  }
  if (config.kind === 'line' && xIndex < 0) {
    notes.push('No X column: using row index as X.')
  }
  if (config.sort === 'x-ascending') {
    notes.push('Points sorted by ascending X for display; raw row order is unchanged.')
  }
  if (totalPoints === 0) {
    notes.push('No plottable points: every row is missing or non-numeric in the mapped columns.')
  } else if (totalSkipped > 0) {
    notes.push(`${totalSkipped} rows skipped (missing or non-numeric in mapped columns).`)
  }
  return { series, xMode: xIsCategorical ? 'categorical' : 'numeric', totalPoints, totalSkipped, notes }
}

/** Auto-fit world with padding; explicit bounds win where set. Log axes fit in log10 space; non-positive explicit bounds fall back to auto. */
export function plotWorld(plot: ResolvedPlot, config: PlotConfig): WorldRect | null {
  const lineLike = config.kind === 'scatter' || config.kind === 'line'
  const xLog = lineLike && config.xScale === 'log'
  const yLog = lineLike && config.yScale === 'log'
  const xs: number[] = []
  const ys: number[] = []
  for (const s of plot.series) {
    for (const p of s.points) {
      if (!xLog || p.x > 0) {
        xs.push(xLog ? Math.log10(p.x) : p.x)
      }
      if (!yLog || p.y > 0) {
        ys.push(yLog ? Math.log10(p.y) : p.y)
      }
    }
  }
  if (xs.length === 0 || ys.length === 0) {
    return null
  }
  function axis(values: number[], explicitMin: number | null, explicitMax: number | null, log: boolean, padFraction: number, padMin: number): [number, number] | null {
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const span = hi - lo || padMin
    lo -= span * padFraction
    hi += span * padFraction
    if (explicitMin !== null && (!log || explicitMin > 0)) {
      lo = log ? Math.log10(explicitMin) : explicitMin
    }
    if (explicitMax !== null && (!log || explicitMax > 0)) {
      hi = log ? Math.log10(explicitMax) : explicitMax
    }
    if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      return null
    }
    return [lo, hi]
  }
  let xBounds: [number, number] | null
  if (config.kind === 'bar') {
    const n = Math.max(...plot.series.map((s) => s.points.length), 0)
    xBounds = [config.xMin ?? -0.75, config.xMax ?? Math.max(0, n - 1) + 0.75]
    if (!(xBounds[1] > xBounds[0])) {
      return null
    }
  } else {
    const fit = axis(xs, config.xMin, config.xMax, xLog, 0.05, 1)
    if (fit === null) {
      return null
    }
    xBounds = fit
  }
  let yBounds: [number, number] | null
  if (config.kind === 'bar' || config.kind === 'histogram') {
    const allY = ys
    const top = Math.max(...allY)
    const bottom = Math.min(0, ...allY)
    const span = top - bottom || 1
    yBounds = [config.yMin ?? bottom - span * 0.08, config.yMax ?? top + span * 0.08]
    if (!(yBounds[1] > yBounds[0])) {
      return null
    }
  } else {
    const fit = axis(ys, config.yMin, config.yMax, yLog, 0.08, 1)
    if (fit === null) {
      return null
    }
    yBounds = fit
  }
  return { xMin: xBounds[0], xMax: xBounds[1], yMin: yBounds[0], yMax: yBounds[1] }
}
