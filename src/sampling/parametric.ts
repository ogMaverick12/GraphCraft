import type { PointEvaluator } from '../math/index.ts'
import type { SampleOptions, SamplePoint, SampleResult } from './types.ts'
import {
  BASELINE_DIVISOR,
  BASELINE_MAX,
  BASELINE_MIN,
  BOUNDARY_BISECT_STEPS,
  BOUNDARY_MAGNITUDE_CAP,
  checkCancelled,
  concatRuns,
  finalizeSampling,
  minIntervalWidth,
  resolveOptions,
  splitEdges,
  SPIKE_FACTOR,
  toleranceAt,
  warn,
  type RunList,
  type SamplerState,
} from './sampler.ts'

/**
 * Parametric sampler (Stage 2): samples `evaluatePoint` over a parameter
 * range (t or theta) and returns ordered xy segments for rendering.
 *
 * Shares the budget/depth/cancellation/determinism machinery and result
 * shape with the Cartesian sampler, but refines on xy-space deviation
 * (not y-error): closed loops refine because arc midpoints deviate from
 * their chords — matching endpoints are never taken as proof of a clean
 * interior. Invalid points split; persistent same-side explosions gap.
 */

/** Evaluate one parameter value. Null unless both coordinates are finite. */
function tryParametricPoint(
  pointEvaluator: PointEvaluator,
  t: number,
  stats: { evaluations: number },
  parameters?: Record<string, number>,
): SamplePoint | null {
  stats.evaluations += 1
  let point: { x: number; y: number } | null = null
  try {
    point = pointEvaluator.evaluatePoint(t, parameters)
  } catch {
    return null
  }
  if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null
  }
  return { x: point.x, y: point.y }
}

function pointNorm(p: SamplePoint): number {
  return Math.hypot(p.x, p.y)
}

