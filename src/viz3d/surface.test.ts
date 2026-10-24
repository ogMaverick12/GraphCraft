import { describe, expect, it } from 'vitest'
import { MAX_PROJECT_SURFACE_GRID, MIN_PROJECT_SURFACE_GRID } from '../project/schema.ts'
import {
  COARSE_RESOLUTION,
  clampCamera,
  colorForValue,
  compileSurface,
  DEFAULT_CAMERA,
  inspectSurface,
  MAX_SURFACE_GRID,
  MIN_SURFACE_GRID,
  projectWorldPoint,
  makeProjectionFrame,
  sampleVectorField,
  validateVectorFieldSpec,
  projectSurface,
  sampleSurface,
  shadeColor,
  shadeFactor,
  validateSurfaceSpec,
  type SurfaceSpec,
} from './surface.ts'

function spec(source: string, resolution = 48): SurfaceSpec {
  return { source, domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, resolution }
}

function fieldOf(source: string): { evaluateField: (x: number, y: number, p?: Record<string, number>) => { value: number } | null } {
  const compiled = compileSurface(source, [])
  if (!compiled.ok) {
    throw new Error(`Expected compilable surface: ${compiled.error}`)
  }
  return compiled.field
}

describe('surface sampling', () => {
  it('keeps sampler and project grid caps in agreement', () => {
    expect(MAX_SURFACE_GRID).toBe(MAX_PROJECT_SURFACE_GRID)
    expect(MIN_SURFACE_GRID).toBe(MIN_PROJECT_SURFACE_GRID)
  })
  it('compiles z = f(x, y) through the gated engine and rejects bad syntax', () => {
    expect(compileSurface('x+y', []).ok).toBe(true)
    expect(compileSurface('x +', []).ok).toBe(false)
    // Single-variable leftovers and unknown names are refused, not defaulted.
    expect(compileSurface('x+z', []).ok).toBe(false)
  })

  it('samples a plane exactly', () => {
    const sampled = sampleSurface(fieldOf('2*x+3*y+1'), spec('2*x+3*y+1', 24))
    expect(sampled.evals).toBe(25 * 25)
    expect(sampled.holes).toBe(0)
    // Corners: (-2,-2) → -9; (2,2) → 11.
    expect(sampled.grid[0]).toBeCloseTo(-9, 12)
    expect(sampled.grid[sampled.grid.length - 1]).toBeCloseTo(11, 12)
    expect(sampled.finiteMin).toBeCloseTo(-9, 12)
    expect(sampled.finiteMax).toBeCloseTo(11, 12)
  })

  it('samples paraboloid and saddle with correct centres', () => {
    const bowl = sampleSurface(fieldOf('x^2+y^2'), spec('x^2+y^2', 40))
    expect(bowl.finiteMin).toBeCloseTo(0, 9)
    const saddle = sampleSurface(fieldOf('x^2-y^2'), spec('x^2-y^2', 40))
    // Saddle at origin is 0 with ±4 at the edge midpoints.
    expect(saddle.finiteMin).toBeCloseTo(-4, 9)
    expect(saddle.finiteMax).toBeCloseTo(4, 9)
  })

  it('honours restricted domains', () => {
    const sampled = sampleSurface(fieldOf('x+y'), { source: 'x+y', domain: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, resolution: 8 })
    expect(sampled.finiteMin).toBeCloseTo(0, 12)
    expect(sampled.finiteMax).toBeCloseTo(2, 12)
  })

  it('marks invalid regions as holes instead of bridging them', () => {
    // 1/(x*y) blows up along both axes inside the domain.
    const sampled = sampleSurface(fieldOf('1/(x*y)'), spec('1/(x*y)', 24))
    expect(sampled.holes).toBeGreaterThan(0)
    const projected = projectSurface(sampled, spec('1/(x*y)', 24), DEFAULT_CAMERA, { width: 640, height: 440 })
    // Every hole vertex kills up to 4 quads: drawn + dropped covers the grid.
    expect(projected.quads.length + projected.dropped).toBe(24 * 24)
    expect(projected.quads.length).toBeGreaterThan(0)
  })

  it('refuses out-of-range resolutions with numbers', () => {
    expect(validateSurfaceSpec(spec('x+y', 7))).toMatch(/8/)
    expect(validateSurfaceSpec(spec('x+y', MAX_SURFACE_GRID + 1))).toMatch(/128/)
    expect(validateSurfaceSpec(spec('x+y', 48))).toBe(null)
    expect(validateSurfaceSpec({ source: '  ', domain: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, resolution: 24 })).toMatch(/expression/)
    expect(validateSurfaceSpec({ source: 'x', domain: { xMin: 1, xMax: -1, yMin: 0, yMax: 1 }, resolution: 24 })).toMatch(/max above min/)
  })

  it('flags coarse grids below the density rule', () => {
    expect(24 < COARSE_RESOLUTION).toBe(true)
    expect(48 < COARSE_RESOLUTION).toBe(false)
  })
})

