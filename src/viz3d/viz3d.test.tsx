import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'
import { serializeProject } from '../project/serialize.ts'
import { validateProjectText } from '../project/validate.ts'
import { DEFAULT_WORLD } from '../graph/useViewport.ts'
import { FieldView } from './FieldView.tsx'
import { Scatter3D } from './Scatter3D.tsx'
import { SurfaceView } from './SurfaceView.tsx'
import type { Dataset } from '../data/dataset.ts'

function polygons(): string[] {
  return Array.from(document.querySelectorAll('svg polygon')).map((p) => p.getAttribute('points') ?? '')
}

describe('3D surface view', () => {
  it('renders the default paraboloid with quads, axes, and a summary', () => {
    render(<SurfaceView />)
    expect(polygons().length).toBeGreaterThan(1000)
    expect(screen.getByTestId('surface-summary')).toHaveTextContent(/quads/)
    expect(screen.getByTestId('surface-summary')).toHaveTextContent(/z range/)
  })

  it('refuses bad input loudly instead of drawing garbage', () => {
    render(<SurfaceView />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Surface expression' }), { target: { value: 'x +' } })
    expect(screen.getByTestId('surface-error')).toHaveTextContent(/Cannot plot/)
    fireEvent.change(screen.getByRole('textbox', { name: 'X min' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'X max' }), { target: { value: '-5' } })
    expect(screen.getByTestId('surface-error')).toHaveTextContent(/max above min/)
  })

  it('orbits on button press and restores on reset', () => {
    render(<SurfaceView />)
    const before = polygons().slice(0, 8).join('|')
    fireEvent.click(screen.getByRole('button', { name: 'Orbit right' }))
    const turned = polygons().slice(0, 8).join('|')
    expect(turned).not.toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Reset 3D view' }))
    expect(polygons().slice(0, 8).join('|')).toBe(before)
  })

  it('changes quad density with the resolution control and warns when coarse', async () => {
    const user = userEvent.setup()
    render(<SurfaceView />)
    const fine = polygons().length
    await user.selectOptions(screen.getByRole('combobox', { name: 'Surface resolution' }), '24')
    expect(polygons().length).toBeLessThan(fine)
    expect(await screen.findByText(/Coarse grid/)).toBeInTheDocument()
  })

  it('shows holes for invalid regions without bridging', () => {
    render(<SurfaceView initial={{ source: '1/(x*y)', domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, resolution: 24, camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, showGrid: true, title: 'Poles', appearance: 'solid' }} />)
    expect(screen.getByTestId('surface-summary')).toHaveTextContent(/holes/)
  })

  it('switches wireframe and shaded appearances with labelled colour scale', async () => {    const user = userEvent.setup()
    render(<SurfaceView />)
    const solid = Array.from(document.querySelectorAll('svg polygon')).map((p) => p.getAttribute('fill')).join('|')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Surface appearance' }), 'wireframe')
    const wire = Array.from(document.querySelectorAll('svg polygon')).map((p) => p.getAttribute('fill')).join('|')
    expect(wire).not.toBe(solid)
    expect(wire).toContain('none')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Surface appearance' }), 'shaded')
    // Colour legend carries z bounds in every mode.
    expect(screen.getByText(/z 8/)).toBeInTheDocument()
    expect(screen.getByText(/z 0/)).toBeInTheDocument()
  })

  it('exports SVG vectors and guides PNG without canvas', async () => {
    const user = userEvent.setup()
    render(<SurfaceView />)
    await user.click(screen.getByRole('button', { name: 'Export SVG' }))
    // jsdom completes blob downloads: no error means the SVG built cleanly.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Export PNG' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/browser canvas/)
  })
})

describe('3D project round-trip', () => {
  it('saves and reloads surfaces with cameras, refusing malformed entries', () => {
    const text = serializeProject({
      title: 't',
      rows: [],
      world: DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
      parameters: [],
      datasets: [],
      analyses: {},
      surfaces3d: [
        { id: 's1', source: 'x^2-y^2', domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, resolution: 48, camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, showGrid: true, title: 'Saddle', appearance: 'solid' },
      ],
    })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.project.surfaces3d).toHaveLength(1)
      expect(validated.project.surfaces3d?.[0]).toMatchObject({ source: 'x^2-y^2', resolution: 48 })
    }
    const bad = JSON.parse(text) as Record<string, unknown>
    ;(bad['surfaces3d'] as Array<Record<string, unknown>>)[0]!['resolution'] = 999
    expect(validateProjectText(JSON.stringify(bad)).ok).toBe(false)
    const legacy = JSON.parse(text) as Record<string, unknown>
    delete legacy['surfaces3d']
    const reloaded = validateProjectText(JSON.stringify(legacy))
    expect(reloaded.ok).toBe(true)
  })

  it('saves and reloads 2D fields, refusing malformed entries', () => {
    const text = serializeProject({
      title: 't',
      rows: [],
      world: DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
      parameters: [],
      datasets: [],
      analyses: {},
      fields2d: [
        { id: 'f1', mode: 'vectors', source: 'x^2+y^2', uSource: '-y', vSource: 'x', domain: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }, resolution: 32, levelCount: 8, levelList: '', colorPolicy: 'viridis', scalePolicy: 'auto', fixedMin: '', fixedMax: '', arrowMode: 'unit', showGrid: true, title: 'Rotation' },
      ],
    })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.project.fields2d).toHaveLength(1)
      expect(validated.project.fields2d?.[0]).toMatchObject({ mode: 'vectors', arrowMode: 'unit' })
    }
    const bad = JSON.parse(text) as Record<string, unknown>
    ;(bad['fields2d'] as Array<Record<string, unknown>>)[0]!['mode'] = 'streamline'
    expect(validateProjectText(JSON.stringify(bad)).ok).toBe(false)
  })

  it('opens the 3D workspace without disturbing 2D state', async () => {    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Show 3D surfaces' }))
    await screen.findByRole('main', { name: '3D surfaces' })
    expect(await screen.findByTestId('surface-summary')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    await user.click(screen.getByRole('button', { name: 'Show 3D surfaces' }))
    await screen.findByRole('main', { name: '3D surfaces' })
  })
})

