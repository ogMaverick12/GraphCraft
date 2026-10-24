/**
 * Model fitting (Stage 4 DATA-03, extended S4.4): ordinary least squares
 * for lines and bounded-degree polynomials plus three documented
 * linearized nonlinear models (exponential, logarithmic, power), all
 * solved by Householder QR — never by forming normal equations.
 * Pure numerics: no React, no SVG. Every estimate travels with its
 * diagnostics, and failures (singular, too few points, overflow,
 * domain violations) are errors, never silent lines.
 *
 * Scope: linear + polynomial (degree ≤ 6) + exp/log/power via
 * log-linearization (approximate, stated — not true nonlinear MLE).
 * No general solver, no confidence intervals, no p-values.
 */

export const MAX_POLY_DEGREE = 6

/** Documented selection: linearizable curves only — never a universal solver. */
export type FitModel = 'line' | 'poly' | 'exp' | 'log' | 'power'

export interface FitRequest {
  model: FitModel
  /** Polynomial degree 2..6; ignored for lines. */
  degree: number
  xs: number[]
  ys: number[]
  /**
   * Optional per-observation standard deviations (same length as xs).
   * Convention: weight w = 1/σ²; σ ≤ 0 or missing excludes the point
   * with a count. R² stays unweighted on raw residuals (stated).
   */
  sigmas?: Array<number | null | undefined>
}

export interface FitResult {
  model: FitModel
  /**
   * Estimates (not truths). line/poly: c0..cd with y = c0 + c1·x + ….
   * exp: [a, b] with y = a·e^(b·x). log: [a, b] with y = a + b·ln(x).
   * power: [a, b] with y = a·x^b.
   */
  coefficients: number[]
  degree: number
  n: number
  /** Residual degrees of freedom (n − p): the divisor behind residualStd. */
  dof: number
  /** Pairs skipped for missing/non-finite input (counted, not hidden). */
  skipped: number
  residualStd: number
  /** RMSE ÷n and MAE mean|r|: descriptive spread, never validity proofs. */
  rmse: number
  mae: number
  minResidual: number
  maxResidual: number
  /** Null when Y is constant (0/0); R² is descriptive, never causal proof. */
  rSquared: number | null
  /** True only when the design solved cleanly with no warnings. */
  converged: boolean
  warnings: string[]
  methodNote: string
}

export type FitOutcome =
  | { status: 'value'; fit: FitResult }
  | { status: 'error'; kind: 'data' | 'singular' | 'overflow'; message: string }

/**
 * Householder QR solve of min‖Ax−b‖. Returns R's diagonal for the
 * conditioning check alongside the solution. The reflector vector is
 * saved explicitly each step: in-place updates must never consume a
 * vector they are overwriting. Rank failure is detected, reported,
 * never patched over.
 */
function householderSolve(a: number[][], b: number[]): { x: number[]; rDiag: number[] } | null {
  const m = a.length
  const n = a[0]?.length ?? 0
  const r: number[][] = a.map((row) => [...row])
  const y = [...b]
  for (let k = 0; k < n; k += 1) {
    let norm = 0
    for (let i = k; i < m; i += 1) {
      norm = Math.hypot(norm, r[i]?.[k] ?? 0)
    }
    if (!(norm > 0) || !Number.isFinite(norm)) {
      return null
    }
    const leading = r[k]?.[k] ?? 0
    const sign = leading >= 0 ? 1 : -1
    const u0 = leading + sign * norm
    const beta = 1 / (norm * (norm + Math.abs(leading)))
    if (!Number.isFinite(beta) || beta === 0) {
      return null
    }
    const tail: number[] = []
    for (let i = k + 1; i < m; i += 1) {
      tail.push(r[i]?.[k] ?? 0)
    }
    const component = (i: number): number => (i === k ? u0 : (tail[i - k - 1] ?? 0))
    // Direct reflector application (kept explicit for auditability).
    for (let j = k; j < n; j += 1) {
      let dot = 0
      for (let i = k; i < m; i += 1) {
        dot += component(i) * (r[i]?.[j] ?? 0)
      }
      const scale = dot * beta
      for (let i = k; i < m; i += 1) {
        r[i]![j] = (r[i]?.[j] ?? 0) - component(i) * scale
      }
    }
    {
      let dot = 0
      for (let i = k; i < m; i += 1) {
        dot += component(i) * (y[i] ?? 0)
      }
      const scale = dot * beta
      for (let i = k; i < m; i += 1) {
        y[i] = (y[i] ?? 0) - component(i) * scale
      }
    }
    for (let i = k + 1; i < m; i += 1) {
      r[i]![k] = 0
    }
  }
  const rDiag = Array.from({ length: n }, (_, k) => Math.abs(r[k]?.[k] ?? 0))
  const x = Array.from({ length: n }, () => 0)
  for (let k = n - 1; k >= 0; k -= 1) {
    const pivot = r[k]?.[k] ?? 0
    if (pivot === 0 || !Number.isFinite(pivot)) {
      return null
    }
    let sum = y[k] ?? 0
    for (let j = k + 1; j < n; j += 1) {
      sum -= (r[k]?.[j] ?? 0) * (x[j] ?? 0)
    }
    x[k] = sum / pivot
  }
  if (x.some((v) => !Number.isFinite(v))) {
    return null
  }
  return { x, rDiag }
}

