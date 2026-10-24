import type { Evaluator } from '../math/index.ts'

/**
 * Local extrema (Stage 2 analysis): dense sampling finds strict local
 * extrema of samples, each refined by golden-section search and
 * verified against its neighbours. Interior only — endpoints are never
 * reported. Estimates with residuals, never analytic claims.
 */

export interface Extremum {
  readonly x: number
  readonly y: number
  readonly kind: 'minimum' | 'maximum'
}

export interface ExtremaResult {
  extrema: Extremum[]
  warnings: string[]
  evaluations: number
}

const SAMPLES = 512
const MAX_EVALUATIONS = 20000
const REFINEMENT_ITERATIONS = 60

function golden(
  evaluator: Evaluator,
  lo: number,
  hi: number,
  seekMinimum: boolean,
  parameters: Record<string, number> | undefined,
  count: { evaluations: number },
): { x: number; y: number } | null {
  const golden = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  const at = (x: number): number | null => {
    count.evaluations += 1
    if (count.evaluations > MAX_EVALUATIONS) {
      return null
    }
    try {
      const result = evaluator.evaluate(x, parameters)
      return result.kind === 'value' ? result.value : null
    } catch {
      return null
    }
  }
  let c = b - golden * (b - a)
  let d = a + golden * (b - a)
  let fc = at(c)
  let fd = at(d)
  if (fc === null || fd === null) {
    return null
  }
  for (let i = 0; i < REFINEMENT_ITERATIONS; i += 1) {
    const takeLeft = seekMinimum ? fc < fd : fc > fd
    if (takeLeft) {
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
  const best = seekMinimum ? (fc <= fd ? { x: c, y: fc } : { x: d, y: fd }) : fc >= fd ? { x: c, y: fc } : { x: d, y: fd }
  return best
}

export function findExtrema(
  evaluator: Evaluator,
  xMin: number,
  xMax: number,
  parameters: Record<string, number> | undefined,
): ExtremaResult {
  const warnings: string[] = []
  const count = { evaluations: 0 }
  if (!(xMax > xMin) || !Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return { extrema: [], warnings: ['Extrema search needs a finite range with max above min.'], evaluations: 0 }
  }
  const xs: number[] = []
  const ys: Array<number | null> = []
  for (let i = 0; i <= SAMPLES; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / SAMPLES
    xs.push(x)
    count.evaluations += 1
    try {
      const result = evaluator.evaluate(x, parameters)
      ys.push(result.kind === 'value' ? result.value : null)
    } catch {
      ys.push(null)
    }
  }

  const extrema: Extremum[] = []
  for (let i = 1; i < SAMPLES; i += 1) {
    const prev = ys[i - 1]
    const current = ys[i]
    const next = ys[i + 1]
    const xa = xs[i - 1]
    const xb = xs[i + 1]
    if (prev === null || prev === undefined || current === null || current === undefined || next === null || next === undefined) {
      continue
    }
    if (xa === undefined || xb === undefined) {
      continue
    }
    if (current < prev && current < next) {
      const refined = golden(evaluator, xa, xb, true, parameters, count)
      if (refined !== null) {
        extrema.push({ x: refined.x, y: refined.y, kind: 'minimum' })
      }
    } else if (current > prev && current > next) {
      const refined = golden(evaluator, xa, xb, false, parameters, count)
      if (refined !== null) {
        extrema.push({ x: refined.x, y: refined.y, kind: 'maximum' })
      }
    }
    if (count.evaluations >= MAX_EVALUATIONS) {
      warnings.push('Extrema search hit its evaluation budget; some extrema may be missing.')
      break
    }
  }

  // Deduplicate within a small fraction of the range.
  const dedupeTol = Math.max((xMax - xMin) * 1e-7, 1e-9)
  extrema.sort((a, b) => a.x - b.x)
  const unique = extrema.filter((candidate, index) => index === 0 || Math.abs(candidate.x - (extrema[index - 1]?.x ?? 0)) > dedupeTol)

  if (unique.length === 0) {
    warnings.push('No interior local extrema found in this range.')
  }
  return { extrema: unique, warnings, evaluations: count.evaluations }
}
