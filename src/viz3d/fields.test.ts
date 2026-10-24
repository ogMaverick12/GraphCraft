import { describe, expect, it } from 'vitest'
import { compileSurface } from './surface.ts'
import {
  autoLevels,
  colorForField,
  contourLevels,
  layoutArrows,
  MAX_ARROWS_PER_SIDE,
  parseLevelList,
  probeRange,
  resolveScale,
} from './fields.ts'
import type { FieldEvaluator } from '../math/index.ts'

const DOMAIN = { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }

function fieldOf(source: string): FieldEvaluator {
  const compiled = compileSurface(source, [])
  if (!compiled.ok) {
    throw new Error(`Expected compilable field: ${compiled.error}`)
  }
  return compiled.field
}

describe('viridis colour scale', () => {
  it('pins dark-to-bright ends and clamps outside values', () => {
    expect(colorForField(0, 0, 10)).toBe('#440154')
    expect(colorForField(10, 0, 10)).toBe('#fde725')
    expect(colorForField(-5, 0, 10)).toBe('#440154')
    expect(colorForField(99, 0, 10)).toBe('#fde725')
  })

  it('lands mid-ramp on degenerate ranges instead of dividing by zero', () => {
    expect(colorForField(3, 3, 3)).not.toBe('#440154')
  })

  it('centres the diverging scale on neutral with labelled ends', () => {
    expect(colorForField(0, -10, 10, 'diverging')).toBe('#f5f3ef')
    expect(colorForField(-10, -10, 10, 'diverging')).toBe('#1d4ed8')
    expect(colorForField(10, -10, 10, 'diverging')).toBe('#b91c1c')
  })
})

describe('scale policy resolution', () => {
  it('follows finite data on auto', () => {
    expect(resolveScale(2, 8, { policy: 'auto', fixedMin: null, fixedMax: null })).toMatchObject({ min: 2, max: 8, fallback: false })
  })

  it('centres symmetric scales on the larger magnitude', () => {
    expect(resolveScale(-2, 8, { policy: 'symmetric', fixedMin: null, fixedMax: null })).toMatchObject({ min: -8, max: 8 })
  })

  it('honours valid fixed bounds and falls back loudly otherwise', () => {
    expect(resolveScale(0, 1, { policy: 'fixed', fixedMin: 2, fixedMax: 5 })).toMatchObject({ min: 2, max: 5, fallback: false })
    const bad = resolveScale(0, 1, { policy: 'fixed', fixedMin: 5, fixedMax: 2 })
    expect(bad.fallback).toBe(true)
    expect(bad.note).toMatch(/Fixed bounds invalid/)
    const empty = resolveScale(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, { policy: 'auto', fixedMin: null, fixedMax: null })
    expect(empty).toMatchObject({ min: 0, max: 1, fallback: true })
  })
})

