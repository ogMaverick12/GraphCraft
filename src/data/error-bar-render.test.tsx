import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curveStyle } from '../graph/palette.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { DataPlot } from './DataPlot.tsx'
import { buildDataFigureScene } from './figure.ts'
import { resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./error-bars.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./error-bars.ts')>()
  return {
    ...actual,
    buildErrorBarPaths: (points: Parameters<typeof actual.buildErrorBarPaths>[0], cap?: number) => {
      probe.builds += 1
      return actual.buildErrorBarPaths(points, cap)
    },
  }
})

interface Row {
  x: number | null
  y: number
  xerr?: number | null
  upper?: number | null
  lower?: number | null
  group?: string
}

function dataset(rows: ReadonlyArray<Row>): Dataset {
  return {
    id: 'ds-s7510',
    name: 'S7.5.10 error bars',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
      { id: 'c3', name: 'xerr', type: 'numeric' },
      { id: 'c4', name: 'upper', type: 'numeric' },
      { id: 'c5', name: 'lower', type: 'numeric' },
      { id: 'c6', name: 'group', type: 'categorical' },
    ],
    rows: rows.map((row) => [row.x, row.y, row.xerr ?? null, row.upper ?? null, row.lower ?? null, row.group ?? null]),
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
    title: 'S7.5.10',
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
    yError: { mode: 'asymmetric', upper: 'c4', lower: 'c5' },
    xError: { mode: 'column', column: 'c3' },
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

function errorPaths(svg: SVGSVGElement): SVGPathElement[] {
  return Array.from(svg.querySelectorAll<SVGPathElement>('path[aria-hidden="true"][stroke]'))
}

function commandCount(d: string | null): number {
  return d === null ? 0 : (d.match(/\bM\b/g) ?? []).length
}

const FIXTURE_ROWS: Row[] = [
  { x: 2, y: 4, xerr: 0.5, upper: 3, lower: 1 },
  { x: 8, y: 8, xerr: 0.25, upper: 1, lower: 0.5 },
]

beforeEach(() => {
  probe.builds = 0
})

describe('live error-bar batching (S7.5.10)', () => {
  it('renders one vertical and one horizontal path with the former stem and cap coordinates', () => {
    const { svg } = show(dataset(FIXTURE_ROWS), config())

    const paths = errorPaths(svg)
    expect(paths).toHaveLength(2)
    expect(paths[0]?.getAttribute('d')).toBe(
      'M 128 120 L 128 280 M 124 120 L 132 120 M 124 280 L 132 280 M 512 40 L 512 100 M 508 40 L 516 40 M 508 100 L 516 100',
    )
    expect(paths[1]?.getAttribute('d')).toBe(
      'M 96 240 L 160 240 M 96 236 L 96 244 M 160 236 L 160 244 M 496 80 L 528 80 M 496 76 L 496 84 M 528 76 L 528 84',
    )
    for (const path of paths) {
      expect(path).toHaveAttribute('fill', 'none')
      expect(path).toHaveAttribute('stroke', curveStyle(0).color)
      expect(path).toHaveAttribute('stroke-width', '1.25')
      expect(path).toHaveAttribute('aria-hidden', 'true')
      expect(path.closest('g[clip-path]')).not.toBeNull()
    }
    expect(svg.querySelectorAll('g[aria-hidden="true"][stroke]')).toHaveLength(0)
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    expect(svg.querySelectorAll('title')).toHaveLength(0)
  })

  it('serializes full-precision fractional screen coordinates instead of rounding them', () => {
    const { svg } = show(
      dataset([{ x: 1, y: 2, xerr: 0.1, upper: 0.2, lower: 0.1 }]),
      config(),
      { xMin: 0, xMax: 3, yMin: 0, yMax: 7 },
    )
    const paths = errorPaths(svg)
    expect(paths).toHaveLength(2)
    expect(paths[0]?.getAttribute('d')).toBe(
      'M 213.33333333333334 274.2857142857143 L 213.33333333333334 291.42857142857144 M 209.33333333333334 274.2857142857143 L 217.33333333333334 274.2857142857143 M 209.33333333333334 291.42857142857144 L 217.33333333333334 291.42857142857144',
    )
    expect(paths[1]?.getAttribute('d')).toBe(
      'M 192 285.7142857142857 L 234.66666666666669 285.7142857142857 M 192 281.7142857142857 L 192 289.7142857142857 M 234.66666666666669 281.7142857142857 L 234.66666666666669 289.7142857142857',
    )
  })

  it('keeps X and Y error-bar configuration independent on scatter, line, and bar marks', () => {
    const ds = dataset(FIXTURE_ROWS)
    const yOnly = config({ xError: { mode: 'none' } })
    const ySvg = show(ds, yOnly).svg
    expect(errorPaths(ySvg)).toHaveLength(1)
    expect(errorPaths(ySvg)[0]?.getAttribute('d')).toContain('M 128 120 L 128 280')

    const xOnly = config({ yError: { mode: 'none' } })
    const xSvg = show(ds, xOnly).svg
    expect(errorPaths(xSvg)).toHaveLength(1)
    expect(errorPaths(xSvg)[0]?.getAttribute('d')).toContain('M 96 240 L 160 240')

    const none = show(ds, config({ yError: { mode: 'none' }, xError: { mode: 'none' } })).svg
    expect(errorPaths(none)).toHaveLength(0)

    const line = show(ds, config({ kind: 'line' })).svg
    expect(errorPaths(line)).toHaveLength(2)
    const lineMarkers = line.querySelectorAll('g[clip-path] > g > path[fill]:not([stroke])')
    expect(lineMarkers).toHaveLength(1)
    expect((lineMarkers[0]?.getAttribute('d') ?? '').match(/\bM\b/g)).toHaveLength(2)
    expect(line.querySelectorAll('circle')).toHaveLength(0)
    expect(line.querySelectorAll('line')).not.toHaveLength(0)

    const bar = show(ds, config({ kind: 'bar' })).svg
    expect(errorPaths(bar)).toHaveLength(1)
    expect(commandCount(errorPaths(bar)[0]?.getAttribute('d') ?? null)).toBe(6)
    const barMarkers = bar.querySelectorAll('g[clip-path] > g > path[fill]:not([stroke])')
    expect(barMarkers).toHaveLength(1)
    expect((barMarkers[0]?.getAttribute('d') ?? '').match(/\bM\b/g)).toHaveLength(2)
    expect(bar.querySelectorAll('g[clip-path] > g > rect')).toHaveLength(0)
  })

  it('omits missing or invalid errors per axis and drops skipped rows exactly as before', () => {
    const ds = dataset([
      { x: 1, y: 2, xerr: null, upper: 0.5, lower: 0.5 },
      { x: 2, y: 3, xerr: 0.2, upper: null, lower: 0.5 },
      { x: 3, y: 4, xerr: -0.1, upper: 0.5, lower: 0.5 },
      { x: null, y: 5, xerr: 0.2, upper: 0.5, lower: 0.5 },
      { x: 4, y: 6, xerr: 0.2, upper: 0.5, lower: -1 },
    ])
    const { plot, svg } = show(ds, config())

    expect(plot.totalPoints).toBe(4)
    expect(plot.totalSkipped).toBe(1)
    const paths = errorPaths(svg)
    expect(paths).toHaveLength(2)
    expect(commandCount(paths[0]?.getAttribute('d') ?? null)).toBe(6)
    expect(commandCount(paths[1]?.getAttribute('d') ?? null)).toBe(6)
    expect(screen.getByRole('img', { name: /S7\.5\.10: scatter plot with 1 visible series and 4 points/ })).toBe(svg)
  })

  it('omits a whisker whose endpoint cannot be placed on a log axis without affecting the other axis', () => {
    const ds = dataset([{ x: 1, y: 1, xerr: 0.5, upper: 0.2, lower: 2 }])
    const cfg = config({ xScale: 'log', yScale: 'log' })
    const { svg } = show(ds, cfg, { xMin: 0.1, xMax: 10, yMin: 0.1, yMax: 10 })

    const paths = errorPaths(svg)
    expect(paths).toHaveLength(1)
    expect(commandCount(paths[0]?.getAttribute('d') ?? null)).toBe(3)
  })

  it('keeps one error path per series/axis at 100 and 10,000 points with every whisker retained', () => {
    const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({
      x: i,
      y: i / 10,
      xerr: 0.2 + (i % 3) * 0.1,
      upper: 0.4,
      lower: 0.3,
    }))
    const cfg = config()
    const small = show(dataset(rows(100)), cfg, { xMin: 0, xMax: 99, yMin: -5, yMax: 15 }).svg
    const smallPaths = errorPaths(small)
    expect(smallPaths).toHaveLength(2)
    expect(commandCount(smallPaths[0]?.getAttribute('d') ?? null)).toBe(300)
    expect(commandCount(smallPaths[1]?.getAttribute('d') ?? null)).toBe(300)

    const large = show(dataset(rows(10000)), cfg, { xMin: 0, xMax: 9999, yMin: -5, yMax: 1005 }).svg
    const largePaths = errorPaths(large)
    expect(largePaths).toHaveLength(2)
    expect(commandCount(largePaths[0]?.getAttribute('d') ?? null)).toBe(30000)
    expect(commandCount(largePaths[1]?.getAttribute('d') ?? null)).toBe(30000)
    expect(large.querySelectorAll('g[aria-hidden="true"][stroke]')).toHaveLength(0)
    expect(large.querySelectorAll('g[aria-hidden="true"][stroke] > line')).toHaveLength(0)
  })

  it('bounds error geometry by series and axis and rebuilds only when its inputs change', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      y: i / 10,
      xerr: 0.25,
      upper: 0.5,
      lower: 0.5,
      group: i < 500 ? 'A' : 'B',
    }))
    const ds = dataset(rows)
    const cfg = config({ seriesColumn: 'c6' })
    const plot = resolvePlot(ds, cfg)
    const world = { xMin: 0, xMax: 999, yMin: -5, yMax: 105 }
    const view = render(
      <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    const svg = view.container.querySelector('svg')
    expect(svg).not.toBeNull()
    if (svg === null) {
      throw new Error('Expected a rendered plot SVG')
    }

    expect(errorPaths(svg)).toHaveLength(4)
    expect(probe.builds).toBe(2)
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 382 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (0, 0)')
    expect(probe.builds).toBe(2)

    view.rerender(
      <DataPlot plot={plot} config={{ ...cfg, title: 'Renamed' }} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(2)
    expect(screen.getByTestId('scatter-tooltip')).toBeInTheDocument()

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={{ xMin: 0, xMax: 499, yMin: -5, yMax: 105 }} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(4)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
  })

  it('keeps scatter hover, clipping, and the accessible summary intact around the batched whiskers', () => {
    const { svg } = show(dataset(FIXTURE_ROWS), config())

    expect(screen.getByRole('img', { name: /S7\.5\.10: scatter plot with 1 visible series and 2 points/ })).toBe(svg)
    expect(errorPaths(svg).every((path) => path.closest('g[clip-path]') !== null)).toBe(true)

    fireEvent.pointerMove(svg, { clientX: 128, clientY: 240 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('y: (2, 4)')
    fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
  })

  it('leaves the separate export scene as per-rule whisker geometry', () => {
    const ds = dataset(FIXTURE_ROWS)
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const built = buildDataFigureScene(plot, cfg, DEFAULT_WORLD, null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status !== 'value') {
      throw new Error('Expected an export scene')
    }
    expect(built.scene.rules).toHaveLength(12)
    expect(built.scene.rules.every((rule) => rule.width === 1.25)).toBe(true)
    expect(plot.series[0]?.points).toHaveLength(2)
  })
})
