/**
 * Curve styles (GS-03): distinct, theme-aware colours plus distinct dash
 * patterns, so colour is never the only distinguisher. Colours resolve
 * through CSS variables (`--gc-curve-*`) defined in `src/index.css` for
 * both themes; dashes are baked per curve index.
 */

export interface CurveStyle {
  /** CSS variable reference, e.g. `var(--gc-curve-1)`. */
  readonly color: string
  /** SVG stroke-dasharray string; empty means solid. */
  readonly dash: string
  readonly width: number
}

const DASHES = ['', '7 4', '2 3', '9 3 2 3', '7 4 2 4', '2 2']

export const CURVE_STYLE_COUNT = 6

/**
 * Concrete light-theme hex values, mirroring `--gc-curve-*` in
 * `src/index.css`. Used where CSS variables cannot resolve (exported
 * files, canvas). Keep the two in sync; the palette test asserts parity.
 */
export const LIGHT_CURVE_HEX = ['#1d4ed8', '#b91c1c', '#047857', '#7e22ce', '#c2410c', '#0e7490']

export function curveStyle(index: number): CurveStyle {
  const slot = ((index % CURVE_STYLE_COUNT) + CURVE_STYLE_COUNT) % CURVE_STYLE_COUNT
  return { color: `var(--gc-curve-${slot + 1})`, dash: DASHES[slot] ?? '', width: 2 }
}

/** Fixed light-theme curve colour: exported figures use one predictable theme. */
export function lightCurveHex(index: number): string {
  const slot = ((index % CURVE_STYLE_COUNT) + CURVE_STYLE_COUNT) % CURVE_STYLE_COUNT
  return LIGHT_CURVE_HEX[slot] ?? '#1d4ed8'
}
