import type { Evaluator } from '../math/index.ts'

/**
 * Numerical root finding (Stage 2 analysis): sign-change bracketing
 * plus bisection, with an even-multiplicity fallback that minimizes
 * |f| (e.g. `x^2` at 0, which never changes sign). Estimates only —
 * never claimed analytic. Bounded iterations and evaluations; invalid
 * samples are skipped, never interpolated.
 */

export interface FoundRoot {
  readonly x: number
  readonly residual: number
  /** 'bracket' for sign-change bisection, 'minimum' for |f| minimization. */
  readonly method: 'bracket' | 'minimum'
}

export interface RootSearchOptions {
  divisions?: number
  xTolerance?: number
  residualTolerance?: number
  maxEvaluations?: number
}

export interface RootSearchResult {
  roots: FoundRoot[]
  warnings: string[]
  evaluations: number
}

const DEFAULT_DIVISIONS = 200
const DEFAULT_X_TOLERANCE = 1e-9
const DEFAULT_MAX_EVALUATIONS = 20000

function evaluateFinite(evaluator: Evaluator, x: number, parameters: Record<string, number> | undefined, count: { evaluations: number }): number | null {
  count.evaluations += 1
  let result
  try {
    result = evaluator.evaluate(x, parameters)
  } catch {
    return null
  }
  return result.kind === 'value' ? result.value : null
}

function bisect(
  evaluator: Evaluator,
  lo: number,
  hi: number,
  flo: number,
  parameters: Record<string, number> | undefined,
  count: { evaluations: number },
  maxEvaluations: number,
  xTolerance: number,
): { x: number; residual: number } | null {
  let a = lo
  let b = hi
  let fa = flo
  for (let i = 0; i < 100; i += 1) {
    if (count.evaluations >= maxEvaluations) {
      return null
    }
    const mid = (a + b) / 2
    const fm = evaluateFinite(evaluator, mid, parameters, count)
    if (fm === null) {
      return null
    }
    if (Math.abs(fm) === 0 || (b - a) / 2 < xTolerance) {
      return { x: mid, residual: Math.abs(fm) }
    }
    if ((fa < 0) !== (fm < 0)) {
      b = mid
    } else {
      a = mid
      fa = fm
    }
  }
  const mid = (a + b) / 2
  const fm = evaluateFinite(evaluator, mid, parameters, count)
  return fm === null ? null : { x: mid, residual: Math.abs(fm) }
}

/**
 * Acceptance test for a refined candidate. Bisection stops at the x
 * tolerance, so a genuine root with slope s can only reach a residual
 * of about s·xTolerance — accepting only a fixed absolute residual
 * silently drops steep-but-real roots (e.g. sin(10x)). The secant
 * slope over the bracketing interval bounds s for smooth crossings,
 * while pole crossings and jumps keep residuals far above it (their
 * residual grows as the interval shrinks).
 */
function acceptResidual(residual: number, slopeEstimate: number, residualTolerance: number, xTolerance: number): boolean {
  return residual <= Math.max(residualTolerance, slopeEstimate * xTolerance * 4)
}

/** Golden-section minimization of |f| over a bracket (even-multiplicity recovery). */
function minimizeAbs(
  evaluator: Evaluator,
  lo: number,
  hi: number,
  parameters: Record<string, number> | undefined,
  count: { evaluations: number },
  maxEvaluations: number,
  xTolerance: number,
): { x: number; residual: number } | null {
  const golden = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  const at = (x: number): number | null => evaluateFinite(evaluator, x, parameters, count)
  let c = b - golden * (b - a)
  let d = a + golden * (b - a)
  let fc = at(c)
  let fd = at(d)
  if (fc === null || fd === null) {
    return null
  }
  for (let i = 0; i < 80; i += 1) {
    if (count.evaluations >= maxEvaluations || b - a < xTolerance) {
      break
    }
    if (Math.abs(fc) < Math.abs(fd)) {
      b = d
      d = c
      fd = fc
      c = b - golden * (b - a)
      fc = at(c)
      if (fc === null) {
        return null
      }
    } else {
      a = c
      c = d
      fc = fd
      d = a + golden * (b - a)
      fd = at(d)
      if (fd === null) {
        return null
      }
    }
  }
  const best = Math.abs(fc) <= Math.abs(fd) ? { x: c, residual: Math.abs(fc) } : { x: d, residual: Math.abs(fd) }
  return best
}

/**
 * Find roots of f over [xMin, xMax]. Sign changes bisect; strict local
 * minima of |f| recover even-multiplicity roots; candidates with large
 * residuals (e.g. poles) are rejected, never reported as roots.
 * Duplicates merge within tolerance. A simple scan cannot prove it
 * found every root — documented, not claimed.
 */
