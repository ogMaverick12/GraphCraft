import { describe, expect, it } from 'vitest'
import { approximateFraction, formatDisplay } from './format.ts'

describe('display formatting', () => {
  it('parses scientific notation and displays extremes exponentially', () => {
    expect(formatDisplay(1.25e-6)).toBe('0.00000125')
    expect(formatDisplay(0.000000123456)).toBe('1.23456e-7')
    expect(formatDisplay(1e100)).toBe('1e+100')
    expect(formatDisplay(123456789012345)).toBe('123456789012345')
  })

  it('honours the significant-digits setting without touching the value', () => {
    expect(formatDisplay(2 / 3, 12)).toBe('0.666666666667')
    expect(formatDisplay(2 / 3, 6)).toBe('0.666667')
    expect(formatDisplay(0.1 + 0.2, 6)).toBe('0.3')
    expect(formatDisplay(1 / 3, 99)).toBe(formatDisplay(1 / 3, 12))
  })

  it('round-trips through text within display precision', () => {
    for (const value of [0.1 + 0.2, 2 / 3, Math.sqrt(2), 1e100, 123.456]) {
      const shown = formatDisplay(value, 12)
      const back = Number(shown)
      expect(Math.abs(back - value) / Math.max(1, Math.abs(value))).toBeLessThan(1e-11)
    }
    expect(Number(formatDisplay(0.1 + 0.2, 12))).toBe(0.3)
  })

  it('formats near-zero residues honestly instead of hiding them', () => {
    expect(formatDisplay(4.440892e-16)).toBe('4.440892e-16')
    expect(formatDisplay(0)).toBe('0')
  })
})

describe('fraction approximation for display', () => {
  it('finds canonical fractions for repeating decimals', () => {
    expect(approximateFraction(1 / 3)).toEqual({ p: 1, q: 3 })
    expect(approximateFraction(0.1 + 0.2)).toEqual({ p: 3, q: 10 })
    expect(approximateFraction(2.5)).toEqual({ p: 5, q: 2 })
    expect(approximateFraction(-0.75)).toEqual({ p: -3, q: 4 })
    expect(approximateFraction(Math.PI)).toEqual({ p: 355, q: 113 })
  })

  it('declines integers and misleading magnitudes', () => {
    expect(approximateFraction(5)).toBe(null)
    expect(approximateFraction(0)).toBe(null)
    expect(approximateFraction(1e100)).toBe(null)
    expect(approximateFraction(1e-15)).toBe(null)
    expect(approximateFraction(Number.NaN)).toBe(null)
  })
})
