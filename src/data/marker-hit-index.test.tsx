import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransform, worldToScreen, type WorldRect } from '../graph/coordinate.ts'
import type { Dataset } from './dataset.ts'
import { DataPlot } from './DataPlot.tsx'
import { SCATTER_HIT_RADIUS, type ScatterScreenPoint } from './scatter-marks.ts'
import { buildMarkerHitIndex, findNearestMarker, measureNearestMarker } from './marker-hit-index.ts'
import { resolvePlot, type PlotConfig } from './plots.ts'

const probe = vi.hoisted(() => ({ builds: 0 }))

vi.mock('./marker-hit-index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marker-hit-index.ts')>()
  return {
    ...actual,
    buildMarkerHitIndex: (points: ReadonlyArray<ScatterScreenPoint>) => {
      probe.builds += 1
      return actual.buildMarkerHitIndex(points)
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
    id: 'ds-s7515',
    name: 'S7.5.15 marker hit index',
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
    title: 'S7.5.15',
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

function point(px: number, py: number, title: string): ScatterScreenPoint {
  return { px, py, title }
}

function linearNearest(points: ReadonlyArray<ScatterScreenPoint>, x: number, y: number): ScatterScreenPoint | null {
  let nearest: ScatterScreenPoint | null = null
  let bestDistance = SCATTER_HIT_RADIUS * SCATTER_HIT_RADIUS
  for (const candidate of points) {
    const dx = candidate.px - x
    const dy = candidate.py - y
    const distance = dx * dx + dy * dy
    if (distance <= bestDistance) {
      bestDistance = distance
      nearest = candidate
    }
  }
  return nearest
}

function show(
  ds: Dataset,
  cfg: PlotConfig,
  world: WorldRect,
): { view: ReturnType<typeof render>; plot: ReturnType<typeof resolvePlot>; svg: SVGSVGElement } {
  const plot = resolvePlot(ds, cfg)
  const view = render(
    <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered plot SVG')
  }
  return { view, plot, svg }
}

function workload(n: number): { points: ScatterScreenPoint[]; target: number; transform: ReturnType<typeof createTransform>; world: WorldRect } {
  const world = { xMin: -1, xMax: n, yMin: -1, yMax: n }
  const transform = createTransform(world, { width: 640, height: 400 }, false)
  const points = Array.from({ length: n }, (_, i) => {
    const screen = worldToScreen(transform, i, (i * 37) % n)
    return point(screen.px, screen.py, `P${i}`)
  })
  return { points, target: Math.floor(n / 2), transform, world }
}

beforeEach(() => {
  probe.builds = 0
})

describe('marker hit index (S7.5.15)', () => {
  it('matches the linear reference across a deterministic screen grid', () => {
    const points = [
      point(0, 0, 'origin'),
      point(7, 0, 'edge-right'),
      point(0, 7, 'edge-bottom'),
      point(7, 7, 'corner'),
      point(50.1, 50.1, 'duplicate-a'),
      point(50.1, 50.1, 'duplicate-b'),
      point(96, 50.5, 'left-cluster'),
      point(100.25, 50.5, 'centre-cluster'),
      point(104.5, 50.5, 'right-cluster'),
      point(100.25, 54, 'above-cluster'),
      point(100.25, 47, 'below-cluster'),
      point(-7, 10, 'negative-margin'),
      point(640, 400, 'far-corner'),
    ]
    const index = buildMarkerHitIndex(points)
    const xs = [-20, -7, 0, 3, 7, 10, 50.1, 96, 100.25, 104.5, 107.5, 111]
    const ys = [-20, 0, 3, 7, 10, 47, 50.5, 54, 58, 400]
    let compared = 0
    for (const x of xs) {
      for (const y of ys) {
        const measured = measureNearestMarker(index, x, y)
        expect(measured.hit).toBe(linearNearest(points, x, y))
        expect(measured.stats.candidatesExamined).toBe(measured.stats.distanceTests)
        compared += 1
      }
    }
    expect(compared).toBe(120)
    expect(index.pointCount).toBe(points.length)
  })

  it('keeps the inclusive hit radius and later flattened point on exact ties', () => {
    const boundary = buildMarkerHitIndex([point(10, 0, 'edge'), point(10.0001, 0, 'beyond')])
    const onEdge = measureNearestMarker(boundary, 3, 0)
    expect(onEdge.hit?.title).toBe('edge')
    expect(onEdge.stats).toEqual({ candidatesExamined: 2, distanceTests: 2 })
    const outside = measureNearestMarker(boundary, 2.9999, 0)
    expect(outside.hit).toBeNull()

    const tied = buildMarkerHitIndex([point(7, 0, 'first'), point(0, 7, 'second')])
    expect(measureNearestMarker(tied, 0, 0).hit?.title).toBe('second')

    const coincident = buildMarkerHitIndex([point(5, 5, 'dup-0'), point(5, 5, 'dup-1'), point(5, 5, 'dup-2')])
    const duplicate = measureNearestMarker(coincident, 5, 5)
    expect(duplicate.hit?.title).toBe('dup-2')
    expect(duplicate.stats).toEqual({ candidatesExamined: 3, distanceTests: 3 })

    const empty = buildMarkerHitIndex([])
    expect(findNearestMarker(empty, 0, 0)).toBeNull()
    expect(measureNearestMarker(empty, 0, 0).stats).toEqual({ candidatesExamined: 0, distanceTests: 0 })
  })

  it('examines far fewer candidates for 100, 1,000, and 10,000 point workloads', () => {
    for (const [n, expectedCandidates] of [
      [100, 1],
      [1000, 1],
      [10000, 14],
    ] as const) {
      const { points, target } = workload(n)
      const index = buildMarkerHitIndex(points)
      const targetPoint = points[target]
      if (targetPoint === undefined) throw new Error('Expected target point')
      const measured = measureNearestMarker(index, targetPoint.px, targetPoint.py)
      expect(measured.hit).toBe(targetPoint)
      expect(measured.hit).toBe(linearNearest(points, targetPoint.px, targetPoint.py))
      expect(measured.stats).toEqual({ candidatesExamined: expectedCandidates, distanceTests: expectedCandidates })
      expect(index.pointCount).toBe(n)
    }
  })

  it('bounds dense clusters by the candidate population', () => {
    const points = Array.from({ length: 1000 }, (_, i) => point(100, 100, `cluster-${i}`))
    const index = buildMarkerHitIndex(points)
    const measured = measureNearestMarker(index, 100, 100)
    expect(measured.hit?.title).toBe('cluster-999')
    expect(measured.stats).toEqual({ candidatesExamined: 1000, distanceTests: 1000 })
    expect(measureNearestMarker(index, 0, 0).hit).toBeNull()
  })
})

describe('live marker hit integration (S7.5.15)', () => {
  it('preserves exact scatter and line tooltip text and cross-series tie-breaking', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 1, y: 1, group: 'B' },
    ])
    const world = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }
    const scatter = show(ds, config({ seriesColumn: 'c3' }), world)
    fireEvent.pointerMove(scatter.svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('B: (1, 1)')
    scatter.view.unmount()

    const line = show(ds, config({ kind: 'line', seriesColumn: 'c3' }), world)
    fireEvent.pointerMove(line.svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('B: (1, 1)')
    line.view.unmount()
  })

  it('reuses the index across hover and title-only updates, then replaces it on input changes', () => {
    const ds = dataset([
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'B' },
    ])
    const cfg = config({ seriesColumn: 'c3' })
    const world = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 }
    const { view, plot, svg } = show(ds, cfg, world)
    expect(probe.builds).toBe(1)

    fireEvent.pointerMove(svg, { clientX: 64, clientY: 360 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    expect(probe.builds).toBe(1)

    view.rerender(
      <DataPlot plot={plot} config={{ ...cfg, title: 'Title only' }} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(1)
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')

    const hiddenCfg = { ...cfg, hiddenSeries: ['A'] }
    view.rerender(
      <DataPlot plot={plot} config={hiddenCfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(2)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 128, clientY: 320 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('B: (2, 2)')
    expect(probe.builds).toBe(2)

    view.rerender(
      <DataPlot plot={plot} config={cfg} world={world} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(3)
    const zoomedWorld = { xMin: 0, xMax: 5, yMin: 0, yMax: 5 }
    view.rerender(
      <DataPlot plot={plot} config={cfg} world={zoomedWorld} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(probe.builds).toBe(4)
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 128, clientY: 320 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (1, 1)')
    expect(probe.builds).toBe(4)

    const changedDs = dataset([
      { x: 3, y: 3, group: 'A' },
      { x: 4, y: 4, group: 'B' },
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
    expect(screen.queryByTestId('scatter-tooltip')).toBeNull()
    fireEvent.pointerMove(svg, { clientX: 384, clientY: 160 })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent('A: (3, 3)')
    expect(probe.builds).toBe(5)
  })

  it('does not build a marker index for an empty plot', () => {
    const cfg = config()
    const plot = resolvePlot(dataset([]), cfg)
    render(
      <DataPlot plot={plot} config={cfg} world={null} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(screen.getByText(/No plottable points/)).toBeInTheDocument()
    expect(probe.builds).toBe(0)
  })

  it('returns the exact 10,000-point target through the live indexed tooltip', () => {
    const { points, target, world } = workload(10000)
    const ds = dataset(
      Array.from({ length: 10000 }, (_, i) => ({ x: i, y: (i * 37) % 10000 })),
    )
    const cfg = config({ title: 'S7.5.15 large scatter' })
    const { plot, svg, view } = show(ds, cfg, world)
    const targetPoint = points[target]
    const label = plot.series[0]?.label
    if (targetPoint === undefined || label === undefined) throw new Error('Expected target point and series label')
    fireEvent.pointerMove(svg, { clientX: targetPoint.px, clientY: targetPoint.py })
    expect(screen.getByTestId('scatter-tooltip')).toHaveTextContent(`${label}: (5000, 5000)`)
    expect(probe.builds).toBe(1)
    view.unmount()
  })
})
