import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { useDialogFocus } from '../components/ui/useDialogFocus.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import {
  downloadBlob,
  exportPngBlob,
  renderExportSvg,
  resolveExportScale,
  sanitizeFigureFilename,
  type ExportBackground,
} from '../export/index.ts'
import { datasetToCsvTable, fitSummaryToCsvTable, plottedPointsToCsvTable, residualsToCsvTable, tablesToCsv } from './csvExport.ts'
import type { Dataset } from './dataset.ts'
import { buildDataFigureScene, type DataFigureSizeKey } from './figure.ts'
import { evaluateModelFit, extractFitPairs, fitModel } from './fits.ts'
import type { CsvTableChoice, ExportFormatChoice, FigureSizeChoice, PersistedExportSettings, PersistedFitSelection } from './persistence.ts'
import type { PlotConfig, ResolvedPlot } from './plots.ts'

interface DataExportDialogProps {
  dataset: Dataset
  plot: ResolvedPlot
  config: PlotConfig
  world: WorldRect | null
  fitCurve: Array<{ x: number; y: number }> | null
  fitLabel: string | null
  fitSelection: PersistedFitSelection | null
  initialSettings: PersistedExportSettings
  onSettingsChange: (settings: PersistedExportSettings) => void
  onClose: () => void
}

/**
 * Data Lab export dialog: SVG vectors and scaled PNGs through the shared
 * export scene, plus formula-safe CSV for explicitly selected tables.
 * Everything is built from CURRENT props at click time — never a stale
 * snapshot. PDF is refused with criteria (no real implementation on
 * hand); the dialog offers only formats that genuinely work.
 */
