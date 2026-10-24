import { describe, expect, it } from 'vitest'
import { compileSurface, DEFAULT_CAMERA, projectSurface, sampleSurface } from './surface.ts'
import { renderSurfaceSvgText } from './surfaceSvg.ts'

function built(appearance: 'solid' | 'wireframe' | 'shaded'): string {
  const compiled = compileSurface('x^2+y^2', [])
  if (!compiled.ok) {
    throw new Error('expected compilable surface')
  }
  const spec = { source: 'x^2+y^2', domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, resolution: 24 }
  const sampled = sampleSurface(compiled.field, spec)
  const projected = projectSurface(sampled, spec, DEFAULT_CAMERA, { width: 640, height: 440 })
  const ticks = { xTicks: [{ px: 100, label: '-1' }], yTicks: [{ py: 200, label: '0' }] }
  return renderSurfaceSvgText({
    quads: projected.quads,
    axes: projected.axes,
    ...ticks,
    vMin: sampled.finiteMin,
    vMax: sampled.finiteMax,
    title: 'Bowl',
    source: 'x^2+y^2',
    appearance,
    showGrid: true,
    size: { width: 640, height: 440 },
  })
}

function parseSvg(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBe(null)
  return doc
}

describe('surface SVG export structure', () => {
  it('carries plate, title, axes, ticks, colorbar, and one polygon per quad', () => {
    const svg = built('solid')
    const doc = parseSvg(svg)
    expect(svg).toContain('fill="#ffffff"')
    expect(doc.documentElement.textContent).toContain('Bowl')
    expect(doc.documentElement.textContent).toContain('z 8')
    expect(doc.documentElement.textContent).toContain('z 0')
    // Axes (3) + ticks + colorbar swatches are lines/rects/texts; quads are polygons.
    expect(doc.querySelectorAll('polygon').length).toBe(24 * 24)
    expect(doc.querySelectorAll('line').length).toBeGreaterThanOrEqual(3)
    expect(svg).not.toContain('Graph viewport')
    expect(svg).not.toContain('Export SVG')
  })

  it('renders wireframe without fills and shaded without changing counts', () => {
    const wire = built('wireframe')
    expect(wire).toContain('fill="none"')
    expect(parseSvg(wire).querySelectorAll('polygon')).toHaveLength(24 * 24)
    const shaded = built('shaded')
    expect(parseSvg(shaded).querySelectorAll('polygon')).toHaveLength(24 * 24)
  })
})

describe('maximum grid caps', () => {
  it('completes the 128² grid within a generous budget with exact counts', () => {
    const compiled = compileSurface('sin(x)*cos(y)', [])
    if (!compiled.ok) {
      throw new Error('expected compilable surface')
    }
    const spec = { source: 'sin(x)*cos(y)', domain: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, resolution: 128 }
    const started = Date.now()
    const sampled = sampleSurface(compiled.field, spec)
    const projected = projectSurface(sampled, spec, DEFAULT_CAMERA, { width: 640, height: 440 })
    expect(Date.now() - started).toBeLessThan(15000)
    expect(sampled.evals).toBe(129 * 129)
    expect(projected.quads.length + projected.dropped).toBe(128 * 128)
  }, 30000)
})