describe('contour levels through marching squares', () => {
  it('traces the known circle x²+y²=4 at level 4', () => {
    const levels = contourLevels(fieldOf('x^2+y^2'), 'x^2+y^2', DOMAIN, [4], 200)
    expect(levels).toHaveLength(1)
    const points = levels[0]?.segments.flat() ?? []
    expect(points.length).toBeGreaterThan(8)
    // Every traced point sits on the radius-2 circle.
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(2, 1)
    }
  })

  it('traces ellipses at known levels', () => {
    // x²/4 + y² = 9: level 9 passes through (0, ±3) and (±6, 0).
    const levels = contourLevels(fieldOf('x^2/4+y^2'), 'x^2/4+y^2', { xMin: -7, xMax: 7, yMin: -4, yMax: 4 }, [9], 200)
    const points = levels[0]?.segments.flat() ?? []
    expect(points.length).toBeGreaterThan(8)
    for (const point of points) {
      expect(point.x * point.x / 4 + point.y * point.y).toBeCloseTo(9, 0)
    }
  })

  it('returns empty segments (not errors) for levels with no crossings', () => {
    const levels = contourLevels(fieldOf('x^2+y^2'), 'x^2+y^2', DOMAIN, [-5], 120)
    expect(levels[0]?.segments).toEqual([])
  })

  it('skips non-finite levels and still contours through singular fields', () => {
    const levels = contourLevels(fieldOf('1/(x*y)'), '1/(x*y)', DOMAIN, [Number.NaN, 1], 160)
    expect(levels[0]?.segments).toEqual([])
    // Level 1 exists away from the axes (xy = 1 hyperbola branches).
    const points = levels[1]?.segments.flat() ?? []
    expect(points.length).toBeGreaterThan(0)
    // Away from the poles the interpolation is tight; pole-adjacent
    // cells are honestly coarse (documented approximation limit).
    const calm = points.filter((point) => Math.abs(point.x) > 0.5 && Math.abs(point.y) > 0.5)
    expect(calm.length).toBeGreaterThan(0)
    for (const point of calm) {
      expect(point.x * point.y).toBeCloseTo(1, 0)
    }
  })

  it('parses explicit level lists and builds even auto levels', () => {
    expect(parseLevelList('1, 2.5, 4')).toEqual({ levels: [1, 2.5, 4] })
    expect(parseLevelList('  ')).toEqual({ levels: [] })
    expect(parseLevelList('1, oops')).toEqual({ error: '"oops" is not a finite contour level.' })
    expect(autoLevels(0, 10, 3)).toEqual([2.5, 5, 7.5])
    expect(autoLevels(5, 5, 3)).toEqual([])
  })

  it('probes finite data ranges for auto levels', () => {
    const { min, max } = probeRange(fieldOf('x^2-y^2'), 'x^2-y^2', DOMAIN)
    expect(min).toBeCloseTo(-9, 6)
    expect(max).toBeCloseTo(9, 6)
  })
})

describe('vector arrow layout', () => {
  function arrows(u: string, v: string, n: number): Array<{ x: number; y: number; u: number; v: number } | null> {
    const cu = compileSurface(u, [])
    const cv = compileSurface(v, [])
    if (!cu.ok || !cv.ok) {
      throw new Error('uncompilable components')
    }
    const out: Array<{ x: number; y: number; u: number; v: number } | null> = []
    for (let j = 0; j <= n; j += 1) {
      const y = DOMAIN.yMin + ((DOMAIN.yMax - DOMAIN.yMin) * j) / n
      for (let i = 0; i <= n; i += 1) {
        const x = DOMAIN.xMin + ((DOMAIN.xMax - DOMAIN.xMin) * i) / n
        const uu = cu.field.evaluateField(x, y, {})
        const vv = cv.field.evaluateField(x, y, {})
        out.push(uu !== null && vv !== null && Number.isFinite(uu.value) && Number.isFinite(vv.value) ? { x, y, u: uu.value, v: vv.value } : null)
      }
    }
    return out
  }

  it('keeps uniform fields parallel and equal', () => {
    const grid = layoutArrows(arrows('1', '0', 8), 8, 'magnitude', 0.4)
    expect(grid.stride).toBe(1)
    expect(grid.maxMagnitude).toBeCloseTo(1, 12)
    const angles = new Set(grid.arrows.map((a) => a.angle.toFixed(9)))
    expect(angles.size).toBe(1)
  })

  it('caps density with a visible stride on dense grids', () => {
    const grid = layoutArrows(arrows('x', 'y', 64), 64, 'magnitude', 0.4)
    expect(grid.stride).toBeGreaterThan(1)
    const perSide = Math.ceil(65 / grid.stride)
    expect(perSide).toBeLessThanOrEqual(MAX_ARROWS_PER_SIDE + 1)
    expect(grid.arrows.length).toBeLessThanOrEqual(perSide * perSide)
  })

  it('marks unit mode direction-only with constant lengths', () => {
    const grid = layoutArrows(arrows('x', 'y', 8), 8, 'unit', 0.4)
    const lengths = new Set(grid.arrows.map((a) => a.length.toFixed(12)))
    expect(lengths.size).toBe(1)
    // Radial field points outward: angle matches position angle.
    for (const arrow of grid.arrows.slice(0, 20)) {
      expect(arrow.angle).toBeCloseTo(Math.atan2(arrow.y, arrow.x), 9)
    }
  })

  it('drops singular arrows as holes', () => {
    const grid = layoutArrows(arrows('1/x', 'y', 8), 8, 'magnitude', 0.4)
    // x = 0 column (9 arrows) is singular.
    expect(grid.arrows.length).toBeLessThan(81)
  })
})
