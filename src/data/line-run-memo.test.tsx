import { act, fireEvent, render, screen } from '@testing-library/react'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldRect } from '../graph/coordinate.ts'
import { DataPlot } from './DataPlot.tsx'
import type { Dataset } from './dataset.ts'
import { PlotWorkshop } from './PlotWorkshop.tsx'
import type { DatasetAnalysisSnapshot } from './persistence.ts'
import { resolvePlot, type PlotConfig, type ResolvedPlot } from './plots.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./line-runs.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./line-runs.ts')>()
  return {
    ...actual,
    buildLineRunGeometry: (...args: Parameters<typeof actual.buildLineRunGeometry>) => {
      probe.builds += 1
      return actual.buildLineRunGeometry(...args)
    },
  }
})

interface Row {
  x: number
  y: number | null
}

function dataset(rows: ReadonlyArray<Row>, name = 'S7.5.17'): Dataset {
  return {
    id: 'ds-s7517',
    name,
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
    ],
    rows: rows.map((row) => [row.x, row.y]),
    provenance: { kind: 'manual', importedAt: '2026-10-22T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'line',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.17',
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

const WORLD: WorldRect = { xMin: 0, xMax: 10000, yMin: 0, yMax: 10000 }
const SMALL_WORLD: WorldRect = { xMin: 0, xMax: 6, yMin: 0, yMax: 6 }

function largeDataset(): Dataset {
  return dataset(Array.from({ length: 10000 }, (_, index) => ({ x: index, y: index % 37 === 0 ? null : index })))
}

function largePlot(ds: Dataset = largeDataset()): ResolvedPlot {
  return resolvePlot(ds, config({ title: 'S7.5.17 large' }))
}

function smallPlot(rows: ReadonlyArray<Row>, name = 'S7.5.17 small'): ResolvedPlot {
  return resolvePlot(dataset(rows, name), config({ title: name }))
}

function show(plot: ResolvedPlot, cfg: PlotConfig, world: WorldRect): { view: ReturnType<typeof render>; svg: SVGSVGElement } {
  const view = render(
    <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered line plot')
  }
  return { view, svg }
}

function linePaths(svg: SVGSVGElement): SVGPathElement[] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('g[clip-path] > g > path[fill="none"]')).filter((path) => path.querySelector('title') !== null)
}

function markerPath(svg: SVGSVGElement): SVGPathElement | null {
  return svg.querySelector<SVGPathElement>('g[clip-path] > g > path[fill]:not([fill="none"])')
}

function pathData(paths: SVGPathElement[]): string[] {
  return paths.map((path) => path.getAttribute('d') ?? '')
}

function pathHash(paths: SVGPathElement[]): string {
  return createHash('sha256').update(pathData(paths).join('\n')).digest('hex')
}

