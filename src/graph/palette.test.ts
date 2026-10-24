import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURVE_STYLE_COUNT, LIGHT_CURVE_HEX, curveStyle, lightCurveHex } from './palette.ts'

/**
 * Parity guard for the export palette: exported figures bake concrete
 * hexes (no CSS variables resolve in a standalone file or canvas), so
 * the table must stay identical to the light-theme `--gc-curve-*`
 * tokens in `src/index.css`. The dark theme block appears later in the
 * file; the first occurrence per token is the light theme.
 */
const css = readFileSync(join(import.meta.dirname, '..', 'index.css'), 'utf8')

function lightCurveTokens(): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const found of css.matchAll(/--gc-curve-(\d):\s*(#[0-9a-f]{6})\b/gi)) {
    const name = found[1] ?? ''
    if (!tokens.has(name)) {
      tokens.set(name, (found[2] ?? '').toLowerCase())
    }
  }
  return tokens
}

describe('export palette parity', () => {
  it('keeps the light hex table identical to the CSS variables', () => {
    const tokens = lightCurveTokens()
    for (let slot = 1; slot <= CURVE_STYLE_COUNT; slot += 1) {
      expect(LIGHT_CURVE_HEX[slot - 1], `--gc-curve-${slot}`).toBe(tokens.get(String(slot)))
    }
  })

  it('cycles slots for any style index and never returns a variable for exports', () => {
    expect(lightCurveHex(CURVE_STYLE_COUNT)).toBe(LIGHT_CURVE_HEX[0])
    expect(lightCurveHex(-1)).toBe(LIGHT_CURVE_HEX[CURVE_STYLE_COUNT - 1])
    expect(curveStyle(CURVE_STYLE_COUNT).color).toBe('var(--gc-curve-1)')
  })
})
