import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldRect } from '../graph/coordinate.ts'
import type { Dataset } from './dataset.ts'
import { DataPlot } from './DataPlot.tsx'
import type { BarScreenRect } from './bar-marks.ts'
import { buildBarHitIndex, findBarHit, measureBarHit } from './bar-hit-index.ts'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./bar-hit-index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bar-hit-index.ts')>()
  return {
    ...actual,
    buildBarHitIndex: (rects: ReadonlyArray<BarScreenRect>) => {
      probe.builds += 1
      return actual.buildBarHitIndex(rects)
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
    id: 'ds-s7514',
    name: 'S7.5.14 bar hit index',
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

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'bar',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.14',
    xLabel: 'category',
    yLabel: 'value',
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

function rect(x: number, y: number, width: number, height: number, title: string): BarScreenRect {
  return { x, y, width, height, title }
}

function linearHit(rects: ReadonlyArray<BarScreenRect>, x: number, y: number): BarScreenRect | null {
  let hit: BarScreenRect | null = null
  for (const candidate of rects) {
    if (x >= candidate.x && x <= candidate.x + candidate.width && y >= candidate.y && y <= candidate.y + candidate.height) {
      hit = candidate
    }
  }
  return hit
}

function show(
  ds: Dataset,
  cfg: PlotConfig,
  world?: WorldRect,
): { view: ReturnType<typeof render>; svg: SVGSVGElement; plot: ReturnType<typeof resolvePlot>; world: WorldRect } {
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
    throw new Error('Expected a bar SVG')
  }
  return { view, svg, plot, world: bounds }
}

function barPath(svg: SVGSVGElement): SVGPathElement {
  const path = svg.querySelector<SVGPathElement>('g[clip-path] > g > path[fill]:not([fill="none"])')
  if (path === null) {
    throw new Error('Expected a batched bar path')
  }
  return path
}

beforeEach(() => {
  probe.builds = 0
})

describe('bar hit index (S7.5.14)', () => {
  it('matches the linear reference across interiors, edges, overlaps, and outside points', () => {
    const rects = [
      rect(0, 0, 100, 50, 'r0'),
      rect(50, 20, 60, 60, 'r1'),
      rect(100, 0, 50, 50, 'r2'),
      rect(20, 60, 20, 30, 'r3'),
      rect(80, 70, 40, 10, 'r4'),
    ]
    const index = buildBarHitIndex(rects)
    const xs = [-10, 0, 20, 50, 80, 100, 110, 150, 170]
    const ys = [-10, 0, 20, 50, 60, 70, 80, 90, 110]
    let compared = 0
    for (const x of xs) {
      for (const y of ys) {
        expect(findBarHit(index, x, y)).toBe(linearHit(rects, x, y))
        compared += 1
      }
    }
    expect(compared).toBe(81)
  })

  it('keeps inclusive shared edges and later flattened rectangles as the winner', () => {
    const adjacent = [rect(0, 0, 10, 10, 'left'), rect(10, 0, 10, 10, 'right')]
    const index = buildBarHitIndex(adjacent)
    expect(findBarHit(index, 10, 5)?.title).toBe('right')
    expect(measureBarHit(index, 10, 5).stats).toEqual({ candidatesExamined: 2, containmentTests: 2 })

    const overlap = [rect(0, 0, 20, 20, 'early'), rect(5, 5, 20, 20, 'late')]
    expect(findBarHit(buildBarHitIndex(overlap), 10, 10)?.title).toBe('late')
    expect(findBarHit(buildBarHitIndex([...overlap].reverse()), 10, 10)?.title).toBe('early')
  })

  it('examines one of 10,000 disjoint rectangles for an ordinary pointer location', () => {
    const rects = Array.from({ length: 10000 }, (_, i) => rect(i * 10, 0, 10, 100, `bar-${i}`))
    const index = buildBarHitIndex(rects)
    const hit = measureBarHit(index, 50005, 50)
    expect(hit.hit?.title).toBe('bar-5000')
    expect(hit.stats).toEqual({ candidatesExamined: 1, containmentTests: 1 })
    expect(rects).toHaveLength(10000)

    expect(measureBarHit(index, 50000, 50).stats).toEqual({ candidatesExamined: 2, containmentTests: 2 })
    expect(measureBarHit(index, 50010, 50).stats).toEqual({ candidatesExamined: 2, containmentTests: 2 })
    expect(measureBarHit(index, 50005, 150).stats).toEqual({ candidatesExamined: 1, containmentTests: 1 })
    expect(measureBarHit(index, 100005, 50).stats).toEqual({ candidatesExamined: 0, containmentTests: 0 })
  })

  it('bounds overlapping and identical intervals by the candidate population', () => {
    const rects = Array.from({ length: 2048 }, (_, i) => rect(100, 100, 50, 50, `same-${i}`))
    const index = buildBarHitIndex(rects)
    const measured = measureBarHit(index, 125, 125)
    expect(measured.hit?.title).toBe('same-2047')
    expect(measured.stats).toEqual({ candidatesExamined: 2048, containmentTests: 2048 })
  })
})

describe('live bar hit integration (S7.5.14)', () => {
  it('reuses one index across hover and title-only updates, then replaces it on input changes', () => {
    const ds = barDataset([
      { x: 'A', y: 3, group: 'g1' },
      { x: 'A', y: -2, group: 'g2' },
      { x: 'B', y: 4, group: 'g1' },
      { x: 'B', y: 1, group: 'g2' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const world = { xMin: -0.5, xMax: 1.5, yMin: -5, yMax: 5 }
    const { view, svg, plot } = show(ds, cfg, world)
    expect(probe.builds).toBe(1)
    const initialPath = barPath(svg).getAttribute('d')

    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g1: A = 3')
    expect(probe.builds).toBe(1)
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 200 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    expect(probe.builds).toBe(1)

    view.rerender(
      <DataPlot
        plot={plot}
        config={{ ...cfg, title: 'Title only' }}
        world={world}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    expect(probe.builds).toBe(1)
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    expect(barPath(view.container.querySelector('svg') ?? svg).getAttribute('d')).toBe(initialPath)

    const hiddenCfg = { ...cfg, hiddenSeries: ['g1'] }
    view.rerender(
      <DataPlot
        plot={plot}
        config={hiddenCfg}
        world={world}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    expect(probe.builds).toBe(2)
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 250 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    expect(probe.builds).toBe(2)

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(3)
    const zoomedWorld = { xMin: 0, xMax: 1, yMin: -5, yMax: 5 }
    view.rerender(
      <DataPlot
        plot={plot}
        config={cfg}
        world={zoomedWorld}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    expect(probe.builds).toBe(4)
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 250 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('g2: A = -2')
    expect(probe.builds).toBe(4)
    const changedDs = barDataset([
      { x: 'A', y: 8, group: 'g1' },
      { x: 'A', y: -2, group: 'g2' },
      { x: 'B', y: 4, group: 'g1' },
      { x: 'B', y: 1, group: 'g2' },
    ])
    view.rerender(
      <DataPlot
        plot={resolvePlot(changedDs, cfg)}
        config={cfg}
        world={zoomedWorld}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    expect(probe.builds).toBe(5)
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
  })

  it('omits zero-area bars, missing rows, and outside pointers from the index', () => {
    const ds = barDataset([
      { x: 'A', y: 5 },
      { x: 'B', y: 0 },
      { x: 'C', y: null },
    ])
    const cfg = config({ title: 'Zero-area index' })
    const { svg } = show(ds, cfg, { xMin: -0.5, xMax: 2.5, yMin: 0, yMax: 5 })
    const path = barPath(svg)
    expect((path.getAttribute('d') ?? '').match(/\bM\b/g)).toHaveLength(2)
    expect(probe.builds).toBe(1)

    fireEvent.pointerMove(svg, { clientX: 320, clientY: 400 })
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 10, clientY: 10 })
    expect(screen.queryByTestId('bar-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 106, clientY: 200 })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: A = 5')
  })

  it('does not build an index for scatter plots', () => {
    const ds: Dataset = {
      ...barDataset([
        { x: '0', y: 1 },
        { x: '1', y: 2 },
      ]),
      columns: [
        { id: 'c1', name: 'x', type: 'numeric' },
        { id: 'c2', name: 'y', type: 'numeric' },
      ],
      rows: [
        [1, 2],
        [2, 4],
      ],
    }
    const cfg = config({ kind: 'scatter' })
    show(ds, cfg, { xMin: 0, xMax: 3, yMin: 0, yMax: 5 })
    expect(probe.builds).toBe(0)
  })
})
