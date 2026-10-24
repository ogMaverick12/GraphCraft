import type { Evaluator } from '../math/index.ts'
import { formatSkippedPercent } from './format.ts'

/**
 * Numerical definite integration (Stage 2 analysis): adaptive Simpson
 * with an explicit tolerance policy, bounded depth and evaluations,
 * and honest gap accounting — invalid subintervals are skipped and
 * their share of the range reported, never silently zeroed.
 * Non-convergence is reported, not rounded into an answer.
 */

export interface IntegralResult {
  value: number
  /** Simpson-vs-refined disagreement bound over the valid parts. */
  errorEstimate: number
  /** Fraction of [a, b] skipped as invalid, 0 when clean. */
  skippedFraction: number
  /** True only when converged with no skipped regions. */
  converged: boolean
  method: 'adaptive-simpson'
  tolerance: number
  warnings: string[]
}

/**
 * Optional cap overrides for focused diagnostics tests. Production callers
 * omit this so the shipped caps (MAX_DEPTH / MAX_EVALUATIONS) apply.
 */
export interface IntegralLimits {
  readonly maxDepth?: number
  readonly maxEvaluations?: number
}

const MAX_DEPTH = 12
const MAX_EVALUATIONS = 50000

function finiteValue(evaluator: Evaluator, x: number, parameters: Record<string, number> | undefined): number | null {
  try {
    const result = evaluator.evaluate(x, parameters)
    return result.kind === 'value' ? result.value : null
  } catch {
    return null
  }
}

interface SimpsonState {
  evaluations: number
  skippedWidth: number
  /** Effective evaluation cap for this run (tests may tighten it). */
  maxEvaluations: number
  /** Set only when an `ok: false` result came from each stop cause. */
  budgetExhausted: boolean
  depthExhausted: boolean
}

interface SimpsonResult {
  value: number
  error: number
  ok: boolean
}

function withinBudget(state: SimpsonState): boolean {
  return state.evaluations < state.maxEvaluations
}

function adaptive(
  evaluator: Evaluator,
  a: number,
  b: number,
  tolerance: number,
  depth: number,
  parameters: Record<string, number> | undefined,
  state: SimpsonState,
): SimpsonResult {
  const mid = (a + b) / 2
  const leftMid = (a + mid) / 2
  const rightMid = (mid + b) / 2
  const fa = finiteValue(evaluator, a, parameters)
  const fm = finiteValue(evaluator, mid, parameters)
  const fb = finiteValue(evaluator, b, parameters)
  const flm = finiteValue(evaluator, leftMid, parameters)
  const frm = finiteValue(evaluator, rightMid, parameters)
  state.evaluations += 5
  if (fa === null || fm === null || fb === null || flm === null || frm === null) {
    // Some node invalid: subdivide while budget and depth allow, else skip.
    if (depth <= 0 || !withinBudget(state) || b - a < 1e-12) {
      state.skippedWidth += b - a
      return { value: 0, error: 0, ok: true }
    }
    const left = adaptive(evaluator, a, mid, tolerance / 2, depth - 1, parameters, state)
    const right = adaptive(evaluator, mid, b, tolerance / 2, depth - 1, parameters, state)
    return { value: left.value + right.value, error: left.error + right.error, ok: left.ok && right.ok }
  }
  const h = (b - a) / 2
  const left = (h / 6) * (fa + 4 * flm + fm)
  const right = (h / 6) * (fm + 4 * frm + fb)
  const refined = left + right
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb)
  const error = Math.abs(refined - whole) / 15
  if (depth <= 0 || error <= tolerance * Math.max(1, Math.abs(refined))) {
    const ok = depth > 0 || error <= tolerance * Math.max(1, Math.abs(refined))
    if (!ok) {
      state.depthExhausted = true
    }
    return { value: refined, error, ok }
  }
  if (!withinBudget(state)) {
    state.budgetExhausted = true
    return { value: refined, error: Number.POSITIVE_INFINITY, ok: false }
  }
  const leftResult = adaptive(evaluator, a, mid, tolerance / 2, depth - 1, parameters, state)
  const rightResult = adaptive(evaluator, mid, b, tolerance / 2, depth - 1, parameters, state)
  return {
    value: leftResult.value + rightResult.value,
    error: leftResult.error + rightResult.error,
    ok: leftResult.ok && rightResult.ok,
  }
}

/** Finite non-negative integer cap, or the shipped fallback. */
function resolveLimit(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(minimum, Math.floor(value))
}

/** Name the stop cause that actually produced an `ok: false` result. */
function nonConvergenceWarning(state: SimpsonState): string {
  const suffix = ' Try a narrower interval.'
  if (state.budgetExhausted && state.depthExhausted) {
    return `Integration did not converge within the evaluation budget and the refinement depth limit.${suffix}`
  }
  if (state.budgetExhausted) {
    return `Integration did not converge within the evaluation budget.${suffix}`
  }
  if (state.depthExhausted) {
    return `Integration did not converge within the refinement depth limit.${suffix}`
  }
  return `Integration did not converge.${suffix}`
}

export function integrate(
  evaluator: Evaluator,
  a: number,
  b: number,
  parameters: Record<string, number> | undefined,
  tolerance = 1e-9,
  limits: IntegralLimits = {},
): IntegralResult {
  const warnings: string[] = []
  const invalid = (message: string): IntegralResult => ({
    value: 0,
    errorEstimate: Number.NaN,
    skippedFraction: 0,
    converged: false,
    method: 'adaptive-simpson',
    tolerance,
    warnings: [message],
  })
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
    return invalid('Integral needs finite a below b.')
  }
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) {
    return invalid('Integral needs a positive finite tolerance.')
  }
  const maxDepth = resolveLimit(limits.maxDepth, MAX_DEPTH, 0)
  const maxEvaluations = resolveLimit(limits.maxEvaluations, MAX_EVALUATIONS, 1)
  const state: SimpsonState = {
    evaluations: 0,
    skippedWidth: 0,
    maxEvaluations,
    budgetExhausted: false,
    depthExhausted: false,
  }
  const result = adaptive(evaluator, a, b, tolerance, maxDepth, parameters, state)
  const skippedFraction = state.skippedWidth / (b - a)
  const trustworthy = result.ok && skippedFraction === 0 && result.error <= tolerance * Math.max(1, Math.abs(result.value))
  if (!result.ok) {
    warnings.push(nonConvergenceWarning(state))
  }
  const skippedLabel = formatSkippedPercent(skippedFraction)
  if (skippedLabel !== null) {
    warnings.push(`${skippedLabel} of the interval was invalid and skipped; the value covers the valid parts only.`)
  }
  return {
    value: result.value,
    errorEstimate: result.error,
    skippedFraction,
    converged: trustworthy,
    method: 'adaptive-simpson',
    tolerance,
    warnings,
  }
}
