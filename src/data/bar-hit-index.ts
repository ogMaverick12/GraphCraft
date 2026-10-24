import type { BarScreenRect } from './bar-marks.ts'

/**
 * X-interval index for live bar/histogram hover. Rectangles are the exact
 * full-precision screen records used to build the rendered path. Each entry
 * keeps its original flattened position so a query can reproduce the former
 * "later painter wins" rule without changing geometry.
 */
export interface BarHitEntry {
  readonly rect: BarScreenRect
  readonly order: number
  readonly maxX: number
}

export interface BarHitIndex {
  /** Entries sorted by inclusive x start, then original paint order. */
  readonly ordered: ReadonlyArray<BarHitEntry>
  /** prefixMaxX[i] is the largest maxX among ordered[0..i]. */
  readonly prefixMaxX: ReadonlyArray<number>
}

export interface BarHitQueryStats {
  candidatesExamined: number
  containmentTests: number
}

export interface MeasuredBarHit {
  readonly hit: BarScreenRect | null
  readonly stats: BarHitQueryStats
}

/**
 * Build once per rectangle batch. Sorting plus one prefix pass is
 * O(N log N) build time; queries then walk backwards from the last possible
 * x start and stop as soon as no earlier interval can contain the pointer.
 */
export function buildBarHitIndex(rects: ReadonlyArray<BarScreenRect>): BarHitIndex {
  const ordered: BarHitEntry[] = rects.map((rect, order) => ({ rect, order, maxX: rect.x + rect.width }))
  ordered.sort((a, b) => a.rect.x - b.rect.x || a.order - b.order)
  let max = -Infinity
  const prefixMaxX = ordered.map((entry) => {
    if (entry.maxX > max) {
      max = entry.maxX
    }
    return max
  })
  return { ordered, prefixMaxX }
}

function queryBarHit(index: BarHitIndex, x: number, y: number, stats?: BarHitQueryStats): BarScreenRect | null {
  const { ordered, prefixMaxX } = index
  let low = 0
  let high = ordered.length
  while (low < high) {
    const middle = (low + high) >> 1
    const entry = ordered[middle]
    if (entry !== undefined && entry.rect.x <= x) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  let hit: BarScreenRect | null = null
  let bestOrder = -1
  for (let i = low - 1; i >= 0; i -= 1) {
    if ((prefixMaxX[i] ?? -Infinity) < x) {
      break
    }
    if (stats !== undefined) {
      stats.candidatesExamined += 1
    }
    const entry = ordered[i]
    if (entry === undefined || x > entry.maxX) {
      continue
    }
    if (stats !== undefined) {
      stats.containmentTests += 1
    }
    const rect = entry.rect
    if (y >= rect.y && y <= rect.y + rect.height && entry.order > bestOrder) {
      hit = rect
      bestOrder = entry.order
    }
  }
  return hit
}

/** Inclusive edges and later flattened rectangles retain their former priority. */
export function findBarHit(index: BarHitIndex, x: number, y: number): BarScreenRect | null {
  return queryBarHit(index, x, y)
}

/** Test/profiling seam: same query with deterministic work counters. */
export function measureBarHit(index: BarHitIndex, x: number, y: number): MeasuredBarHit {
  const stats: BarHitQueryStats = { candidatesExamined: 0, containmentTests: 0 }
  const hit = queryBarHit(index, x, y, stats)
  return { hit, stats }
}