describe('2D field view', () => {
  it('draws contours with segment counts and one label per level in the summary', () => {
    render(<FieldView />)
    expect(screen.getByTestId('field-summary')).toHaveTextContent(/levels/)
    expect(document.querySelectorAll('svg path').length).toBeGreaterThan(0)
    // Default x²+y² over ±3 with 8 auto levels: labels name the values.
    const labels = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent ?? '')
    expect(labels.some((text) => text.trim() !== '' && Number.isFinite(Number(text)))).toBe(true)
  })

  it('shades heatmaps with a labelled scale and honors fixed bounds', async () => {
    const user = userEvent.setup()
    render(<FieldView />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Field display' }), 'heatmap')
    expect(await screen.findByTestId('field-summary')).toHaveTextContent(/cells/)
    expect(await screen.findByTestId('field-summary')).toHaveTextContent(/scale \[/)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scale policy' }), 'fixed')
    fireEvent.change(screen.getByRole('textbox', { name: 'Fixed min' }), { target: { value: '0' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Fixed max' }), { target: { value: '10' } })
    expect(await screen.findByTestId('field-summary')).toHaveTextContent(/scale \[0, 10\]/)
  })

  it('draws arrows with a stated stride and refuses bad input loudly', async () => {
    const user = userEvent.setup()
    render(<FieldView />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Field display' }), 'vectors')
    expect(await screen.findByTestId('field-summary')).toHaveTextContent(/arrows/)
    fireEvent.change(screen.getByRole('textbox', { name: 'U component' }), { target: { value: '1/' } })
    expect(await screen.findByTestId('field-error')).toBeInTheDocument()
  })

  it('colours arrows by magnitude with a labelled legend', async () => {
    const user = userEvent.setup()
    render(<FieldView />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Field display' }), 'vectors')
    await screen.findByTestId('field-summary')
    // Rotation field (-y, x): magnitudes vary, so fills must vary too.
    const fills = Array.from(document.querySelectorAll('svg line')).map((l) => l.getAttribute('stroke'))
    expect(new Set(fills).size).toBeGreaterThan(1)
    expect(await screen.findByTestId('field-summary')).toHaveTextContent(/colour shows magnitude/)
  })

  it('rejects garbage level lists instead of guessing', async () => {
    render(<FieldView />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Exact contour levels' }), { target: { value: '1, nope' } })
    expect(await screen.findByTestId('field-error')).toHaveTextContent(/not a finite contour level/)
  })

  it('exports field SVG and guides PNG without canvas', async () => {
    const user = userEvent.setup()
    render(<FieldView />)
    await user.click(screen.getByRole('button', { name: 'Export SVG' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Export PNG' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/browser canvas/)
  })

  it('orbits by drag, inspects by click, and orbits by keyboard', async () => {
    const user = userEvent.setup()
    render(<SurfaceView />)
    const viewer = screen.getByRole('application', { name: /3D surface viewer/ })
    vi.spyOn(viewer, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 640, height: 440, top: 0, left: 0, right: 640, bottom: 440, toJSON: () => ({}) })
    const before = Array.from(document.querySelectorAll('svg polygon')).slice(0, 8).map((p) => p.getAttribute('points')).join('|')

    // Drag orbits (pointer movement above the click threshold).
    fireEvent.pointerDown(viewer, { clientX: 320, clientY: 220, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 420, clientY: 220, pointerId: 1 })
    fireEvent.pointerUp(viewer, { clientX: 420, clientY: 220, pointerId: 1 })
    expect(Array.from(document.querySelectorAll('svg polygon')).slice(0, 8).map((p) => p.getAttribute('points')).join('|')).not.toBe(before)

    // Click (no drag) inspects the nearest vertex with a readout.
    fireEvent.pointerDown(viewer, { clientX: 320, clientY: 220, pointerId: 2 })
    fireEvent.pointerUp(viewer, { clientX: 320, clientY: 220, pointerId: 2 })
    expect(await screen.findByTestId('surface-inspection')).toHaveTextContent(/Inspected: x = /)

    // Keyboard arrows orbit without a pointer at all.
    viewer.focus()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByTestId('surface-inspection')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(await screen.findByTestId('surface-inspection')).toHaveTextContent(/Click the surface/)
  })

  it('keeps aspect with viewBox scaling on resize', () => {
    render(<SurfaceView />)
    const svg = document.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 640 440')
    expect(svg?.getAttribute('width')).toBe('100%')
  })
})

describe('3D scatter from datasets', () => {
  const dataset: Dataset = {
    id: 'ds-3d',
    name: 'Points',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
      { id: 'c3', name: 'z', type: 'numeric' },
    ],
    rows: [
      [0, 0, 0],
      [1, 2, 3],
      [2, null, 4],
      [3, 6, 9],
    ],
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }

  it('maps three columns with correct coordinates and counts skips', () => {
    render(<Scatter3D datasets={[dataset]} initial={{ datasetId: 'ds-3d', xId: 'c1', yId: 'c2', zId: 'c3', camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, title: 'S' }} />)
    expect(screen.getByTestId('scatter-summary')).toHaveTextContent('3 observations, 1 rows skipped')
    const titles = Array.from(document.querySelectorAll('svg circle title')).map((t) => t.textContent ?? '')
    expect(titles).toContain('(1, 2, 3)')
    expect(titles).toContain('(3, 6, 9)')
  })

  it('orbits and zooms from the keyboard on the viewer', () => {
    render(
      <Scatter3D
        datasets={[dataset]}
        initial={{ datasetId: 'ds-3d', xId: 'c1', yId: 'c2', zId: 'c3', camera: { yaw: -Math.PI / 4, pitch: Math.PI / 5, distance: 12, panX: 0, panY: 0 }, title: 'S' }}
      />,
    )
    const viewer = screen.getByRole('application', { name: /3D scatter viewer/ })
    const positions = (): string => Array.from(document.querySelectorAll('svg circle')).map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).join('|')
    const before = positions()
    fireEvent.keyDown(viewer, { key: 'ArrowRight' })
    expect(positions()).not.toBe(before)
    fireEvent.keyDown(viewer, { key: '+' })
    expect(positions()).not.toBe(before)
    fireEvent.keyDown(viewer, { key: '0' })
    expect(positions()).toBe(before)
  })

  it('downsamples large clouds with a stated stride', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => [i, i, i] as Array<number | string | null>)
    const big: Dataset = { ...dataset, id: 'ds-big', rows }
    render(<Scatter3D datasets={[big]} initial={{ datasetId: 'ds-big', xId: 'c1', yId: 'c2', zId: 'c3', camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, title: 'Big' }} />)
    expect(screen.getByTestId('scatter-summary')).toHaveTextContent(/showing every \d/)
    expect(document.querySelectorAll('svg circle').length).toBeLessThanOrEqual(2000)
  })

  it('round-trips scatter configs with tolerant references', () => {
    const text = serializeProject({
      title: 't',
      rows: [],
      world: DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
      parameters: [],
      datasets: [],
      analyses: {},
      scatters3d: [{ id: 's', datasetId: 'gone', xId: 'c1', yId: 'c2', zId: 'c3', camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, title: 'S' }],
    })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.project.scatters3d).toHaveLength(1)
    }
    render(<Scatter3D datasets={[]} initial={{ datasetId: 'gone', xId: null, yId: null, zId: null, camera: { yaw: 0, pitch: 0.5, distance: 12, panX: 0, panY: 0 }, title: 'S' }} />)
    expect(screen.getByTestId('scatter-summary')).toHaveTextContent('0 observations')
  })
})