describe('projection and ordering', () => {
  it('orbits yaw by ninety degrees onto the other axis', () => {
    const sampled = sampleSurface(fieldOf('x'), spec('x', 8))
    const facingX = projectSurface(sampled, spec('x', 8), { ...DEFAULT_CAMERA, yaw: 0, pitch: 0, distance: 100 }, { width: 640, height: 440 })
    const turned = projectSurface(sampled, spec('x', 8), { ...DEFAULT_CAMERA, yaw: Math.PI / 2, pitch: 0, distance: 100 }, { width: 640, height: 440 })
    // Same quad count (no holes in a plane), mirrored horizontal extents.
    expect(facingX.quads.length).toBe(turned.quads.length)
    const span = (quads: typeof facingX.quads): number => Math.max(...quads.flatMap((q) => q.corners.map((c) => c.px))) - Math.min(...quads.flatMap((q) => q.corners.map((c) => c.px)))
    expect(span(facingX.quads)).toBeCloseTo(span(turned.quads), 6)
  })

  it('sorts quads far-to-near by depth, with nearer quads later in paint order', () => {
    const sampled = sampleSurface(fieldOf('x+y'), spec('x+y', 16))
    const { quads } = projectSurface(sampled, spec('x+y', 16), DEFAULT_CAMERA, { width: 640, height: 440 })
    for (let i = 1; i < quads.length; i += 1) {
      expect((quads[i]?.depth ?? 0) <= (quads[i - 1]?.depth ?? 0)).toBe(true)
    }
    // Perspective pins the physics: the nearest quad (smallest view depth)
    // projects larger on screen than the farthest one, and both renderers
    // paint later polygons on top — so the nearer quad must come later.
    const area = (index: number): number => {
      const corners = quads[index]?.corners ?? []
      let sum = 0
      for (let k = 0; k < corners.length; k += 1) {
        const p1 = corners[k]
        const p2 = corners[(k + 1) % corners.length]
        if (p1 === undefined || p2 === undefined) {
          return 0
        }
        sum += p1.px * p2.py - p2.px * p1.py
      }
      return Math.abs(sum) / 2
    }
    let nearIndex = 0
    let farIndex = 0
    quads.forEach((quad, index) => {
      if (quad.depth > (quads[farIndex]?.depth ?? Number.NEGATIVE_INFINITY)) {
        farIndex = index
      }
      if (quad.depth < (quads[nearIndex]?.depth ?? Number.POSITIVE_INFINITY)) {
        nearIndex = index
      }
    })
    expect(area(nearIndex)).toBeGreaterThan(area(farIndex))
    expect(nearIndex).toBeGreaterThan(farIndex)
  })

  it('keeps every projected corner finite', () => {
    const sampled = sampleSurface(fieldOf('sin(x)*cos(y)'), spec('sin(x)*cos(y)', 32))
    const { quads } = projectSurface(sampled, spec('sin(x)*cos(y)', 32), DEFAULT_CAMERA, { width: 640, height: 440 })
    expect(quads.length).toBeGreaterThan(0)
    for (const quad of quads) {
      for (const corner of quad.corners) {
        expect(Number.isFinite(corner.px)).toBe(true)
        expect(Number.isFinite(corner.py)).toBe(true)
      }
    }
  })
})

