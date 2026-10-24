import { describe, expect, it } from 'vitest'
import { compileExpression } from '../math/index.ts'
import type { Evaluator } from '../math/index.ts'
import { derivative, tangent } from './derivative.ts'
import { findExtrema } from './extrema.ts'
import { integrate } from './integral.ts'
import { findIntersections } from './intersections.ts'
import { findRoots } from './roots.ts'

function evaluatorFor(source: string): Evaluator {
  const compiled = compileExpression(source)
  if (!compiled.ok) {
    throw new Error(`Cannot test unsamplable expression "${source}"`)
  }
  return compiled.expression
}

function countedEvaluatorFor(source: string): { evaluator: Evaluator; calls: () => number } {
  const expression = evaluatorFor(source)
  let calls = 0
  return {
    evaluator: {
      evaluate: (x, parameters) => {
        calls += 1
        return expression.evaluate(x, parameters)
      },
    },
    calls: () => calls,
  }
}

describe('roots', () => {
  it('finds both roots of x^2 - 4', () => {
    const { roots, evaluations } = findRoots(evaluatorFor('x^2 - 4'), -5, 5, undefined)
    expect(roots.map((r) => r.x).sort((a, b) => a - b)).toHaveLength(2)
    expect(roots[0]?.x).toBeCloseTo(-2, 6)
    expect(roots[1]?.x).toBeCloseTo(2, 6)
    for (const root of roots) {
      expect(root.residual).toBeLessThan(1e-6)
    }
    expect(evaluations).toBeLessThanOrEqual(20000)
  })

  it('recovers the repeated root of x^2 without a sign change', () => {
    const { roots } = findRoots(evaluatorFor('x^2'), -2, 2, undefined)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.x).toBeCloseTo(0, 6)
    expect(['bracket', 'minimum']).toContain(roots[0]?.method)
  })

  it('finds an off-grid even root by minimization', () => {
    // Shifted so no sample lands exactly on the root: minimum method must fire.
    const { roots } = findRoots(evaluatorFor('(x-0.3)^2'), -2, 2, undefined)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.x).toBeCloseTo(0.3, 5)
    expect(roots[0]?.method).toBe('minimum')
  })

  it('rejects pole crossings instead of reporting roots', () => {
    const { roots } = findRoots(evaluatorFor('1/x'), -2, 2, undefined)
    expect(roots).toHaveLength(0)
  })

  it('explains the no-root case', () => {
    const { roots, warnings } = findRoots(evaluatorFor('x^2 + 1'), -5, 5, undefined)
    expect(roots).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('rejects bad ranges', () => {
    expect(findRoots(evaluatorFor('x'), 5, -5, undefined).roots).toHaveLength(0)
  })
})

describe('intersections', () => {
  it('finds x meeting x^2 at 0 and 1', () => {
    const { points } = findIntersections(evaluatorFor('x'), evaluatorFor('x^2'), -2, 2, undefined)
    expect(points.map((p) => p.x).sort((a, b) => a - b)).toHaveLength(2)
    expect(points[0]?.x).toBeCloseTo(0, 5)
    expect(points[0]?.y).toBeCloseTo(0, 5)
    expect(points[1]?.x).toBeCloseTo(1, 5)
    expect(points[1]?.y).toBeCloseTo(1, 5)
  })
})

describe('extrema', () => {
  it('finds the maximum of -x^2 and the extrema of x^3 - 3x', () => {
    const single = findExtrema(evaluatorFor('-x^2'), -2, 2, undefined)
    expect(single.extrema).toHaveLength(1)
    expect(single.extrema[0]).toMatchObject({ kind: 'maximum' })
    expect(single.extrema[0]?.x).toBeCloseTo(0, 5)

    const cubic = findExtrema(evaluatorFor('x^3 - 3*x'), -3, 3, undefined)
    const kinds = cubic.extrema.map((e) => e.kind).sort()
    expect(kinds).toEqual(['maximum', 'minimum'])
    const minimum = cubic.extrema.find((e) => e.kind === 'minimum')
    const maximum = cubic.extrema.find((e) => e.kind === 'maximum')
    expect(minimum?.x).toBeCloseTo(1, 4)
    expect(maximum?.x).toBeCloseTo(-1, 4)
  })
})

