import { calculate, type AngleMode } from './evaluate.ts'
import { formatDisplay } from './format.ts'
import { splitTopLevel } from './linalg.ts'

/**
 * Measurement-uncertainty lane: uncorrelated first-order (linearized)
 * propagation for `value ± σ` quantities, plus inverse-variance
 * weighted means. Every result names its formula; every refusal names
 * its cause. Assumptions are stated on every figure, not in fine
 * print: inputs are independent (covariances ignored), σ is small
 * enough that linearization holds, and σ means one standard
 * deviation of a symmetric error — asymmetric bounds are a Data Lab
 * display concept and never enter these formulas.
 */

export interface Uncertain {
  readonly value: number
  /** One standard deviation, finite and ≥ 0 (0 = exact). */
  readonly sigma: number
}

export type UncertainOutcome = { status: 'value'; value: Uncertain } | { status: 'error'; kind: 'syntax' | 'domain'; message: string }

/** Strict `value ± sigma` grammar (`±`, `+/-`, or `+-`); both sides are engine expressions. */
export function parseUncertain(source: string, mode: AngleMode): UncertainOutcome {
  const match = /^(.*?)(±|\+\/-|\+-)(.*?)$/.exec(source)
  if (match === null) {
    return { status: 'error', kind: 'syntax', message: 'Uncertainty looks like `10 ± 0.2` — value, ±, then sigma.' }
  }
  const valueText = (match[1] ?? '').trim()
  const sigmaText = (match[3] ?? '').trim()
  if (valueText === '' || sigmaText === '') {
    return { status: 'error', kind: 'syntax', message: 'Uncertainty needs both a value and a sigma: `10 ± 0.2`.' }
  }
  const value = calculate(valueText, mode)
  if (value.status !== 'value') {
    return { status: 'error', kind: 'syntax', message: `Value "${valueText}" is not a finite number.` }
  }
  const sigma = calculate(sigmaText, mode)
  if (sigma.status !== 'value') {
    return { status: 'error', kind: 'syntax', message: `Sigma "${sigmaText}" is not a finite number.` }
  }
  if (!(sigma.value >= 0)) {
    return { status: 'error', kind: 'domain', message: `Sigma must be ≥ 0 (got ${sigmaText}). Negative uncertainties are refused.` }
  }
  return { status: 'value', value: { value: value.value, sigma: sigma.value } }
}

/** Strict `[(v, σ), …]` grammar for weighted means; each pair faces the same checks. */
export function parseUncertainList(source: string, mode: AngleMode): { status: 'value'; value: Uncertain[] } | { status: 'error'; kind: 'syntax' | 'domain'; message: string } {
  const text = source.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) {
    return { status: 'error', kind: 'syntax', message: 'Weighted data looks like [(10, 0.2), (12, 0.3)] — square brackets, (value, sigma) pairs.' }
  }
  const parts = splitTopLevel(text.slice(1, -1))
  if (parts.length === 1 && parts[0]?.trim() === '') {
    return { status: 'error', kind: 'domain', message: 'Empty dataset: at least one (value, sigma) pair is required.' }
  }
  const items: Uncertain[] = []
  for (const part of parts) {
    const pair = part.trim()
    if (!pair.startsWith('(') || !pair.endsWith(')')) {
      return { status: 'error', kind: 'syntax', message: `Entry "${pair}" is not a (value, sigma) pair.` }
    }
    const cells = splitTopLevel(pair.slice(1, -1))
    if (cells.length !== 2) {
      return { status: 'error', kind: 'syntax', message: `Entry "${pair}" needs exactly two numbers: (value, sigma).` }
    }
    const value = calculate((cells[0] ?? '').trim(), mode)
    const sigma = calculate((cells[1] ?? '').trim(), mode)
    if (value.status !== 'value') {
      return { status: 'error', kind: 'syntax', message: `Value "${(cells[0] ?? '').trim()}" is not a finite number.` }
    }
    if (sigma.status !== 'value') {
      return { status: 'error', kind: 'syntax', message: `Sigma "${(cells[1] ?? '').trim()}" is not a finite number.` }
    }
    if (!(sigma.value > 0)) {
      return { status: 'error', kind: 'domain', message: `Weighted means need every sigma > 0 (got ${sigma.value} at entry ${items.length + 1}); exact (σ = 0) values would take infinite weight.` }
    }
    items.push({ value: value.value, sigma: sigma.value })
  }
  return { status: 'value', value: items }
}

export type PropagationOutcome = { status: 'value'; value: Uncertain; method: string } | { status: 'error'; kind: 'domain'; message: string }

