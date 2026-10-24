import { describe, expect, it } from 'vitest'
import { compileExpression, MAX_EXPRESSION_LENGTH } from '../math/index.ts'
import { sampleImplicit } from '../sampling/implicit.ts'
import { compileRow, rangeForRow } from './compile.ts'
import { createImplicitRow, createRow } from './model.ts'

describe('compileRow', () => {
  it('compiles single formulas with no breakpoints', () => {
    const compiled = compileRow(createRow('x^2', 0))
    expect(compiled.error).toBe(null)
    expect(compiled.domainError).toBe(null)
    expect(compiled.breakpoints).toEqual([])
    expect(compiled.evaluatorKind).toBe('scalar')
    if (compiled.evaluator !== null && 'evaluate' in compiled.evaluator) {
      expect(compiled.evaluator.evaluate(3)).toEqual({ kind: 'value', value: 9 })
    } else {
      throw new Error('Expected a scalar evaluator')
    }
  })

  it('reports formula errors without an evaluator', () => {
    const compiled = compileRow(createRow('x+', 0))
    expect(compiled.error).toMatch(/Could not parse/)
    expect(compiled.evaluator).toBe(null)
  })

  it('compiles piecewise rows with breakpoints', () => {
    const row = {
      ...createRow('x', 0),
      branches: [{ op: 'lt' as const, value: 0, source: '-x' }],
      defaultSource: 'x',
    }
    const compiled = compileRow(row)
    expect(compiled.error).toBe(null)
    expect(compiled.breakpoints).toEqual([0])
    if (compiled.evaluator === null || !('evaluate' in compiled.evaluator)) {
      throw new Error('Expected a scalar evaluator')
    }
    expect(compiled.evaluator.evaluate(-2)).toEqual({ kind: 'value', value: 2 })
    expect(compiled.evaluator.evaluate(2)).toEqual({ kind: 'value', value: 2 })
  })

  it('names failing branches', () => {
    const row = {
      ...createRow('x', 0),
      branches: [{ op: 'lt' as const, value: 0, source: 'x^2' }],
      defaultSource: 'y',
    }
    const compiled = compileRow(row)
    expect(compiled.error).toMatch(/Default branch/)
    expect(compiled.evaluator).toBe(null)
  })

  it('flags invalid domains while keeping row identity', () => {
    const row = { ...createRow('x', 2), domain: { min: 5, max: 2 } }
    const compiled = compileRow(row)
    expect(compiled.domainError).toMatch(/min below max/)
    if (compiled.evaluator === null || !('evaluate' in compiled.evaluator)) {
      throw new Error('Expected a scalar evaluator')
    }
    expect(compiled.evaluator.evaluate(0)).toEqual({ kind: 'value', value: 0 })
  })

  it('intersects domains with the view', () => {
    const view = { xMin: -10, xMax: 10 }
    expect(rangeForRow(createRow('x', 0), view)).toEqual({ xMin: -10, xMax: 10 })
    const restricted = { ...createRow('sqrt(x)', 0), domain: { min: 0, max: 4 } }
    expect(rangeForRow(restricted, view)).toEqual({ xMin: 0, xMax: 4 })
    const outside = { ...createRow('sqrt(x)', 0), domain: { min: 20, max: 30 } }
    expect(rangeForRow(outside, view)).toBe(null)
  })

  it('recompiles only when the row changes (keyed by caller)', () => {
    // compileRow is pure: identical rows give independent but equal evaluators.
    const row = createRow('x^2', 0)
    const first = compileRow(row)
    const second = compileRow({ ...row })
    expect(first.error).toBe(null)
    expect(second.error).toBe(null)
    if (first.evaluator === null || !('evaluate' in first.evaluator) || second.evaluator === null || !('evaluate' in second.evaluator)) {
      throw new Error('Expected scalar evaluators')
    }
    expect(first.evaluator.evaluate(4)).toEqual(second.evaluator.evaluate(4))
  })

  it('compiles parametric rows with t-scoped components', () => {
    const row = { kind: 'parametric' as const, id: 'p', visible: true, colorIndex: 0, label: '', xSource: 'cos(t)', ySource: 'sin(t)', tMin: 0, tMax: 6.2832 }
    const compiled = compileRow(row)
    expect(compiled.error).toBe(null)
    expect(compiled.evaluatorKind).toBe('point')
    if (compiled.evaluator === null || !('evaluatePoint' in compiled.evaluator)) {
      throw new Error('Expected a point evaluator')
    }
    expect(compiled.evaluator.evaluatePoint(0, {})).toMatchObject({ x: 1 })
    const atPi = compiled.evaluator.evaluatePoint(Math.PI, {})
    expect(atPi?.x).toBeCloseTo(-1, 9)
    expect(atPi?.y).toBeCloseTo(0, 9)
  })

  it('rejects reversed parameter ranges with messages', () => {
    const bad = { kind: 'parametric' as const, id: 'p', visible: true, colorIndex: 0, label: '', xSource: 't', ySource: 't', tMin: 5, tMax: 2 }
    expect(compileRow(bad).error).toMatch(/min below max/)
    const polar = { kind: 'polar' as const, id: 'q', visible: true, colorIndex: 0, label: '', source: '2', thetaMin: 1, thetaMax: 1 }
    expect(compileRow(polar).error).toMatch(/min below max/)
  })

  it('names the failing parametric component', () => {
    const row = { kind: 'parametric' as const, id: 'p', visible: true, colorIndex: 0, label: '', xSource: 't', ySource: 'z', tMin: 0, tMax: 1 }
    expect(compileRow(row).error).toMatch(/y\(t\)/)
  })

  it('maps negative radii through angle-plus-pi equivalence', () => {
    const row = { kind: 'polar' as const, id: 'q', visible: true, colorIndex: 0, label: '', source: '-2', thetaMin: 0, thetaMax: 1 }
    const compiled = compileRow(row)
    expect(compiled.error).toBe(null)
    if (compiled.evaluator === null || !('evaluatePoint' in compiled.evaluator)) {
      throw new Error('Expected a point evaluator')
    }
    // r=-2 at θ=0 plots at (-2, 0): the documented negative-radius policy.
    const point = compiled.evaluator.evaluatePoint(0, {})
    expect(point?.x).toBeCloseTo(-2, 12)
    expect(point?.y).toBeCloseTo(0, 12)
  })

  it('ranges parametric rows by t and polar rows by theta', () => {
    const view = { xMin: -10, xMax: 10 }
    const param = { kind: 'parametric' as const, id: 'p', visible: true, colorIndex: 0, label: '', xSource: 't', ySource: 't', tMin: -3, tMax: 3 }
    expect(rangeForRow(param, view)).toEqual({ xMin: -3, xMax: 3 })
    const polar = { kind: 'polar' as const, id: 'q', visible: true, colorIndex: 0, label: '', source: '2', thetaMin: 0, thetaMax: 1 }
    expect(rangeForRow(polar, view)).toEqual({ xMin: 0, xMax: 1 })
  })

  it('accepts two individually legal implicit sides even when the synthesized difference exceeds 500 characters', () => {
    const padding = ' '.repeat(260)
    const left = `x^2 + y^2${padding}`
    const right = `25${padding}`
    expect(left.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH)
    expect(right.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH)
    expect(left.length + right.length + 5).toBeGreaterThan(MAX_EXPRESSION_LENGTH)

    const compiled = compileRow(createImplicitRow(left, right, 0))
    expect(compiled.error).toBe(null)
    expect(compiled.evaluatorKind).toBe('field')
    if (compiled.evaluator === null || !('evaluateField' in compiled.evaluator)) {
      throw new Error('Expected a field evaluator')
    }
    expect(compiled.evaluator.evaluateField(5, 0)).toEqual({ value: 0 })
    expect(compiled.evaluator.evaluateField(0, 0)).toEqual({ value: -25 })

    const sampled = sampleImplicit(compiled.evaluator, { xMin: -6, xMax: 6, yMin: -6, yMax: 6, pixelWidth: 300 })
    expect(sampled.status).toBe('ok')
    const points = sampled.segments.flatMap((segment) => segment.points)
    expect(points.length).toBeGreaterThan(32)
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(5, 0)
    }
  })

  it('accepts exactly 500 characters on each implicit side', () => {
    const left = `x${' '.repeat(MAX_EXPRESSION_LENGTH - 1)}`
    const right = `1${' '.repeat(MAX_EXPRESSION_LENGTH - 1)}`
    expect(left).toHaveLength(MAX_EXPRESSION_LENGTH)
    expect(right).toHaveLength(MAX_EXPRESSION_LENGTH)
    const compiled = compileRow(createImplicitRow(left, right, 0))
    expect(compiled.error).toBe(null)
    expect(compiled.evaluatorKind).toBe('field')
  })

  it('reports over-limit implicit sides against the user input before combining', () => {
    const overLimit = '1'.repeat(MAX_EXPRESSION_LENGTH + 1)
    const expectedLength = MAX_EXPRESSION_LENGTH + 1
    const left = compileRow(createImplicitRow(overLimit, '1', 0))
    expect(left.error).toBe(`Left-hand side: Expression is too long (${expectedLength} characters; maximum is ${MAX_EXPRESSION_LENGTH}).`)
    expect(left.evaluator).toBe(null)

    const right = compileRow(createImplicitRow('1', overLimit, 0))
    expect(right.error).toBe(`Right-hand side: Expression is too long (${expectedLength} characters; maximum is ${MAX_EXPRESSION_LENGTH}).`)
    expect(right.evaluator).toBe(null)
  })

  it('still applies the AST node cap to the synthesized difference', () => {
    const side = `x${'+0'.repeat(120)}`
    expect(side.length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH)
    expect(compileExpression(side, { variables: ['x', 'y'] }).ok).toBe(true)
    const compiled = compileRow(createImplicitRow(side, side, 0))
    expect(compiled.error).toMatch(/too complex/)
    expect(compiled.evaluator).toBe(null)
  })

  it('keeps malformed implicit sides as parse errors without an evaluator', () => {
    const compiled = compileRow(createImplicitRow('x+', '1', 0))
    expect(compiled.error).toMatch(/Could not parse/)
    expect(compiled.evaluator).toBe(null)
    expect(compiled.evaluatorKind).toBe(null)
  })

  it('keeps ordinary implicit equations working', () => {
    const compiled = compileRow(createImplicitRow('x^2 + y^2', '1', 0))
    expect(compiled.error).toBe(null)
    if (compiled.evaluator === null || !('evaluateField' in compiled.evaluator)) {
      throw new Error('Expected a field evaluator')
    }
    expect(compiled.evaluator.evaluateField(1, 0)).toEqual({ value: 0 })
    expect(compiled.evaluator.evaluateField(0, 0)).toEqual({ value: -1 })
  })
})