export function findRoots(
  evaluator: Evaluator,
  xMin: number,
  xMax: number,
  parameters: Record<string, number> | undefined,
  opts: RootSearchOptions = {},
): RootSearchResult {
  const warnings: string[] = []
  const count = { evaluations: 0 }
  const divisions = opts.divisions ?? DEFAULT_DIVISIONS
  const xTolerance = opts.xTolerance ?? DEFAULT_X_TOLERANCE
  const maxEvaluations = opts.maxEvaluations ?? DEFAULT_MAX_EVALUATIONS
  if (!(xMax > xMin) || !Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return { roots: [], warnings: ['Root search needs a finite range with max above min.'], evaluations: 0 }
  }

  const xs: number[] = []
  const fs: Array<number | null> = []
  const steps = Math.max(8, Math.min(2000, Math.floor(divisions)))
  for (let i = 0; i <= steps; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / steps
    xs.push(x)
    fs.push(evaluateFinite(evaluator, x, parameters, count))
  }

  const finite = fs.filter((v): v is number => v !== null)
  const scale = finite.length > 0 ? Math.max(...finite.map((v) => Math.abs(v)), 0) : 0
  const residualTolerance = opts.residualTolerance ?? Math.max(1e-9, scale * 1e-9)
  const minimumThreshold = Math.max(1e-6, scale * 1e-3)

  const candidates: FoundRoot[] = []

  // Boundary roots: a near-zero sampled endpoint (e.g. sin at 2π, or an
  // even-multiplicity root at the range edge) never forms the interior
  // three-point pattern below, so probe both ends explicitly. The
  // residual check still gates the result, so small non-roots are dropped.
  const probeBoundary = (outer: number, inner: number, lo: number, hi: number): void => {
    const outerValue = fs[outer]
    const innerValue = fs[inner]
    const outerX = xs[outer]
    const innerX = xs[inner]
    if (
      outerValue === null || outerValue === undefined ||
      innerValue === null || innerValue === undefined ||
      outerX === undefined || innerX === undefined
    ) {
      return
    }
    if (!(Math.abs(outerValue) < Math.abs(innerValue)) || !(Math.abs(outerValue) < minimumThreshold)) {
      return
    }
    const slopeEstimate = Math.abs(innerValue - outerValue) / Math.abs(innerX - outerX)
    const refined = minimizeAbs(evaluator, lo, hi, parameters, count, maxEvaluations, xTolerance)
    if (refined !== null && acceptResidual(refined.residual, slopeEstimate, residualTolerance, xTolerance)) {
      candidates.push({ x: refined.x, residual: refined.residual, method: 'minimum' })
    }
  }
  const firstX = xs[0]
  const secondX = xs[2]
  if (firstX !== undefined && secondX !== undefined) {
    probeBoundary(0, 1, firstX, secondX)
  }
  const lastX = xs[steps]
  const secondLastX = xs[steps - 2]
  if (lastX !== undefined && secondLastX !== undefined) {
    probeBoundary(steps, steps - 1, secondLastX, lastX)
  }

  let unresolvedBrackets = 0
  for (let i = 0; i < steps; i += 1) {
    const fa = fs[i]
    const fb = fs[i + 1]
    const xa = xs[i]
    const xb = xs[i + 1]
    if (fa === null || fa === undefined || fb === null || fb === undefined || xa === undefined || xb === undefined) {
      continue
    }
    if (fa === 0) {
      candidates.push({ x: xa, residual: 0, method: 'bracket' })
    }
    if ((fa < 0) !== (fb < 0)) {
      const slopeEstimate = Math.abs(fb - fa) / (xb - xa)
      const refined = bisect(evaluator, xa, xb, fa, parameters, count, maxEvaluations, xTolerance)
      if (refined !== null && acceptResidual(refined.residual, slopeEstimate, residualTolerance, xTolerance)) {
        candidates.push({ x: refined.x, residual: refined.residual, method: 'bracket' })
      } else {
        // Pole crossings and jumps keep residuals far above the slope
        // bound; they are dropped — but counted, so the result says so.
        unresolvedBrackets += 1
      }
    } else if (i + 2 <= steps) {
      // Even-multiplicity / cusp probe: every strict local minimum of
      // |f| is a candidate; the acceptance residual decides. (Cusp
      // contacts are linear, so a fixed pre-filter would miss them at
      // coarse sampling; the probe count stays bounded by the scan.)
      const fc = fs[i + 2]
      const xc = xs[i + 2]
      if (fc !== null && fc !== undefined && xc !== undefined && Math.abs(fb) < Math.abs(fa) && Math.abs(fb) <= Math.abs(fc)) {
        const slopeEstimate = Math.max(Math.abs(fb - fa) / (xb - xa), Math.abs(fc - fb) / (xc - xb))
        const refined = minimizeAbs(evaluator, xa, xc, parameters, count, maxEvaluations, xTolerance)
        if (refined !== null && acceptResidual(refined.residual, slopeEstimate, residualTolerance, xTolerance)) {
          candidates.push({ x: refined.x, residual: refined.residual, method: 'minimum' })
        }
      }
    }
    if (count.evaluations >= maxEvaluations) {
      warnings.push('Root search hit its evaluation budget; some roots may be missing.')
      break
    }
  }
  if (unresolvedBrackets > 0) {
    const plural = unresolvedBrackets === 1 ? '' : 's'
    warnings.push(`${unresolvedBrackets} bracketed sign change${plural} did not resolve to roots (possible pole, jump, or unresolved steep crossing); the root list may be incomplete.`)
  }

  // Deduplicate within a small fraction of the range.
  const dedupeTol = Math.max((xMax - xMin) * 1e-7, xTolerance * 10)
  candidates.sort((a, b) => a.x - b.x)
  const roots: FoundRoot[] = []
  for (const candidate of candidates) {
    const previous = roots[roots.length - 1]
    if (previous !== undefined && Math.abs(candidate.x - previous.x) <= dedupeTol) {
      if (candidate.residual < previous.residual) {
        roots[roots.length - 1] = candidate
      }
      continue
    }
    roots.push(candidate)
  }

  if (roots.length === 0) {
    warnings.push('No roots found: no sign change or qualifying minimum in this range (a scan cannot prove absence).')
  }
  return { roots, warnings, evaluations: count.evaluations }
}
