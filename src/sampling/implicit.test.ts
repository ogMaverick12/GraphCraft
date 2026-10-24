import { describe, expect, it } from 'vitest'
import { compileExpression } from '../math/index.ts'
import type { FieldEvaluator } from '../math/index.ts'
import { MAX_IMPLICIT_EVALUATIONS, gridDimensions, sampleImplicit, sampleInequality } from './implicit.ts'

function fieldFor(source: string): FieldEvaluator {
  const compiled = compileExpression(`(${source})`, { variables: ['x', 'y'] })
  if (!compiled.ok) {
    throw new Error(`Cannot test unsamplable field "${source}"`)
  }
  return {
    evaluateField: (x, y, parameters) => {
      const result = compiled.expression.evaluateRecord({ x, y }, parameters)
      if (result.kind !== 'value') {
        return null
      }
      return { value: result.value }
    },
  }
}

function onContour(points: Array<{ x: number; y: number }>, source: string, tolerance: number): void {
  const compiled = compileExpression(`(${source})`, { variables: ['x', 'y'] })
  if (!compiled.ok) {
    throw new Error('Cannot verify contour')
  }
  for (const p of points) {
    const result = compiled.expression.evaluateRecord({ x: p.x, y: p.y })
    expect(result.kind).toBe('value')
    if (result.kind === 'value') {
      expect(Math.abs(result.value)).toBeLessThan(tolerance)
    }
  }
}

const VIEW = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, pixelWidth: 300 }
/** B1 regression viewport: a 1000 px square view of the circle r = 5. */
const SQUARE_1000 = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, pixelWidth: 1000 }

describe('implicit sampler: contours', () => {
  it('traces the unit circle on the contour', () => {
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 1'), VIEW)
    expect(result.status).toBe('ok')
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(32)
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 0)
    }
    onContour(points, 'x^2 + y^2 - 1', 0.2)
  })

  it('traces an ellipse on the contour', () => {
    const result = sampleImplicit(fieldFor('x^2/9 + y^2/4 - 1'), VIEW)
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(32)
    onContour(points, 'x^2/9 + y^2/4 - 1', 0.3)
    expect(Math.max(...points.map((p) => Math.abs(p.x)))).toBeCloseTo(3, 0)
  })

  it('draws two crossing lines through the saddle without bogus joins', () => {
    const result = sampleImplicit(fieldFor('x^2 - y^2'), { xMin: -2, xMax: 2, yMin: -2, yMax: 2, pixelWidth: 300 })
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(16)
    // Every emitted point lies on the contour (no diagonal shortcuts).
    onContour(points, 'x^2 - y^2', 0.3)
    // Both diagonals present: points with x*y > 0 and x*y < 0 exist.
    const signs = new Set(points.map((p) => Math.sign(p.x * p.y)))
    expect(signs.has(1)).toBe(true)
    expect(signs.has(-1)).toBe(true)
  })

  it('reports degenerate and empty fields instead of drawing', () => {
    const constant = sampleImplicit(fieldFor('1'), VIEW)
    expect(constant.segments).toHaveLength(0)

    const zero = sampleImplicit(fieldFor('0'), VIEW)
    expect(zero.segments).toHaveLength(0)
    expect(zero.warnings.some((w) => w.code === 'degenerate-field')).toBe(true)

    const elsewhere = sampleImplicit(fieldFor('x^2 + y^2 - 100'), { xMin: -1, xMax: 1, yMin: -1, yMax: 1, pixelWidth: 100 })
    expect(elsewhere.segments).toHaveLength(0)
  })

  it('caps work under a tiny budget', () => {
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 1'), { ...VIEW, maxEvaluations: 100 })
    expect(result.stats.evaluations).toBeLessThanOrEqual(100)
    expect(['ok', 'partial']).toContain(result.status)
  })

  it('is deterministic', () => {
    const options = { ...VIEW }
    expect(sampleImplicit(fieldFor('x^2 - y^2'), options)).toEqual(sampleImplicit(fieldFor('x^2 - y^2'), options))
  })

  it('honours cancellation instead of returning stale contours', () => {
    const controller = new AbortController()
    controller.abort()
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 1'), { ...VIEW, signal: controller.signal })
    expect(result.status).toBe('cancelled')
  })
})