export function DataExportDialog({
  dataset,
  plot,
  config,
  world,
  fitCurve,
  fitLabel,
  fitSelection,
  initialSettings,
  onSettingsChange,
  onClose,
}: DataExportDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormatChoice>(initialSettings.format)
  const [requestedScale, setRequestedScale] = useState(initialSettings.scale)
  const [background, setBackground] = useState<ExportBackground>(initialSettings.background)
  const [caption, setCaption] = useState(initialSettings.caption)
  const [csvTable, setCsvTable] = useState<CsvTableChoice>(initialSettings.csvTable)
  const [figureSize, setFigureSize] = useState<FigureSizeChoice>(initialSettings.figureSize ?? 'M')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { dialogRef, onKeyDown } = useDialogFocus()

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function currentSettings(): PersistedExportSettings {
    return { format, scale: requestedScale, background, caption, csvTable, figureSize }
  }

  const figure = useMemo(() => {
    if (format === 'csv' || world === null) {
      return null
    }
    return buildDataFigureScene(
      plot,
      config,
      world,
      fitCurve !== null ? { points: fitCurve, label: fitLabel ?? 'Fit' } : null,
      { caption },
      background,
      figureSize as DataFigureSizeKey,
    )
  }, [format, plot, config, world, fitCurve, fitLabel, caption, background, figureSize])

  const figureError = figure !== null && figure.status === 'error' ? figure.message : null
  const scene = figure !== null && figure.status === 'value' ? figure.scene : null
  const { scale, capped } = useMemo(() => {
    if (scene === null) {
      return { scale: 1, capped: false }
    }
    return resolveExportScale(format === 'png' ? requestedScale : 1, scene.width, scene.height + scene.legendHeight + scene.captionHeight)
  }, [scene, format, requestedScale])
  const pixelWidth = scene === null ? 0 : Math.round(scene.width * scale)
  const pixelHeight = scene === null ? 0 : Math.round((scene.height + scene.legendHeight + scene.captionHeight) * scale)
  const filename = sanitizeFigureFilename(config.title === '' ? dataset.name : config.title, format === 'csv' ? 'csv' : format)

  function buildCsv(): { text: string } | { error: string } {
    if (csvTable === 'dataset') {
      return { text: tablesToCsv(datasetToCsvTable(dataset)) }
    }
    if (csvTable === 'plotted-points') {
      const visible = plot.series.filter((s) => !config.hiddenSeries.includes(s.key))
      return { text: tablesToCsv(plottedPointsToCsvTable(visible.map((s) => ({ label: s.label, points: s.points })))) }
    }
    // Residuals and summaries recompute from the CURRENT fit selection —
    // never a stored copy that could have gone stale after data edits.
    if (fitSelection === null || fitSelection.model === 'none' || fitSelection.xId === null || fitSelection.yId === null) {
      return { error: 'No fitted model is selected: residuals need a current fit.' }
    }
    const xIndex = dataset.columns.findIndex((col) => col.id === fitSelection.xId)
    const yIndex = dataset.columns.findIndex((col) => col.id === fitSelection.yId)
    if (xIndex < 0 || yIndex < 0) {
      return { error: 'The fitted columns are gone: re-select Fit X/Y first.' }
    }
    const { xs, ys } = extractFitPairs(dataset.rows, xIndex, yIndex)
    const outcome = fitModel({ model: fitSelection.model, degree: fitSelection.degree, xs, ys })
    if (outcome.status !== 'value') {
      return { error: `Fit failed (${outcome.kind}): ${outcome.message}` }
    }
    if (csvTable === 'residuals') {
      const rows = xs.map((x, i) => {
        const observed = ys[i] ?? 0
        const fitted = evaluateModelFit(outcome.fit.model, outcome.fit.coefficients, x)
        return { x, observed, fitted, residual: observed - fitted }
      })
      return { text: tablesToCsv(residualsToCsvTable(rows)) }
    }
    const fit = outcome.fit
    return {
      text: tablesToCsv(
        fitSummaryToCsvTable({
          equation: fitLabel ?? fit.model,
          model: fit.model,
          n: fit.n,
          dof: fit.dof,
          skipped: outcome.fit.skipped,
          rSquared: fit.rSquared,
          residualStd: fit.residualStd,
          rmse: fit.rmse,
          mae: fit.mae,
          minResidual: fit.minResidual,
          maxResidual: fit.maxResidual,
          methodNote: fit.methodNote,
          warnings: fit.warnings,
        }),
      ),
    }
  }

  async function onDownload(): Promise<void> {
    setError(null)
    onSettingsChange(currentSettings())
    if (format === 'csv') {
      const built = buildCsv()
      if ('error' in built) {
        setError(built.error)
        return
      }
      if (!downloadBlob(filename, new Blob([built.text], { type: 'text/csv' }))) {
        setError('Download is unavailable in this browser.')
        return
      }
      onClose()
      return
    }
    if (scene === null) {
      setError(figureError ?? 'Nothing to export.')
      return
    }
    if (format === 'svg') {
      if (!downloadBlob(filename, new Blob([renderExportSvg(scene, 1)], { type: 'image/svg+xml' }))) {
        setError('Download is unavailable in this browser.')
        return
      }
      onClose()
      return
    }
    setBusy(true)
    try {
      const blob = await exportPngBlob(scene, scale)
      if (blob === null) {
        setError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      if (!downloadBlob(filename, blob)) {
        setError('Download is unavailable in this browser.')
        return
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={dialogRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Export data figure" className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-elevated p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">Export data figure</h2>
        <p className="mt-1 text-xs text-muted">Built from the current view — change the plot or fit first, then export again.</p>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Format</legend>
          <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-ink">
            {(['svg', 'png', 'csv'] as const).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="data-export-format" checked={format === option} onChange={() => setFormat(option)} className="h-4 w-4 accent-accent" />
                {option === 'svg' ? 'SVG (vector)' : option === 'png' ? 'PNG (raster)' : 'CSV (table)'}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">PDF is not offered: no real, licence-reviewed implementation is on hand, and a renamed image would be dishonest.</p>
        </fieldset>

        {format === 'csv' ? (
          <label className="mt-3 block text-sm text-ink">
            Table
            <select
              aria-label="CSV table"
              value={csvTable}
              onChange={(event) => setCsvTable(event.target.value as CsvTableChoice)}
              className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="dataset">Dataset (all rows)</option>
              <option value="plotted-points">Plotted points (visible series)</option>
              <option value="residuals">Residuals (current fit)</option>
              <option value="fit-summary">Fit summary (current fit)</option>
            </select>
          </label>
        ) : (
          <>
            {format === 'png' && (
              <label className="mt-3 block text-sm text-ink">
                Resolution
                <select
                  aria-label="PNG resolution"
                  value={requestedScale}
                  onChange={(event) => setRequestedScale(Number(event.target.value))}
                  className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[1, 2, 3].map((option) => (
                    <option key={option} value={option}>
                      {option}×
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mt-3 block text-sm text-ink">
              Figure size
              <select
                aria-label="Figure size"
                value={figureSize}
                onChange={(event) => setFigureSize(event.target.value as FigureSizeChoice)}
                className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="S">Small (480×320)</option>
                <option value="M">Standard (720×440)</option>
                <option value="L">Wide (960×520)</option>
              </select>
            </label>
            <label className="mt-3 block text-sm text-ink">
              Background
              <select
                aria-label="Export background"
                value={background}
                onChange={(event) => setBackground(event.target.value as ExportBackground)}
                className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="white">White</option>
                <option value="transparent">Transparent</option>
              </select>
            </label>
            <label className="mt-3 block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">Caption (optional)</span>
              <input
                type="text"
                aria-label="Figure caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Method, sample size, caveats…"
                maxLength={560}
                className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </>
        )}

        <p className="mt-3 text-xs text-muted" data-testid="export-summary">
          {format === 'csv'
            ? 'CSV with quoting and formula-injection guards; missing cells stay empty.'
            : scene === null
              ? (figureError ?? 'Nothing to export.')
              : format === 'svg'
                ? `Vector figure, ${scene.width}×${scene.height + scene.legendHeight + scene.captionHeight} units.`
                : `${pixelWidth}×${pixelHeight} px at ${scale}×.`}
          {format !== 'csv' && capped ? ' Capped to the output limit.' : ''} Exports use the light figure theme.
        </p>

        {figureError !== null && format !== 'csv' && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {figureError}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} ref={closeRef}>
            Cancel
          </Button>
          <Button onClick={() => void onDownload()} disabled={busy || (format !== 'csv' && scene === null)} className="border-accent bg-accent font-semibold text-white hover:bg-accent-strong dark:text-white">
            {busy ? 'Rendering…' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  )
}