describe('derivative and tangent', () => {
  it('estimates d/dx x^2 at x=2 as 4 with a policy attached', () => {
    const result = derivative(evaluatorFor('x^2'), 2, undefined)
    expect(result.value).not.toBe(null)
    if (result.value !== null) {
      expect(result.value).toBeCloseTo(4, 6)
    }
    expect(result.method).toBe('central-difference')
    expect(result.step).toBeGreaterThan(0)
    expect(result.errorEstimate).not.toBe(null)
  })

  it('flags the cusp of abs(x) at 0', () => {
    const result = derivative(evaluatorFor('abs(x)'), 0, undefined)
    expect(result.warnings.some((w) => w.match(/cusp/))).toBe(true)
  })

  it('refuses a derivative at the undefined point of 1/x instead of a huge finite value (B6)', () => {
    const result = derivative(evaluatorFor('1/x'), 0, undefined)
    expect(result.value).toBe(null)
    expect(result.errorEstimate).toBe(null)
    expect(result.warnings.join(' ')).toMatch(/undefined or non-finite/)
    expect(result.warnings.join(' ')).toMatch(/not established/)
  })

  it('refuses a derivative where the target value is a gap or non-finite (1/x^2 and sin(x)/x at 0)', () => {
    const evenPole = derivative(evaluatorFor('1/x^2'), 0, undefined)
    expect(evenPole.value).toBe(null)
    expect(evenPole.warnings.length).toBeGreaterThan(0)

    const removable = derivative(evaluatorFor('sin(x)/x'), 0, undefined)
    expect(removable.value).toBe(null)
    expect(removable.warnings.length).toBeGreaterThan(0)
  })

  it('keeps ordinary derivatives and valid points of singular functions (x^2 at 3; 1/x at 2)', () => {
    const quadratic = derivative(evaluatorFor('x^2'), 3, undefined)
    expect(quadratic.value).not.toBe(null)
    if (quadratic.value !== null) {
      expect(quadratic.value).toBeCloseTo(6, 6)
    }
    expect(quadratic.warnings).toHaveLength(0)

    const hyperbola = derivative(evaluatorFor('1/x'), 2, undefined)
    expect(hyperbola.value).not.toBe(null)
    if (hyperbola.value !== null) {
      expect(hyperbola.value).toBeCloseTo(-0.25, 6)
    }
    expect(hyperbola.warnings).toHaveLength(0)
  })

  it('keeps the one-sided domain-edge case honest (sqrt at 0 needs both sides)', () => {
    const result = derivative(evaluatorFor('sqrt(x)'), 0, undefined)
    expect(result.value).toBe(null)
    expect(result.warnings.join(' ')).toMatch(/both sides/)
  })

  it('draws no tangent at the pole of 1/x (the refusal reaches the caller)', () => {
    const { tangent: line, warnings } = tangent(evaluatorFor('1/x'), 0, undefined)
    expect(line).toBe(null)
    expect(warnings.join(' ')).toMatch(/not established/)
  })

  it('builds the tangent to x^2 at x=2', () => {
    const { tangent: line, warnings } = tangent(evaluatorFor('x^2'), 2, undefined)
    expect(warnings).toHaveLength(0)
    if (line === null) {
      throw new Error('Expected a tangent')
    }
    expect(line.slope).toBeCloseTo(4, 6)
    expect(line.y0).toBeCloseTo(4, 9)
    expect(line.at(3)).toBeCloseTo(8, 6)
  })
})

