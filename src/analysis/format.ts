/**
 * Compact number formatting for analysis display (Stage 2): six
 * significant digits, so listed estimates never imply exactness.
 * Shared by the analysis panel, graph labels, and export legends.
 */
export function shortNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  const rounded = Number(value.toPrecision(6))
  return String(rounded)
}

/**
 * Skipped fraction (0..1) as a percentage at the established 0.1%
 * precision. A positive fraction that would print as "0.0%" becomes
 * "<0.1%" instead of falsely reading as none; exactly zero returns null
 * so callers omit the label. The fraction itself is never rounded.
 */
export function formatSkippedPercent(fraction: number): string | null {
  if (!(fraction > 0)) {
    return null
  }
  const percent = (fraction * 100).toFixed(1)
  return percent === '0.0' ? '<0.1%' : `${percent}%`
}