function polyValue(coefficients: number[], x: number): number {
  let result = 0
  for (let d = coefficients.length - 1; d >= 0; d -= 1) {
    result = result * x + (coefficients[d] ?? 0)
  }
  return result
}

/** Evaluate any supported model at x (display/sampling helper). */
export function evaluateModelFit(model: FitModel, coefficients: number[], x: number): number {
  if (model === 'exp') {
    return (coefficients[0] ?? NaN) * Math.exp((coefficients[1] ?? NaN) * x)
  }
  if (model === 'log') {
    return (coefficients[0] ?? NaN) + (coefficients[1] ?? NaN) * Math.log(x)
  }
  if (model === 'power') {
    return (coefficients[0] ?? NaN) * Math.pow(x, coefficients[1] ?? NaN)
  }
  return polyValue(coefficients, x)
}

function modelEquation(model: FitModel): string {
  if (model === 'exp') return 'y = a·e^(b·x)'
  if (model === 'log') return 'y = a + b·ln(x)'
  if (model === 'power') return 'y = a·x^b'
  return 'y = c0 + c1·x + …'
}

export function fitModel(request: FitRequest): FitOutcome {
  const isPoly = request.model === 'poly'
  const isLinearized = request.model === 'exp' || request.model === 'log' || request.model === 'power'
  const degree = request.model === 'line' ? 1 : isLinearized ? 1 : Math.floor(request.degree)
  if (isPoly && (!Number.isInteger(request.degree) || degree < 2 || degree > MAX_POLY_DEGREE)) {
    return { status: 'error', kind: 'data', message: `Polynomial degree must be an integer from 2 to ${MAX_POLY_DEGREE}.` }
  }
  const pairs: Array<[number, number]> = []
  let skipped = 0
  let weightExcluded = 0
  const rowWeights: number[] = []
  const sigmas = request.sigmas
  const useWeights = sigmas !== undefined
  if (useWeights && sigmas.length !== request.xs.length) {
    return { status: 'error', kind: 'data', message: `Weights length ${sigmas.length} does not match ${request.xs.length} observations; refusing rather than misaligning.` }
  }
  for (let i = 0; i < request.xs.length; i += 1) {
    const x = request.xs[i]
    const y = request.ys[i]
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      skipped += 1
      continue
    }
    if (useWeights) {
      const sigma = sigmas?.[i]
      if (typeof sigma !== 'number' || !Number.isFinite(sigma) || sigma <= 0) {
        weightExcluded += 1
        continue
      }
      rowWeights.push(1 / (sigma * sigma))
    }
    pairs.push([x, y])
  }
  const p = degree + 1
  if (!isLinearized && pairs.length < p + 1) {
    return {
      status: 'error',
      kind: 'data',
      message: `Too few observations: a degree-${degree} fit needs at least ${p + 1} points with valid X and Y (${pairs.length} available).`,
    }
  }
  if (isLinearized) {
    const kind = request.model
    if (kind !== 'exp' && kind !== 'log' && kind !== 'power') {
      return { status: 'error', kind: 'data', message: `Unsupported model "${request.model}".` }
    }
    return fitLinearized(kind, pairs, skipped, weightExcluded, rowWeights, useWeights)
  }
  const design = pairs.map(([x], i) => {
    const weight = useWeights ? Math.sqrt(rowWeights[i] ?? 0) : 1
    return Array.from({ length: p }, (_, d) => weight * Math.pow(x, d))
  })
  const targets = pairs.map(([, y], i) => (useWeights ? Math.sqrt(rowWeights[i] ?? 0) * y : y))
  if (design.some((row) => row.some((v) => !Number.isFinite(v)))) {
    return { status: 'error', kind: 'overflow', message: 'Design powers overflowed: rescale X (e.g. divide by 1000) and refit.' }
  }
  const solved = householderSolve(design, targets)
  if (solved === null) {
    return {
      status: 'error',
      kind: 'singular',
      message: 'Singular design: constant X, duplicated structure, or exact collinearity leaves no unique fit. Check the X column.',
    }
  }
  const coefficients = solved.x
  const maxDiag = Math.max(...solved.rDiag, 0)
  const minDiag = Math.min(...solved.rDiag)
  const warnings: string[] = []
  if (useWeights) {
    warnings.push('Weighted least squares with w = 1/σ²; R² below is unweighted on raw residuals.')
  }
  if (weightExcluded > 0) {
    warnings.push(`${weightExcluded} points excluded (missing or non-positive σ).`)
  }
  if (maxDiag > 0 && minDiag / maxDiag < 1e-9) {
    warnings.push('Ill-conditioned design (near-duplicate X structure): coefficients may be unreliable; check residuals.')
  }
  if (degree >= 3) {
    warnings.push(`Degree ${degree} can overfit: it follows noise, not trend. Prefer the lowest degree that captures the shape.`)
  }
  const residuals = pairs.map(([x, y]) => y - polyValue(coefficients, x))
  if (residuals.some((r) => !Number.isFinite(r))) {
    return { status: 'error', kind: 'overflow', message: 'Residuals overflowed: rescale and refit.' }
  }
  const dof = pairs.length - p
  const ssRes = residuals.reduce((sum, r) => sum + r * r, 0)
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length
  const ssTot = pairs.reduce((sum, [, y]) => sum + (y - meanY) * (y - meanY), 0)
  const rSquared = ssTot === 0 ? null : 1 - ssRes / ssTot
  if (rSquared === null) {
    warnings.push('Constant Y: R² is undefined (0/0), so no goodness-of-fit is reported.')
  }
  return {
    status: 'value',
    fit: {
      model: request.model,
      coefficients,
      degree,
      n: pairs.length,
      dof,
      skipped,
      residualStd: Math.sqrt(ssRes / dof),
      rmse: Math.sqrt(ssRes / pairs.length),
      mae: residuals.reduce((sum, r) => sum + Math.abs(r), 0) / pairs.length,
      minResidual: Math.min(...residuals),
      maxResidual: Math.max(...residuals),
      rSquared,
      converged: warnings.length === 0,
      warnings,
      methodNote: 'Ordinary least squares via Householder QR (no normal equations).',
    },
  }
}