function refuse(message: string): PropagationOutcome {
  return { status: 'error', kind: 'domain', message }
}

/** σ = √(σA² + σB²): uncorrelated addition. */
export function addUncertain(a: Uncertain, b: Uncertain): PropagationOutcome {
  const value = a.value + b.value
  const sigma = Math.hypot(a.sigma, b.sigma)
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Addition overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: 'Uncorrelated first-order propagation: σ = √(σA² + σB²).' }
}

/** σ = √(σA² + σB²): uncorrelated subtraction. */
export function subUncertain(a: Uncertain, b: Uncertain): PropagationOutcome {
  const value = a.value - b.value
  const sigma = Math.hypot(a.sigma, b.sigma)
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Subtraction overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: 'Uncorrelated first-order propagation: σ = √(σA² + σB²).' }
}

/** σ = √((B·σA)² + (A·σB)²): absolute form, exact at zero crossings. */
export function mulUncertain(a: Uncertain, b: Uncertain): PropagationOutcome {
  const value = a.value * b.value
  const sigma = Math.hypot(b.value * a.sigma, a.value * b.sigma)
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Multiplication overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: 'Uncorrelated first-order propagation: σ = √((B·σA)² + (A·σB)²).' }
}

/** σ = √((σA/B)² + (A·σB/B²)²): division; zero divisor refused. */
export function divUncertain(a: Uncertain, b: Uncertain): PropagationOutcome {
  if (b.value === 0) {
    return refuse('Division by a zero value is refused (uncertainty would be unbounded).')
  }
  const value = a.value / b.value
  const sigma = Math.hypot(a.sigma / b.value, (a.value * b.sigma) / (b.value * b.value))
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Division overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: 'Uncorrelated first-order propagation: σ = √((σA/B)² + (A·σB/B²)²).' }
}

/** σ = |k·v^(k−1)|·σv: integer powers exact, fractional powers need v ≥ 0. */
export function powUncertain(base: Uncertain, k: number): PropagationOutcome {
  if (!Number.isFinite(k)) {
    return refuse('The exponent must be finite.')
  }
  if (base.value < 0 && !Number.isInteger(k)) {
    return refuse('Fractional powers of negative values are refused (non-real).')
  }
  if (base.value === 0 && k < 1) {
    return refuse('0^k with k < 1 has an unbounded derivative: refused.')
  }
  const value = base.value ** k
  const sigma = Math.abs(k * base.value ** (k - 1)) * base.sigma
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Power overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: 'First-order propagation: σ = |k·v^(k−1)|·σv; uncorrelated by construction (single input).' }
}

/**
 * Inverse-variance weighted mean: w = 1/σ² (the same convention as
 * Data Lab fit weights), value = Σwx/Σw, σ = 1/√Σw. Independent,
 * correctly-quoted σ assumed — a misquoted sigma misweights silently,
 * so the per-point weights travel in the method note count only.
 */
export function weightedMean(items: Uncertain[]): PropagationOutcome {
  if (items.length === 0) {
    return refuse('Weighted mean needs at least one measurement.')
  }
  let smallest = Infinity
  for (const item of items) {
    if (!(item.sigma > 0) || !Number.isFinite(item.value) || !Number.isFinite(item.sigma)) {
      return refuse('Weighted means need every sigma finite and > 0.')
    }
    smallest = Math.min(smallest, item.sigma)
  }
  // Scale the weights by the smallest σ before squaring: raw w = 1/σ²
  // leaves the double range at extreme sigmas (σ ≈ 1e-160 → w ≈ 1e320
  // overflows; σ ≈ 1e200 → w underflows to 0) even though the mean and
  // its σ are representable. w_i/w_min = (σ_min/σ_i)² ∈ (0, 1], and the
  // invariants give mean = Σt·x/Σt, σ = σ_min/√Σt with Σt ≥ 1.
  let sumT = 0
  let sumTX = 0
  for (const item of items) {
    const ratio = smallest / item.sigma
    const t = ratio * ratio
    sumT += t
    sumTX += t * item.value
  }
  const value = sumTX / sumT
  const sigma = smallest / Math.sqrt(sumT)
  if (!Number.isFinite(value) || !Number.isFinite(sigma)) {
    return refuse('Weighted mean overflowed: rescale the inputs.')
  }
  return { status: 'value', value: { value, sigma }, method: `Inverse-variance weighted mean over ${items.length} independent measurements (w = 1/σ², σ = 1/√Σw).` }
}

/** `value ± sigma` with display formatting (full precision travels in history). */
export function formatUncertain(u: Uncertain): string {
  return `${formatDisplay(u.value)} ± ${formatDisplay(u.sigma)}`
}
