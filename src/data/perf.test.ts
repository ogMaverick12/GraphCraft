import { describe, expect, it } from 'vitest'
import { buildDataFigureScene } from './figure.ts'
import { extractFitPairs, fitModel } from './fits.ts'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'

/**
 * Realistic-size performance: 10,000 rows (the import cap) must parse
 * through mapping, fitting, figure building, and serialization without
 * truncation or timeouts. Budgets are generous (correctness first);
 * failures here mean algorithmic blowup, not a slow machine.
 */

function bigDataset(n: number): Dataset {
  return {
    id: 'ds-perf',
    name: 'Perf',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'y', type: 'numeric' },
    ],
    rows: Array.from({ length: n }, (_, i) => [i, 2 * i + 1]),
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(): PlotConfig {
  return {
    kind: 'scatter',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'Perf',
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
  }
}

describe('realistic input sizes', () => {
  it('maps, fits, and figures 10,000 rows without truncation', () => {
    const started = Date.now()
    const ds = bigDataset(10000)
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    expect(plot.totalPoints).toBe(10000)
    expect(plot.totalSkipped).toBe(0)

    const { xs, ys } = extractFitPairs(ds.rows, 0, 1)
    const outcome = fitModel({ model: 'line', degree: 1, xs, ys })
    expect(outcome.status).toBe('value')
    if (outcome.status === 'value') {
      expect(outcome.fit.coefficients[1]).toBeCloseTo(2, 9)
    }

    const world = plotWorld(plot, cfg)
    const built = buildDataFigureScene(plot, cfg, world, null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status === 'value') {
      expect(built.scene.points).toHaveLength(10000)
    }
    // Generous wall budget: guards against blowup, not machine speed.
    expect(Date.now() - started).toBeLessThan(20000)
  }, 30000)

  it('keeps the serialized bundle far below the v6 cap at 10k rows', () => {
    const ds = bigDataset(10000)
    const text = JSON.stringify(ds.rows)
    expect(text.length).toBeLessThan(2_097_152)
  })

  it('bounds heap growth of the 10k pipeline below a generous ceiling', () => {
    const before = process.memoryUsage().heapUsed
    const ds = bigDataset(10000)
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const world = plotWorld(plot, cfg)
    const built = buildDataFigureScene(plot, cfg, world, null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (global.gc !== undefined) {
      global.gc()
    }
    const delta = process.memoryUsage().heapUsed - before
    // Generous ceiling (node harness, not a device budget): guards
    // against accidental retention (caches, listeners, copies), not speed.
    expect(delta).toBeLessThan(150 * 1024 * 1024)
  })
})
