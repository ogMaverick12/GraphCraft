import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curveStyle } from '../graph/palette.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { DataPlot } from './DataPlot.tsx'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'
import { buildDataFigureScene } from './figure.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./bar-marks.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bar-marks.ts')>()
  return {
    ...actual,
    buildBarSeriesMark: (input: Parameters<typeof actual.buildBarSeriesMark>[0]) => {
      probe.builds += 1
      return actual.buildBarSeriesMark(input)
    },
  }
})

interface BarRow {
  x: string
  y: number | null
  group?: string
}

function barDataset(rows: ReadonlyArray<BarRow>): Dataset {
  return {
    id: 'ds-s7512',
    name: 'S7.5.12 bar markers',
    columns: [
      { id: 'c1', name: 'category', type: 'categorical' },
      { id: 'c2', name: 'value', type: 'numeric' },
      { id: 'c3', name: 'group', type: 'categorical' },
    ],
    rows: rows.map((row) => [row.x, row.y, row.group ?? null]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function histogramDataset(values: ReadonlyArray<number>): Dataset {
  return {
    id: 'ds-s7512-hist',
    name: 'S7.5.12 histogram markers',
    columns: [
      { id: 'c1', name: 'row', type: 'numeric' },
      { id: 'c2', name: 'value', type: 'numeric' },
    ],
    rows: values.map((value, i) => [i, value]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'bar',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.12',
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

function show(
  ds: Dataset,
  cfg: PlotConfig,
  world?: WorldRect,
): { plot: ReturnType<typeof resolvePlot>; svg: SVGSVGElement; view: ReturnType<typeof render> } {
  const plot = resolvePlot(ds, cfg)
  const bounds = world ?? plotWorld(plot, cfg)
  if (bounds === null) {
    throw new Error('Expected plot bounds')
  }
  const view = render(
    <DataPlot plot={plot} config={cfg} world={bounds} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered plot SVG')
  }
  return { plot, svg, view }
}

function barPaths(svg: SVGSVGElement): SVGPathElement[] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('g[clip-path] > g > path[fill]:not([fill="none"])'))
}

function directBarRects(svg: SVGSVGElement): SVGRectElement[] {
  return Array.from(svg.querySelectorAll<SVGRectElement>('g[clip-path] > g > rect'))
}

function markerCount(d: string): number {
  return [...d.matchAll(/\bM\s+/g)].length
}

beforeEach(() => {
  probe.builds = 0
})

describe('live bar/histogram batching (S7.5.12)', () => {
  it('batches positive, negative, zero, and skipped bars into one exact path with area-aware hover', () => {
    const ds = barDataset([
      { x: 'A', y: 10 },
      { x: 'B', y: -5 },
      { x: 'C', y: 0 },
      { x: 'D', y: null },
    ])
    const cfg = config()
    const { plot, svg } = show(ds, cfg, { xMin: -0.5, xMax: 2.5, yMin: -10, yMax: 10 })

    expect(plot.totalPoints).toBe(3)
    expect(plot.totalSkipped).toBe(1)
    expect(directBarRects(svg)).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)
    const paths = barPaths(svg)
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute('d')).toBe(
      'M 42.66666666666667 0 h 128 v 200 h -128 Z M 256 200 h 128 v 100 h -128 Z M 469.33333333333337 200 h 128 v 0 h -128 Z',
    )
    expect(paths[0]).toHaveAttribute('fill', curveStyle(0).color)
    expect(paths[0]).toHaveAttribute('fill-opacity', '0.75')
    expect(paths[0]).toHaveAttribute('aria-hidden', 'true')
    expect(paths[0]?.closest('g[clip-path]')).not.toBeNull()
    expect(screen.getByRole('img', { name: /S7\.5\.12: bar plot with 1 visible series and 3 points\. 1 rows skipped/ })).toBe(svg)

    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    const tooltip = screen.getByTestId('bar-tooltip')
    expect(tooltip).toHaveTextContent('value: A = 10')
    expect(tooltip).toHaveStyle({ left: '100px', top: '92px' })
    expect(tooltip).toHaveAttribute('aria-hidden', 'true')

    fireEvent.pointerMove(svg, { clientX: 300, clientY: 250 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: B = -5')

    fireEvent.pointerMove(svg, { clientX: 500, clientY: 200 })
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()

    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: A = 10')
    fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
  })

  it('preserves grouped offsets, series colours/order, and later-series edge hit testing', () => {
    const ds = barDataset([
      { x: 'A', y: 3, group: 'g1' },
      { x: 'A', y: -2, group: 'g2' },
      { x: 'B', y: 4, group: 'g1' },
      { x: 'B', y: 1, group: 'g2' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const { svg } = show(ds, cfg, { xMin: -0.5, xMax: 1.5, yMin: -5, yMax: 5 })

    const paths = barPaths(svg)
    expect(paths).toHaveLength(2)
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([
      'M 64 80 h 96 v 120 h -96 Z M 384 40 h 96 v 160 h -96 Z',
      'M 160 200 h 96 v 80 h -96 Z M 480 160 h 96 v 40 h -96 Z',
    ])
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual([curveStyle(0).color, curveStyle(1).color])
    expect(paths.every((path) => path.getAttribute('fill-opacity') === '0.75')).toBe(true)
    expect(directBarRects(svg)).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)

    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g1: A = 3')
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 200 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    fireEvent.pointerMove(svg, { clientX: 480, clientY: 180 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: B = 1')
  })

  it('preserves histogram bin boundaries, counts, labels, and shared-edge hit behaviour', () => {
    const cfg = config({ kind: 'histogram', yColumn: 'c2' })
    const { plot, svg } = show(histogramDataset([1, 2, 2, 3, 4]), cfg, { xMin: 0, xMax: 5, yMin: 0, yMax: 3 })

    expect(plot.series[0]?.points.map((point) => point.label)).toEqual(['1–1.75', '1.75–2.5', '2.5–3.25', '3.25–4'])
    expect(directBarRects(svg)).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)
    const paths = barPaths(svg)
    expect(paths).toHaveLength(1)
    expect(paths[0]?.getAttribute('d')).toBe(
      'M 128 266.66666666666663 h 96 v 133.33333333333337 h -96 Z M 224 133.33333333333331 h 96 v 266.6666666666667 h -96 Z M 320 266.66666666666663 h 96 v 133.33333333333337 h -96 Z M 416 266.66666666666663 h 96 v 133.33333333333337 h -96 Z',
    )
    expect(paths[0]).toHaveAttribute('fill-opacity', '0.75')
    expect(paths[0]?.closest('g[clip-path]')).not.toBeNull()

    fireEvent.pointerMove(svg, { clientX: 160, clientY: 300 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: 1–1.75 = 1')
    fireEvent.pointerMove(svg, { clientX: 224, clientY: 300 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: 1.75–2.5 = 2')
    fireEvent.pointerMove(svg, { clientX: 320, clientY: 300 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: 2.5–3.25 = 1')
  })

  it('keeps one bar path per series with every bar at 100 and 10,000 points', { timeout: 120000 }, () => {
    for (const n of [100, 10000]) {
      const rows = Array.from({ length: n }, (_, i) => ({ x: `C${i}`, y: ((i % 7) - 3) * 4 + (i % 3) * 0.25 }))
      const { plot, svg, view } = show(barDataset(rows), config({ title: `Bar ${n}` }))
      expect(plot.totalPoints).toBe(n)
      const paths = barPaths(svg)
      expect(paths).toHaveLength(1)
      const d = paths[0]?.getAttribute('d') ?? ''
      expect(markerCount(d)).toBe(n)
      const xs = [...d.matchAll(/\bM\s+([-\d.]+)/g)].map((match) => match[1])
      expect(xs).toHaveLength(n)
      expect(new Set(xs).size).toBe(n)
      expect(directBarRects(svg)).toHaveLength(0)
      expect(svg.querySelectorAll('title')).toHaveLength(0)
      view.unmount()
    }

    for (const [n, bins] of [[100, 8], [10000, 15]] as const) {
      const values = Array.from({ length: n }, (_, i) => 50 + Math.sin(i / 11) * 20 + (i % 5))
      const cfg = config({ kind: 'histogram', title: `Histogram ${n}` })
      const { plot, svg, view } = show(histogramDataset(values), cfg)
      expect(plot.series[0]?.points).toHaveLength(bins)
      const paths = barPaths(svg)
      expect(paths).toHaveLength(1)
      expect(markerCount(paths[0]?.getAttribute('d') ?? '')).toBe(bins)
      expect(directBarRects(svg)).toHaveLength(0)
      expect(svg.querySelectorAll('title')).toHaveLength(0)
      view.unmount()
    }
  })

  it('does not rebuild bar geometry for hover or a title-only render', () => {
    const ds = barDataset([
      { x: 'A', y: 3, group: 'g1' },
      { x: 'A', y: -2, group: 'g2' },
      { x: 'B', y: 4, group: 'g1' },
      { x: 'B', y: 1, group: 'g2' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const plot = resolvePlot(ds, cfg)
    const world = { xMin: -0.5, xMax: 1.5, yMin: -5, yMax: 5 }
    const view = render(
      <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered bar SVG')
    }
    expect(probe.builds).toBe(2)
    const initial = barPaths(svg).map((path) => path.getAttribute('d'))

    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g1: A = 3')
    expect(probe.builds).toBe(2)

    const renamed = { ...cfg, title: 'Renamed without geometry changes' }
    view.rerender(
      <DataPlot plot={plot} config={renamed} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(2)
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g1: A = 3')
    const unchangedSvg = view.container.querySelector('svg')
    expect(unchangedSvg).not.toBeNull()
    if (unchangedSvg === null) {
      throw new Error('Expected the renamed bar SVG')
    }
    expect(barPaths(unchangedSvg).map((path) => path.getAttribute('d'))).toEqual(initial)

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={{ xMin: 0, xMax: 1, yMin: -5, yMax: 5 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(4)
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
  })

  it('invalidates bar hover when visibility or the dataset changes', () => {
    const ds = barDataset([
      { x: 'A', y: 3, group: 'g1' },
      { x: 'A', y: -2, group: 'g2' },
      { x: 'B', y: 4, group: 'g1' },
      { x: 'B', y: 1, group: 'g2' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const plot = resolvePlot(ds, cfg)
    const world = { xMin: -0.5, xMax: 1.5, yMin: -5, yMax: 5 }
    const view = render(
      <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered bar SVG')
    }
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g1: A = 3')

    view.rerender(
      <DataPlot plot={plot} config={{ ...cfg, hiddenSeries: ['g1'] }} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
    const hiddenSvg = view.container.querySelector('svg')
    expect(hiddenSvg).not.toBeNull()
    if (hiddenSvg === null) {
      throw new Error('Expected the hidden-series bar SVG')
    }
    expect(barPaths(hiddenSvg)).toHaveLength(1)
    expect(barPaths(hiddenSvg)[0]?.getAttribute('fill')).toBe(curveStyle(1).color)
    expect(barPaths(hiddenSvg)[0]?.getAttribute('d')).toBe('M 64 200 h 192 v 80 h -192 Z M 384 160 h 192 v 40 h -192 Z')

    const changedPlot = resolvePlot(
      barDataset([
        { x: 'A', y: 8, group: 'g1' },
        { x: 'A', y: -2, group: 'g2' },
        { x: 'B', y: 4, group: 'g1' },
        { x: 'B', y: 1, group: 'g2' },
      ]),
      cfg,
    )
    fireEvent.pointerMove(hiddenSvg, { clientX: 160, clientY: 250 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    view.rerender(
      <DataPlot plot={changedPlot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
  })

  it('keeps error bars, clipping, and the accessible summary around the batched bars', () => {
    const cfg = config({ yError: { mode: 'fixed', value: 0.5 }, xError: { mode: 'fixed', value: 0.25 } })
    const { svg } = show(barDataset([{ x: 'A', y: 2 }, { x: 'B', y: 3 }]), cfg, { xMin: -0.5, xMax: 1.5, yMin: 0, yMax: 4 })
    expect(barPaths(svg)).toHaveLength(1)
    expect(directBarRects(svg)).toHaveLength(0)
    const errorPaths = svg.querySelectorAll('g[clip-path] > g > path[aria-hidden="true"][fill="none"]')
    expect(errorPaths).toHaveLength(1)
    expect(barPaths(svg)[0]?.closest('g[clip-path]')).not.toBeNull()
    expect(screen.getByRole('img', { name: /S7\.5\.12: bar plot with 1 visible series and 2 points/ })).toBe(svg)
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 300 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: A = 2')
  })

  it('leaves the separate export scene as per-bar and per-bin geometry', () => {
    const barCfg = config()
    const barPlot = resolvePlot(
      barDataset([
        { x: 'A', y: 10 },
        { x: 'B', y: -5 },
        { x: 'C', y: 0 },
      ]),
      barCfg,
    )
    const barScene = buildDataFigureScene(barPlot, barCfg, { xMin: -0.5, xMax: 2.5, yMin: -10, yMax: 10 }, null, { caption: '' }, 'white')
    expect(barScene.status).toBe('value')
    if (barScene.status !== 'value') {
      throw new Error('Expected a bar export scene')
    }
    expect(barScene.scene.bars).toHaveLength(3)
    expect(barScene.scene.bars.map((bar) => bar.label)).toEqual(['value: A = 10', 'value: B = -5', 'value: C = 0'])

    const histCfg = config({ kind: 'histogram', yColumn: 'c2' })
    const histPlot = resolvePlot(histogramDataset([1, 2, 2, 3, 4]), histCfg)
    const histScene = buildDataFigureScene(histPlot, histCfg, { xMin: 0, xMax: 5, yMin: 0, yMax: 3 }, null, { caption: '' }, 'white')
    expect(histScene.status).toBe('value')
    if (histScene.status !== 'value') {
      throw new Error('Expected a histogram export scene')
    }
    expect(histScene.scene.bars).toHaveLength(4)
    expect(histScene.scene.bars.map((bar) => bar.label)).toEqual([
      'value: 1–1.75 = 1',
      'value: 1.75–2.5 = 2',
      'value: 2.5–3.25 = 1',
      'value: 3.25–4 = 1',
    ])
  })
})
