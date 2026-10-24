import type { Dataset } from './dataset.ts'
import type { PlotConfig } from './plots.ts'

/**
 * Default mapping for a freshly opened dataset, shared by the workshop
 * and project restore. Kept separate from the plotting algorithms so the
 * synchronous startup path can build an analysis default without pulling
 * Data Lab rendering code into the initial entry.
 */
export function defaultPlotConfig(dataset: Dataset): PlotConfig {
  const numeric = dataset.columns.filter((col) => col.type === 'numeric')
  const xCol = numeric[0]
  const yCol = numeric[1] ?? numeric[0]
  const withUnit = (col: { name: string; unit?: string } | undefined): string => (col === undefined ? '' : col.unit === undefined ? col.name : `${col.name} (${col.unit})`)
  return {
    kind: 'scatter',
    xColumn: xCol?.id ?? null,
    yColumn: yCol?.id ?? null,
    seriesColumn: null,
    title: dataset.name,
    xLabel: withUnit(xCol),
    yLabel: withUnit(yCol),
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