describe('height colour mapping', () => {
  it('pins the ramp ends and midpoints', () => {
    expect(colorForValue(0, 0, 10)).toBe('#1d4ed8')
    expect(colorForValue(10, 0, 10)).toBe('#b91c1c')
    expect(colorForValue(5, 0, 10)).not.toBe('#1d4ed8')
  })

  it('lands mid-ramp for constant surfaces instead of dividing by zero', () => {
    expect(colorForValue(3, 3, 3)).toBe('#047857')
  })
})

describe('camera bounds and inspection', () => {
  it('clamps pitch, distance, pan, and non-finite cameras', () => {
    expect(clampCamera({ ...DEFAULT_CAMERA, pitch: Math.PI }).pitch).toBeCloseTo(Math.PI / 2 - 0.05, 12)
    expect(clampCamera({ ...DEFAULT_CAMERA, pitch: -Math.PI }).pitch).toBeCloseTo(-Math.PI / 2 + 0.05, 12)
    expect(clampCamera({ ...DEFAULT_CAMERA, distance: 0 }).distance).toBe(4)
    expect(clampCamera({ ...DEFAULT_CAMERA, distance: 1000 }).distance).toBe(60)
    expect(clampCamera({ ...DEFAULT_CAMERA, panX: 1e9 }).panX).toBe(1e6)
    expect(clampCamera({ yaw: Number.NaN, pitch: Number.NaN, distance: Number.NaN, panX: Number.NaN, panY: Number.NaN })).toEqual(DEFAULT_CAMERA)
  })

  it('inspects exact plane values through a projected round-trip', () => {
    const field = fieldOf('2*x+3*y+1')
    const current = spec('2*x+3*y+1', 24)
    const sampled = sampleSurface(field, current)
    const camera = { yaw: 0, pitch: 0.6, distance: 12, panX: 0, panY: 0 }
    const size = { width: 640, height: 440 }
    // Project vertex (x=0, y=0, z=1), then inspect its own pixels.
    const frame = makeProjectionFrame(current, camera, size)
    const placed = projectWorldPoint(frame, 0, 0, 1)
    expect(placed).not.toBe(null)
    if (placed === null) {
      throw new Error('expected a projection')
    }
    const outcome = inspectSurface(sampled, current, camera, size, placed.px, placed.py)
    // The reported vertex lies exactly on the plane (self-consistent alignment).
    expect(outcome.status).toBe('value')
    if (outcome.status === 'value') {
      expect(outcome.z).toBeCloseTo(2 * outcome.x + 3 * outcome.y + 1, 9)
    }
  })

  it('reports holes and empty space honestly', () => {
    const field = fieldOf('1/(x*y)')
    const current = { source: '1/(x*y)', domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, resolution: 24 }
    const sampled = sampleSurface(field, current)
    expect(sampled.holes).toBeGreaterThan(0)
    const far = inspectSurface(sampled, current, DEFAULT_CAMERA, { width: 640, height: 440 }, -5000, -5000)
    expect(far).toEqual({ status: 'empty' })
  })

  it('never re-evaluates while orbiting (projection is evaluation-free)', () => {
    let evals = 0
    const field = fieldOf('x^2+y^2')
    const counting = {
      evaluateField: (x: number, y: number, p?: Record<string, number>): { value: number } | null => {
        evals += 1
        return field.evaluateField(x, y, p)
      },
    }
    const current = spec('x^2+y^2', 32)
    const sampled = sampleSurface(counting, current)
    expect(evals).toBe(33 * 33)
    const size = { width: 640, height: 440 }
    projectSurface(sampled, current, DEFAULT_CAMERA, size)
    projectSurface(sampled, current, { ...DEFAULT_CAMERA, yaw: 1.2, pitch: 0.9 }, size)
    projectSurface(sampled, current, { ...DEFAULT_CAMERA, distance: 30 }, size)
    expect(evals).toBe(33 * 33)
  })
})

