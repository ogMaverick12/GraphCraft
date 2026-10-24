import type { Evaluator } from '../math/index.ts'
import type {
  CurveSegment,
  ResolvedSampleOptions,
  SampleOptions,
  SamplePoint,
  SampleResult,
  SampleStats,
  SampleWarning,
} from './types.ts'

/**
 * Adaptive numerical sampler (Stage 1).
 *
 * Takes a validated single-variable evaluator and a mathematical x-range
 * and returns ordered curve segments for rendering. Pure TypeScript:
 * no React or DOM — only `pixelWidth` for x resolution and optional
 * `pixelHeight` for visibility-aware diagnostics.
 *
 * Method: uniform baseline, then per-interval midpoint refinement driven
 * by linear-interpolation error against local scale. Invalid samples split
 * segments. Suspected poles (sign flip with growing magnitude, or same-side
 * explosion) are probed by subdivision and gapped when growth persists.
 *
 * Guarantees: bounded evaluations and depth; deterministic output for
 * identical inputs; segments never joined across gaps. Non-guarantee
 * (see docs/sampling/ADAPTIVE_SAMPLING.md): finite sampling cannot prove
 * a region is pole-free — narrow features below half-pixel width may be
 * missed, and that is reported, not hidden.
 */

export const DEFAULT_PIXEL_WIDTH = 800
export const DEFAULT_MAX_EVALUATIONS = 4000
export const DEFAULT_MAX_DEPTH = 12
export const DEFAULT_RELATIVE_TOLERANCE = 0.0025
export const DEFAULT_ABSOLUTE_TOLERANCE = 1e-12
export const BASELINE_DIVISOR = 4
export const BASELINE_MIN = 33
export const BASELINE_MAX = 257
export const BOUNDARY_BISECT_STEPS = 24
export const BOUNDARY_MAGNITUDE_CAP = 1e12
export const POLE_RATIO = 4
export const SPIKE_FACTOR = 8
export const MIN_BASELINE_EVALUATIONS = 16
/** A terminal midpoint deviation below half a screen pixel is not visible. */
export const UNDER_RESOLVED_SCREEN_PIXELS = 0.5

/** Evaluate one x. Returns a finite point, or null for domain/overflow/failure. */
function tryPoint(evaluator: Evaluator, x: number, stats: SampleStats, parameters?: Record<string, number>): SamplePoint | null {
  stats.evaluations += 1
  const result = evaluator.evaluate(x, parameters)
  if (result.kind !== 'value') {
    return null
  }
  return { x, y: result.value }
}

export interface SamplerState<E = Evaluator> {
  evaluator: E
  options: ResolvedSampleOptions
  stats: SampleStats
  warnings: SampleWarning[]
  warned: Set<string>
  budgetHit: boolean
  cancelled: boolean
}

export function warn(state: SamplerState<unknown>, code: SampleWarning['code'], message: string): void {
  if (state.warned.has(code)) {
    return
  }
  state.warned.add(code)
  state.warnings.push({ code, message })
}

export function checkCancelled(state: SamplerState<unknown>): boolean {
  if (state.cancelled) {
    return true
  }
  if (state.options.signal?.aborted === true) {
    state.cancelled = true
    return true
  }
  return false
}

export function toleranceAt(state: SamplerState<unknown>, values: number[]): number {
  const scale = Math.max(...values.map((v) => Math.abs(v)), 0)
  return Math.max(state.options.absoluteTolerance, state.options.relativeTolerance * scale)
}

export function minIntervalWidth(options: ResolvedSampleOptions): number {
  return ((options.xMax - options.xMin) / options.pixelWidth) * 0.5
}

/**
 * Convert a world-space y error to screen pixels at the supplied viewport
 * scale. Invalid/empty y spans fall back to Infinity so a diagnostic is
 * never silently suppressed.
 */
export function screenSpaceYError(options: ResolvedSampleOptions, error: number): number {
  const span = options.yMax - options.yMin
  if (!(span > 0) || !Number.isFinite(span) || !(options.pixelHeight > 0) || !Number.isFinite(options.pixelHeight)) {
    return Number.POSITIVE_INFINITY
  }
  return (error / span) * options.pixelHeight
}

/**
 * Bisect an invalid→valid bracket to snap a segment edge to the domain
 * boundary (e.g. sqrt starting at exactly 0). Bounded to a fixed step
 * count; stops early inside pole explosions (|y| beyond cap).
 */