function pointDistance(a: SamplePoint, b: SamplePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Bisect an invalid→valid bracket to snap a run edge to the domain
 * boundary. Bounded; stops early inside explosions.
 */
function snapParametric(
  state: SamplerState<PointEvaluator>,
  invalidT: number,
  validT: number,
  validPoint: SamplePoint,
): { t: number; point: SamplePoint } {
  let lo = invalidT
  let heldT = validT
  let held = validPoint
  for (let i = 0; i < BOUNDARY_BISECT_STEPS; i += 1) {
    if (checkCancelled(state) || state.stats.evaluations >= state.options.maxEvaluations) {
      state.budgetHit = true
      break
    }
    const midT = (lo + heldT) / 2
    const mid = tryParametricPoint(state.evaluator, midT, state.stats, state.options.parameters)
    if (mid === null || pointNorm(mid) > BOUNDARY_MAGNITUDE_CAP) {
      lo = midT
    } else {
      heldT = midT
      held = mid
    }
  }
  return { t: heldT, point: held }
}

/** Refine the parameter interval [ta, tb] with endpoints a, b. */
function refineParametric(
  state: SamplerState<PointEvaluator>,
  a: SamplePoint,
  ta: number,
  b: SamplePoint,
  tb: number,
  depth: number,
): RunList {
  if (depth > state.stats.maxDepthReached) {
    state.stats.maxDepthReached = depth
  }
  if (checkCancelled(state)) {
    return [[a, b]]
  }
  if (state.stats.evaluations >= state.options.maxEvaluations) {
    state.budgetHit = true
    return [[a, b]]
  }

  const tm = (ta + tb) / 2
  const m = tryParametricPoint(state.evaluator, tm, state.stats, state.options.parameters)
  if (m === null) {
    // Invalid midpoint: a hard gap. No interpolation across it.
    state.stats.splitCount += 1
    return [[a], [b]]
  }

  // Same-side explosion (a pole hiding between valid samples): probe once,
  // gap when growth persists instead of joining across it.
  const largest = Math.max(pointNorm(a), pointNorm(b), pointNorm(m))
  const smallest = Math.min(pointNorm(a), pointNorm(b), pointNorm(m))
  if (smallest > 0 && largest / smallest > SPIKE_FACTOR) {
    if (depth >= state.options.maxDepth) {
      warn(state, 'pole-suspected', 'A steep spike could not be resolved; a gap was left rather than a false connection.')
      state.stats.splitCount += 1
      return [[a], [b]]
    }
    const left = refineParametric(state, a, ta, m, tm, depth + 1)
    const right = refineParametric(state, m, tm, b, tb, depth + 1)
    return concatRuns(left, right)
  }

  const interpolated = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const error = pointDistance(m, interpolated)
  if (error <= toleranceAt(state, [a.x, a.y, b.x, b.y, m.x, m.y])) {
    return [[a, m, b]]
  }

  const minDt = minIntervalWidth(state.options)
  if (tb - ta < minDt) {
    warn(state, 'under-resolved', 'A region varies below half-pixel parameter width; detail is approximate there.')
    return [[a, m, b]]
  }
  if (depth >= state.options.maxDepth) {
    warn(state, 'max-depth-reached', 'Subdivision depth cap reached in a high-curvature region; detail is approximate there.')
    return [[a, m, b]]
  }
  return concatRuns(refineParametric(state, a, ta, m, tm, depth + 1), refineParametric(state, m, tm, b, tb, depth + 1))
}

/**
 * Sample a parametric evaluator over the parameter range in options
 * (`xMin`/`xMax` name the parameter bounds). Deterministic for identical
 * inputs; shares budget, depth, cancellation, and diagnostics semantics
 * with the Cartesian sampler.
 */
export function sampleParametric(pointEvaluator: PointEvaluator, options: SampleOptions): SampleResult {
  const resolved = resolveOptions(options)
  if ('error' in resolved) {
    return {
      status: 'error',
      segments: [],
      stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
      warnings: [{ code: 'no-valid-samples', message: resolved.error }],
    }
  }

  const state: SamplerState<PointEvaluator> = {
    evaluator: pointEvaluator,
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
    // Appended, never merged across sub-range edges.
    runs.push(...sampleParametricRange(state, lo, hi, baselineCount, k === 0, k + 2 === edges.length))
    if (state.cancelled) {
      break
    }
  }
  return finalizeSampling(state, runs)
}

function sampleParametricRange(
  state: SamplerState<PointEvaluator>,
  lo: number,
  hi: number,
  baselineCount: number,
  warnStart: boolean,
  warnEnd: boolean,
): RunList {
  const runs: RunList = []
  const ts: number[] = []
  const points: Array<SamplePoint | null> = []
  for (let i = 0; i < baselineCount; i += 1) {
    if (checkCancelled(state) || state.stats.evaluations >= state.options.maxEvaluations) {
      state.budgetHit = true
      break
    }
    const t = lo + ((hi - lo) * i) / (baselineCount - 1)
    ts.push(t)
    points.push(tryParametricPoint(state.evaluator, t, state.stats, state.options.parameters))
  }

  // Snap invalid→valid transitions toward the true boundary.
  for (let i = 0; i + 1 < points.length; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    const currentT = ts[i]
    const nextT = ts[i + 1]
    if (currentT === undefined || nextT === undefined) {
      continue
    }
    if (current === null && next !== null) {
      const snapped = snapParametric(state, currentT, nextT, next)
      ts[i + 1] = snapped.t
      points[i + 1] = snapped.point
    } else if (current !== null && next === null) {
      const snapped = snapParametric(state, nextT, currentT, current)
      ts[i] = snapped.t
      points[i] = snapped.point
    }
  }

  if (warnStart && points.length > 0 && points[0] === null) {
    warn(state, 'invalid-endpoint', 'The range starts outside the curve domain; the curve begins at the first valid point.')
  }
  if (warnEnd && points.length > 0 && points[points.length - 1] === null) {
    warn(state, 'invalid-endpoint', 'The range ends outside the curve domain; the curve stops at the last valid point.')
  }

  let runStart: number | null = null
  const flushPairRuns = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      const ta = ts[i]
      const tb = ts[i + 1]
      if (a === null || b === null || ta === undefined || tb === undefined) {
        continue
      }
      const pairRuns = refineParametric(state, a, ta, b, tb, 0)
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
