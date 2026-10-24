/**
 * Live Data Lab error-bar batching. One path carries every whisker for a
 * series on one axis; the values remain the same screen coordinates the
 * previous `<line>` implementation rendered. Path numbers are serialized
 * from their full double values (no extra rounding), and each whisker is
 * three segments: centre stem, lower/left cap, upper/right cap.
 */

export const ERROR_BAR_CAP = 4

export interface ErrorBarScreenPoint {
  readonly px: number
  readonly py: number
  /** Vertical whisker bounds in screen pixels. */
  readonly yTop?: number
  readonly yBottom?: number
  /** Horizontal whisker bounds in screen pixels. */
  readonly xLeft?: number
  readonly xRight?: number
}

export interface ErrorBarPaths {
  readonly y: string
  readonly x: string
}

function appendSegment(parts: string[], x1: number, y1: number, x2: number, y2: number): void {
  parts.push(`M ${String(x1)} ${String(y1)} L ${String(x2)} ${String(y2)}`)
}

/** Build one vertical and one horizontal path for a series, preserving point order. */
export function buildErrorBarPaths(points: ReadonlyArray<ErrorBarScreenPoint>, cap = ERROR_BAR_CAP): ErrorBarPaths {
  const yParts: string[] = []
  const xParts: string[] = []
  for (const point of points) {
    const { px, py, yTop, yBottom, xLeft, xRight } = point
    if (yTop !== undefined && yBottom !== undefined && Number.isFinite(yTop) && Number.isFinite(yBottom)) {
      appendSegment(yParts, px, yTop, px, yBottom)
      appendSegment(yParts, px - cap, yTop, px + cap, yTop)
      appendSegment(yParts, px - cap, yBottom, px + cap, yBottom)
    }
    if (xLeft !== undefined && xRight !== undefined && Number.isFinite(xLeft) && Number.isFinite(xRight)) {
      appendSegment(xParts, xLeft, py, xRight, py)
      appendSegment(xParts, xLeft, py - cap, xLeft, py + cap)
      appendSegment(xParts, xRight, py - cap, xRight, py + cap)
    }
  }
  return { y: yParts.join(' '), x: xParts.join(' ') }
}