beforeEach(() => {
  probe.builds = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('S7.5.17 line-run geometry memoization', () => {
  it('reuses the 271-run geometry for a 10,000-row line series across title-only and hover updates', () => {
    const cfg = config({ title: 'S7.5.17 large' })
    const ds = largeDataset()
    const plot = largePlot(ds)
    expect(plot.totalPoints).toBe(9729)
    expect(plot.totalSkipped).toBe(271)
    const { view, svg } = show(plot, cfg, WORLD)

    expect(probe.builds).toBe(1)
    const initial = linePaths(svg)
    expect(initial).toHaveLength(271)
    expect(pathHash(initial)).toBe('2d4e860c5fb941145d0e9012aed1d86949a80e01879c3abd0d736710ad62f46f')
    expect(initial.reduce((sum, path) => sum + (path.getAttribute('d')?.match(/\bL\b/g) ?? []).length + 1, 0)).toBe(9729)
    expect(initial[0]?.querySelector('title')?.textContent).toBe('y segment 1 of 271')
    expect(initial[270]?.querySelector('title')?.textContent).toBe('y segment 271 of 271')
    expect(screen.getByRole('img')).toHaveAccessibleName(/S7.5.17 large: line plot with 1 visible series and 9729 points\. 271 rows skipped\./)
    const markerBefore = markerPath(svg)?.getAttribute('d') ?? ''
    expect(markerBefore).not.toBe('')

    const renamedCfg = { ...cfg, title: 'Renamed in Inspector' }
    probe.builds = 0
    view.rerender(
      <DataPlot plot={plot} config={renamedCfg} world={WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(0)
    expect(pathHash(linePaths(svg))).toBe('2d4e860c5fb941145d0e9012aed1d86949a80e01879c3abd0d736710ad62f46f')
    expect(screen.getByRole('img')).toHaveAccessibleName(/Renamed in Inspector: line plot/)
    expect(linePaths(svg)[0]?.querySelector('title')?.textContent).toBe('y segment 1 of 271')

    probe.builds = 0
    fireEvent.pointerMove(svg, { clientX: 320, clientY: 200 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (5000, 5000)')
    expect(probe.builds).toBe(0)
    expect(pathHash(linePaths(svg))).toBe('2d4e860c5fb941145d0e9012aed1d86949a80e01879c3abd0d736710ad62f46f')
    expect(markerPath(svg)?.getAttribute('d')).toBe(markerBefore)
  })

  it('rebuilds for a viewport change and never reuses stale paths when returning', () => {
    const cfg = config({ title: 'S7.5.17 small' })
    const plot = smallPlot([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: null },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ])
    const { view, svg } = show(plot, cfg, SMALL_WORLD)
    expect(probe.builds).toBe(1)
    const initial = pathData(linePaths(svg))
    expect(initial).toEqual(['M 106.67 333.33 L 213.33 266.67', 'M 426.67 133.33 L 533.33 66.67'])

    probe.builds = 0
    view.rerender(
      <DataPlot plot={plot} config={cfg} world={{ xMin: 0, xMax: 12, yMin: 0, yMax: 12 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    const moved = pathData(linePaths(svg))
    expect(moved).not.toEqual(initial)

    probe.builds = 0
    view.rerender(
      <DataPlot plot={plot} config={cfg} world={SMALL_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    expect(pathData(linePaths(svg))).toEqual(initial)
  })

  it('invalidates for dataset, visibility, and log-scale changes without losing later updates', () => {
    const cfg = config({ title: 'S7.5.17 invalidation' })
    const plotA = smallPlot([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: null },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ])
    const { view, svg } = show(plotA, cfg, SMALL_WORLD)
    const original = pathData(linePaths(svg))
    expect(probe.builds).toBe(1)

    const plotB = smallPlot([
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: null },
      { x: 4, y: 5 },
      { x: 5, y: 6 },
    ])
    probe.builds = 0
    view.rerender(
      <DataPlot plot={plotB} config={cfg} world={SMALL_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    const changed = pathData(linePaths(svg))
    expect(changed).not.toEqual(original)
    const hiddenKey = plotB.series[0]?.key
    if (hiddenKey === undefined) {
      throw new Error('Expected a series key')
    }

    probe.builds = 0
    view.rerender(
      <DataPlot plot={plotB} config={{ ...cfg, hiddenSeries: [hiddenKey] }} world={SMALL_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(0)
    expect(linePaths(svg)).toHaveLength(0)

    probe.builds = 0
    view.rerender(
      <DataPlot plot={plotB} config={cfg} world={SMALL_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    expect(pathData(linePaths(svg))).toEqual(changed)

    probe.builds = 0
    view.rerender(
      <DataPlot plot={plotB} config={{ ...cfg, xScale: 'log' }} world={SMALL_WORLD} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    expect(pathData(linePaths(svg))).not.toEqual(changed)
  })

  it('invalidates on a plot-size change and keeps clipping bounds in sync', () => {
    let callback: ResizeObserverCallback | null = null
    class ControlledResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callback = cb
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ControlledResizeObserver)

    const cfg = config({ title: 'S7.5.17 resize' })
    const plot = smallPlot([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: null },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ])
    const { view, svg } = show(plot, cfg, SMALL_WORLD)
    const initial = pathData(linePaths(svg))
    const box = view.container.querySelector<HTMLElement>('div.h-full.w-full')
    if (box === null) {
      throw new Error('Expected the plot measurement box')
    }
    const rectSpy = vi.spyOn(box, 'getBoundingClientRect')
    probe.builds = 0
    rectSpy.mockReturnValue(new DOMRect(0, 0, 320, 200))
    act(() => {
      callback?.([], {} as ResizeObserver)
    })

    expect(probe.builds).toBe(1)
    expect(pathData(linePaths(svg))).not.toEqual(initial)
    expect(svg.querySelector('clipPath rect')?.getAttribute('width')).toBe('320')
    expect(svg.querySelector('clipPath rect')?.getAttribute('height')).toBe('200')
  })

  it('does not rebuild line runs for a title-only Inspector edit through PlotWorkshop', () => {
    const cfg = config({ title: 'S7.5.17 workshop' })
    const ds = dataset(
      Array.from({ length: 100 }, (_, index) => ({ x: index, y: index % 10 === 0 ? null : index })),
      'S7.5.17 workshop',
    )
    const initialAnalysis: DatasetAnalysisSnapshot = {
      plot: cfg,
      fit: { model: 'none', degree: 2, xId: 'c1', yId: 'c2', weightMode: 'none', weightColumn: '', weightFixed: '1' },
      fitResult: null,
      export: { format: 'svg', scale: 1, background: 'white', caption: '', csvTable: 'dataset', figureSize: 'M' },
    }
    const view = render(<PlotWorkshop dataset={ds} initialAnalysis={initialAnalysis} />)
    expect(probe.builds).toBe(1)
    const svg = view.container.querySelector<SVGSVGElement>('svg[role="img"]')
    if (svg === null) {
      throw new Error('Expected the workshop line plot')
    }
    expect(screen.getByRole('img', { name: /S7.5.17 workshop: line plot/ })).toBeInTheDocument()
    const beforePaths = pathData(linePaths(svg))

    probe.builds = 0
    fireEvent.change(screen.getByLabelText('Plot title'), { target: { value: 'Renamed in Inspector' } })
    expect(probe.builds).toBe(0)
    expect(screen.getByRole('img', { name: /Renamed in Inspector: line plot/ })).toBeInTheDocument()
    expect(pathData(linePaths(svg))).toEqual(beforePaths)
  })
})
