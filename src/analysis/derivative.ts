import type { Evaluator } from '../math/index.ts'

/**
 * Numerical differentiation (Stage 2 analysis): central differences
 * with an explicit step policy, one-sided disagreement detection for
 * cusps, and a step-doubling error estimate. A finite function value at
 * the target is required — an undefined or non-finite target returns no
 * value with a warning (a quotient sampled only around a singularity
 * describes the step, not the function). The policy and its limitations
 * travel with every result.
 */

export interface DerivativeResult {
  value: number | null
  /** Step actually used. */
  step: number
  /** |d(h) − d(h/2)|: small means the difference quotient settled. */
  errorEstimate: number | null
  method: 'central-difference'
  warnings: string[]
}

function finiteValue(evaluator: Evaluator, x: number, parameters: Record<string, number> | undefined): number | null {
  try {
    const result = evaluator.evaluate(x, parameters)
    return result.kind === 'value' && Number.isFinite(result.value) ? result.value : null
  } catch {
    return null
  }
}

function central(evaluator: Evaluator, x: number, h: number, parameters: Record<string, number> | undefined): number | null {
  const right = finiteValue(evaluator, x + h, parameters)
  const left = finiteValue(evaluator, x - h, parameters)
  if (right === null || left === null) {
    return null
  }
  return (right - left) / (2 * h)
}

/**
 * First derivative estimate. Default step h = sqrt(eps)·max(1, |x|)
 * balances truncation against rounding for central differences.
 */
export function derivative(
  evaluator: Evaluator,
  x: number,
  parameters: Record<string, number> | undefined,
  step?: number,
): DerivativeResult {
  const warnings: string[] = []
  if (!Number.isFinite(x)) {
    return { value: null, step: Number.NaN, errorEstimate: null, method: 'central-difference', warnings: ['Derivative needs a finite x.'] }
  }
  const h = step ?? Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(x))
  if (!(h > 0) || !Number.isFinite(h)) {
    return { value: null, step: h, errorEstimate: null, method: 'central-difference', warnings: ['Derivative needs a positive finite step.'] }
  }
  // Differentiability at x requires a function value at x: without one the
  // quotient describes the step, not the function (1/x at 0 returned
  // ≈ 4.5e15 with no warning; 1/x² at 0 returned exactly 0).
  const here = finiteValue(evaluator, x, parameters)
  if (here === null) {
    return { value: null, step: h, errorEstimate: null, method: 'central-difference', warnings: ['Function is undefined or non-finite at x; derivative not established.'] }
  }
  const center = central(evaluator, x, h, parameters)
  if (center === null) {
    return { value: null, step: h, errorEstimate: null, method: 'central-difference', warnings: ['Function is not defined on both sides of x at this step.'] }
  }
  // Cusp check: one-sided slopes disagreeing means no single tangent.
  const right = finiteValue(evaluator, x + h, parameters)
  const left = finiteValue(evaluator, x - h, parameters)
  if (right !== null && left !== null) {
    const rightSlope = (right - here) / h
    const leftSlope = (here - left) / h
    const scale = Math.max(Math.abs(rightSlope), Math.abs(leftSlope), 1)
    if (Math.abs(rightSlope - leftSlope) > Math.max(1e-6, scale * 1e-3)) {
      warnings.push('One-sided slopes disagree here (possible cusp or kink); treat the value cautiously.')
    }
  }
  const finer = central(evaluator, x, h / 2, parameters)
  const errorEstimate = finer === null ? null : Math.abs(center - finer)
  return { value: center, step: h, errorEstimate, method: 'central-difference', warnings }
}

export interface TangentResult {
  x0: number
  y0: number
  slope: number
  /** y = slope·(x − x0) + y0, rendered as an overlay curve. */
  at: (x: number) => number
  derivative: DerivativeResult
}

/** Tangent line at x0, plus an optional normal (null slope when vertical). */
export function tangent(
  evaluator: Evaluator,
  x0: number,
  parameters: Record<string, number> | undefined,
  step?: number,
): { tangent: TangentResult | null; warnings: string[] } {
  const derivativeResult = derivative(evaluator, x0, parameters, step)
  if (derivativeResult.value === null) {
    return { tangent: null, warnings: derivativeResult.warnings }
  }
  const y0 = finiteValue(evaluator, x0, parameters)
  if (y0 === null) {
    return { tangent: null, warnings: ['Function is not defined at this x.'] }
  }
  const slope = derivativeResult.value
  return {
    tangent: {
      x0,
      y0,
      slope,
      at: (x: number): number => slope * (x - x0) + y0,
      derivative: derivativeResult,
    },
    warnings: derivativeResult.warnings,
  }
}
