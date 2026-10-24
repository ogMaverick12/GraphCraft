import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { DataPlot } from './DataPlot.tsx'
import { SERIES_GLYPHS } from './plots.ts'
import { curveStyle } from '../graph/palette.ts'
import { FitPanel } from './FitPanel.tsx'
import { DataExportDialog } from './DataExport.tsx'
import { plotWorld, resolvePlot, type ErrorSource, type PlotConfig, type PlotKind, type PlotSort, type ResolvedPlot, type XErrorSource } from './plots.ts'
import { defaultPlotConfig } from './plot-defaults.ts'
import type { Dataset } from './dataset.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import type { DatasetAnalysisSnapshot, PersistedExportSettings, PersistedFitResultMeta, PersistedFitSelection } from './persistence.ts'

interface PlotWorkshopProps {
  dataset: Dataset
  initialAnalysis?: DatasetAnalysisSnapshot
  onAnalysisChange?: (analysis: DatasetAnalysisSnapshot) => void
}

function plotResolveKey(config: PlotConfig): string {
  return JSON.stringify([
    config.kind,
    config.xColumn,
    config.yColumn,
    config.seriesColumn,
    config.sort,
    config.xScale,
    config.yScale,
    config.yError,
    config.xError,
  ])
}

function plotWorldKey(config: PlotConfig): string {
  return JSON.stringify([config.kind, config.xScale, config.yScale, config.xMin, config.xMax, config.yMin, config.yMax])
}

function numericInput(value: number | null, onChange: (value: number | null) => void, label: string): React.JSX.Element {
  return (
    <label className="block text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const text = event.target.value.trim()
          if (text === '') {
            onChange(null)
            return
          }
          const parsed = Number(text)
          onChange(Number.isFinite(parsed) ? parsed : null)
        }}
        placeholder="auto"
        className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}

/**
 * Plot workshop (Stage 4 DATA-02, extended with fitting + export): column
 * mapping, plot-type choice, axis bounds, grid/sort controls, series
 * toggles, the figure, and a tabular alternative for the plotted points.
 * Config state lives here and reports upward for project persistence;
 * the dataset is never mutated. Restored analyses initialize every
 * control, so a reopened project shows the exact saved setup.
 */
