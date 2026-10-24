import { describe, expect, it } from 'vitest'
import {
  addUncertain,
  divUncertain,
  formatUncertain,
  mulUncertain,
  parseUncertain,
  parseUncertainList,
  powUncertain,
  subUncertain,
  weightedMean,
} from './uncertainty.ts'
import { describe as describeStats } from './stats.ts'

function value(text: string): { value: number; sigma: number } {
  const parsed = parseUncertain(text, 'radians')
  if (parsed.status !== 'value') {
    throw new Error(`Expected a quantity: ${parsed.message}`)
  }
  return parsed.value
}

describe('uncertain parsing', () => {
  it('accepts ±, +/-, and +- grammars with engine expressions', () => {
    expect(value('10 ± 0.2')).toEqual({ value: 10, sigma: 0.2 })
    expect(value('2*3 +/- 0.1')).toEqual({ value: 6, sigma: 0.1 })
    expect(value('1 +- 0')).toEqual({ value: 1, sigma: 0 })
  })

  it('refuses missing parts and negative sigmas', () => {
    expect(parseUncertain('10', 'radians').status).toBe('error')
    expect(parseUncertain('10 ±', 'radians').status).toBe('error')
    expect(parseUncertain('10 ± -0.2', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(parseUncertain('oops ± 0.1', 'radians').status).toBe('error')
  })

  it('parses weighted lists and refuses non-positive sigmas by index', () => {
    const list = parseUncertainList('[(10, 0.2), (12, 0.3)]', 'radians')
    expect(list.status).toBe('value')
    expect(parseUncertainList('[(10, 0)]', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(parseUncertainList('[10, 0.2]', 'radians').status).toBe('error')
    expect(parseUncertainList('[]', 'radians').status).toBe('error')
  })
})

describe('first-order propagation against hand references', () => {
  it('adds and subtracts in quadrature', () => {
    const sum = addUncertain(value('10 ± 0.2'), value('5 ± 0.1'))
    expect(sum.status).toBe('value')
    if (sum.status === 'value') {
      expect(sum.value.value).toBeCloseTo(15, 12)
      expect(sum.value.sigma).toBeCloseTo(Math.sqrt(0.04 + 0.01), 12)
      expect(sum.method).toMatch(/√\(σA² \+ σB²\)/)
    }
    const diff = subUncertain(value('10 ± 0.2'), value('5 ± 0.1'))
    if (diff.status === 'value') {
      expect(diff.value.value).toBeCloseTo(5, 12)
      expect(diff.value.sigma).toBeCloseTo(Math.sqrt(0.04 + 0.01), 12)
    }
  })

  it('multiplies with the absolute form (exact at zero)', () => {
    const product = mulUncertain(value('10 ± 0.2'), value('5 ± 0.1'))
    if (product.status === 'value') {
      expect(product.value.value).toBeCloseTo(50, 12)
      expect(product.value.sigma).toBeCloseTo(Math.hypot(5 * 0.2, 10 * 0.1), 12)
    } else {
      throw new Error('expected a product')
    }
    // Zero crossing stays finite where the relative form would divide by zero.
    const zeroed = mulUncertain(value('0 ± 0.2'), value('5 ± 0.1'))
    if (zeroed.status === 'value') {
      expect(zeroed.value.sigma).toBeCloseTo(1, 12)
    } else {
      throw new Error('expected a finite zero-crossing product')
    }
  })

  it('divides and refuses zero divisors', () => {
    const quotient = divUncertain(value('10 ± 0.2'), value('5 ± 0.1'))
    if (quotient.status === 'value') {
      expect(quotient.value.value).toBeCloseTo(2, 12)
      expect(quotient.value.sigma).toBeCloseTo(Math.hypot(0.2 / 5, (10 * 0.1) / 25), 12)
    } else {
      throw new Error('expected a quotient')
    }
    expect(divUncertain(value('1 ± 0.1'), value('0 ± 0'))).toMatchObject({ status: 'error' })
  })

  it('powers with domain refusals', () => {
    const squared = powUncertain(value('3 ± 0.1'), 2)
    if (squared.status === 'value') {
      expect(squared.value.value).toBeCloseTo(9, 12)
      expect(squared.value.sigma).toBeCloseTo(0.6, 12)
    } else {
      throw new Error('expected a square')
    }
    expect(powUncertain(value('-2 ± 0.1'), 0.5).status).toBe('error')
    expect(powUncertain(value('0 ± 0.1'), 0.5).status).toBe('error')
  })

  it('computes inverse-variance weighted means', () => {
    // w = 25, 100/9 ≈ 11.11 → mean ≈ 10.615, σ = 1/√36.11 ≈ 0.1664.
    const mean = weightedMean([value('10 ± 0.2'), value('12 ± 0.3')])
    if (mean.status === 'value') {
      expect(mean.value.value).toBeCloseTo(10.6153846154, 6)
      expect(mean.value.sigma).toBeCloseTo(0.1664100588, 6)
      expect(mean.method).toMatch(/w = 1\/σ²/)
    } else {
      throw new Error('expected a weighted mean')
    }
    expect(weightedMean([]).status).toBe('error')
  })

  it('keeps weighted means representable at extreme sigmas (scaled weights)', () => {
    // σ ≈ 1e-160: raw w = 1/σ² ≈ 1e320 → Infinity pre-fix (spurious refusal).
    const tiny = weightedMean([value('10 ± 1e-160'), value('12 ± 1e-160')])
    expect(tiny.status).toBe('value')
    if (tiny.status === 'value') {
      expect(tiny.value.value).toBeCloseTo(11, 9)
      expect(tiny.value.sigma / (1e-160 / Math.SQRT2)).toBeCloseTo(1, 6)
    }
    // σ = 1e200: raw w underflows to 0 → Σw = 0 → 0/0 refusal pre-fix.
    const huge = weightedMean([value('10 ± 1e200'), value('12 ± 1e200')])
    expect(huge.status).toBe('value')
    if (huge.status === 'value') {
      expect(huge.value.value).toBeCloseTo(11, 9)
      expect(huge.value.sigma / (1e200 / Math.SQRT2)).toBeCloseTo(1, 6)
    }
  })

  it('formats with display precision', () => {
    expect(formatUncertain({ value: 15, sigma: Math.sqrt(0.05) })).toContain('±')
  })
})

describe('standard error of the mean', () => {
  it('reports s/√n with an iid caveat, null when n < 2', () => {
    const summary = describeStats([2, 4, 4, 4, 5, 5, 7, 9])
    // σ = 2 (population fixture); s = 2√(8/7), so SEM = s/√8 = 2/√7.
    expect(summary.sem).toBeCloseTo(2 / Math.sqrt(7), 9)
    expect(summary.notes.some((note) => note.includes('not a confidence interval'))).toBe(true)
    expect(describeStats([5]).sem).toBe(null)
  })
})
