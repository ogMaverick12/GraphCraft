import { describe, expect, it } from 'vitest'
import { histogramBins, logTicks, plotWorld, resolvePlot, seriesShape, sturgesBins, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'

function dataset(columns: Array<{ name: string; type: 'numeric' | 'categorical' }>, rows: Array<Array<number | string | null>>): Dataset {
  return {
    id: 'ds-test',
    name: 'Test',
    columns: columns.map((col, i) => ({ id: `c${i + 1}`, name: col.name, type: col.type })),
    rows,
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'scatter',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'Plot',
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

const xy = dataset(
  [
    { name: 'x', type: 'numeric' },
    { name: 'y', type: 'numeric' },
  ],
  [
    [1, 2],
    [2, 4],
    [3, null],
    [4, 8],
  ],
)

describe('plot mapping', () => {
  it('maps X/Y columns and counts skipped rows', () => {
    const plot = resolvePlot(xy, config())
    expect(plot.series).toHaveLength(1)
    expect(plot.series[0]?.points).toEqual([
      { x: 1, y: 2, label: '' },
      { x: 2, y: 4, label: '' },
      { x: 4, y: 8, label: '' },
    ])
    expect(plot.totalSkipped).toBe(1)
    expect(plot.notes.some((note) => note.includes('1 rows skipped'))).toBe(true)
  })

  it('requires numeric X for scatter and line, row index when unmapped', () => {
    const cat = dataset(
      [
        { name: 'g', type: 'categorical' },
        { name: 'v', type: 'numeric' },
      ],
      [
        ['a', 1],
        ['b', 2],
      ],
    )
    const bad = resolvePlot(cat, config({ xColumn: 'c1', yColumn: 'c2' }))
    expect(bad.totalPoints).toBe(0)
    expect(bad.totalSkipped).toBe(2)
    const indexed = resolvePlot(cat, config({ xColumn: null, yColumn: 'c2' }))
    expect(indexed.series[0]?.points.map((p) => p.x)).toEqual([0, 1])
  })

  it('splits multiple series with stable colours and legend labels', () => {
    const grouped = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
        { name: 'g', type: 'categorical' },
      ],
      [
        [1, 2, 'a'],
        [2, 3, 'b'],
        [3, 4, 'a'],
      ],
    )
    const plot = resolvePlot(grouped, config({ seriesColumn: 'c3' }))
    expect(plot.series.map((s) => s.label)).toEqual(['a', 'b'])
    expect(plot.series.map((s) => s.colorIndex)).toEqual([0, 1])
    expect(plot.series[0]?.points).toHaveLength(2)
  })

  it('renders bars on categorical X without connecting lines', () => {
    const cats = dataset(
      [
        { name: 'g', type: 'categorical' },
        { name: 'v', type: 'numeric' },
      ],
      [
        ['a', 1],
        ['b', 2],
        ['a', 3],
      ],
    )
    const plot = resolvePlot(cats, config({ kind: 'bar', xColumn: 'c1', yColumn: 'c2' }))
    expect(plot.xMode).toBe('categorical')
    expect(plot.series[0]?.points.map((p) => p.label)).toEqual(['a', 'b', 'a'])
    const world = plotWorld(plot, config({ kind: 'bar' }))
    expect(world !== null && world.yMin <= 0).toBe(true)
  })

  it('sorts line points by X only when asked, never mutating rows', () => {
    const before = JSON.stringify(xy.rows)
    const sorted = resolvePlot(xy, config({ kind: 'line', sort: 'x-ascending' }))
    expect(sorted.series[0]?.points.map((p) => p.x)).toEqual([1, 2, 4])
    expect(JSON.stringify(xy.rows)).toBe(before)
    expect(sorted.notes.some((note) => note.includes('sorted by ascending X'))).toBe(true)
  })

  it('reports empty series instead of crashing', () => {
    const empty = dataset([{ name: 'v', type: 'numeric' }], [[null], [null]])
    const plot = resolvePlot(empty, config({ xColumn: null, yColumn: 'c1' }))
    expect(plot.totalPoints).toBe(0)
    expect(plotWorld(plot, config())).toBe(null)
    expect(plot.notes.some((note) => note.includes('No plottable points'))).toBe(true)
  })

  it('honours explicit axis bounds over auto-fit', () => {
    const plot = resolvePlot(xy, config())
    const auto = plotWorld(plot, config())
    const fixed = plotWorld(plot, config({ xMin: 0, xMax: 100, yMin: -5, yMax: 5 }))
    expect(auto).not.toBe(null)
    expect(fixed).toMatchObject({ xMin: 0, xMax: 100, yMin: -5, yMax: 5 })
  })

  it('records finite skipped X values as line-break gaps', () => {
    const gapped = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
      ],
      [
        [0, 0],
        [1, null],
        [2, 4],
      ],
    )
    const plot = resolvePlot(gapped, config({ kind: 'line' }))
    expect(plot.series[0]?.gapXs).toEqual([1])
    expect(plot.totalSkipped).toBe(1)
  })

  it('excludes non-positive values on log scales with a count', () => {
    const mixed = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
      ],
      [
        [0.1, 1],
        [1, 10],
        [0, 5],
        [10, -2],
      ],
    )
    const plot = resolvePlot(mixed, config({ kind: 'scatter', xScale: 'log', yScale: 'log' }))
    expect(plot.totalPoints).toBe(2)
    expect(plot.notes.some((note) => note.includes('non-positive values excluded'))).toBe(true)
    const world = plotWorld(plot, config({ kind: 'scatter', xScale: 'log', yScale: 'log' }))
    expect(world).not.toBe(null)
    if (world !== null) {
      // 5% X padding and 8% Y padding in log space.
      expect(world.xMin).toBeCloseTo(-1.05, 9)
      expect(world.xMax).toBeCloseTo(0.05, 9)
      expect(world.yMin).toBeCloseTo(-0.08, 9)
      expect(world.yMax).toBeCloseTo(1.08, 9)
    }
  })

  it('reports all-excluded log plots instead of an empty world', () => {
    const nonPositive = dataset([{ name: 'v', type: 'numeric' }], [[-1], [0]])
    const plot = resolvePlot(nonPositive, config({ kind: 'scatter', xColumn: null, yColumn: 'c1', yScale: 'log' }))
    expect(plot.totalPoints).toBe(0)
    expect(plotWorld(plot, config({ yScale: 'log' }))).toBe(null)
  })

  it('generates power-of-ten ticks with readable labels', () => {
    expect(logTicks(0, 2)).toEqual([
      { value: 0, label: '1' },
      { value: 1, label: '10' },
      { value: 2, label: '100' },
    ])
    expect(logTicks(-1, 0)[0]).toEqual({ value: -1, label: '0.1' })
    expect(logTicks(0, 10)).toHaveLength(11)
  })

  it('assigns distinct shapes per series index', () => {
    expect([seriesShape(0), seriesShape(1), seriesShape(2), seriesShape(3), seriesShape(4)]).toEqual(['circle', 'square', 'triangle', 'diamond', 'circle'])
  })

  it('attaches symmetric column uncertainties and counts the unusable', () => {
    const data = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
        { name: 'e', type: 'numeric' },
      ],
      [
        [0, 1, 0.5],
        [1, 2, -1],
        [2, 3, null],
      ],
    )
    const plot = resolvePlot(data, config({ yError: { mode: 'column', column: 'c3' } }))
    expect(plot.series[0]?.points[0]?.yErr).toEqual([0.5, 0.5])
    expect(plot.series[0]?.points[1]?.yErr).toBe(undefined)
    expect(plot.series[0]?.points[2]?.yErr).toBe(undefined)
    expect(plot.notes.some((note) => note.includes('2 points draw without error bars'))).toBe(true)
  })

  it('supports asymmetric and fixed uncertainties, refusing bad fixed values', () => {
    const data = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
        { name: 'up', type: 'numeric' },
        { name: 'lo', type: 'numeric' },
      ],
      [[0, 1, 0.4, 0.2]],
    )
    const asym = resolvePlot(data, config({ yError: { mode: 'asymmetric', upper: 'c3', lower: 'c4' } }))
    expect(asym.series[0]?.points[0]?.yErr).toEqual([0.2, 0.4])
    const fixed = resolvePlot(data, config({ yError: { mode: 'fixed', value: 0.1 } }))
    expect(fixed.series[0]?.points[0]?.yErr).toEqual([0.1, 0.1])
    const bad = resolvePlot(data, config({ yError: { mode: 'fixed', value: -3 } }))
    expect(bad.series[0]?.points[0]?.yErr).toBe(undefined)
    expect(bad.notes.some((note) => note.includes('Fixed uncertainty'))).toBe(true)
  })

  it('attaches X uncertainties only when explicitly configured', () => {
    const data = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
        { name: 'ex', type: 'numeric' },
      ],
      [[0, 1, 0.25]],
    )
    const plain = resolvePlot(data, config())
    expect(plain.series[0]?.points[0]?.xErr).toBe(undefined)
    const withX = resolvePlot(data, config({ xError: { mode: 'column', column: 'c3' } }))
    expect(withX.series[0]?.points[0]?.xErr).toEqual([0.25, 0.25])
  })

  it('maps uncertainty columns row-by-row within each split series', () => {
    const data = dataset(
      [
        { name: 'x', type: 'numeric' },
        { name: 'y', type: 'numeric' },
        { name: 'e', type: 'numeric' },
        { name: 'g', type: 'categorical' },
      ],
      [
        [0, 1, 0.5, 'a'],
        [1, 2, 0.25, 'b'],
        [2, 4, 0.75, 'a'],
      ],
    )
    const plot = resolvePlot(data, config({ yError: { mode: 'column', column: 'c3' }, seriesColumn: 'c4' }))
    expect(plot.series.map((s) => s.label)).toEqual(['a', 'b'])
    expect(plot.series[0]?.points.map((p) => p.yErr)).toEqual([
      [0.5, 0.5],
      [0.75, 0.75],
    ])
    expect(plot.series[1]?.points.map((p) => p.yErr)).toEqual([[0.25, 0.25]])
  })
})

describe('histogram binning', () => {
  it('applies documented Sturges bins', () => {
    expect(sturgesBins(0)).toBe(1)
    expect(sturgesBins(8)).toBe(4)
    expect(sturgesBins(1000000)).toBeLessThanOrEqual(50)
  })

  it('bins values with counts that sum to n', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9]
    const bins = histogramBins(values)
    expect(bins).toHaveLength(4)
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(8)
    expect(bins[0]).toMatchObject({ x0: 2 })
  })

  it('resolves histogram through the mapping with a bin note', () => {
    const data = dataset([{ name: 'v', type: 'numeric' }], [[2], [4], [4], [null]])
    const plot = resolvePlot(data, config({ kind: 'histogram', xColumn: null, yColumn: 'c1' }))
    expect(plot.totalPoints).toBe(3)
    expect(plot.totalSkipped).toBe(1)
    expect(plot.notes.some((note) => note.includes('Sturges'))).toBe(true)
  })
})