function snapBoundary(state: SamplerState, invalidX: number, validPoint: SamplePoint): SamplePoint {
  let lo = invalidX
  let hi = validPoint
  for (let i = 0; i < BOUNDARY_BISECT_STEPS; i += 1) {
    if (checkCancelled(state) || state.stats.evaluations >= state.options.maxEvaluations) {
      state.budgetHit = true
      break
    }
    const midX = (lo + hi.x) / 2
    const mid = tryPoint(state.evaluator, midX, state.stats, state.options.parameters)
    if (mid === null || Math.abs(mid.y) > BOUNDARY_MAGNITUDE_CAP) {
      lo = midX
    } else {
      hi = mid
    }
  }
  return hi
}

export type RunList = SamplePoint[][]

function singleRun(points: SamplePoint[]): RunList {
  return [points]
}

/** Refine interval [a, b] (both valid). Returns ordered runs; cuts are gaps. */
function refineInterval(state: SamplerState, a: SamplePoint, b: SamplePoint, depth: number): RunList {
  if (depth > state.stats.maxDepthReached) {
    state.stats.maxDepthReached = depth
  }
  if (checkCancelled(state)) {
    return singleRun([a, b])
  }
  if (state.stats.evaluations >= state.options.maxEvaluations) {
    state.budgetHit = true
    return singleRun([a, b])
  }

  const midX = (a.x + b.x) / 2
  const m = tryPoint(state.evaluator, midX, state.stats, state.options.parameters)
  if (m === null) {
    // Invalid midpoint: a hard gap. No interpolation across it.
    state.stats.splitCount += 1
    return [[a], [b]]
  }

  const absA = Math.abs(a.y)
  const absB = Math.abs(b.y)
  const absM = Math.abs(m.y)
  const smallest = Math.min(absA, absB, absM)
  const largest = Math.max(absA, absB, absM)

  // Suspected pole: sign flip with growing magnitude, or same-side explosion.
  const signFlip = a.y * b.y < 0
  const growth = smallest > 0 && largest / smallest > POLE_RATIO
  const spike = !signFlip && absM > SPIKE_FACTOR * Math.max(absA, absB)
  if ((signFlip && growth) || spike) {
    return probeSuspectedPole(state, a, b, m, depth)
  }

  const interpolated = (a.y + b.y) / 2
  const error = Math.abs(m.y - interpolated)
  if (error <= toleranceAt(state, [a.y, b.y, m.y])) {
    return singleRun([a, m, b])
  }

  const minDx = minIntervalWidth(state.options)
  if (b.x - a.x < minDx) {
    // The interval is already terminal, but only report it when the chord
    // approximation would be visible. Ordinary curvature near y = 0 can
    // exceed relative tolerance while remaining far below a screen pixel.
    if (screenSpaceYError(state.options, error) >= UNDER_RESOLVED_SCREEN_PIXELS) {
      warn(state, 'under-resolved', 'A region varies below half-pixel width; detail is approximate there.')
    }
    return singleRun([a, m, b])
  }
  if (depth >= state.options.maxDepth) {
    warn(state, 'max-depth-reached', 'Subdivision depth cap reached in a high-curvature region; detail is approximate there.')
    return singleRun([a, m, b])
  }
  return concatRuns(refineInterval(state, a, m, depth + 1), refineInterval(state, m, b, depth + 1))
}

/**
 * Subdivide once around a suspicious interval. Cut only when a sub-half
 * retains the flip while magnitudes grow (pole signature); a shrinking
 * bracket is a root and refines normally. Depth-capped either way.
 */
function probeSuspectedPole(state: SamplerState, a: SamplePoint, b: SamplePoint, m: SamplePoint, depth: number): RunList {
  if (depth >= state.options.maxDepth) {
    warn(state, 'pole-suspected', 'A steep sign change or spike could not be resolved; a gap was left rather than a false connection.')
    state.stats.splitCount += 1
    return [[a], [b]]
  }
  const parentMax = Math.max(Math.abs(a.y), Math.abs(b.y))
  const leftFlip = a.y * m.y < 0
  const rightFlip = m.y * b.y < 0
  const grown =
    (leftFlip && Math.max(Math.abs(a.y), Math.abs(m.y)) >= parentMax) ||
    (rightFlip && Math.max(Math.abs(m.y), Math.abs(b.y)) >= parentMax)
  if ((leftFlip || rightFlip) && grown) {
    warn(state, 'pole-suspected', 'A steep sign change or spike could not be resolved; a gap was left rather than a false connection.')
    state.stats.splitCount += 1
    return [[a], [b]]
  }
  return concatRuns(refineInterval(state, a, m, depth + 1), refineInterval(state, m, b, depth + 1))
}