export function PlotWorkshop({ dataset, initialAnalysis, onAnalysisChange }: PlotWorkshopProps): React.JSX.Element {
  const restoredPlot = initialAnalysis?.plot
  const [config, setConfig] = useState<PlotConfig>(() => restoredPlot ?? defaultPlotConfig(dataset))
  const [viewOverride, setViewOverride] = useState<WorldRect | null>(null)
  const [fitCurve, setFitCurve] = useState<Array<{ x: number; y: number }> | null>(null)
  const [fitLabel, setFitLabel] = useState<string | null>(null)
  const [fitSelection, setFitSelection] = useState<PersistedFitSelection | null>(null)
  const [fitResult, setFitResult] = useState<PersistedFitResultMeta | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportSettings, setExportSettings] = useState<PersistedExportSettings>(
    () => initialAnalysis?.export ?? { format: 'svg', scale: 1, background: 'white', caption: '', csvTable: 'dataset', figureSize: 'M' },
  )
  const [yErrorMode, setYErrorMode] = useState<'none' | 'column' | 'asymmetric' | 'fixed'>(restoredPlot?.yError.mode === 'column' || restoredPlot?.yError.mode === 'asymmetric' || restoredPlot?.yError.mode === 'fixed' ? restoredPlot.yError.mode : 'none')
  const [yErrorColumn, setYErrorColumn] = useState(restoredPlot?.yError.mode === 'column' ? (restoredPlot.yError.column ?? '') : '')
  const [yErrorUpper, setYErrorUpper] = useState(restoredPlot?.yError.mode === 'asymmetric' ? (restoredPlot.yError.upper ?? '') : '')
  const [yErrorLower, setYErrorLower] = useState(restoredPlot?.yError.mode === 'asymmetric' ? (restoredPlot.yError.lower ?? '') : '')
  const [yErrorFixed, setYErrorFixed] = useState(restoredPlot?.yError.mode === 'fixed' && typeof restoredPlot.yError.value === 'number' ? String(restoredPlot.yError.value) : '')
  const [xErrorMode, setXErrorMode] = useState<'none' | 'column' | 'fixed'>(restoredPlot?.xError.mode === 'column' || restoredPlot?.xError.mode === 'fixed' ? restoredPlot.xError.mode : 'none')
  const [xErrorColumn, setXErrorColumn] = useState(restoredPlot?.xError.mode === 'column' ? (restoredPlot.xError.column ?? '') : '')
  const [xErrorFixed, setXErrorFixed] = useState(restoredPlot?.xError.mode === 'fixed' && typeof restoredPlot.xError.value === 'number' ? String(restoredPlot.xError.value) : '')

  useEffect(() => {
    onAnalysisChange?.({ plot: config, fit: fitSelection ?? initialAnalysis?.fit ?? { model: 'line', degree: 2, xId: null, yId: null, weightMode: 'none', weightColumn: '', weightFixed: '1' }, fitResult, export: exportSettings })
    // Reports the combined analysis; the callback is stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, fitSelection, fitResult, exportSettings])

  function patch(patch: Partial<PlotConfig>): void {
    setConfig((current) => ({ ...current, ...patch }))
    setViewOverride(null)
  }

  function toggleSeries(key: string): void {
    setConfig((current) => ({
      ...current,
      hiddenSeries: current.hiddenSeries.includes(key) ? current.hiddenSeries.filter((k) => k !== key) : [...current.hiddenSeries, key],
    }))
  }

  // Resolve and frame only when an input that changes the data mapping,
  // scales, uncertainty, or explicit bounds changes. Presentation-only
  // Inspector state (title, labels, grid, ticks, visibility) must not rebuild
  // the same series/world objects that feed DataPlot's line-run memo.
  const plotCache = useRef<{ dataset: Dataset; key: string; plot: ResolvedPlot } | null>(null)
  const worldCache = useRef<{ plot: ResolvedPlot; key: string; world: WorldRect | null } | null>(null)
  const plot = useMemo(() => {
    const key = plotResolveKey(config)
    const cached = plotCache.current
    if (cached !== null && cached.dataset === dataset && cached.key === key) {
      return cached.plot
    }
    const next = resolvePlot(dataset, config)
    plotCache.current = { dataset, key, plot: next }
    return next
  }, [dataset, config])
  const autoWorld = useMemo(() => {
    const key = plotWorldKey(config)
    const cached = worldCache.current
    if (cached !== null && cached.plot === plot && cached.key === key) {
      return cached.world
    }
    const next = plotWorld(plot, config)
    worldCache.current = { plot, key, world: next }
    return next
  }, [plot, config])
  const world = viewOverride ?? autoWorld

  function zoom(factor: number): void {
    const base = world
    if (base === null) {
      return
    }
    const cx = (base.xMin + base.xMax) / 2
    const cy = (base.yMin + base.yMax) / 2
    setViewOverride({
      xMin: cx - (cx - base.xMin) * factor,
      xMax: cx + (base.xMax - cx) * factor,
      yMin: cy - (cy - base.yMin) * factor,
      yMax: cy + (base.yMax - cy) * factor,
    })
  }

  const visibleSeries = plot.series.filter((s) => !config.hiddenSeries.includes(s.key))
  const tableRows = visibleSeries.flatMap((s) => s.points.map((p) => ({ series: s.label, x: p.label !== '' ? p.label : String(p.x), y: String(p.y) })))
  const numericColumns = dataset.columns.filter((col) => col.type === 'numeric')

  function firstNumericId(): string {
    return numericColumns[0]?.id ?? ''
  }

  function buildYError(mode: 'none' | 'column' | 'asymmetric' | 'fixed'): ErrorSource {
    if (mode === 'column') {
      return { mode: 'column', column: yErrorColumn === '' ? firstNumericId() : yErrorColumn }
    }
    if (mode === 'asymmetric') {
      return { mode: 'asymmetric', upper: yErrorUpper === '' ? firstNumericId() : yErrorUpper, lower: yErrorLower === '' ? firstNumericId() : yErrorLower }
    }
    if (mode === 'fixed') {
      return { mode: 'fixed', value: Number(yErrorFixed) }
    }
    return { mode: 'none' }
  }

  function buildXError(mode: 'none' | 'column' | 'fixed'): XErrorSource {
    if (mode === 'column') {
      return { mode: 'column', column: xErrorColumn === '' ? firstNumericId() : xErrorColumn }
    }
    if (mode === 'fixed') {
      return { mode: 'fixed', value: Number(xErrorFixed) }
    }
    return { mode: 'none' }
  }

  function errorColumnSelect(label: string, value: string, onChange: (id: string) => void): React.JSX.Element {
    return (
      <label className="block text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {numericColumns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  function fixedValueInput(label: string, value: string, onChange: (text: string) => void): React.JSX.Element {
    return (
      <label className="block text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="≥ 0"
          className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
    )
  }

  function columnSelect(label: string, value: string | null, allowNone: boolean, numericOnly: boolean, onChange: (id: string | null) => void): React.JSX.Element {
    return (
      <label className="block text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <select
          aria-label={label}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allowNone && <option value="">(none)</option>}
          {dataset.columns
            .filter((col) => !numericOnly || col.type === 'numeric')
            .map((col) => (
              <option key={col.id} value={col.id}>
                {col.name} ({col.type})
              </option>
            ))}
        </select>
      </label>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Plot type</span>
          <select
            aria-label="Plot type"
            value={config.kind}
            onChange={(event) => patch({ kind: event.target.value as PlotKind })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="scatter">Scatter</option>
            <option value="line">Line</option>
            <option value="bar">Bar (categorical X)</option>
            <option value="histogram">Histogram (bins Y)</option>
          </select>
        </label>
        {columnSelect('X column', config.xColumn, true, false, (id) => patch({ xColumn: id }))}
        {columnSelect('Y column', config.yColumn, true, true, (id) => patch({ yColumn: id }))}
        {columnSelect('Series split', config.seriesColumn, true, false, (id) => patch({ seriesColumn: id }))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Title</span>
          <input
            type="text"
            aria-label="Plot title"
            value={config.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">X label</span>
          <input
            type="text"
            aria-label="X axis label"
            value={config.xLabel}
            onChange={(event) => patch({ xLabel: event.target.value })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Y label</span>
          <input
            type="text"
            aria-label="Y axis label"
            value={config.yLabel}
            onChange={(event) => patch({ yLabel: event.target.value })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Sort</span>
          <select
            aria-label="Point order"
            value={config.sort}
            onChange={(event) => patch({ sort: event.target.value as PlotSort })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="row-order">Row order</option>
            <option value="x-ascending">X ascending</option>
          </select>
        </label>
        {numericInput(config.xMin, (xMin) => patch({ xMin }), 'X min')}
        {numericInput(config.xMax, (xMax) => patch({ xMax }), 'X max')}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {numericInput(config.yMin, (yMin) => patch({ yMin }), 'Y min')}
        {numericInput(config.yMax, (yMax) => patch({ yMax }), 'Y max')}
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">X scale</span>
          <select
            aria-label="X axis scale"
            value={config.xScale}
            onChange={(event) => patch({ xScale: event.target.value as 'linear' | 'log' })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="linear">Linear</option>
            <option value="log">Log (scatter/line, positive values)</option>
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Y scale</span>
          <select
            aria-label="Y axis scale"
            value={config.yScale}
            onChange={(event) => patch({ yScale: event.target.value as 'linear' | 'log' })}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="linear">Linear</option>
            <option value="log">Log (scatter/line, positive values)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {numericInput(config.tickX, (tickX) => patch({ tickX: tickX === null ? null : Math.min(12, Math.max(2, Math.round(tickX))) }), 'X ticks (blank auto)')}
        {numericInput(config.tickY, (tickY) => patch({ tickY: tickY === null ? null : Math.min(12, Math.max(2, Math.round(tickY))) }), 'Y ticks (blank auto)')}
        <label className="flex items-end gap-2 pb-1 text-xs text-muted">
          <input type="checkbox" aria-label="Show grid" checked={config.showGrid} onChange={(event) => patch({ showGrid: event.target.checked })} className="h-4 w-4 accent-accent" />
          Show grid
        </label>
        <div className="flex items-end pb-0.5">
          <Button onClick={() => setConfig(defaultPlotConfig(dataset))} title="Restore default mapping and view" variant="ghost" className="px-2 py-0.5 text-xs">
            Reset plot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Y errors</span>
          <select
            aria-label="Y error bars"
            value={yErrorMode}
            onChange={(event) => {
              const mode = event.target.value as 'none' | 'column' | 'asymmetric' | 'fixed'
              setYErrorMode(mode)
              patch({ yError: buildYError(mode) })
            }}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="none">None</option>
            <option value="column">Column (±)</option>
            <option value="asymmetric">Asymmetric (+/− columns)</option>
            <option value="fixed">Fixed value</option>
          </select>
        </label>
        {yErrorMode === 'column' && errorColumnSelect('Y error column', yErrorColumn, (id) => {
          setYErrorColumn(id)
          patch({ yError: { mode: 'column', column: id } })
        })}
        {yErrorMode === 'asymmetric' && errorColumnSelect('Upper (+) column', yErrorUpper, (id) => {
          setYErrorUpper(id)
          patch({ yError: { mode: 'asymmetric', upper: id, lower: yErrorLower } })
        })}
        {yErrorMode === 'asymmetric' && errorColumnSelect('Lower (−) column', yErrorLower, (id) => {
          setYErrorLower(id)
          patch({ yError: { mode: 'asymmetric', upper: yErrorUpper, lower: id } })
        })}
        {yErrorMode === 'fixed' && fixedValueInput('Fixed ± value', yErrorFixed, (text) => {
          setYErrorFixed(text)
          patch({ yError: { mode: 'fixed', value: Number(text) } })
        })}
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">X errors</span>
          <select
            aria-label="X error bars"
            value={xErrorMode}
            onChange={(event) => {
              const mode = event.target.value as 'none' | 'column' | 'fixed'
              setXErrorMode(mode)
              patch({ xError: buildXError(mode) })
            }}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="none">None</option>
            <option value="column">Column (±)</option>
            <option value="fixed">Fixed value</option>
          </select>
        </label>
        {xErrorMode === 'column' && errorColumnSelect('X error column', xErrorColumn, (id) => {
          setXErrorColumn(id)
          patch({ xError: { mode: 'column', column: id } })
        })}
        {xErrorMode === 'fixed' && fixedValueInput('Fixed ± value', xErrorFixed, (text) => {
          setXErrorFixed(text)
          patch({ xError: { mode: 'fixed', value: Number(text) } })
        })}
      </div>

      {plot.series.length > 1 && (       <div className="flex flex-wrap gap-1.5" role="group" aria-label="Series visibility">
          {plot.series.map((s) => {
            const hidden = config.hiddenSeries.includes(s.key)
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!hidden}
                aria-label={`Toggle ${s.label}`}
                title={hidden ? `Show ${s.label}` : `Hide ${s.label}`}
                onClick={() => toggleSeries(s.key)}
                className={`gc-transition rounded-md border px-2 py-0.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  hidden ? 'border-line bg-surface text-muted line-through' : 'border-line bg-elevated text-ink'
                }`}
              >
                <span aria-hidden="true" style={{ color: curveStyle(s.colorIndex).color }}>
                  {SERIES_GLYPHS[s.colorIndex % SERIES_GLYPHS.length]}{' '}
                </span>
                {s.label} ({s.points.length})
              </button>
            )
          })}
        </div>
      )}

      <DataPlot
        plot={plot}
        config={config}
        world={world}
        fitLine={config.kind === 'bar' || config.kind === 'histogram' ? null : fitCurve}
        onZoomIn={() => zoom(1 / 1.2)}
        onZoomOut={() => zoom(1.2)}
        onResetView={() => setViewOverride(plotWorld(plot, config))}
      />

      <FitPanel
        dataset={dataset}
        plotConfig={config}
        initialFit={initialAnalysis?.fit}
        onFitCurve={(points, label) => {
          setFitCurve(points)
          setFitLabel(label)
        }}
        onFitState={(selection, result) => {
          setFitSelection(selection)
          setFitResult(result)
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setExportOpen(true)} title="Export this figure (SVG/PNG) or its tables (CSV)" variant="ghost" className="px-2 py-0.5 text-xs">
          Export figure / tables
        </Button>
        <span className="text-xs text-muted">SVG vectors, scaled PNG, or formula-safe CSV — built from the current view.</span>
      </div>

      {exportOpen && (
        <DataExportDialog
          dataset={dataset}
          plot={plot}
          config={config}
          world={world}
          fitCurve={config.kind === 'bar' || config.kind === 'histogram' ? null : fitCurve}
          fitLabel={fitLabel}
          fitSelection={fitSelection}
          initialSettings={exportSettings}
          onSettingsChange={setExportSettings}
          onClose={() => setExportOpen(false)}
        />
      )}

      <p role="status" className="text-xs text-muted" data-testid="plot-summary">
        {plot.totalPoints} points{plot.totalSkipped > 0 ? `, ${plot.totalSkipped} rows skipped` : ''}.
      </p>
      {plot.notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {plot.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {tableRows.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-ink">Data table ({tableRows.length} rows)</summary>
          <div className="mt-1 max-h-48 overflow-auto rounded-md border border-line">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line bg-surface px-2 py-1 text-left text-muted">Series</th>
                  <th scope="col" className="border-b border-line bg-surface px-2 py-1 text-left text-muted">X</th>
                  <th scope="col" className="border-b border-line bg-surface px-2 py-1 text-left text-muted">Y</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{row.series}</td>
                    <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{row.x}</td>
                    <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{row.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableRows.length > 100 && <p className="px-2 py-1 text-xs text-muted">Showing 100 of {tableRows.length}.</p>}
          </div>
        </details>
      )}
    </div>
  )
}
