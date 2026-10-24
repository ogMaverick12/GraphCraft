import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curveStyle } from '../graph/palette.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { DataPlot } from './DataPlot.tsx'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./scatter-marks.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scatter-marks.ts')>()
  return {
    ...actual,
    buildScatterSeriesMark: (input: Parameters<typeof actual.buildScatterSeriesMark>[0]) => {
      probe.builds += 1
      return actual.buildScatterSeriesMark(input)
    },
  }
})

interface Row {
  x: number
  y: number
  group?: string
}

function dataset(rows: ReadonlyArray<Row>): Dataset {
  return {
    id: 'ds-s759',
    name: 'S7.5.9 scatter',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
      { id: 'c3', name: 'group', type: 'categorical' },
    ],
    rows: rows.map((row) => [row.x, row.y, row.group ?? null]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'scatter',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.9',
    xLabel: 'x',
    yLabel: 'y',
    sort: 'row-order',
    showGrid: true,
    hiddenSeries: [],
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    xScale: 'linear',
    yScale: 'linear',
    tickX: null,
    tickY: null,
    yError: { mode: 'none' },
    xError: { mode: 'none' },
    ...overrides,
  }
}

const DEFAULT_WORLD: WorldRect = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }

function show(ds: Dataset, cfg: PlotConfig, world: WorldRect = DEFAULT_WORLD): { plot: ReturnType<typeof resolvePlot>; svg: SVGSVGElement } {
  const plot = resolvePlot(ds, cfg)
  const view = render(
    <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered plot SVG')
  }
  return { plot, svg }
}

function pathData(svg: SVGSVGElement): string[] {
  return Array.from(svg.querySelectorAll('path')).map((path) => path.getAttribute('d') ?? '')
}

beforeEach(() => {
  probe.builds = 0
})