/** Concatenate run lists, merging at the shared midpoint (no cut there). */
export function concatRuns(left: RunList, right: RunList): RunList {
  if (left.length === 0) {
    return right
  }
  if (right.length === 0) {
    return left
  }
  const merged: RunList = [...left]
  const firstRight = right[0]
  if (firstRight !== undefined) {
    const lastLeft = merged[merged.length - 1]
    if (lastLeft !== undefined) {
      merged[merged.length - 1] = [...lastLeft, ...firstRight.slice(1)]
    }
  }
  for (const run of right.slice(1)) {
    merged.push(run)
  }
  return merged
}

export function resolveOptions(options: SampleOptions): ResolvedSampleOptions | { error: string } {
  const { xMin, xMax, yMin, yMax, pixelWidth, pixelHeight, maxEvaluations, maxDepth, relativeTolerance, absoluteTolerance, breaks, parameters, signal } = options
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
    return { error: 'xMax must be a finite number greater than finite xMin.' }
  }
  const resolved: ResolvedSampleOptions = {
    xMin,
    xMax,
    yMin: yMin ?? xMin,
    yMax: yMax ?? xMax,
    pixelWidth: pixelWidth ?? DEFAULT_PIXEL_WIDTH,
    pixelHeight: pixelHeight ?? pixelWidth ?? DEFAULT_PIXEL_WIDTH,
    maxEvaluations: maxEvaluations ?? DEFAULT_MAX_EVALUATIONS,
    maxDepth: maxDepth ?? DEFAULT_MAX_DEPTH,
    relativeTolerance: relativeTolerance ?? DEFAULT_RELATIVE_TOLERANCE,
    absoluteTolerance: absoluteTolerance ?? DEFAULT_ABSOLUTE_TOLERANCE,
    breaks: Array.isArray(breaks) ? breaks.filter((b) => Number.isFinite(b)) : [],
    ...(parameters !== undefined ? { parameters } : {}),
    ...(signal !== undefined ? { signal } : {}),
  }
  if (!(resolved.pixelWidth > 0) || !Number.isFinite(resolved.pixelWidth)) {
    return { error: 'pixelWidth must be a finite number greater than 0.' }
  }
  if (!(resolved.pixelHeight > 0) || !Number.isFinite(resolved.pixelHeight)) {
    return { error: 'pixelHeight must be a finite number greater than 0.' }
  }
  if (!Number.isInteger(resolved.maxEvaluations) || resolved.maxEvaluations < MIN_BASELINE_EVALUATIONS) {
    return { error: `maxEvaluations must be an integer of at least ${MIN_BASELINE_EVALUATIONS}.` }
  }
  if (!Number.isInteger(resolved.maxDepth) || resolved.maxDepth < 0) {
    return { error: 'maxDepth must be a non-negative integer.' }
  }
  if (!(resolved.relativeTolerance > 0) || !(resolved.absoluteTolerance >= 0)) {
    return { error: 'Tolerances must be positive (absolute may be zero).' }
  }
  return resolved
}

/**
 * Sample one contiguous range, appending runs to `runs`. Sub-ranges from
 * `breaks` share the state (budget, stats, warnings) but never merge runs
 * across their edges — branch boundaries stay disconnected.
 */
function sampleRange(
  state: SamplerState,
  lo: number,
  hi: number,
  baselineCount: number,
  warnStart: boolean,
  warnEnd: boolean,
): RunList {
  const { evaluator } = state
  const baseline: Array<SamplePoint | null> = []
  for (let i = 0; i < baselineCount; i += 1) {
    if (checkCancelled(state) || state.stats.evaluations >= state.options.maxEvaluations) {
      state.budgetHit = true
      break
    }
    const x = lo + ((hi - lo) * i) / (baselineCount - 1)
    baseline.push(tryPoint(evaluator, x, state.stats, state.options.parameters))
  }

  // Snap invalid→valid transitions to domain boundaries (e.g. sqrt at 0).
  const points: Array<SamplePoint | null> = [...baseline]
  for (let i = 0; i + 1 < points.length; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    if (current === null && next !== null) {
      points[i + 1] = snapBoundary(state, lo + ((hi - lo) * i) / (baselineCount - 1), next)
    } else if (current !== null && next === null) {
      // Valid→invalid: snap from the right side on the next pass via reversed roles.
      const snapped = snapBoundary(state, lo + ((hi - lo) * (i + 1)) / (baselineCount - 1), current)
      points[i] = snapped
    }
  }

  if (points.length > 0) {
    const first = points[0]
    const last = points[points.length - 1]
    if (warnStart && first === null) {
      warn(state, 'invalid-endpoint', 'The range starts outside the function domain; the curve begins at the first valid point.')
    }
    if (warnEnd && last === null) {
      warn(state, 'invalid-endpoint', 'The range ends outside the function domain; the curve stops at the last valid point.')
    }
  }

  let runStart: number | null = null
  const runs: RunList = []
  const flushPairRuns = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      if (a === null || b === null) {
        continue
      }
      const pairRuns = refineInterval(state, a, b, 0)
      if (runs.length === 0) {
        runs.push(...pairRuns)
      } else {
        const merged = concatRuns([runs.pop() as SamplePoint[]], pairRuns)
        runs.push(...merged)
      }
      if (state.cancelled) {
        return
      }
    }
  }

  for (let i = 0; i < points.length; i += 1) {
    if (points[i] === null) {
      if (runStart !== null) {
        if (i - runStart >= 2) {
          flushPairRuns(runStart, i - 1)
        } else if (i - runStart === 1) {
          const solo = points[runStart]
          if (solo !== null) {
            runs.push([solo])
          }
        }
        if (state.cancelled) {
          break
        }
        runStart = null
      }
    } else if (runStart === null) {
      runStart = i
    }
  }
  if (runStart !== null && !state.cancelled) {
    if (points.length - runStart >= 2) {
      flushPairRuns(runStart, points.length - 1)
    } else {
      const solo = points[runStart]
      if (solo !== null) {
        runs.push([solo])
      }
    }
  }
  return runs
}

