import { calculate, type AngleMode } from './evaluate.ts'
import { formatDisplay } from './format.ts'
import { splitTopLevel } from './linalg.ts'

/**
 * Statistics lane (Stage 3 structured modes): descriptive statistics
 * over a bracketed numeric list, computed natively. Every spread figure
 * names its convention — sample (÷(n−1)) vs population (÷n) — so
 * "standard deviation" is never ambiguous.
 */

export interface StatsSummary {
  readonly n: number
  readonly sum: number
  readonly mean: number
  readonly median: number
  /** All values tied at the highest frequency; empty when every value is unique. */
  readonly modes: number[]
  readonly min: number
  readonly max: number
  readonly range: number
  readonly q1: number
  readonly q3: number
  readonly iqr: number
  readonly popVariance: number
  readonly popStd: number
  readonly sampleVariance: number | null
  readonly sampleStd: number | null
  /** Standard error of the mean (s/√n); null when n < 2. Precision of the mean, never a confidence interval. */
  readonly sem: number | null
  /** Shown alongside the figures: definitions and any caveats. */
  readonly notes: string[]
}

export type StatsOutcome = { status: 'value'; value: StatsSummary } | { status: 'error'; kind: 'syntax' | 'domain'; message: string }

/** Strict `[v1, v2, ...]` grammar; each entry is an engine expression. */
export function parseDataList(source: string, mode: AngleMode): StatsOutcome {
  const values = parseNumberList(source, mode)
  if (values.status !== 'value') {
    return values
  }
  return { status: 'value', value: describe(values.value) }
}

/** Raw finite values under the same strict grammar (paired lists, moving averages). */
export function parseNumberList(source: string, mode: AngleMode): { status: 'value'; value: number[] } | { status: 'error'; kind: 'syntax' | 'domain'; message: string } {
  const text = source.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) {
    return { status: 'error', kind: 'syntax', message: 'Data looks like [2, 4, 4, 5] — square brackets, comma-separated numbers.' }
  }
  const parts = splitTopLevel(text.slice(1, -1))
  if (parts.length === 1 && parts[0]?.trim() === '') {
    return { status: 'error', kind: 'domain', message: 'Empty dataset: at least one value is required.' }
  }
  const values: number[] = []
  for (const part of parts) {
    const outcome = calculate(part.trim(), mode)
    if (outcome.status !== 'value') {
      return { status: 'error', kind: 'syntax', message: `Entry "${part.trim()}" is not a finite number${outcome.status === 'variable' ? ' (variables need values first)' : `: ${outcome.message}`}.` }
    }
    values.push(outcome.value)
  }
  return { status: 'value', value: values }
}

/**
 * Linear-interpolation quantile (method R-7 / numpy default): position
 * h = (n−1)·p over the sorted values, interpolating between neighbours.
 * Documented so quartile figures are reproducible, not conventional fog.
 */
