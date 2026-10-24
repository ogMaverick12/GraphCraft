/**
 * Live bar/histogram batching. One path carries every rectangle in a series;
 * the per-bar records stay outside the DOM for area-aware hover.
 * Rectangles use the same screen coordinates, full precision, and series fill
 * as the former individual `<rect>` elements.
 */

export interface BarScreenRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly title: string
}

export interface BarSeriesInput {
  readonly key: string
  readonly color: string
  readonly rects: ReadonlyArray<BarScreenRect>
}

export interface BarSeriesMark extends BarSeriesInput {
  /** All rectangle subpaths joined into one SVG path. */
  readonly d: string
}

/** Join every bar/bin rectangle into one deterministic path, preserving order. */
export function buildBarSeriesMark(input: BarSeriesInput): BarSeriesMark {
  let d = ''
  for (const rect of input.rects) {
    const x = String(rect.x)
    const y = String(rect.y)
    const width = String(rect.width)
    const height = String(rect.height)
    const back = String(-rect.width)
    d += `${d === '' ? '' : ' '}M ${x} ${y} h ${width} v ${height} h ${back} Z`
  }
  return { ...input, d }
}