/**
 * Sample an evaluator over [xMin, xMax]. The evaluator is compiled once
 * by the caller — never recompiled in the loop. Deterministic for
 * identical expression, range, and options.
 */
export function sampleFunction(evaluator: Evaluator, options: SampleOptions): SampleResult {
  const resolved = resolveOptions(options)
  if ('error' in resolved) {
    return {
      status: 'error',
      segments: [],
      stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
      warnings: [{ code: 'no-valid-samples', message: resolved.error }],
    }
  }

  const state: SamplerState = {
    evaluator,
    options: resolved,
    stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
    warnings: [],
    warned: new Set<string>(),
    budgetHit: false,
    cancelled: false,
  }

  if (checkCancelled(state)) {
    return { status: 'cancelled', segments: [], stats: state.stats, warnings: state.warnings }
  }

  // Split at breakpoints (branch boundaries): sub-ranges sample on the
  // shared budget but their runs are never merged across an edge.
  const edges = splitEdges(resolved.xMin, resolved.xMax, resolved.breaks)
  const runs: RunList = []
  const totalSpan = resolved.xMax - resolved.xMin
  const singleRange = edges.length === 2
  for (let k = 0; k + 1 < edges.length; k += 1) {
    const lo = edges[k]
    const hi = edges[k + 1]
    if (lo === undefined || hi === undefined || !(hi > lo)) {
      continue
    }
    const baselineCount = singleRange
      ? Math.min(BASELINE_MAX, Math.max(BASELINE_MIN, Math.round(resolved.pixelWidth / BASELINE_DIVISOR)))
      : Math.max(5, Math.round((resolved.pixelWidth * (hi - lo)) / totalSpan / BASELINE_DIVISOR))
    // Runs from one sub-range are appended, never merged into the
    // previous sub-range: breakpoints stay disconnected by construction.
    runs.push(...sampleRange(state, lo, hi, baselineCount, k === 0, k + 2 === edges.length))
    if (state.cancelled) {
      break
    }
  }
  return finalizeSampling(state, runs)
}
/** Sorted unique interior split positions bracketed by the range ends. */
export function splitEdges(xMin: number, xMax: number, breaks: number[]): number[] {
  const edges = [xMin]
  for (const edge of [...new Set(breaks)].sort((a, b) => a - b)) {
    if (edge > xMin && edge < xMax) {
      edges.push(edge)
    }
  }
  edges.push(xMax)
  return edges
}

/** Shared result assembly: segments, counts, cancellation, and diagnostics. */
export function finalizeSampling(state: SamplerState<unknown>, runs: RunList): SampleResult {
  const segments: CurveSegment[] = runs.filter((run) => run.length > 0).map((runPoints) => ({ points: runPoints }))
  state.stats.segmentCount = segments.length

  if (state.cancelled) {
    return { status: 'cancelled', segments, stats: state.stats, warnings: state.warnings }
  }
  if (segments.length === 0) {
    warn(state, 'no-valid-samples', 'No valid samples in this range; nothing to draw.')
  }
  if (state.budgetHit) {
    warn(state, 'budget-exhausted', 'The evaluation budget was exhausted; refined detail is incomplete.')
  }
  const status = state.budgetHit ? 'partial' : 'ok'
  return { status, segments, stats: state.stats, warnings: state.warnings }
}

export type { Evaluator }
