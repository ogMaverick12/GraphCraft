import { describe, expect, it } from 'vitest'
import { calculate, prepare, type CalcOutcome } from './evaluate.ts'
import { formatDisplay } from './format.ts'

function valueOf(source: string, mode: 'radians' | 'degrees' = 'radians'): number {
  const outcome: CalcOutcome = calculate(source, mode)
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected a value for "${source}": ${JSON.stringify(outcome)}`)
  }
  return outcome.value
}

describe('calculator: precedence and grouping', () => {
  it('follows standard precedence with right-associative powers', () => {
    expect(valueOf('2+3*4')).toBe(14)
    expect(valueOf('2^3^2')).toBe(512)
    expect(valueOf('(2+3)*4')).toBe(20)
    expect(valueOf('((2+3)*(4-1))^2')).toBe(225)
  })

  it('handles unary minus and nested parentheses', () => {
    expect(valueOf('-2^2')).toBe(-4)
    expect(valueOf('(-2)^2')).toBe(4)
    expect(valueOf('-(3+2)')).toBe(-5)
    expect(valueOf('--5')).toBe(5)
  })

  it('supports powers, roots, and reciprocal spelled honestly', () => {
    expect(valueOf('2^10')).toBe(1024)
    expect(valueOf('sqrt(16)')).toBe(4)
    expect(valueOf('9^(1/2)')).toBe(3)
    expect(valueOf('1/8')).toBe(0.125)
    expect(valueOf('5!')).toBe(120)
  })

  it('treats trailing percent strictly as division by 100', () => {
    expect(valueOf('50%')).toBe(0.5)
    expect(valueOf('50+10%')).toBeCloseTo(50.1, 12)
    expect(valueOf('(3+2)%')).toBeCloseTo(0.05, 12)
    expect(prepare('50%', 'radians').interpreted).toBe('(50)/100')
  })

  it('never lets a mid-expression percent silently become division', () => {
    const outcome = calculate('7%3', 'radians')
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') {
      expect(outcome.message).toMatch(/%/i)
    }
  })

  it('supports nested scientific expressions without ambiguity', () => {
    expect(valueOf('sin(pi/6)')).toBeCloseTo(0.5, 12)
    expect(valueOf('log(10^2)')).toBe(2)
    expect(valueOf('log(8, 2)')).toBe(3)
    expect(valueOf('sqrt(2^2+3^2)')).toBeCloseTo(Math.sqrt(13), 12)
    expect(valueOf('round(2.5)+mod(7, 3)')).toBe(4)
    expect(valueOf('combinations(5, 2)+permutations(5, 2)')).toBe(30)
  })

  it('rejects out-of-domain inverse trig with domain errors', () => {
    expect(calculate('asin(2)', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(calculate('acos(-2)', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(valueOf('asin(1)', 'degrees')).toBeCloseTo(90, 10)
    expect(valueOf('acos(-1)')).toBeCloseTo(Math.PI, 12)
  })
})

describe('calculator: angle modes', () => {
  it('evaluates trig in radians by default', () => {
    expect(valueOf('sin(pi/2)')).toBeCloseTo(1, 12)
    expect(valueOf('cos(pi)')).toBeCloseTo(-1, 12)
    expect(prepare('sin(pi/2)', 'radians').adjusted).toBe(false)
  })

  it('converts degrees around trig calls, including nesting', () => {
    expect(valueOf('sin(90)', 'degrees')).toBeCloseTo(1, 12)
    expect(valueOf('cos(180)', 'degrees')).toBeCloseTo(-1, 12)
    expect(valueOf('tan(45)', 'degrees')).toBeCloseTo(1, 12)
    expect(valueOf('sin(cos(0))', 'degrees')).toBeCloseTo(Math.sin(Math.PI / 180), 12)
    expect(prepare('sin(90)', 'degrees').interpreted).toBe('sin((90)*pi/180)')
  })

  it('returns inverse trig in degrees under degree mode', () => {
    expect(valueOf('asin(1)', 'degrees')).toBeCloseTo(90, 10)
    expect(valueOf('acos(0)', 'degrees')).toBeCloseTo(90, 10)
    expect(valueOf('atan(1)', 'degrees')).toBeCloseTo(45, 10)
  })

  it('leaves hyperbolics in radians in both modes', () => {
    expect(valueOf('sinh(1)', 'degrees')).toBeCloseTo(Math.sinh(1), 12)
    expect(prepare('sinh(1)', 'degrees').interpreted).toBe('sinh(1)')
  })
})

describe('calculator: range and errors', () => {
  it('formats very large and small magnitudes without losing the value', () => {
    expect(valueOf('10^100')).toBe(1e100)
    expect(formatDisplay(1e100)).toBe('1e+100')
    expect(formatDisplay(0.1 + 0.2)).toBe('0.3')
    expect(valueOf('0.1+0.2')).toBeCloseTo(0.3, 15)
    expect(formatDisplay(123456789012345)).toBe('123456789012345')
    expect(formatDisplay(0.000000123456)).toBe('1.23456e-7')
  })

  it('reports divide-by-zero, domain errors, and overflow distinctly', () => {
    expect(calculate('1/0', 'radians')).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(calculate('sqrt(-1)', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(calculate('log(-5)', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(calculate('10^1000', 'radians')).toMatchObject({ status: 'error', kind: 'overflow' })
  })

  it('rejects bad syntax and unsupported constructs with guidance', () => {
    expect(calculate('2+', 'radians')).toMatchObject({ status: 'error', kind: 'syntax' })
    expect(calculate('foo(2)', 'radians')).toMatchObject({ status: 'error', kind: 'unsupported' })
    const empty = calculate('', 'radians')
    expect(empty.status).toBe('error')
  })

  it('reports the expression complexity cap as a limit, not unsupported', () => {
    const complex = `1${'+1'.repeat(150)}`
    const outcome = calculate(complex, 'radians')
    expect(outcome).toMatchObject({ status: 'error', kind: 'limit' })
    if (outcome.status === 'error') {
      expect(outcome.message).toContain('too complex')
    }
  })

  it('rejects quoted and non-decimal literals through the calculator lane', () => {
    for (const source of ['"5"', '"5" + 2', '0xff', '0b1010']) {
      const outcome = calculate(source, 'radians')
      expect(outcome).toMatchObject({ status: 'error', kind: 'unsupported' })
      if (outcome.status === 'error') {
        expect(outcome.message).toMatch(/literals are not supported/)
      }
    }
  })

  it('refuses to evaluate variable-bearing input with a hidden binding', () => {
    const outcome = calculate('x+2', 'radians')
    expect(outcome.status).toBe('variable')
    if (outcome.status === 'variable') {
      expect(outcome.message).toMatch(/graph variable/i)
    }
  })
})
