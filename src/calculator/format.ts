/**
 * Calculator display policy (Stage 3 CALC-01, extended S3.4): standard
 * IEEE-754 doubles, formatted for reading without implying arbitrary
 * precision. The internal numeric value is always preserved separately
 * (history stores the number); this formats a display string only,
 * never rounded back into state.
 *
 * - Integers with |v| < 1e15 print exactly (all are exactly representable).
 * - Non-zero values with |v| >= 1e12 or |v| < 1e-6 print exponential
 *   with 6 fractional digits (e.g. 1.2e+12).
 * - Everything else prints up to `digits` significant digits (default
 *   12, user-selectable 6–12), trailing zeros stripped (0.1+0.2 shows
 *   "0.3" at any setting; the stored value keeps all 17 digits).
 */

export function formatDisplay(value: number, digits = 12): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return String(value)
  }
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
    const raw = value.toExponential(6)
    const sep = raw.indexOf('e')
    return `${String(Number(raw.slice(0, sep)))}e${raw.slice(sep + 1)}`
  }
  const precision = [6, 8, 10, 12].includes(digits) ? digits : 12
  return Number(value.toPrecision(precision)).toString()
}

/**
 * Nearest simple fraction for display ONLY (S3.4): continued fractions
 * capped at denominator 1000. Returns null for integers and for
 * magnitudes where a fraction would mislead (|v| ≥ 1e9 or < 1e-12).
 * Callers must label results with ≈ — this is an approximation, unlike
 * the exact rational lane, which prints bare p/q.
 */
export function approximateFraction(value: number, maxDenominator = 1000): { p: number; q: number } | null {
  if (!Number.isFinite(value) || Number.isInteger(value)) {
    return null
  }
  const abs = Math.abs(value)
  if (abs >= 1e9 || abs < 1e-12) {
    return null
  }
  let best = { p: Math.round(abs), q: 1 }
  let hPrev2 = 0
  let hPrev1 = 1
  let kPrev2 = 1
  let kPrev1 = 0
  let x = abs
  for (let i = 0; i < 64; i += 1) {
    const a = Math.floor(x)
    const h = a * hPrev1 + hPrev2
    const k = a * kPrev1 + kPrev2
    if (k > maxDenominator) {
      break
    }
    best = { p: h, q: k }
    hPrev2 = hPrev1
    hPrev1 = h
    kPrev2 = kPrev1
    kPrev1 = k
    const remainder = x - a
    if (remainder < 1e-12) {
      break
    }
    x = 1 / remainder
  }
  const sign = value < 0 ? -1 : 1
  return { p: sign * best.p, q: best.q }
}

/** Full-precision round-trip text for sending a result to the graph. */
export function formatExact(value: number): string {
  return String(value)
}
