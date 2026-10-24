import { SCATTER_HIT_RADIUS, type ScatterScreenPoint } from './scatter-marks.ts'

/**
 * Screen-space grid for nearest-point hover. Points are the exact
 * full-precision records used to build the marker paths. The cell edge equals
 * the hit radius, so every point within the inclusive search circle lies in
 * one of the 3x3 cell columns/rows intersected by the pointer's radius box.
 */
export const MARKER_HIT_CELL_SIZE = SCATTER_HIT_RADIUS

export interface MarkerHitEntry {
  readonly point: ScatterScreenPoint
  /** Original flattened order, used only for exact-distance tie-breaking. */
  readonly order: number
}

export interface MarkerHitIndex {
  readonly cellSize: number
  readonly pointCount: number
  readonly cells: ReadonlyMap<number, ReadonlyMap<number, ReadonlyArray<MarkerHitEntry>>>
}

export interface MarkerHitQueryStats {
  candidatesExamined: number
  distanceTests: number
}

export interface MeasuredMarkerHit {
  readonly hit: ScatterScreenPoint | null
  readonly stats: MarkerHitQueryStats
}

/** Build once per marker batch. One cell insertion per point, no sorting. */
export function buildMarkerHitIndex(points: ReadonlyArray<ScatterScreenPoint>): MarkerHitIndex {
  const cells = new Map<number, Map<number, MarkerHitEntry[]>>()
  let order = 0
  for (const point of points) {
    const cellY = Math.floor(point.py / MARKER_HIT_CELL_SIZE)
    const cellX = Math.floor(point.px / MARKER_HIT_CELL_SIZE)
    let row = cells.get(cellY)
    if (row === undefined) {
      row = new Map()
      cells.set(cellY, row)
    }
    let bucket = row.get(cellX)
    if (bucket === undefined) {
      bucket = []
      row.set(cellX, bucket)
    }
    bucket.push({ point, order })
    order += 1
  }
  return { cellSize: MARKER_HIT_CELL_SIZE, pointCount: points.length, cells }
}

function queryNearestMarker(index: MarkerHitIndex, x: number, y: number, stats?: MarkerHitQueryStats): ScatterScreenPoint | null {
  const { cells, cellSize } = index
  const radius = SCATTER_HIT_RADIUS
  const minCellX = Math.floor((x - radius) / cellSize)
  const maxCellX = Math.floor((x + radius) / cellSize)
  const minCellY = Math.floor((y - radius) / cellSize)
  const maxCellY = Math.floor((y + radius) / cellSize)

  let nearest: ScatterScreenPoint | null = null
  let bestDistance = radius * radius
  let bestOrder = -1
  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    const row = cells.get(cellY)
    if (row === undefined) {
      continue
    }
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const bucket = row.get(cellX)
      if (bucket === undefined) {
        continue
      }
      for (const entry of bucket) {
        if (stats !== undefined) {
          stats.candidatesExamined += 1
        }
        const dx = entry.point.px - x
        const dy = entry.point.py - y
        const distance = dx * dx + dy * dy
        if (stats !== undefined) {
          stats.distanceTests += 1
        }
        if (distance < bestDistance || (distance === bestDistance && entry.order > bestOrder)) {
          bestDistance = distance
          nearest = entry.point
          bestOrder = entry.order
        }
      }
    }
  }
  return nearest
}

/** Inclusive radius, squared screen distance, and later flattened point on ties. */
export function findNearestMarker(index: MarkerHitIndex, x: number, y: number): ScatterScreenPoint | null {
  return queryNearestMarker(index, x, y)
}

/** Test/profiling seam: same query with deterministic work counters. */
export function measureNearestMarker(index: MarkerHitIndex, x: number, y: number): MeasuredMarkerHit {
  const stats: MarkerHitQueryStats = { candidatesExamined: 0, distanceTests: 0 }
  const hit = queryNearestMarker(index, x, y, stats)
  return { hit, stats }
}