describe('flat shading', () => {
  it('bounds factors and shades lit faces brighter than turned ones', () => {    expect(shadeFactor(0, 0, 0)).toBe(0.45)
    const up = shadeFactor(0, 0, 1)
    const down = shadeFactor(0, 0, -1)
    expect(up).toBeGreaterThan(down)
    expect(up).toBeLessThanOrEqual(1)
    expect(down).toBeGreaterThanOrEqual(0.45)
    expect(shadeColor('#ffffff', 0.5)).toBe('#808080')
    expect(shadeColor('#1d4ed8', 1)).toBe('#1d4ed8')
  })

  it('shades a tilted plane uniformly and a paraboloid variably', () => {
    const plane = sampleSurface(fieldOf('x+y'), spec('x+y', 16))
    const tilted = projectSurface(plane, spec('x+y', 16), DEFAULT_CAMERA, { width: 640, height: 440 })
    const shades = new Set(tilted.quads.map((q) => q.shade.toFixed(9)))
    expect(shades.size).toBe(1)
    const bowl = sampleSurface(fieldOf('x^2+y^2'), spec('x^2+y^2', 16))
    const curved = projectSurface(bowl, spec('x^2+y^2', 16), DEFAULT_CAMERA, { width: 640, height: 440 })
    expect(new Set(curved.quads.map((q) => q.shade.toFixed(3))).size).toBeGreaterThan(3)
  })
})

describe('vector field model', () => {
  function fields(u: string, v: string): { uField: { evaluateField: (x: number, y: number, p?: Record<string, number>) => { value: number } | null }; vField: { evaluateField: (x: number, y: number, p?: Record<string, number>) => { value: number } | null } } {
    const cu = compileSurface(u, [])
    const cv = compileSurface(v, [])
    if (!cu.ok || !cv.ok) {
      throw new Error('Expected compilable components')
    }
    return { uField: cu.field, vField: cv.field }
  }

  const domain = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }

  it('samples a constant field exactly', () => {
    const { uField, vField } = fields('1', '2')
    const sampled = sampleVectorField(uField, vField, { uSource: '1', vSource: '2', domain, resolution: 8 })
    expect(sampled.evals).toBe(2 * 9 * 9)
    expect(sampled.holes).toBe(0)
    expect(sampled.maxMagnitude).toBeCloseTo(Math.hypot(1, 2), 12)
    expect(sampled.arrows[0]).toEqual({ x: -1, y: -1, u: 1, v: 2 })
  })

  it('samples a rotation field with correct circulation', () => {
    const { uField, vField } = fields('-y', 'x')
    const sampled = sampleVectorField(uField, vField, { uSource: '-y', vSource: 'x', domain, resolution: 8 })
    // At (1, 0) the arrow must point along +y; at (0, 1) along −x.
    const at = (x: number, y: number): { u: number; v: number } => {
      const found = sampled.arrows.find((a) => a !== null && Math.abs(a.x - x) < 1e-9 && Math.abs(a.y - y) < 1e-9)
      if (found === null || found === undefined) {
        throw new Error(`missing arrow at (${x}, ${y})`)
      }
      return found
    };
    expect(at(1, 0).v).toBeCloseTo(1, 12)
    expect(at(0, 1).u).toBeCloseTo(-1, 12)
  })

  it('marks invalid components as holes and refuses bad specs', () => {
    const { uField, vField } = fields('1/x', 'y')
    const sampled = sampleVectorField(uField, vField, { uSource: '1/x', vSource: 'y', domain, resolution: 8 })
    expect(sampled.holes).toBeGreaterThan(0)
    expect(validateVectorFieldSpec({ uSource: '', vSource: 'y', domain, resolution: 8 })).toMatch(/expression/)
    expect(validateVectorFieldSpec({ uSource: 'x', vSource: 'y', domain, resolution: 200 })).toMatch(/8.*128|integer/)
    expect(validateVectorFieldSpec({ uSource: 'x', vSource: 'y', domain: { xMin: 1, xMax: -1, yMin: 0, yMax: 1 }, resolution: 8 })).toMatch(/max above min/)
    expect(validateVectorFieldSpec({ uSource: 'x', vSource: 'y', domain, resolution: 16 })).toBe(null)
  })
})
