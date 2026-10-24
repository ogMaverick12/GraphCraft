import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curveStyle } from '../graph/palette.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { DataPlot } from './DataPlot.tsx'
import { resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'
import { buildDataFigureScene } from './figure.ts'

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
  xerr?: number | null
  upper?: number | null
  lower?: number | null
}

function dataset(rows: ReadonlyArray<Row>): Dataset {
  return {
    id: 'ds-s7511',
    name: 'S7.5.11 line markers',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
      { id: 'c3', name: 'group', type: 'categorical' },
      { id: 'c4', name: 'xerr', type: 'numeric' },
      { id: 'c5', name: 'upper', type: 'numeric' },
      { id: 'c6', name: 'lower', type: 'numeric' },
    ],
    rows: rows.map((row) => [row.x, row.y, row.group ?? null, row.xerr ?? null, row.upper ?? null, row.lower ?? null]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'line',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.11',
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

function show(
  ds: Dataset,
  cfg: PlotConfig,
  world: WorldRect = DEFAULT_WORLD,
): { plot: ReturnType<typeof resolvePlot>; svg: SVGSVGElement; view: ReturnType<typeof render> } {
  const plot = resolvePlot(ds, cfg)
  const view = render(
    <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered plot SVG')
  }
  return { plot, svg, view }
}

function markerPaths(svg: SVGSVGElement): SVGPathElement[] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('g[clip-path] > g > path[fill]:not([fill="none"])'))
}

function runPaths(svg: SVGSVGElement): SVGPathElement[] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('g[clip-path] > g > path[fill="none"]')).filter((path) => path.querySelector('title') !== null)
}

function pathTitle(path: SVGPathElement): string | null {
  return path.querySelector('title')?.textContent ?? null
}

beforeEach(() => {
  probe.builds = 0
})