describe('live scatter rendering (S7.5.9)', () => {
  it('batches one ordered path per series while keeping shapes, colours, and accessibility summary', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'A' },
      { x: 3, y: 3, group: 'A' },
      { x: 4, y: 4, group: 'B' },
      { x: 5, y: 5, group: 'B' },
      { x: 6, y: 6, group: 'B' },
      { x: 7, y: 7, group: 'C' },
      { x: 8, y: 8, group: 'D' },
    ])
    const cfg = config({ seriesColumn: 'c3', title: 'S7.5.9' })
    const { svg } = show(ds, cfg)

    const paths = Array.from(svg.querySelectorAll('path'))
    expect(paths).toHaveLength(4)
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)

    const first = paths[0]?.getAttribute('d') ?? ''
    const second = paths[1]?.getAttribute('d') ?? ''
    const third = paths[2]?.getAttribute('d') ?? ''
    const fourth = paths[3]?.getAttribute('d') ?? ''
    expect(first.match(/\bM\b/g)).toHaveLength(3)
    expect(first.match(/\bA 3\.5 3\.5\b/g)).toHaveLength(6)
    expect(first.startsWith('M 64.00 356.50')).toBe(true)
    expect(first).toContain('M 128.00 316.50')
    expect(first).toContain('M 192.00 276.50')
    expect(second.match(/\bM\b/g)).toHaveLength(3)
    expect(second).toContain('M 252.50 236.50')
    expect(second).toContain('h 7 v 7 h -7 Z')
    expect(third).toContain('M 448.00 115.00 L 453.00 124.00 L 443.00 124.00 Z')
    expect(fourth).toContain('M 512.00 75.00 L 517.00 80.00 L 512.00 85.00 L 507.00 80.00 Z')
    expect(paths[0]).toHaveAttribute('fill', curveStyle(0).color)
    expect(paths[1]).toHaveAttribute('fill', curveStyle(1).color)
    expect(paths[2]).toHaveAttribute('fill', curveStyle(2).color)
    expect(paths[3]).toHaveAttribute('fill', curveStyle(3).color)
    expect(paths[0]?.closest('g[clip-path]')).not.toBeNull()
    expect(screen.getByRole('img', { name: /S7\.5\.9: scatter plot with 4 visible series and 8 points/ })).toBe(svg)
  })

  it('renders 10,000 points in one path without dropping, duplicating, or reordering them', () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: i }))
    const cfg = config({ title: 'Large scatter' })
    const { svg } = show(dataset(rows), cfg, { xMin: 0, xMax: 9999, yMin: 0, yMax: 9999 })

    const paths = Array.from(svg.querySelectorAll('path'))
    expect(paths).toHaveLength(1)
    const d = paths[0]?.getAttribute('d') ?? ''
    const markers = [...d.matchAll(/\bM\s+([-\d.]+)\s+([-\d.]+)/g)]
    expect(markers).toHaveLength(10000)
    const xs = markers.map((marker) => Number(marker[1]))
    const expectedXs = rows.map((row) => Number(((row.x / 9999) * 640).toFixed(2)))
    expect(xs).toEqual(expectedXs)
    expect(markers[0]?.[2]).toBe('396.50')
    expect(markers[9999]?.[2]).toBe('-3.50')
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)
  })

  it('updates the batch when data or hidden-series settings change, and keeps invalid rows skipped', () => {
    const cfg = config()
    const firstDataset = dataset([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ])
    const firstPlot = resolvePlot(firstDataset, cfg)
    const view = render(
      <DataPlot plot={firstPlot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const firstSvg = view.container.querySelector('svg')
    expect(firstSvg).not.toBeNull()
    if (firstSvg === null) {
      throw new Error('Expected a rendered plot SVG')
    }
    expect(pathData(firstSvg)[0]?.match(/\bM\b/g)).toHaveLength(3)

    const filtered = dataset([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ])
    filtered.rows.push([4, null, null], [5, 4, null])
    const filteredPlot = resolvePlot(filtered, cfg)
    view.rerender(
      <DataPlot plot={filteredPlot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const updatedSvg = view.container.querySelector('svg')
    expect(updatedSvg).not.toBeNull()
    if (updatedSvg === null) {
      throw new Error('Expected an updated plot SVG')
    }
    expect(pathData(updatedSvg)[0]?.match(/\bM\b/g)).toHaveLength(4)
    expect(screen.getByRole('img', { name: /4 points/ })).toBe(updatedSvg)
    const beforeZoom = pathData(updatedSvg)[0]

    const zoomed = { xMin: 0, xMax: 5, yMin: 0, yMax: 5 }
    view.rerender(
      <DataPlot plot={filteredPlot} config={cfg} world={zoomed} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const zoomedSvg = view.container.querySelector('svg')
    expect(zoomedSvg).not.toBeNull()
    if (zoomedSvg === null) {
      throw new Error('Expected a zoomed plot SVG')
    }
    expect(pathData(zoomedSvg)[0]).not.toBe(beforeZoom)

    const hidden = { ...cfg, hiddenSeries: ['\u0000single'] }
    view.rerender(
      <DataPlot plot={filteredPlot} config={hidden} world={zoomed} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const hiddenSvg = view.container.querySelector('svg')
    expect(hiddenSvg).not.toBeNull()
    if (hiddenSvg === null) {
      throw new Error('Expected a hidden-series plot SVG')
    }
    expect(hiddenSvg.querySelectorAll('path')).toHaveLength(0)
  })

  it('does not rebuild scatter geometry for hover or unrelated config changes', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'A' },
      { x: 4, y: 4, group: 'B' },
      { x: 5, y: 5, group: 'B' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const plot = resolvePlot(ds, cfg)
    const view = render(
      <DataPlot plot={plot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered plot SVG')
    }
    expect(probe.builds).toBe(2)
    const initialPath = pathData(svg)[0]

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    expect(probe.builds).toBe(2)

    fireEvent.pointerMove(svg, { clientX: 500, clientY: 100 })
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
    expect(probe.builds).toBe(2)

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    view.rerender(
      <DataPlot plot={plot} config={{ ...cfg, title: 'Renamed' }} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(2)
    expect(pathData(svg)[0]).toBe(initialPath)
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')

    const zoomed = { xMin: 0, xMax: 5, yMin: 0, yMax: 5 }
    view.rerender(
      <DataPlot plot={plot} config={cfg} world={zoomed} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(4)
    expect(pathData(svg)[0]).not.toBe(initialPath)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
  })

  it('keeps fit and line-run titles separate from batched marker paths', () => {
    const ds = dataset([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ])
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const view = render(
      <DataPlot
        plot={plot}
        config={cfg}
        world={DEFAULT_WORLD}
        fitLine={[
          { x: 1, y: 1 },
          { x: 3, y: 3 },
        ]}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered plot SVG')
    }
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    expect(svg.querySelector('path > title')?.textContent).toBe('Fitted model curve')

    const lineCfg = config({ kind: 'line' })
    const linePlot = resolvePlot(ds, lineCfg)
    view.rerender(
      <DataPlot plot={linePlot} config={lineCfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const lineSvg = view.container.querySelector('svg')
    expect(lineSvg).not.toBeNull()
    if (lineSvg === null) {
      throw new Error('Expected a rendered line SVG')
    }
    expect(lineSvg.querySelectorAll('circle')).toHaveLength(0)
    const lineMarkers = lineSvg.querySelectorAll('g[clip-path] > g > path[fill]:not([stroke])')
    expect(lineMarkers).toHaveLength(1)
    expect((lineMarkers[0]?.getAttribute('d') ?? '').match(/\bM\b/g)).toHaveLength(3)
    expect(Array.from(lineSvg.querySelectorAll('title')).map((title) => title.textContent)).toEqual(['y (3 points)'])
  })

  it('retains the empty-plot message when no points are plottable', () => {
    const cfg = config()
    const empty = dataset([])
    const plot = resolvePlot(empty, cfg)
    const view = render(
      <DataPlot plot={plot} config={cfg} world={plotWorld(plot, cfg)} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(view.container.querySelector('svg')).toBeNull()
    expect(screen.getByText(/No plottable points/)).toBeInTheDocument()
  })
})