describe('integral', () => {
  it('integrates x over [0, 2] as exactly 2', () => {
    const result = integrate(evaluatorFor('x'), 0, 2, undefined)
    expect(result.converged).toBe(true)
    expect(result.value).toBeCloseTo(2, 8)
    expect(result.skippedFraction).toBe(0)
    expect(result.method).toBe('adaptive-simpson')
    expect(result.warnings).toHaveLength(0)
  })

  it('blames the evaluation budget only when the budget is exhausted', () => {
    const { evaluator, calls } = countedEvaluatorFor('sin(1000*x)')
    const result = integrate(evaluator, 0, 1, undefined, 1e-9, { maxEvaluations: 25 })
    expect(result.converged).toBe(false)
    expect(calls()).toBeGreaterThanOrEqual(25)
    expect(calls()).toBeLessThan(50000)
    expect(result.errorEstimate).toBe(Number.POSITIVE_INFINITY)
    const text = result.warnings.join(' ')
    expect(text).toMatch(/evaluation budget/)
    expect(text).not.toMatch(/refinement depth/)
  })

  it('reports the refinement-depth limit instead of blaming the budget', () => {
    const { evaluator, calls } = countedEvaluatorFor('sin(1000*x)')
    const result = integrate(evaluator, 0, 1, undefined)
    expect(result.converged).toBe(false)
    expect(calls()).toBeGreaterThan(40000)
    expect(calls()).toBeLessThan(50000)
    expect(Number.isFinite(result.value)).toBe(true)
    expect(Number.isFinite(result.errorEstimate)).toBe(true)
    const text = result.warnings.join(' ')
    expect(text).toMatch(/refinement depth/)
    expect(text).not.toMatch(/evaluation budget/)
  })

  it('integrates sqrt(x) over [-1, 2] skipping the invalid part', () => {
    const result = integrate(evaluatorFor('sqrt(x)'), -1, 2, undefined)
    // Singularity at 0 limits precision; the estimate stays honest about it.
    expect(result.value).toBeCloseTo((2 / 3) * Math.pow(2, 1.5), 4)
    expect(result.skippedFraction).toBeGreaterThan(0)
    expect(result.skippedFraction).toBe(0.33349609375)
    expect(result.converged).toBe(false)
    expect(result.warnings.some((w) => w.match(/skipped/))).toBe(true)
    expect(result.warnings.join(' ')).toContain('33.3% of the interval was invalid and skipped')
    expect(result.warnings.join(' ')).toMatch(/refinement depth/)
    expect(result.warnings.join(' ')).not.toMatch(/evaluation budget/)
  })

  it('keeps a tiny positive skipped fraction exact and labels it <0.1% (B5)', () => {
    const result = integrate(evaluatorFor('sqrt(x)'), -0.000001, 1, undefined)
    expect(result.skippedFraction).toBe(0.000244140625)
    expect(result.value).toBeCloseTo(0.6666641387029841, 12)
    const text = result.warnings.join(' ')
    expect(text).toContain('<0.1% of the interval was invalid and skipped')
    expect(text).not.toContain('0.0% of the interval')
    expect(text).toMatch(/refinement depth/)
  })

  it('keeps budget and skip diagnostics separate when both occur', () => {
    const result = integrate(evaluatorFor('sqrt(x)'), -1, 2, undefined, 1e-9, { maxEvaluations: 25 })
    expect(result.skippedFraction).toBe(0.5)
    const text = result.warnings.join(' ')
    expect(text).toMatch(/evaluation budget/)
    expect(text).not.toMatch(/refinement depth/)
    expect(text).toContain('50.0% of the interval was invalid and skipped')
  })

  it('reports non-convergence for 1/x across its pole', () => {
    const result = integrate(evaluatorFor('1/x'), -1, 1, undefined)
    expect(result.converged).toBe(false)
  })

  it('rejects bad bounds and tolerances', () => {
    expect(integrate(evaluatorFor('x'), 2, 1, undefined).converged).toBe(false)
    expect(integrate(evaluatorFor('x'), 0, 1, undefined, 0).converged).toBe(false)
  })
})

