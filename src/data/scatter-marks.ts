import type { GlyphShape } from './plots.ts'

/**
 * Live point-marker batching. One path carries every point in a series;
 * the per-point records stay outside the DOM for nearest-point hover.
 * Geometry uses the same dimensions as the former per-point marks
 * (3.5px radius, 7px square, and 5/4px triangle and diamond extents).
 * Scatter paths serialize at the established 0.01px convention; line
 * markers can request full-precision coordinates.
 */

export const POINT_RADIUS = 3.5
/** Pointer hit slop around a mark centre; the glyphs are 7–10px wide/tall. */
export const SCATTER_HIT_RADIUS = 7

export interface ScatterScreenPoint {
  readonly px: number
  readonly py: number
  readonly title: string
}

export interface ScatterSeriesInput {
  readonly key: string
  readonly color: string
  readonly shape: GlyphShape
  readonly points: ReadonlyArray<ScatterScreenPoint>
  /** Serialize every coordinate from its full double instead of 0.01px. */
  readonly fullPrecision?: boolean
}

export interface ScatterSeriesMark extends ScatterSeriesInput {
  /** All point subpaths joined into one SVG path. */
  readonly d: string
}

type CoordinateFormatter = (value: number) => string

function pointSubpath(shape: GlyphShape, px: number, py: number, format: CoordinateFormatter): string {
  if (shape === 'square') {
    const x = format(px - 3.5)
    const y = format(py - 3.5)
    return `M ${x} ${y} h 7 v 7 h -7 Z`
  }
  if (shape === 'triangle') {
    return `M ${format(px)} ${format(py - 5)} L ${format(px + 5)} ${format(py + 4)} L ${format(px - 5)} ${format(py + 4)} Z`
  }
  if (shape === 'diamond') {
    return `M ${format(px)} ${format(py - 5)} L ${format(px + 5)} ${format(py)} L ${format(px)} ${format(py + 5)} L ${format(px - 5)} ${format(py)} Z`
  }
  const x = format(px)
  const top = format(py - POINT_RADIUS)
  const bottom = format(py + POINT_RADIUS)
  return `M ${x} ${top} A 3.5 3.5 0 1 1 ${x} ${bottom} A 3.5 3.5 0 1 1 ${x} ${top} Z`
}

/** Join every point's glyph into one deterministic path, preserving data order. */
export function buildScatterSeriesMark(input: ScatterSeriesInput): ScatterSeriesMark {
  const format: CoordinateFormatter = input.fullPrecision === true ? (value) => String(value) : (value) => value.toFixed(2)
  let d = ''
  for (const point of input.points) {
    d += `${d === '' ? '' : ' '}${pointSubpath(input.shape, point.px, point.py, format)}`
  }
  return { ...input, d }
}
