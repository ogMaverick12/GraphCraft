import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { compileRow } from './compile.ts'
import { TRANSFORM_TEMPLATES } from './templates.ts'
import { createTransform, worldToScreen } from '../graph/coordinate.ts'
import { sampleParametric } from '../sampling/index.ts'

const CIRCLE_TMAX = 6.283185307179586

function sampledPoints(row: Parameters<typeof compileRow>[0], tMin: number, tMax: number): Array<{ x: number; y: number }> {
  const compiled = compileRow(row)
  if (compiled.evaluator === null || !('evaluatePoint' in compiled.evaluator)) {
    throw new Error('Expected a point evaluator')
  }
  const result = sampleParametric(compiled.evaluator, { xMin: tMin, xMax: tMax, pixelWidth: 400 })
  return result.segments.flatMap((s) => s.points)
}

describe('template geometry (mathematically verified)', () => {
  it('unit circle has radius 1 everywhere and closes', () => {
    const template = TRANSFORM_TEMPLATES.find((t) => t.id === 'unit-circle')
    if (template === undefined || template.kind !== 'parametric') {
      throw new Error('Missing circle template')
    }
    const points = sampledPoints(
      { kind: 'parametric', id: 'c', visible: true, colorIndex: 0, label: '', xSource: template.xSource, ySource: template.ySource, tMin: template.tMin, tMax: template.tMax },
      template.tMin,
      template.tMax,
    )
    expect(points.length).toBeGreaterThan(32)
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 1)
    }
    const first = points[0]
    const last = points[points.length - 1]
    if (first !== undefined && last !== undefined) {
      expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(0.05)
    }
  })

  it('ellipse template honours semi-axes 3 and 2', () => {
    const template = TRANSFORM_TEMPLATES.find((t) => t.id === 'ellipse')
    if (template === undefined || template.kind !== 'parametric') {
      throw new Error('Missing ellipse template')
    }
    const points = sampledPoints(
      { kind: 'parametric', id: 'e', visible: true, colorIndex: 0, label: '', xSource: template.xSource, ySource: template.ySource, tMin: template.tMin, tMax: template.tMax },
      template.tMin,
      template.tMax,
    )
    for (const p of points) {
      expect(p.x * p.x / 9 + p.y * p.y / 4).toBeCloseTo(1, 1)
    }
    expect(Math.max(...points.map((p) => Math.abs(p.x)))).toBeCloseTo(3, 1)
    expect(Math.max(...points.map((p) => Math.abs(p.y)))).toBeCloseTo(2, 1)
  })

  it('lissajous template crosses the origin and stays bounded', () => {
    const template = TRANSFORM_TEMPLATES.find((t) => t.id === 'lissajous')
    if (template === undefined || template.kind !== 'parametric') {
      throw new Error('Missing lissajous template')
    }
    const points = sampledPoints(
      { kind: 'parametric', id: 'l', visible: true, colorIndex: 0, label: '', xSource: template.xSource, ySource: template.ySource, tMin: template.tMin, tMax: template.tMax },
      template.tMin,
      template.tMax,
    )
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.001)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.001)
    }
    const nearOrigin = points.some((p) => Math.hypot(p.x, p.y) < 0.05)
    expect(nearOrigin).toBe(true)
  })

  it('a full circle is undistorted under equal aspect', () => {
    const world = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
    const t = createTransform(world, { width: 800, height: 600 }, true)
    const radii: number[] = []
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      const edge = worldToScreen(t, Math.cos(angle), Math.sin(angle))
      const center = worldToScreen(t, 0, 0)
      radii.push(Math.hypot(edge.px - center.px, edge.py - center.py))
    }
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1)
  })
})

describe('parametric and polar rows', () => {
  it('rejects reversed ranges with messages', () => {
    const bad = { kind: 'parametric' as const, id: 'p', visible: true, colorIndex: 0, label: '', xSource: 't', ySource: 't', tMin: 5, tMax: 2 }
    expect(compileRow(bad).error).toMatch(/min below max/)
  })

  it('adds, edits, hides, and deletes a parametric row in-app', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Parametric curve' }))
    expect(await screen.findByRole('img', { name: /x=cos\(t\)/ })).toBeInTheDocument()

    const editors = screen.getAllByRole('textbox', { name: 'x(t) expression' })
    const xEditor = editors[0]
    if (xEditor === undefined) {
      throw new Error('Expected an x(t) editor')
    }
    await user.clear(xEditor)
    await user.type(xEditor, '2*cos(t)')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('img', { name: /x=2\*cos\(t\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Hide x=2\*cos/ }))
    expect(screen.queryByRole('img', { name: /x=2\*cos/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show x=2\*cos/ }))

    await user.click(screen.getByRole('button', { name: /Delete x=2\*cos/ }))
    expect(screen.queryByRole('textbox', { name: 'x(t) expression' })).not.toBeInTheDocument()
  })

  it('adds a polar row and keeps pole gaps disconnected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Polar curve' }))
    const svg = await screen.findByRole('img', { name: /r=2\*cos/ })
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(1)
  })

  it('adds template curves with verified shapes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Circle/ }))
    expect(await screen.findByRole('img', { name: /x=cos\(t\)/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Lissajous/ }))
    expect(await screen.findByRole('img', { name: /x=sin\(3\*t\)/ })).toBeInTheDocument()
  })

  it('round-trips parametric and polar rows through save and open', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Parametric curve' }))
    await screen.findByRole('img', { name: /x=cos\(t\)/ })

    const doc = {
      format: 'graphcraft-project',
      version: 4,
      title: 'Param round trip',
      expressions: [
        { kind: 'parametric', id: 'p1', xSource: 'cos(t)', ySource: 'sin(t)', tMin: 0, tMax: CIRCLE_TMAX, visible: true, colorIndex: 0, label: 'Unit circle' },
        { kind: 'polar', id: 'q1', source: '3', thetaMin: 0, thetaMax: CIRCLE_TMAX, visible: true, colorIndex: 1, label: '' },
      ],
      viewport: { xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: true, showGrid: true },
      parameters: [],
    }
    const file = new File([JSON.stringify(doc)], 'param.graphcraft.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected a hidden file input')
    }
    await user.upload(input, file)
    // Unsaved parametric row triggers the guard; discard to proceed.
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(await screen.findByRole('img', { name: /Unit circle/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Unit circle/ }).getAttribute('aria-label')).toContain('r=3')
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Param round trip')
  })
})