describe('reference values: closed-form checks (transcendental and cubic)', () => {
  it('differentiates sin at 0 and exp at 1 against closed forms', () => {
    const sinAt0 = derivative(evaluatorFor('sin(x)'), 0, undefined)
    expect(sinAt0.value).not.toBe(null)
    if (sinAt0.value !== null) {
      expect(sinAt0.value).toBeCloseTo(1, 8) // cos(0)
    }
    const expAt1 = derivative(evaluatorFor('exp(x)'), 1, undefined)
    expect(expAt1.value).not.toBe(null)
    if (expAt1.value !== null) {
      expect(expAt1.value).toBeCloseTo(Math.E, 6) // e^1
    }
  })

  it('finds sin roots 0/π/2π and its extrema at π/2 and 3π/2', () => {
    const { roots } = findRoots(evaluatorFor('sin(x)'), 0, 2 * Math.PI, undefined)
    const xs = roots.map((root) => root.x)
    expect(xs).toHaveLength(3)
    expect(xs[0]).toBeCloseTo(0, 8)
    expect(xs[1]).toBeCloseTo(Math.PI, 6)
    expect(xs[2]).toBeCloseTo(2 * Math.PI, 6)
    for (const root of roots) {
      expect(root.residual).toBeLessThan(1e-6)
    }

    const { extrema } = findExtrema(evaluatorFor('sin(x)'), 0, 2 * Math.PI, undefined)
    expect(extrema).toHaveLength(2)
    const maximum = extrema.find((e) => e.kind === 'maximum')
    const minimum = extrema.find((e) => e.kind === 'minimum')
    expect(maximum?.x).toBeCloseTo(Math.PI / 2, 6)
    expect(maximum?.y).toBeCloseTo(1, 9)
    expect(minimum?.x).toBeCloseTo((3 * Math.PI) / 2, 6)
    expect(minimum?.y).toBeCloseTo(-1, 9)
  })

  it('recovers boundary roots without an interior sign change (cos at −π/2)', () => {
    const { roots } = findRoots(evaluatorFor('cos(x)'), -Math.PI / 2, 2, undefined)
    const xs = roots.map((root) => root.x)
    expect(xs).toHaveLength(2)
    expect(xs[0]).toBeCloseTo(-Math.PI / 2, 6)
    expect(xs[1]).toBeCloseTo(Math.PI / 2, 6)
    for (const root of roots) {
      expect(root.residual).toBeLessThan(1e-6)
    }
  })

  it('integrates sin over [0, π] as 2 and x^3 over [0, 2] as 4 (Simpson-exact cubic)', () => {
    const sine = integrate(evaluatorFor('sin(x)'), 0, Math.PI, undefined)
    expect(sine.converged).toBe(true)
    expect(sine.value).toBeCloseTo(2, 8)

    const cubic = integrate(evaluatorFor('x^3'), 0, 2, undefined)
    expect(cubic.converged).toBe(true)
    expect(cubic.value).toBeCloseTo(4, 8)
  })
})

describe('roots: steep and cusp cases (audit S7.2 item 4)', () => {
  it('reports every resolvable steep root (sin(10*x): 63 of 63)', () => {
    const { roots, warnings } = findRoots(evaluatorFor('sin(10*x)'), -10, 10, undefined)
    expect(warnings).toHaveLength(0)
    const xs = roots.map((root) => root.x).sort((a, b) => a - b)
    expect(xs).toHaveLength(63)
    for (let index = 0; index < xs.length; index += 1) {
      expect(xs[index]).toBeCloseTo(((index - 31) * Math.PI) / 10, 6)
    }
  })

  it('finds cusp (linear-contact) roots off the sample grid (abs(sin(2*x)): 13 of 13)', () => {
    const { roots, warnings } = findRoots(evaluatorFor('abs(sin(2*x))'), -10, 10, undefined)
    expect(warnings).toHaveLength(0)
    const xs = roots.map((root) => root.x).sort((a, b) => a - b)
    expect(xs).toHaveLength(13)
    for (let index = 0; index < xs.length; index += 1) {
      expect(xs[index]).toBeCloseTo(((index - 6) * Math.PI) / 2, 6)
    }
  })

  it('resolves a steep root the fixed absolute tolerance dropped (sin(1/x) at 1/π)', () => {
    const { roots } = findRoots(evaluatorFor('sin(1/x)'), 0.2, 1, undefined)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.x).toBeCloseTo(1 / Math.PI, 6)
    expect(roots[0]?.residual).toBeLessThan(1e-6)
  })

  it('warns honestly when bracketed sign changes do not resolve (sin(100*x))', () => {
    const { roots, warnings } = findRoots(evaluatorFor('sin(100*x)'), -10, 10, undefined)
    expect(roots.length).toBeGreaterThan(0)
    expect(roots.length).toBeLessThan(637)
    expect(warnings.join(' ')).toMatch(/did not resolve/)
  })
})