describe('implicit sampler: budget-sized grid', () => {
  it('keeps the visible circle at 1000 px instead of aborting at the budget', () => {
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 25'), SQUARE_1000)
    expect(result.stats.evaluations).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(64)
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 0)
    }
    onContour(points, 'x^2 + y^2 - 25', 0.2)
    // The old failure discarded all geometry and claimed no valid samples.
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(false)
    expect(sampleImplicit(fieldFor('x^2 + y^2 - 25'), SQUARE_1000)).toEqual(result)
  })

  it('sizes the base grid deterministically inside the budget', () => {
    const square = gridDimensions(1000, 12, 12)
    expect(square).toEqual({ nx: 173, ny: 173, budgetLimited: true })
    expect(square.nx * square.ny).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    // Ordinary densities are returned unchanged.
    expect(gridDimensions(800, 12, 12)).toEqual({ nx: 160, ny: 160, budgetLimited: false })
    expect(gridDimensions(300, 10, 10)).toEqual({ nx: 60, ny: 60, budgetLimited: false })
    // A reduction scales both axes by the same factor: cells keep their shape.
    const wide = gridDimensions(1000, 12, 9.6)
    expect(wide).toEqual({ nx: 193, ny: 154, budgetLimited: true })
    expect(wide.nx * wide.ny).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    expect(wide.nx / wide.ny).toBeCloseTo(200 / 160, 2)
  })

  it('keeps the whole pass inside the budget with a counted evaluator', () => {
    let calls = 0
    const base = fieldFor('x^2 + y^2 - 25')
    const counted: FieldEvaluator = {
      evaluateField: (x, y, parameters) => {
        calls += 1
        return base.evaluateField(x, y, parameters)
      },
    }
    const result = sampleImplicit(counted, SQUARE_1000)
    expect(result.stats.evaluations).toBe(calls)
    expect(calls).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
  })

  it('reports the deliberate resolution reduction in its diagnostics', () => {
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 25'), SQUARE_1000)
    expect(result.status).not.toBe('error')
    expect(result.warnings.some((w) => w.code === 'under-resolved')).toBe(true)
  })

  it('still reports no-valid-samples when the contour is genuinely absent', () => {
    const elsewhere = sampleImplicit(fieldFor('x^2 + y^2 - 100'), { xMin: -1, xMax: 1, yMin: -1, yMax: 1, pixelWidth: 1000 })
    expect(elsewhere.segments).toHaveLength(0)
    expect(elsewhere.warnings.some((w) => w.code === 'no-valid-samples')).toBe(true)
    expect(elsewhere.stats.evaluations).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
  })

  it('retains output and diagnostics for ordinary under-budget grids', () => {
    const unit = sampleImplicit(fieldFor('x^2 + y^2 - 1'), VIEW)
    expect(unit.status).toBe('ok')
    expect(unit.stats.evaluations).toBe(4032)
    expect(unit.segments).toHaveLength(92)
    expect(unit.warnings).toEqual([])

    const halfPlane = sampleInequality(fieldFor('y - x'), '<=', VIEW)
    expect(halfPlane.status).toBe('ok')
    expect(halfPlane.regions).toHaveLength(59)
    expect(halfPlane.warnings).toEqual([])
  })

  it('keeps inequality fills and their boundary at 1000 px', () => {
    const result = sampleInequality(fieldFor('x^2 + y^2 - 25'), '<=', SQUARE_1000)
    expect(result.stats.evaluations).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    expect(result.segments.length).toBeGreaterThan(0)
    expect(result.regions.length).toBeGreaterThan(0)
    const covers = (x: number, y: number): boolean =>
      result.regions.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
    expect(covers(0, 0)).toBe(true)
    expect(covers(5.5, 5.5)).toBe(false)
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(false)
  })
})