export function quantile(sortedAscending: number[], p: number): number {
  const n = sortedAscending.length
  if (n === 0) {
    return Number.NaN
  }
  if (n === 1 || p <= 0) {
    return sortedAscending[0] ?? Number.NaN
  }
  if (p >= 1) {
    return sortedAscending[n - 1] ?? Number.NaN
  }
  const h = (n - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  const below = sortedAscending[lo] ?? 0
  return below + (h - lo) * ((sortedAscending[hi] ?? below) - below)
}

/**
 * Neumaier compensated summation: plain Σ loses low-order terms to
 * cancellation ([1e16, 1, −1e16] naively sums to 0, not 1) while
 * leaving ordinary sums bit-identical.
 */
function compensatedSum(values: number[], term: (x: number, i: number) => number): number {
  let sum = 0
  let compensation = 0
  for (let i = 0; i < values.length; i += 1) {
    const x = term(values[i] ?? 0, i)
    const t = sum + x
    if (Math.abs(sum) >= Math.abs(x)) {
      compensation += sum - t + x
    } else {
      compensation += x - t + sum
    }
    sum = t
  }
  return sum + compensation
}

export function describe(values: number[]): StatsSummary {
  const sorted = [...values].sort((a, b) => a - b)
  const n = values.length
  const sum = compensatedSum(values, (x) => x)
  const mean = sum / n
  const mid = Math.floor(n / 2)
  const median = n % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  const counts = new Map<number, number>()
  for (const x of values) {
    counts.set(x, (counts.get(x) ?? 0) + 1)
  }
  const top = Math.max(...counts.values())
  const modes = top > 1 ? [...counts.entries()].filter(([, c]) => c === top).map(([x]) => x).sort((a, b) => a - b) : []
  const min = sorted[0] ?? 0
  const max = sorted[n - 1] ?? 0
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const popVariance = compensatedSum(values, (x) => (x - mean) * (x - mean)) / n
  const sampleStd = n >= 2 ? Math.sqrt((popVariance * n) / (n - 1)) : null
  const notes = [
    'σ (population): divides by n — describes this dataset.',
    's (sample): divides by n−1 — estimates a larger population.',
    'SEM = s/√n: precision of the mean under iid sampling — not a confidence interval.',
    'Quartiles use linear interpolation (R-7).',
    modes.length === 0 ? 'No mode: every value appears once.' : `Mode frequency: ${top} observation${top === 1 ? '' : 's'}.`,
  ]
  if (n < 2) {
    notes.push('Single value: sample variance needs n ≥ 2 and is not reported.')
  }
  return {
    n,
    sum,
    mean,
    median,
    modes,
    min,
    max,
    range: max - min,
    q1,
    q3,
    iqr: q3 - q1,
    popVariance,
    popStd: Math.sqrt(popVariance),
    sampleVariance: n >= 2 ? (popVariance * n) / (n - 1) : null,
    sampleStd,
    sem: sampleStd === null ? null : sampleStd / Math.sqrt(n),
    notes,
  }
}

/** One figure per line, each labelled with its convention. */
export function formatStats(summary: StatsSummary): string {  const lines = [
    `n = ${summary.n}, sum = ${formatDisplay(summary.sum)}`,
    `mean = ${formatDisplay(summary.mean)}`,
    `median = ${formatDisplay(summary.median)}`,
    summary.modes.length === 0 ? 'mode: none (all values unique)' : `mode = ${summary.modes.map((m) => formatDisplay(m)).join(', ')}`,
    `min = ${formatDisplay(summary.min)}, max = ${formatDisplay(summary.max)}, range = ${formatDisplay(summary.range)}`,
    `Q1 = ${formatDisplay(summary.q1)}, Q3 = ${formatDisplay(summary.q3)}, IQR = ${formatDisplay(summary.iqr)}`,
    `σ² (population) = ${formatDisplay(summary.popVariance)}, σ = ${formatDisplay(summary.popStd)}`,
  ]
  if (summary.sampleVariance !== null && summary.sampleStd !== null) {
    lines.push(`s² (sample) = ${formatDisplay(summary.sampleVariance)}, s = ${formatDisplay(summary.sampleStd)}`)
  } else {
    lines.push('s (sample): needs n ≥ 2')
  }
  lines.push(summary.sem === null ? 'SEM: needs n ≥ 2' : `SEM (s/√n) = ${formatDisplay(summary.sem)}`)
  return lines.join('\n')
}

export interface PairedSummary {
  readonly n: number
  /** Population covariance (÷n): average co-deviation over these points. */
  readonly popCovariance: number
  /** Sample covariance (÷(n−1)): estimates the population quantity; null when n < 2. */
  readonly sampleCovariance: number | null
  /** Pearson r (dimensionless, in [−1, 1]); null when either column is constant. */
  readonly pearsonR: number | null
  readonly notes: string[]
}

/**
 * Paired covariance and Pearson correlation (requires n ≥ 1 matched
 * finite pairs; the lane enforces this). Assumptions: rows are
 * matched pairs (position, never ключа); both columns finite;
 * denominators follow the same population/sample convention as
 * `describe`. r measures linear association only — a high |r| never
 * implies causation, and the UI states this on every figure.
 */
export function describePaired(xs: number[], ys: number[]): PairedSummary {
  const n = xs.length
  const meanX = compensatedSum(xs, (x) => x) / n
  const meanY = compensatedSum(ys, (y) => y) / n
  const coDev = compensatedSum(xs, (x, i) => (x - meanX) * ((ys[i] ?? 0) - meanY))
  const ssX = compensatedSum(xs, (x) => (x - meanX) * (x - meanX))
  const ssY = compensatedSum(ys, (y) => (y - meanY) * (y - meanY))
  const popCovariance = coDev / n
  const pearsonR = ssX <= 0 || ssY <= 0 ? null : coDev / Math.sqrt(ssX * ssY)
  const notes = [
    'Covariance uses the same ÷n (population) / ÷(n−1) (sample) convention as the descriptive lane.',
    'Pearson r measures linear association in [−1, 1]; it never implies causation.',
  ]
  if (n < 2) {
    notes.push('Single pair: sample covariance is not reported.')
  }
  if (pearsonR === null) {
    notes.push('Constant column: r is undefined (0/0), so no correlation is reported.')
  }
  return {
    n,
    popCovariance,
    sampleCovariance: n >= 2 ? coDev / (n - 1) : null,
    pearsonR,
    notes,
  }
}

/** Paired figures, each labelled with its convention. */
export function formatPaired(summary: PairedSummary): string {
  const lines = [
    `n = ${summary.n} pairs`,
    `cov (population) = ${formatDisplay(summary.popCovariance)}`,
    summary.sampleCovariance === null ? 'cov (sample): needs n ≥ 2' : `cov (sample) = ${formatDisplay(summary.sampleCovariance)}`,
    summary.pearsonR === null ? 'r: undefined (constant column)' : `Pearson r = ${formatDisplay(summary.pearsonR)}`,
  ]
  return lines.join('\n')
}

/**
 * Trailing moving average: output[i] is the mean of the k points
 * ending at i, so output has n−k+1 points and every value is
 * supported by k observations — no padded guesses, no look-ahead.
 * Centered mode needs odd k (an even window has no centre; refused
 * rather than silently off-centred).
 */
export function movingAverage(values: number[], k: number, align: 'trailing' | 'centered'): { status: 'value'; value: number[] } | { status: 'error'; message: string } {
  if (!Number.isInteger(k) || k < 2) {
    return { status: 'error', message: 'Moving averages need an integer window k ≥ 2.' }
  }
  if (k > values.length) {
    return { status: 'error', message: `Window k = ${k} exceeds the ${values.length} observations (full windows only, never padded).` }
  }
  if (align === 'centered' && k % 2 === 0) {
    return { status: 'error', message: 'Centered averages need an odd window (an even window has no centre).' }
  }
  if (!values.every((v) => Number.isFinite(v))) {
    return { status: 'error', message: 'Moving averages need every value finite (missing values are refused, never skipped silently).' }
  }
  const out: number[] = []
  if (align === 'trailing') {
    for (let i = k - 1; i < values.length; i += 1) {
      let sum = 0
      for (let j = i - k + 1; j <= i; j += 1) {
        sum += values[j] ?? 0
      }
      out.push(sum / k)
    }
    return { status: 'value', value: out }
  }
  const half = (k - 1) / 2
  for (let i = half; i + half < values.length; i += 1) {
    let sum = 0
    for (let j = i - half; j <= i + half; j += 1) {
      sum += values[j] ?? 0
    }
    out.push(sum / k)
  }
  return { status: 'value', value: out }
}

/** Parse a second list for paired analysis (same strict grammar as data lists). */
export function parseSecondList(source: string, mode: AngleMode): { status: 'value'; value: number[] } | { status: 'error'; kind: 'syntax' | 'domain'; message: string } {
  const text = source.trim()
  if (text === '') {
    return { status: 'error', kind: 'syntax', message: 'Y list is empty: paired analysis needs both lists.' }
  }
  return parseNumberList(source, mode)
}