/**
 * Linearized nonlinear fits (S4.4 documented selection). Each transforms
 * to a 2-parameter linear problem solved by the same Householder QR:
 * exp y=a·e^(bx) via (x, ln y) needing y>0; log y=a+b·ln x needing x>0;
 * power y=a·x^b via (ln x, ln y) needing x>0,y>0. Domain violations skip
 * with a count (never silently dropped); weights apply in transformed
 * space (stated); R² and residuals are always in original units.
 * Approximate by construction — never claimed as true nonlinear MLE.
 * Iteration: none (direct solve); convergence: exact solve or loud error.
 */
function fitLinearized(
  model: 'exp' | 'log' | 'power',
  pairs: Array<[number, number]>,
  skipped: number,
  weightExcluded: number,
  rowWeights: number[],
  useWeights: boolean,
): FitOutcome {
  const needsPositiveX = model === 'log' || model === 'power'
  const needsPositiveY = model === 'exp' || model === 'power'
  const kept: Array<[number, number]> = []
  const keptWeights: number[] = []
  let domainSkipped = 0
  pairs.forEach(([x, y], i) => {
    if ((needsPositiveX && x <= 0) || (needsPositiveY && y <= 0)) {
      domainSkipped += 1
      return
    }
    kept.push([x, y])
    if (useWeights) {
      keptWeights.push(rowWeights[i] ?? 0)
    }
  })
  const totalSkipped = skipped + domainSkipped
  if (kept.length < 3) {
    return {
      status: 'error',
      kind: 'data',
      message: `Too few observations: ${modelEquation(model)} needs at least 3 points with valid (and in-domain) X and Y (${kept.length} available${domainSkipped > 0 ? `, ${domainSkipped} excluded by domain` : ''}).`,
    }
  }
  const design = kept.map(([x], i) => {
    const weight = useWeights ? Math.sqrt(keptWeights[i] ?? 0) : 1
    const tx = model === 'log' || model === 'power' ? Math.log(x) : x
    return [weight * 1, weight * tx]
  })
  const targets = kept.map(([, y], i) => {
    const weight = useWeights ? Math.sqrt(keptWeights[i] ?? 0) : 1
    const ty = model === 'exp' || model === 'power' ? Math.log(y) : y
    return weight * ty
  })
  if (design.some((row) => row.some((v) => !Number.isFinite(v))) || targets.some((v) => !Number.isFinite(v))) {
    return { status: 'error', kind: 'overflow', message: 'Log-transform overflowed: check for extreme or near-zero values and refit.' }
  }
  const solved = householderSolve(design, targets)
  if (solved === null) {
    return {
      status: 'error',
      kind: 'singular',
      message: 'Singular design in transformed space: constant X (or constant ln X) leaves no unique fit. Check the X column.',
    }
  }
  const [c0 = NaN, c1 = NaN] = solved.x
  let coefficients: number[]
  if (model === 'log') {
    coefficients = [c0, c1]
  } else {
    const a = Math.exp(c0)
    if (!Number.isFinite(a) || !Number.isFinite(c1)) {
      return { status: 'error', kind: 'overflow', message: 'Back-transform overflowed (exp of intercept): rescale and refit.' }
    }
    coefficients = [a, c1]
  }
  const maxDiag = Math.max(...solved.rDiag, 0)
  const minDiag = Math.min(...solved.rDiag)
  const warnings: string[] = [
    'Linearized fit via log transform (Householder QR on transformed data): approximate — not a true nonlinear least-squares optimum.',
  ]
  if (useWeights) {
    warnings.push('Weights w = 1/σ² applied in transformed space; R² below is unweighted on raw residuals.')
  }
  if (weightExcluded > 0) {
    warnings.push(`${weightExcluded} points excluded (missing or non-positive σ).`)
  }
  if (domainSkipped > 0) {
    warnings.push(
      `${domainSkipped} points excluded by domain (${model === 'exp' ? 'needs y > 0' : model === 'log' ? 'needs x > 0' : 'needs x > 0 and y > 0'}).`,
    )
  }
  if (maxDiag > 0 && minDiag / maxDiag < 1e-9) {
    warnings.push('Ill-conditioned design (near-duplicate X structure): coefficients may be unreliable; check residuals.')
  }
  const residuals = kept.map(([x, y]) => y - evaluateModelFit(model, coefficients, x))
  if (residuals.some((r) => !Number.isFinite(r))) {
    return { status: 'error', kind: 'overflow', message: 'Residuals overflowed: rescale and refit.' }
  }
  const dof = kept.length - 2
  const ssRes = residuals.reduce((sum, r) => sum + r * r, 0)
  const meanY = kept.reduce((sum, [, y]) => sum + y, 0) / kept.length
  const ssTot = kept.reduce((sum, [, y]) => sum + (y - meanY) * (y - meanY), 0)
  const rSquared = ssTot === 0 ? null : 1 - ssRes / ssTot
  if (rSquared === null) {
    warnings.push('Constant Y: R² is undefined (0/0), so no goodness-of-fit is reported.')
  }
  return {
    status: 'value',
    fit: {
      model,
      coefficients,
      degree: 1,
      n: kept.length,
      dof,
      skipped: totalSkipped,
      residualStd: Math.sqrt(ssRes / dof),
      rmse: Math.sqrt(ssRes / kept.length),
      mae: residuals.reduce((sum, r) => sum + Math.abs(r), 0) / kept.length,
      minResidual: Math.min(...residuals),
      maxResidual: Math.max(...residuals),
      rSquared,
      converged: false,
      warnings,
      methodNote: 'Linearized least squares via log transform, Householder QR (approximate).',
    },
  }
}

/** Evaluate a fitted polynomial at x (display/sampling helper). */
export function evaluateFit(coefficients: number[], x: number): number {
  return polyValue(coefficients, x)
}

/** Pull finite numeric pairs from dataset columns (skips counted). */
export function extractFitPairs(
  rows: Array<Array<number | string | null>>,
  xIndex: number,
  yIndex: number,
): { xs: number[]; ys: number[]; skipped: number; kept: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  const kept: number[] = []
  let skipped = 0
  for (let r = 0; r < rows.length; r += 1) {
    const x = rows[r]?.[xIndex]
    const y = rows[r]?.[yIndex]
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      xs.push(x)
      ys.push(y)
      kept.push(r)
    } else {
      skipped += 1
    }
  }
  return { xs, ys, skipped, kept }
}
