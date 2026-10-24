import { describe, expect, it } from 'vitest'
import { compileExpression, isValidParameterName, MAX_EXPRESSION_LENGTH, MAX_EXPRESSION_NODES } from './engine.ts'
import type { CompiledExpression } from './types.ts'

function mustCompile(source: string): CompiledExpression {
  const result = compileExpression(source)
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Expected "${source}" to compile: ${result.error.message}`)
  }
  return result.expression
}

function valueAt(source: string, x: number): number {
  const result = mustCompile(source).evaluate(x)
  expect(result.kind).toBe('value')
  if (result.kind !== 'value') {
    throw new Error(`Expected a value for "${source}" at x=${x}`)
  }
  return result.value
}

describe('math engine: correct results', () => {
  it('evaluates x^2', () => {
    expect(valueAt('x^2', 3)).toBe(9)
    expect(valueAt('x^2', -2)).toBe(4)
    expect(valueAt('x^2', 0)).toBe(0)
  })

  it('evaluates 2*x+1', () => {
    expect(valueAt('2*x+1', 0)).toBe(1)
    expect(valueAt('2*x+1', 4)).toBe(9)
  })

  it('evaluates sin(pi/2) and documents radian convention', () => {
    expect(valueAt('sin(pi/2)', 0)).toBeCloseTo(1, 12)
    expect(valueAt('sin(0)', 99)).toBeCloseTo(0, 12)
    expect(valueAt('cos(0)', 0)).toBeCloseTo(1, 12)
  })

  it('evaluates sqrt, abs, exp, ln, log with documented conventions', () => {
    expect(valueAt('sqrt(x)', 16)).toBe(4)
    expect(valueAt('abs(x)', -5)).toBe(5)
    expect(valueAt('exp(0)', 0)).toBe(1)
    expect(valueAt('ln(e)', 0)).toBeCloseTo(1, 12)
    expect(valueAt('log(100)', 0)).toBeCloseTo(2, 12) // log is base-10
    expect(valueAt('floor(2.9)', 0)).toBe(2)
    expect(valueAt('ceil(2.1)', 0)).toBe(3)
  })

  it('evaluates hyperbolic functions in radians', () => {
    expect(valueAt('sinh(0)', 0)).toBe(0)
    expect(valueAt('cosh(0)', 0)).toBe(1)
    expect(valueAt('tanh(0)', 0)).toBe(0)
    expect(valueAt('sinh(1)', 0)).toBeCloseTo(Math.sinh(1), 12)
    expect(valueAt('cosh(1)', 0)).toBeCloseTo(Math.cosh(1), 12)
    expect(valueAt('tanh(1)', 0)).toBeCloseTo(Math.tanh(1), 12)
  })

  it('keeps tan, inverse trig, and unary plus available', () => {
    expect(valueAt('tan(0)', 0)).toBe(0)
    expect(valueAt('asin(1)', 0)).toBeCloseTo(Math.PI / 2, 12)
    expect(valueAt('acos(1)', 0)).toBe(0)
    expect(valueAt('atan(1)', 0)).toBeCloseTo(Math.PI / 4, 12)
    expect(valueAt('+x', 4)).toBe(4)
  })

  it('evaluates integer factorial exactly and rejects the rest as domain errors', () => {
    expect(valueAt('factorial(5)', 0)).toBe(120)
    expect(valueAt('5!', 0)).toBe(120)
    expect(valueAt('factorial(0)', 0)).toBe(1)
    expect(valueAt('(3+2)!', 0)).toBe(120)
    expect(mustCompile('factorial(0.5)').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('(-1)!').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('171!').evaluate(0).kind).toBe('overflow')
  })

  it('applies the tested precedence rule: ^ binds tightest, unary minus loosest', () => {
    expect(valueAt('-x^2', 3)).toBe(-9) // -(3^2), not (-3)^2
    expect(valueAt('2^3^2', 0)).toBe(512) // right-associative: 2^(3^2)
    expect(valueAt('2+3*4', 0)).toBe(14)
    expect(valueAt('(2+3)*4', 0)).toBe(20)
  })

  it('supports implicit multiplication deliberately', () => {
    expect(valueAt('2x', 3)).toBe(6)
    expect(valueAt('2(x+1)', 3)).toBe(8)
    expect(valueAt('2pi', 0)).toBeCloseTo(2 * Math.PI, 12)
  })

  it('supports decimal and scientific notation', () => {
    expect(valueAt('0.5*x', 4)).toBe(2)
    expect(valueAt('1e3*x', 2)).toBe(2000)
    expect(valueAt('1.5e-2', 0)).toBeCloseTo(0.015, 12)
  })

  it('reuses one compiled expression while only x changes', () => {
    const expr = mustCompile('x^2')
    expect(expr.evaluate(2)).toEqual({ kind: 'value', value: 4 })
    expect(expr.evaluate(-3)).toEqual({ kind: 'value', value: 9 })
    expect(expr.source).toBe('x^2')
  })

  it('evaluates general-base logarithms with domain checks', () => {
    expect(valueAt('log(8, 2)', 0)).toBe(3)
    expect(valueAt('log(100)', 0)).toBe(2)
    expect(valueAt('log(100, 10)', 0)).toBe(2)
    expect(mustCompile('log(8, 1)').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('log(-8, 2)').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('log(8, -2)').evaluate(0).kind).toBe('domain-error')
  })

  it('rounds half away from zero with defined decimal handling', () => {
    expect(valueAt('round(2.5)', 0)).toBe(3)
    expect(valueAt('round(-2.5)', 0)).toBe(-3)
    expect(valueAt('round(1.125, 2)', 0)).toBe(1.13) // 1.125 is exact in binary
    expect(valueAt('round(2.4)', 0)).toBe(2)
  })

  it('computes floored modulo with the divisor sign', () => {
    expect(valueAt('mod(7, 3)', 0)).toBe(1)
    expect(valueAt('mod(-7, 3)', 0)).toBe(2)
    expect(valueAt('mod(7, -3)', 0)).toBe(-2)
    expect(mustCompile('mod(7, 0)').evaluate(0).kind).toBe('domain-error')
  })

  it('evaluates permutations and combinations with integer validation', () => {
    expect(valueAt('permutations(5, 2)', 0)).toBe(20)
    expect(valueAt('combinations(5, 2)', 0)).toBe(10)
    expect(valueAt('combinations(52, 5)', 0)).toBe(2598960)
    expect(mustCompile('combinations(5, 6)').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('permutations(5.5, 2)').evaluate(0).kind).toBe('domain-error')
    expect(mustCompile('combinations(-5, 2)').evaluate(0).kind).toBe('domain-error')
  })

  it('bounds huge-count evaluation instead of iterating to the input', () => {
    // x and k can each be up to 1e15; the count loops must stop at the
    // first non-finite product. Measured pre-fix: ~25 s for these three
    // calls (12.6 s for 1e10!) and days at 1e15 — a frozen tab from a
    // short expression. The time bound is deliberately loose (fixed
    // code is microseconds; a regressed build is seconds).
    const start = performance.now()
    expect(mustCompile('10000000000!').evaluate(0).kind).toBe('overflow')
    expect(mustCompile('permutations(10000000000, 5000000000)').evaluate(0).kind).toBe('overflow')
    expect(mustCompile('combinations(10000000000, 5000000000)').evaluate(0).kind).toBe('overflow')
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('keeps a representable binomial whose intermediate product overflows', () => {
    // C(1028,514) ≈ 7.156e307 fits a double, but the running product
    // C(1027,513)·1028 ≈ 3.7e310 does not; the value must survive.
    let reference = BigInt(1)
    for (let i = 1; i <= 514; i += 1) {
      reference = (reference * BigInt(1028 - 514 + i)) / BigInt(i)
    }
    const expected = Number(reference)
    const outcome = mustCompile('combinations(1028,514)').evaluate(0)
    expect(outcome.kind).toBe('value')
    if (outcome.kind === 'value') {
      expect(Math.abs(outcome.value - expected) / expected).toBeLessThan(1e-12)
    }
  })
})

describe('math engine: domain, overflow, and failure types', () => {
  it('reports 1/x at x=0 as overflow, not zero', () => {
    expect(mustCompile('1/x').evaluate(0).kind).toBe('overflow')
    expect(valueAt('1/x', 2)).toBe(0.5)
  })

  it('reports sqrt of a negative as a domain error', () => {
    const result = mustCompile('sqrt(x)').evaluate(-4)
    expect(result.kind).toBe('domain-error')
  })

  it('reports 0/0 and ln of a negative as domain errors', () => {
    expect(mustCompile('0/0').evaluate(1).kind).toBe('domain-error')
    expect(mustCompile('ln(x)').evaluate(-1).kind).toBe('domain-error')
  })

  it('reports extremely large powers as overflow', () => {
    expect(mustCompile('10^x').evaluate(1000).kind).toBe('overflow')
    expect(mustCompile('x^x').evaluate(1000).kind).not.toBe('value')
  })

  it('rejects malformed brackets with a located parse error', () => {
    for (const bad of ['((x)', 'sin(x', '2+']) {
      const result = compileExpression(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('parse-error')
        expect(result.error.position).toBeDefined()
      }
    }
  })

  it('rejects empty input', () => {
    const result = compileExpression('   ')
    expect(result.ok).toBe(false)
  })

  it('rejects unknown symbols and case variants', () => {
    for (const bad of ['y', 'foo(x)', 'X', 'PI', 'Sin(x)']) {
      const result = compileExpression(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('unsupported')
      }
    }
  })

  it('reports the length and complexity caps as limit diagnostics', () => {
    const long = `x+${'1+'.repeat(300)}1`
    const tooLong = compileExpression(long)
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) {
      expect(tooLong.error.kind).toBe('limit')
      expect(tooLong.error.message).toContain('too long')
    }

    // Under the character cap but over the AST-node cap: the complexity
    // cap is a resource limit, not unsupported syntax.
    const complex = `x${'+1'.repeat(150)}`
    expect(complex.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH)
    const tooComplex = compileExpression(complex)
    expect(tooComplex.ok).toBe(false)
    if (!tooComplex.ok) {
      expect(tooComplex.error.kind).toBe('limit')
      expect(tooComplex.error.message).toContain(`more than ${MAX_EXPRESSION_NODES} operations`)
    }

    const deep = 'sin('.repeat(120) + 'x' + ')'.repeat(120)
    expect(compileExpression(deep).ok).toBe(false)
  })

  it('keeps unsupported syntax distinct from resource limits', () => {
    for (const bad of ['2%3', '[1,2]', 'window.x']) {
      const result = compileExpression(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('unsupported')
      }
    }
  })
})

describe('math engine: literal syntax contract', () => {
  it('rejects quoted strings instead of coercing them to numbers', () => {
    for (const source of ['"5"', '"5" + 2', '"5" * 2', '"abc"']) {
      const result = compileExpression(source)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('unsupported')
        expect(result.error.message).toContain('String literals are not supported')
      }
    }
  })

  it('rejects hexadecimal, binary, and octal integer literals', () => {
    for (const source of ['0xff', '0b1010', '0o17', '2 + 0xff', '0x1e + 2', '0b101 + 1']) {
      const result = compileExpression(source)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('unsupported')
        expect(result.error.message).toMatch(/(Hexadecimal|Binary|Octal) literals are not supported/)
      }
    }
  })

  it('keeps decimal and scientific notation working', () => {
    expect(valueAt('5', 0)).toBe(5)
    expect(valueAt('5.0', 0)).toBe(5)
    expect(valueAt('5e2', 0)).toBe(500)
    expect(valueAt('1.5e-2', 0)).toBeCloseTo(0.015, 15)
    expect(valueAt('.5', 0)).toBe(0.5)
    expect(valueAt('0e5', 0)).toBe(0)
    expect(valueAt('1e3 + 2', 0)).toBe(1002)
  })

  it('keeps malformed numeric syntax a parse error', () => {
    for (const source of ['0x', '0b102', '0xffg', '0o8', '"5']) {
      const result = compileExpression(source)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe('parse-error')
      }
    }
  })

  it('does not mistake implicit multiplication for non-decimal prefixes', () => {
    const result = compileExpression('10b + 20x', { parameters: ['b'] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.expression.evaluate(2, { b: 3 })).toEqual({ kind: 'value', value: 70 })
    }
  })
})

describe('math engine: hostile input stays inert', () => {
  const hostile = [
    'window.x',
    'document.cookie',
    'globalThis',
    'fetch("http://example.com")',
    'process.exit(1)',
    'constructor',
    '__proto__',
    'prototype',
    'x.constructor',
    'x=2',
    'f(x)=x',
    '[1,2]',
    '{a:1}',
    'x>2',
    '2%3',
    'import("fs")',
    'a;b',
    'sin;cos',
  ]
  it.each(hostile)('rejects %s without executing anything', (source) => {
    expect(compileExpression(source).ok).toBe(false)
  })

  it('cannot reach application internals through evaluation scope', () => {
    // Only x, pi, e exist in scope; anything else fails at compile time.
    expect(compileExpression('x').ok).toBe(true)
    expect(compileExpression('argv').ok).toBe(false)
    expect(compileExpression('require').ok).toBe(false)
  })
})

describe('math engine: named parameters', () => {
  it('evaluates declared parameters without reparsing per value', () => {
    const compiled = compileExpression('a*x^2 + h', { parameters: ['a', 'h'] })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    expect(compiled.expression.parameterNames).toEqual(['a', 'h'])
    expect(compiled.expression.evaluate(2, { a: 3, h: 1 })).toEqual({ kind: 'value', value: 13 })
    // Same compiled instance serves new values.
    expect(compiled.expression.evaluate(2, { a: 1, h: 0 })).toEqual({ kind: 'value', value: 4 })
  })

  it('rejects undeclared symbols even when parameters exist', () => {
    expect(compileExpression('z*x', { parameters: ['a'] }).ok).toBe(false)
    expect(compileExpression('a*x', { parameters: [] }).ok).toBe(false)
  })

  it('rejects reserved and malformed parameter declarations', () => {
    // 'x' is not a valid parameter name, so it is ignored as a declaration.
    const usesX = compileExpression('x + 1', { parameters: ['x'] })
    expect(usesX.ok).toBe(true)
    if (usesX.ok) {
      expect(usesX.expression.parameterNames).toEqual([])
    }
  })

  it('applies a case-sensitive parameter-name grammar with reserved identifiers', () => {
    for (const name of ['a', 'amplitude_1', 'A', 'X', 'Y', 'T', 'Theta', 'PI', 'E', 'Sin', 'abcdefghijklmnop']) {
      expect(isValidParameterName(name)).toBe(true)
    }
    for (const name of ['x', 'y', 't', 'theta', 'pi', 'e', 'sin', 'cos', 'log', '9a', '_a', 'a b', 'abcdefghijklmnopq']) {
      expect(isValidParameterName(name)).toBe(false)
    }
  })

  it('does not let reserved declarations shadow variables, constants, or functions', () => {
    const alternateVariables: Array<[string, string[]]> = [
      ['y', ['x', 'y']],
      ['t', ['t']],
      ['theta', ['theta']],
    ]
    for (const [name, variables] of alternateVariables) {
      const compiled = compileExpression(`${name} + 1`, { parameters: [name], variables })
      expect(compiled.ok).toBe(true)
      if (compiled.ok) {
        expect(compiled.expression.parameterNames).toEqual([])
        const values = Object.fromEntries(variables.map((variable) => [variable, 2]))
        expect(compiled.expression.evaluateRecord(values)).toEqual({ kind: 'value', value: 3 })
      }
    }

    for (const [name, constant] of [['pi', Math.PI], ['e', Math.E]] as const) {
      const compiled = compileExpression(`${name} + 1`, { parameters: [name] })
      expect(compiled.ok).toBe(true)
      if (compiled.ok) {
        expect(compiled.expression.parameterNames).toEqual([])
        const result = compiled.expression.evaluate(0)
        expect(result.kind).toBe('value')
        if (result.kind === 'value') {
          expect(result.value).toBeCloseTo(constant + 1, 12)
        }
      }
    }

    const sine = compileExpression('sin(x)', { parameters: ['sin'] })
    expect(sine.ok).toBe(true)
    if (sine.ok) {
      expect(sine.expression.parameterNames).toEqual([])
      expect(sine.expression.evaluate(0)).toEqual({ kind: 'value', value: 0 })
    }

    const named = compileExpression('Amplitude*x', { parameters: ['Amplitude'] })
    expect(named.ok).toBe(true)
    if (named.ok) {
      expect(named.expression.parameterNames).toEqual(['Amplitude'])
      expect(named.expression.evaluate(2, { Amplitude: 3 })).toEqual({ kind: 'value', value: 6 })
    }
  })

  it('reports missing or non-finite values instead of guessing', () => {
    const compiled = compileExpression('a*x', { parameters: ['a'] })
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    expect(compiled.expression.evaluate(2)).toEqual({ kind: 'evaluation-error', reason: 'Parameter "a" has no finite value.' })
    expect(compiled.expression.evaluate(2, { a: Number.NaN }).kind).toBe('evaluation-error')
  })

  it('tracks only referenced parameters', () => {
    const compiled = compileExpression('x^2 + b', { parameters: ['a', 'b'] })
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    expect(compiled.expression.parameterNames).toEqual(['b'])
  })
})

describe('math engine: alternate variables', () => {
  it('compiles t-expressions while rejecting x', () => {
    const compiled = compileExpression('cos(t)', { variables: ['t'] })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    expect(compiled.expression.variables).toEqual(['t'])
    const atPi = compiled.expression.evaluate(Math.PI, {})
    expect(atPi.kind).toBe('value')
    if (atPi.kind === 'value') {
      expect(atPi.value).toBeCloseTo(-1, 12)
    }
    expect(compileExpression('x + 1', { variables: ['t'] }).ok).toBe(false)
  })

  it('compiles theta-expressions while rejecting x', () => {
    const compiled = compileExpression('2*cos(3*theta)', { variables: ['theta'] })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    const atZero = compiled.expression.evaluate(0, {})
    expect(atZero.kind).toBe('value')
    if (atZero.kind === 'value') {
      expect(atZero.value).toBeCloseTo(2, 12)
    }
    expect(compileExpression('x', { variables: ['theta'] }).ok).toBe(false)
  })
})
