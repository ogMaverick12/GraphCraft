import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Token contrast guard (dependency-free CI check).
 *
 * Encodes the `docs/S1-BRIEF.md` bars against the shipped palettes:
 * text ≥4.8:1 on every text surface, chart curves ≥4.9:1 on the plot
 * surface, focus ring ≥3:1, white label text ≥4.8:1 on filled accent
 * buttons, and axis rules ≥3:1 on chart surfaces (WCAG 1.4.11 — axes
 * were treated as decorative until the S7.4 pass measured them at
 * 2.29–2.52:1 and the tokens were darkened/lightened to clear the bar).
 * Decorative grid lines stay unasserted: axis values are carried by the
 * tick labels, and the grid is intentionally subtle. The 2026-10-17
 * audits measured the same pairs from composited rendered pixels in a
 * real browser; this test keeps the tokens honest between browser
 * passes.
 */

const css = readFileSync(join(import.meta.dirname, '..', 'index.css'), 'utf8')

function tokenBlock(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  if (match === null) {
    throw new Error(`token block not found in index.css: ${selector}`)
  }
  const tokens: Record<string, string> = {}
  for (const found of match[1].matchAll(/--gc-([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    tokens[found[1]] = found[2].toLowerCase()
  }
  return tokens
}

function channelToLinear(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => channelToLinear(parseInt(hex.slice(index, index + 2), 16)))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT_TOKENS = ['ink', 'ink-soft', 'muted', 'danger', 'warning', 'success'] as const
const TEXT_SURFACES = ['bg', 'surface', 'elevated'] as const
const WHITE = '#ffffff'

const themes: Record<string, Record<string, string>> = {
  light: tokenBlock(':root'),
  dark: tokenBlock('.dark'),
}

describe('palette contrast (shipped tokens)', () => {
  for (const [themeName, tokens] of Object.entries(themes)) {
    it(`${themeName}: text tokens hold the >=4.8:1 brief bar on every text surface`, () => {
      for (const token of TEXT_TOKENS) {
        for (const surface of TEXT_SURFACES) {
          const ratio = contrast(tokens[token], tokens[surface])
          expect(ratio, `${token} on ${surface}`).toBeGreaterThanOrEqual(4.8)
        }
      }
    })

    it(`${themeName}: curves hold the >=4.9:1 brief bar on the plot surface`, () => {
      for (let index = 1; index <= 6; index++) {
        const ratio = contrast(tokens[`curve-${index}`], tokens.surface)
        expect(ratio, `curve-${index} on surface`).toBeGreaterThanOrEqual(4.9)
      }
    })

    it(`${themeName}: axis rules are >=3:1 on chart surfaces (WCAG 1.4.11)`, () => {
      for (const surface of ['bg', 'surface'] as const) {
        const ratio = contrast(tokens.axis, tokens[surface])
        expect(ratio, `axis on ${surface}`).toBeGreaterThanOrEqual(3)
      }
    })

    it(`${themeName}: focus ring is >=3:1 on the app background`, () => {
      expect(contrast(tokens.ring, tokens.bg)).toBeGreaterThanOrEqual(3)
    })

    it(`${themeName}: white label text on filled accent buttons is >=4.8:1`, () => {
      expect(contrast(WHITE, tokens.accent)).toBeGreaterThanOrEqual(4.8)
      expect(contrast(WHITE, tokens['accent-strong'])).toBeGreaterThanOrEqual(4.8)
    })
  }
})
