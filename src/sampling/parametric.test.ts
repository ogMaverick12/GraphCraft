import { describe, expect, it } from 'vitest'
import type { PointEvaluator } from '../math/index.ts'
import { sampleParametric } from './parametric.ts'

const TWO_PI = Math.PI * 2

function circle(t: number): { x: number; y: number } | null {
  return { x: Math.cos(t), y: Math.sin(t) }
}

describe('parametric sampler', () => {
  it('traces a full circle smoothly and closed', () => {
    const evaluator: PointEvaluator = { evaluatePoint: (t) => circle(t) }
    const result = sampleParametric(evaluator, { xMin: 0, xMax: TWO_PI, pixelWidth: 400 })
    expect(result.status).toBe('ok')
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    const points = result.segments.flatMap((s) => s.points)
    expect(points.length).toBeGreaterThan(32)
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 1)
    }
    // Closed: first and last samples meet (no artificial closing segment).
    const first = points[0]
    const last = points[points.length - 1]
    if (first !== undefined && last !== undefined) {
      expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.05)
    }
  })

  it('draws a line segment end to end', () => {
    const evaluator: PointEvaluator = { evaluatePoint: (t) => ({ x: t, y: 2 * t + 1 }) }
    const result = sampleParametric(evaluator, { xMin: 0, xMax: 1, pixelWidth: 100 })
    expect(result.segments).toHaveLength(1)
    const points = result.segments[0]?.points ?? []
    expect(points[0]).toMatchObject({ x: 0, y: 1 })
    const end = points[points.length - 1]
    expect(end?.x).toBeCloseTo(1, 9)
    expect(end?.y).toBeCloseTo(3, 9)
  })

  it('splits around a pole without connecting', () => {
    const evaluator: PointEvaluator = {
      evaluatePoint: (t) => {
        if (t === 1) {
          return null
        }
        const y = 1 / (t - 1)
        return Number.isFinite(y) ? { x: t, y } : null
      },
    }
    const result = sampleParametric(evaluator, { xMin: 0, xMax: 2, pixelWidth: 400 })
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    for (const segment of result.segments) {
      const ts = segment.points.map((p) => p.x)
      expect(Math.min(...ts) < 1 && Math.max(...ts) > 1).toBe(false)
    }
  })

  it('reports fully invalid intervals instead of crashing', () => {
    const evaluator: PointEvaluator = {
      evaluatePoint: (t) => (t >= 0 ? { x: t, y: Math.sqrt(t) } : null),
    }
    const result = sampleParametric(evaluator, { xMin: -2, xMax: -1, pixelWidth: 100 })
    expect(result.segments).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('is deterministic and bounded on wild oscillation', () => {
    const evaluator: PointEvaluator = { evaluatePoint: (t) => (t === 0 ? null : { x: t, y: Math.sin(1 / t) }) }
    const options = { xMin: -1, xMax: 1, pixelWidth: 400, maxEvaluations: 4000 }
    const first = sampleParametric(evaluator, options)
    const second = sampleParametric(evaluator, options)
    expect(second).toEqual(first)
    expect(first.stats.evaluations).toBeLessThanOrEqual(4000)
    expect(first.stats.maxDepthReached).toBeLessThanOrEqual(12)
  })
})
