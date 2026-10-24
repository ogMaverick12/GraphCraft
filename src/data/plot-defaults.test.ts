import { describe, expect, it, vi } from 'vitest'
import type { Dataset } from './dataset.ts'
import { defaultPlotConfig } from './plot-defaults.ts'
import { defaultAnalysis } from './persistence.ts'

// Startup must build these defaults without evaluating the plotting algorithms.
// If a runtime import of plots.ts returns to this path, module loading throws.
vi.mock('./plots.ts', () => {
  throw new Error('plotting algorithms loaded on the startup path')
})

function dataset(columns: Dataset['columns']): Dataset {
  return {
    id: 'ds-defaults',
    name: 'Growth',
    columns,
    rows: [[0, 2.1, 'A']],
    provenance: { kind: 'paste', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

const growth = dataset([
  { id: 'c1', name: 'time', type: 'numeric', unit: 's' },
  { id: 'c2', name: 'height', type: 'numeric', unit: 'cm' },
  { id: 'c3', name: 'tray', type: 'categorical' },
])

describe('default plot configuration', () => {
  it('keeps the original mapping, labels, and property order', () => {
    const config = defaultPlotConfig(growth)
    expect(config).toEqual({
      kind: 'scatter',
      xColumn: 'c1',
      yColumn: 'c2',
      seriesColumn: null,
      title: 'Growth',
      xLabel: 'time (s)',
      yLabel: 'height (cm)',
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
    })
    expect(Object.keys(config)).toEqual([
      'kind',
      'xColumn',
      'yColumn',
      'seriesColumn',
      'title',
      'xLabel',
      'yLabel',
      'sort',
      'showGrid',
      'hiddenSeries',
      'xMin',
      'xMax',
      'yMin',
      'yMax',
      'xScale',
      'yScale',
      'tickX',
      'tickY',
      'yError',
      'xError',
    ])
  })

  it('falls back to the first numeric column for Y and keeps unit-free labels', () => {
    expect(defaultPlotConfig(dataset([{ id: 'c1', name: 'time', type: 'numeric' }]))).toMatchObject({
      xColumn: 'c1',
      yColumn: 'c1',
      xLabel: 'time',
      yLabel: 'time',
    })
  })

  it('leaves mappings empty when there is no numeric column', () => {
    expect(defaultPlotConfig(dataset([{ id: 'c1', name: 'tray', type: 'categorical' }]))).toMatchObject({
      xColumn: null,
      yColumn: null,
      xLabel: '',
      yLabel: '',
    })
  })

  it('returns independent mutable defaults and feeds the startup analysis path', () => {
    const first = defaultPlotConfig(growth)
    const second = defaultPlotConfig(growth)
    expect(first).not.toBe(second)
    expect(first.hiddenSeries).not.toBe(second.hiddenSeries)
    expect(first.yError).not.toBe(second.yError)
    expect(defaultAnalysis(growth).plot).toEqual(first)
  })
})
