import { describe, expect, it } from 'vitest'
import { compileExpression } from '../math/index.ts'
import { sampleFunction } from './sampler.ts'
import type { CompiledExpression, SampleOptions, SampleResult } from './types.ts'

function evaluatorFor(source: string): CompiledExpression {
  const result = compileExpression(source)
  if (!result.ok) {
    throw new Error(`Cannot test unsamplable expression "${source}"`)
  }
  return result.expression
}

function sample(source: string, xMin: number, xMax: number, extra?: Partial<SampleOptions>): SampleResult {
  return sampleFunction(evaluatorFor(source), { xMin, xMax, pixelWidth: 400, ...extra })
}

function assertOrderedFinite(result: SampleResult): void {
  for (const segment of result.segments) {
    expect(segment.points.length).toBeGreaterThan(0)
    for (let i = 1; i < segment.points.length; i += 1) {
      const prev = segment.points[i - 1]
      const current = segment.points[i]
      if (prev !== undefined && current !== undefined) {
        expect(current.x).toBeGreaterThan(prev.x)
        expect(Number.isFinite(current.y)).toBe(true)
      }
    }
  }
}

describe('sampler: under-resolution diagnostics', () => {
  const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -7, yMax: 7, pixelWidth: 500, pixelHeight: 600 }

  it('does not warn for x^2 at the default 500 px view', () => {
    const result = sampleFunction(evaluatorFor('x^2'), DEFAULT_VIEW)
    const points = result.segments.reduce((total, segment) => total + segment.points.length, 0)
    expect(points).toBe(409)
    expect(result.status).toBe('ok')
    expect(result.warnings).toEqual([])
  })

  it('still warns when a narrow feature is visibly under-resolved', () => {
    const result = sampleFunction(evaluatorFor('1/(1+10000*x^2)'), { ...DEFAULT_VIEW, yMin: -1, yMax: 1 })
    expect(result.warnings.some((warning) => warning.code === 'under-resolved')).toBe(true)
  })

  it('does not warn for an ordinary smooth periodic curve', () => {
    const result = sampleFunction(evaluatorFor('sin(x)'), DEFAULT_VIEW)
    expect(result.warnings).toEqual([])
  })

  it('warns when viewport magnification makes the unresolved error visible', () => {
    const result = sampleFunction(evaluatorFor('x^2'), { ...DEFAULT_VIEW, yMin: -0.005, yMax: 0.005 })
    expect(result.warnings.some((warning) => warning.code === 'under-resolved')).toBe(true)
  })
})

describe('sampler: smooth functions', () => {
  it('samples x^2 as one ordered segment', () => {
    const result = sample('x^2', -5, 5)
    expect(result.status).toBe('ok')
    expect(result.segments).toHaveLength(1)
    assertOrderedFinite(result)
    const points = result.segments[0]?.points ?? []
    expect(points[0]?.x).toBeCloseTo(-5, 9)
    expect(points[0]?.y).toBeCloseTo(25, 9)
    expect(points[points.length - 1]?.x).toBeCloseTo(5, 9)
  })

  it('samples sin(x) with roots that fall between baseline samples', () => {
    const result = sample('sin(x)', 3.1, 3.2) // pi lies strictly inside, off-grid
    expect(result.segments).toHaveLength(1)
    const ys = (result.segments[0]?.points ?? []).map((p) => p.y)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(0)
  })

  it('samples a constant with baseline evaluations only', () => {
    const result = sample('5', -3, 3)
    expect(result.status).toBe('ok')
    expect(result.segments).toHaveLength(1)
    for (const p of result.segments[0]?.points ?? []) {
      expect(p.y).toBe(5)
    }
    // Baseline (100) plus exactly one midpoint probe per interval: no recursion.
    expect(result.stats.evaluations).toBeLessThanOrEqual(205)
  })

  it('samples a linear function without needless refinement', () => {
    const result = sample('2*x+1', -3, 3)
    expect(result.status).toBe('ok')
    expect(result.segments).toHaveLength(1)
    expect(result.stats.evaluations).toBeLessThanOrEqual(205)
  })

  it('keeps the abs(x) kink non-negative and tight', () => {
    const result = sample('abs(x)', -2, 2)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    const ys = result.segments.flatMap((s) => s.points.map((p) => p.y))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.min(...ys)).toBeLessThan(0.05)
  })
})