describe('live line-marker batching (S7.5.11)', () => {
  it('batches one exact, styled marker path per line series while preserving order, clipping, and the summary', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'B' },
      { x: 3, y: 3, group: 'C' },
      { x: 4, y: 4, group: 'D' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const { svg } = show(ds, cfg)

    const paths = markerPaths(svg)
    expect(paths).toHaveLength(4)
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([
      'M 64 356.5 A 3.5 3.5 0 1 1 64 363.5 A 3.5 3.5 0 1 1 64 356.5 Z',
      'M 124.5 316.5 h 7 v 7 h -7 Z',
      'M 192 275 L 197 284 L 187 284 Z',
      'M 256 235 L 261 240 L 256 245 L 251 240 Z',
    ])
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual([
      curveStyle(0).color,
      curveStyle(1).color,
      curveStyle(2).color,
      curveStyle(3).color,
    ])
    expect(paths.every((path) => path.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(paths.every((path) => path.closest('g[clip-path]') !== null)).toBe(true)
    expect(svg.querySelectorAll('g[clip-path] > g > circle')).toHaveLength(0)
    expect(svg.querySelectorAll('g[clip-path] > g > rect')).toHaveLength(0)

    expect(Array.from(svg.querySelectorAll('title')).map((title) => title.textContent)).toEqual([
      'A (1 points)',
      'B (1 points)',
      'C (1 points)',
      'D (1 points)',
    ])
    expect(screen.getByRole('img', { name: /S7\.5\.11: line plot with 4 visible series and 4 points/ })).toBe(svg)
  })

  it('serializes line-marker coordinates from their full doubles', () => {
    const { svg } = show(dataset([{ x: 1, y: 2 }]), config(), { xMin: 0, xMax: 3, yMin: 0, yMax: 7 })
    expect(markerPaths(svg)[0]?.getAttribute('d')).toBe(
      'M 213.33333333333334 282.2142857142857 A 3.5 3.5 0 1 1 213.33333333333334 289.2142857142857 A 3.5 3.5 0 1 1 213.33333333333334 282.2142857142857 Z',
    )
    expect(runPaths(svg)[0]?.getAttribute('d')).toBe('M 213.33 285.71')
  })

  it('leaves line runs and gaps unchanged while keeping every valid marker and dropping invalid points', () => {
    const ds = dataset([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ])
    ds.rows[2] = [3, null, null, null, null, null]
    const cfg = config()
    const { plot, svg } = show(ds, cfg, { xMin: 0, xMax: 6, yMin: 0, yMax: 6 })

    expect(plot.series[0]?.gapXs).toEqual([3])
    const runs = runPaths(svg)
    expect(runs.map((path) => path.getAttribute('d'))).toEqual([
      'M 106.67 333.33 L 213.33 266.67',
      'M 426.67 133.33 L 533.33 66.67',
    ])
    expect(runs.map(pathTitle)).toEqual(['y segment 1 of 2', 'y segment 2 of 2'])

    const markers = markerPaths(svg)
    expect(markers).toHaveLength(1)
    const d = markers[0]?.getAttribute('d') ?? ''
    const starts = [...d.matchAll(/\bM\s+([-\d.]+)/g)].map((match) => match[1])
    expect(starts).toEqual(['106.66666666666667', '213.33333333333334', '426.6666666666667', '533.3333333333334'])
    expect(new Set(starts).size).toBe(4)
    expect(svg.querySelectorAll('circle')).toHaveLength(0)

    fireEvent.pointerMove(svg, { clientX: 426.6666666666667, clientY: 133.33333333333334 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (4, 4)')
  })

  it('keeps one marker path per series with every point at 100 and 10,000 points', { timeout: 120000 }, () => {
    for (const n of [100, 10000]) {
      const rows = Array.from({ length: n }, (_, i) => ({ x: i, y: i }))
      const world = { xMin: 0, xMax: n - 1, yMin: 0, yMax: n - 1 }
      const { svg, view } = show(dataset(rows), config(), world)

      const markers = markerPaths(svg)
      expect(markers).toHaveLength(1)
      const d = markers[0]?.getAttribute('d') ?? ''
      const xs = [...d.matchAll(/\bM\s+([-\d.]+)\s+/g)].map((match) => match[1])
      expect(xs).toHaveLength(n)
      expect(new Set(xs).size).toBe(n)
      const scaleX = 640 / (n - 1)
      expect(xs).toEqual(rows.map((row) => String(row.x * scaleX)))
      expect(svg.querySelectorAll('g[clip-path] > g > circle')).toHaveLength(0)
      expect(Array.from(svg.querySelectorAll('title')).map((title) => title.textContent)).toEqual([`y (${n} points)`])
      view.unmount()
    }
  })

  it('applies hidden-series changes to the corresponding marker batch without changing the visible batch', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'B' },
      { x: 3, y: 3, group: 'A' },
      { x: 4, y: 4, group: 'B' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const plot = resolvePlot(ds, cfg)
    const view = render(
      <DataPlot plot={plot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered line SVG')
    }
    expect(markerPaths(svg)).toHaveLength(2)
    const firstMark = markerPaths(svg)[0]?.getAttribute('d')
    const firstRun = runPaths(svg)[0]?.getAttribute('d')

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')

    const hiddenCfg = { ...cfg, hiddenSeries: ['B'] }
    view.rerender(
      <DataPlot plot={plot} config={hiddenCfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const hiddenSvg = view.container.querySelector('svg')
    expect(hiddenSvg).not.toBeNull()
    if (hiddenSvg === null) {
      throw new Error('Expected a hidden-series line SVG')
    }
    expect(markerPaths(hiddenSvg)).toHaveLength(1)
    expect(markerPaths(hiddenSvg)[0]?.getAttribute('d')).toBe(firstMark)
    expect(markerPaths(hiddenSvg)[0]?.getAttribute('fill')).toBe(curveStyle(0).color)
    expect(runPaths(hiddenSvg)).toHaveLength(1)
    expect(runPaths(hiddenSvg)[0]?.getAttribute('d')).toBe(firstRun)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    view.rerender(
      <DataPlot plot={plot} config={{ ...cfg, hiddenSeries: ['A', 'B'] }} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const emptySvg = view.container.querySelector('svg')
    expect(emptySvg).not.toBeNull()
    if (emptySvg === null) {
      throw new Error('Expected the all-hidden line SVG')
    }
    expect(markerPaths(emptySvg)).toHaveLength(0)
    expect(runPaths(emptySvg)).toHaveLength(0)
  })

  it('does not rebuild marker geometry for hover or a title-only render', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'A' },
      { x: 3, y: 3, group: 'B' },
      { x: 4, y: 4, group: 'B' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const plot = resolvePlot(ds, cfg)
    const view = render(
      <DataPlot plot={plot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered line SVG')
    }
    expect(probe.builds).toBe(2)
    const initial = markerPaths(svg).map((path) => path.getAttribute('d'))

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    expect(probe.builds).toBe(2)

    const renamed = { ...cfg, title: 'Renamed without geometry changes' }
    view.rerender(
      <DataPlot plot={plot} config={renamed} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(2)
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    expect(markerPaths(view.container.querySelector('svg') as SVGSVGElement).map((path) => path.getAttribute('d'))).toEqual(initial)

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={{ xMin: 0, xMax: 5, yMin: 0, yMax: 5 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(4)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
  })

  it('shows the same text and 7px nearest-point rule as scatter, with deterministic tie-breaking', () => {
    const { svg } = show(
      dataset([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]),
      config(),
    )

    expect(svg.querySelectorAll('g[clip-path] > g > title')).toHaveLength(0)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    const tooltip = screen.getByTestId('scatter-tooltip')
    expect(tooltip).toHaveTextContent('y: (1, 1)')
    expect(tooltip).toHaveStyle({ left: '64px', top: '352px' })
    expect(tooltip).toHaveAttribute('aria-hidden', 'true')

    fireEvent.pointerMove(svg, { clientX: 71, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (1, 1)')

    fireEvent.pointerMove(svg, { clientX: 72, clientY: 360 })
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    fireEvent.pointerMove(svg, { clientX: 128, clientY: 320 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (2, 2)')
    fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    const tied = show(
      dataset([
        { x: 1, y: 1, group: 'A' },
        { x: 1, y: 1, group: 'B' },
      ]),
      config({ seriesColumn: 'c3' }),
    )
    expect(markerPaths(tied.svg)).toHaveLength(2)
    fireEvent.pointerMove(tied.svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('B: (1, 1)')
  })

  it('invalidates a hover when the viewport or dataset changes', () => {
    const cfg = config()
    const plot = resolvePlot(
      dataset([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]),
      cfg,
    )
    const view = render(
      <DataPlot plot={plot} config={cfg} world={DEFAULT_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered line SVG')
    }
    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (1, 1)')

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={{ xMin: 0, xMax: 5, yMin: 0, yMax: 5 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()

    const zoomedSvg = view.container.querySelector('svg')
    expect(zoomedSvg).not.toBeNull()
    if (zoomedSvg === null) {
      throw new Error('Expected a zoomed line SVG')
    }
    fireEvent.pointerMove(zoomedSvg, { clientX: 128, clientY: 320 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (1, 1)')

    const changedPlot = resolvePlot(
      dataset([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
      ]),
      cfg,
    )
    view.rerender(
      <DataPlot plot={changedPlot} config={cfg} world={{ xMin: 0, xMax: 5, yMin: 0, yMax: 5 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
  })

  it('continues to draw error bars and clipping around the batched line markers', () => {
    const cfg = config({ yError: { mode: 'fixed', value: 0.5 }, xError: { mode: 'fixed', value: 0.25 } })
    const { svg } = show(
      dataset([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
      cfg,
    )
    expect(markerPaths(svg)).toHaveLength(1)
    expect(runPaths(svg)).toHaveLength(1)
    const clipped = svg.querySelectorAll('g[clip-path] > g > path[aria-hidden="true"][fill="none"]')
    expect(clipped).toHaveLength(2)
    expect(markerPaths(svg)[0]?.closest('g[clip-path]')).not.toBeNull()
    fireEvent.pointerMove(svg, { clientX: 128, clientY: 320 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (2, 2)')
  })

  it('leaves the separate export scene as per-point marker geometry', () => {
    const cfg = config()
    const plot = resolvePlot(
      dataset([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]),
      cfg,
    )
    const built = buildDataFigureScene(plot, cfg, DEFAULT_WORLD, null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status !== 'value') {
      throw new Error('Expected an export scene')
    }
    expect(built.scene.points).toHaveLength(3)
    expect(built.scene.points.map((point) => point.shape)).toEqual(['circle', 'circle', 'circle'])
    expect(built.scene.points.map((point) => point.label)).toEqual(['y: (1, 1)', 'y: (2, 2)', 'y: (3, 3)'])
    expect(built.scene.curveRuns).toHaveLength(1)
    expect(built.scene.curveRuns[0]?.points).toHaveLength(3)
  })
})