describe('implicit sampler: caller evaluation budget', () => {
  function countedField(source: string): { field: FieldEvaluator; calls: () => number } {
    let calls = 0
    const base = fieldFor(source)
    return {
      field: {
        evaluateField: (x, y, parameters) => {
          calls += 1
          return base.evaluateField(x, y, parameters)
        },
      },
      calls: () => calls,
    }
  }

  it('honours a small caller budget across the whole implicit pass', () => {
    const { field, calls } = countedField('x^2 + y^2 - 25')
    const result = sampleImplicit(field, { ...SQUARE_1000, maxEvaluations: 100 })
    expect(result.stats.evaluations).toBe(calls())
    expect(calls()).toBeLessThanOrEqual(100)
    expect(result.segments.length).toBeGreaterThan(0)
    expect(result.status).toBe('partial')
    expect(result.warnings.some((w) => w.code === 'under-resolved')).toBe(true)
    expect(result.warnings.some((w) => w.code === 'budget-exhausted')).toBe(true)
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(false)
  })

  it('spends the same caller budget on refinement after the base grid', () => {
    const { field, calls } = countedField('x^2 + y^2 - 25')
    const result = sampleImplicit(field, { ...SQUARE_1000, maxEvaluations: 120 })
    expect(result.stats.evaluations).toBe(calls())
    // The 10×10 base grid costs 100; refinement consumes the rest of the
    // caller's 120 rather than an independent budget.
    expect(calls()).toBeGreaterThan(100)
    expect(calls()).toBeLessThanOrEqual(120)
    expect(result.warnings.some((w) => w.code === 'budget-exhausted')).toBe(true)
  })

  it('returns truthful coarse geometry under the smallest valid budget', () => {
    const result = sampleImplicit(fieldFor('x^2 + y^2 - 25'), { ...SQUARE_1000, maxEvaluations: 16 })
    expect(result.stats.evaluations).toBe(16)
    expect(result.segments.length).toBeGreaterThan(0)
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(0)
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-6)
      expect(p.x).toBeLessThanOrEqual(6)
      expect(p.y).toBeGreaterThanOrEqual(-6)
      expect(p.y).toBeLessThanOrEqual(6)
    }
    expect(result.status).toBe('partial')
    expect(result.warnings.some((w) => w.code === 'under-resolved')).toBe(true)
    expect(result.warnings.some((w) => w.code === 'budget-exhausted')).toBe(true)
    // Not a false "nothing here": the affordable grid still found geometry.
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(false)
  })

  it('applies the caller budget to inequality sampling too', () => {
    const { field, calls } = countedField('x^2 + y^2 - 25')
    const result = sampleInequality(field, '<=', { ...SQUARE_1000, maxEvaluations: 100 })
    expect(result.stats.evaluations).toBe(calls())
    expect(calls()).toBeLessThanOrEqual(100)
    expect(result.regions.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(false)
  })

  it('preserves the module default when the budget is omitted', () => {
    const omitted = sampleImplicit(fieldFor('x^2 + y^2 - 25'), SQUARE_1000)
    const atCap = sampleImplicit(fieldFor('x^2 + y^2 - 25'), { ...SQUARE_1000, maxEvaluations: MAX_IMPLICIT_EVALUATIONS })
    expect(omitted).toEqual(atCap)
    expect(omitted.stats.evaluations).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    expect(omitted.segments.length).toBeGreaterThan(0)
  })

  it('never lets a larger caller budget raise the hard cap', () => {
    const omitted = sampleImplicit(fieldFor('x^2 + y^2 - 25'), SQUARE_1000)
    const huge = sampleImplicit(fieldFor('x^2 + y^2 - 25'), { ...SQUARE_1000, maxEvaluations: 1_000_000 })
    expect(huge).toEqual(omitted)
    expect(huge.stats.evaluations).toBeLessThanOrEqual(MAX_IMPLICIT_EVALUATIONS)
    expect(gridDimensions(1000, 12, 12, 1_000_000)).toEqual({ nx: 173, ny: 173, budgetLimited: true })
  })

  it('rejects invalid budgets with the established option error and no evaluations', () => {
    for (const value of [0, -5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 15]) {
      const result = sampleImplicit(fieldFor('x^2 + y^2 - 25'), { ...SQUARE_1000, maxEvaluations: value })
      expect(result.status).toBe('error')
      expect(result.stats.evaluations).toBe(0)
      expect(result.warnings.map((w) => w.message).join(' ')).toMatch(/maxEvaluations must be an integer of at least 16/)
    }
  })

  it('sizes grids against the caller budget before traversal', () => {
    expect(gridDimensions(1000, 12, 12, 100)).toEqual({ nx: 10, ny: 10, budgetLimited: true })
    expect(gridDimensions(1000, 12, 12, 120)).toEqual({ nx: 10, ny: 10, budgetLimited: true })
    expect(gridDimensions(1000, 12, 12, 16)).toEqual({ nx: 4, ny: 4, budgetLimited: true })
    expect(gridDimensions(800, 12, 12, 5000)).toEqual({ nx: 70, ny: 70, budgetLimited: true })
    // A severe aspect ratio keeps at least one cell in each direction.
    expect(gridDimensions(1000, 50, 1, 16)).toEqual({ nx: 8, ny: 2, budgetLimited: true })
  })
})

describe('implicit sampler: inequalities', () => {
  it('fills the half-plane below a diagonal', () => {
    // F = y - x <= 0  <=>  y <= x.
    const result = sampleInequality(fieldFor('y - x'), '<=', VIEW)
    expect(result.status).toBe('ok')
    expect(result.regions.length).toBeGreaterThan(0)
    const covers = (x: number, y: number): boolean =>
      result.regions.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
    expect(covers(0, -3)).toBe(true)
    expect(covers(0, 3)).toBe(false)
    // Boundary contour drawn alongside the fill.
    expect(result.segments.length).toBeGreaterThan(0)
  })

  it('fills the parabola region y <= x^2', () => {
    const result = sampleInequality(fieldFor('y - x^2'), '<=', VIEW)
    const covers = (x: number, y: number): boolean =>
      result.regions.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
    expect(covers(0, -2)).toBe(true)
    expect(covers(0, 3)).toBe(false)
    expect(result.segments.length).toBeGreaterThan(0)
  })

  it('respects strict versus non-strict sides identically in coverage', () => {
    const loose = sampleInequality(fieldFor('y - x'), '<=', VIEW)
    const strict = sampleInequality(fieldFor('y - x'), '<', VIEW)
    expect(loose.regions.length).toBe(strict.regions.length)
  })
})