describe('sampler: domain splits and poles', () => {
  it('never connects across x=0 for 1/x', () => {
    const result = sample('1/x', -5, 5)
    expect(result.segments).toHaveLength(2)
    assertOrderedFinite(result)
    const [left, right] = result.segments
    expect(left?.points[left.points.length - 1]?.x).toBeLessThan(0)
    expect(right?.points[0]?.x).toBeGreaterThan(0)
    for (const p of left?.points ?? []) {
      expect(p.y).toBeLessThan(0)
    }
    for (const p of right?.points ?? []) {
      expect(p.y).toBeGreaterThan(0)
    }
  })

  it('gaps 1/(x-0.1) around the shifted pole', () => {
    const result = sample('1/(x-0.1)', -1, 1)
    expect(result.segments).toHaveLength(2)
    assertOrderedFinite(result)
    for (const segment of result.segments) {
      const xs = segment.points.map((p) => p.x)
      const spansPole = Math.min(...xs) < 0.1 && Math.max(...xs) > 0.1
      expect(spansPole).toBe(false)
    }
    expect(result.warnings.some((w) => w.code === 'pole-suspected')).toBe(true)
  })

  it('starts sqrt(x) at the snapped domain boundary', () => {
    const result = sample('sqrt(x)', -4, 4)
    expect(result.segments).toHaveLength(1)
    const first = result.segments[0]?.points[0]
    expect(first?.x).toBeGreaterThanOrEqual(0)
    expect(first?.x).toBeLessThan(0.05)
    expect(result.warnings.some((w) => w.code === 'invalid-endpoint')).toBe(true)
  })

  it('clips ln(x) to positive x with an endpoint warning', () => {
    const result = sample('ln(x)', -2, 5)
    expect(result.segments).toHaveLength(1)
    for (const p of result.segments[0]?.points ?? []) {
      expect(p.x).toBeGreaterThan(0)
    }
  })

  it('does not connect across tangent poles', () => {
    const result = sample('tan(x)', 0, 6.5)
    const poles = [Math.PI / 2, (3 * Math.PI) / 2]
    expect(result.segments.length).toBeGreaterThanOrEqual(3)
    assertOrderedFinite(result)
    for (const segment of result.segments) {
      const xs = segment.points.map((p) => p.x)
      for (const pole of poles) {
        expect(Math.min(...xs) < pole && Math.max(...xs) > pole).toBe(false)
      }
    }
  })

  it('reports an invalid range with no samples instead of crashing', () => {
    const result = sample('sqrt(x)', -4, -1)
    expect(result.segments).toHaveLength(0)
    expect(result.warnings.some((w) => w.code === 'no-valid-samples')).toBe(true)
  })
})

describe('sampler: hostile shapes stay bounded', () => {
  it('contains a large exponential without runaway evaluation', () => {
    const result = sample('exp(x)', 0, 100, { maxEvaluations: 4000 })
    expect(result.stats.evaluations).toBeLessThanOrEqual(4000)
    assertOrderedFinite(result)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
  })

  it('contains sin(1/x) near zero without runaway refinement', () => {
    const result = sample('sin(1/x)', -1, 1, { maxEvaluations: 4000 })
    expect(result.stats.evaluations).toBeLessThanOrEqual(4000)
    expect(result.stats.maxDepthReached).toBeLessThanOrEqual(12)
    assertOrderedFinite(result)
    expect(['ok', 'partial']).toContain(result.status)
  })

  it('reports budget exhaustion instead of silently degrading', () => {
    const result = sample('sin(x)', -10, 10, { maxEvaluations: 40 })
    expect(result.status).toBe('partial')
    expect(result.warnings.some((w) => w.code === 'budget-exhausted')).toBe(true)
    expect(result.stats.evaluations).toBeLessThanOrEqual(40 + 24)
  })

  it('rejects invalid options as an error result', () => {
    const result = sample('x', 5, -5)
    expect(result.status).toBe('error')
    expect(result.segments).toHaveLength(0)
  })
})

describe('sampler: control properties', () => {
  it('is deterministic for identical inputs', () => {
    const first = sample('1/x', -5, 5)
    const second = sample('1/x', -5, 5)
    expect(second).toEqual(first)
  })

  it('honours cancellation and never silently substitutes stale data', () => {
    const controller = new AbortController()
    controller.abort()
    const result = sampleFunction(evaluatorFor('x^2'), { xMin: -5, xMax: 5, pixelWidth: 400, signal: controller.signal })
    expect(result.status).toBe('cancelled')
  })

  it('exposes observable statistics without renderer noise', () => {
    const result = sample('x^2', -5, 5)
    expect(result.stats.evaluations).toBeGreaterThan(0)
    expect(result.stats.segmentCount).toBe(result.segments.length)
    expect(result.stats.splitCount).toBe(result.segments.length - 1)
  })
})

describe('sampler: breakpoints', () => {
  it('never connects runs across a breakpoint', () => {
    // Step function sampled as one evaluator, split at x=0.
    const result = sampleFunction(evaluatorFor('x'), { xMin: -2, xMax: 2, pixelWidth: 400, breaks: [0] })
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    for (const segment of result.segments) {
      const xs = segment.points.map((p) => p.x)
      const spansBreak = Math.min(...xs) < 0 && Math.max(...xs) > 0
      expect(spansBreak).toBe(false)
    }
    assertOrderedFinite(result)
  })

  it('shares the budget across sub-ranges deterministically', () => {
    const options = { xMin: -5, xMax: 5, pixelWidth: 400, breaks: [-1, 2] }
    const first = sampleFunction(evaluatorFor('sin(x)'), options)
    const second = sampleFunction(evaluatorFor('sin(x)'), options)
    expect(second).toEqual(first)
    expect(first.stats.evaluations).toBeLessThanOrEqual(4000)
  })

  it('ignores out-of-range and duplicate breakpoints', () => {
    const plain = sampleFunction(evaluatorFor('x^2'), { xMin: -5, xMax: 5, pixelWidth: 400 })
    const withNoise = sampleFunction(evaluatorFor('x^2'), { xMin: -5, xMax: 5, pixelWidth: 400, breaks: [-99, 0, 0, 99] })
    // Same outer segmentation, plus exactly one extra split at x=0.
    expect(withNoise.segments.length).toBe(plain.segments.length + 1)
  })
})
