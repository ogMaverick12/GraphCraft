import { describe, expect, it } from 'vitest'
import { compilePiecewise, type PiecewiseBranch } from './piecewise.ts'

function branches(sources: Array<[string, number, string]>): PiecewiseBranch[] {
  const ops = { '<': 'lt', '≤': 'le', '>': 'gt', '≥': 'ge' } as const
  return sources.map(([op, value, source]) => ({
    condition: { op: ops[op as '<' | '≤' | '>' | '≥'], value },
    source,
  }))
}

describe('piecewise: first-match semantics', () => {
  it('uses the first matching branch in order', () => {
    const result = compilePiecewise(branches([['<', 0, 'x^2'], ['<', 10, 'x + 100']]), 'x')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected compilation')
    }
    expect(result.piecewise.evaluate(-3)).toEqual({ kind: 'value', value: 9 })
    // Overlapping: 5 matches both branches; the first wins.
    expect(result.piecewise.evaluate(5)).toEqual({ kind: 'value', value: 105 })
    expect(result.piecewise.evaluate(50)).toEqual({ kind: 'value', value: 50 })
  })

  it('leaves honest gaps with no default', () => {
    const result = compilePiecewise(branches([['<', 0, '0']]), '')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected compilation')
    }
    expect(result.piecewise.evaluate(-2)).toEqual({ kind: 'value', value: 0 })
    expect(result.piecewise.evaluate(2).kind).toBe('domain-error')
  })

  it('exposes branch boundaries for the sampler', () => {
    const result = compilePiecewise(branches([['<', 0, '-x'], ['≥', 0, 'x']]), '0')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.piecewise.breakpoints).toEqual([0])
    }
  })

  it('models abs(x) piecewise with a tight joint', () => {
    const result = compilePiecewise(branches([['<', 0, '-x']]), 'x')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected compilation')
    }
    for (const x of [-2, -0.001, 0, 0.001, 2]) {
      expect(result.piecewise.evaluate(x)).toEqual({ kind: 'value', value: Math.abs(x) })
    }
  })
})

describe('piecewise: validation', () => {
  it('names the failing branch', () => {
    const result = compilePiecewise(branches([['<', 0, 'x^2'], ['<', 5, 'x+']]), '0')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toMatch(/Branch 2/)
    }
  })

  it('rejects empty definitions and non-finite conditions', () => {
    expect(compilePiecewise([], '').ok).toBe(false)
    expect(compilePiecewise([{ condition: { op: 'lt', value: Number.NaN }, source: 'x' }], '0').ok).toBe(false)
    expect(compilePiecewise([{ condition: { op: 'lt', value: 0 }, source: 'window.x' }], '0').ok).toBe(false)
  })

  it('caps the branch count', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ condition: { op: 'lt' as const, value: i }, source: 'x' }))
    const result = compilePiecewise(many, '0')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('limit')
    }
  })
})
