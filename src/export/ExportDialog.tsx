import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { useDialogFocus } from '../components/ui/useDialogFocus.ts'
import { lightCurveHex } from '../graph/palette.ts'
import type { SizePx, WorldRect } from '../graph/coordinate.ts'
import type { AnalysisMarker } from '../graph/markers.ts'
import {
  buildExportScene,
  downloadBlob,
  exportPngBlob,
  renderExportSvg,
  resolveExportScale,
  sanitizeExportFilename,
  type ExportBackground,
  type ExportCurveInput,
} from './index.ts'

interface ExportDialogProps {
  title: string
  world: WorldRect
  viewportSize: SizePx
  curves: ExportCurveInput[]
  showGrid: boolean
  equalAspect: boolean
  /** Current analysis markers in world coordinates; stale results are never passed in. */
  markers?: AnalysisMarker[]
  /** Learn template annotation markers (roots/extrema only); offered behind an explicit checkbox. */
  templateMarkers?: AnalysisMarker[]
  /** Sampler warnings to disclose — never silently export a shaky figure. */
  warnings: string[]
  onClose: () => void
}

type ExportFormat = 'svg' | 'png'

/** Figure export: SVG vectors or scaled PNG, download only. No PDF yet. */
export function ExportDialog({ title, world, viewportSize, curves, markers = [], templateMarkers = [], showGrid, equalAspect, warnings, onClose }: ExportDialogProps): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('svg')
  const [requestedScale, setRequestedScale] = useState(2)
  const [background, setBackground] = useState<ExportBackground>('white')
  const [includeTemplateMarkers, setIncludeTemplateMarkers] = useState(true)
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

  const exportedMarkers = useMemo(() => (includeTemplateMarkers ? [...markers, ...templateMarkers] : markers), [includeTemplateMarkers, markers, templateMarkers])
  const scene = useMemo(
    () =>
      buildExportScene(
        world,
        { width: Math.max(1, Math.round(viewportSize.width)), height: Math.max(1, Math.round(viewportSize.height)) },
        curves,
        { background, showGrid, equalAspect, includeLegend: true, resolveColor: lightCurveHex },
        exportedMarkers,
      ),
    [world, viewportSize, curves, exportedMarkers, background, showGrid, equalAspect],
  )

  const { scale, capped } = resolveExportScale(format === 'png' ? requestedScale : 1, scene.width, scene.height + scene.legendHeight + scene.captionHeight)
  const pixelWidth = Math.round(scene.width * scale)
  const pixelHeight = Math.round((scene.height + scene.legendHeight + scene.captionHeight) * scale)
  const filename = sanitizeExportFilename(title, format)

  async function onDownload(): Promise<void> {
    setError(null)
    if (format === 'svg') {
      const text = renderExportSvg(scene, 1)
      const done = downloadBlob(filename, new Blob([text], { type: 'image/svg+xml' }))
      if (!done) {
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
      <div ref={dialogRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Export graph" className="relative w-full max-w-md rounded-lg border border-line bg-elevated p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">Export graph</h2>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Format</legend>
          <div className="mt-1.5 flex gap-4 text-sm text-ink">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="export-format" checked={format === 'svg'} onChange={() => setFormat('svg')} className="h-4 w-4 accent-accent" />
              SVG (vector)
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="export-format" checked={format === 'png'} onChange={() => setFormat('png')} className="h-4 w-4 accent-accent" />
              PNG (raster)
            </label>
          </div>
        </fieldset>

        {format === 'png' && (
          <label className="mt-3 block text-sm text-ink">
            Resolution
            <select
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
          Background
          <select
            value={background}
            onChange={(event) => setBackground(event.target.value as ExportBackground)}
            className="ml-2 rounded-md border border-line bg-bg px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="white">White</option>
            <option value="transparent">Transparent</option>
          </select>
        </label>

        {templateMarkers.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              aria-label="Include template annotations in export"
              checked={includeTemplateMarkers}
              onChange={(event) => setIncludeTemplateMarkers(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Include template annotations ({templateMarkers.length})
          </label>
        )}

        <p className="mt-3 text-xs text-muted">
          {format === 'svg' ? `Vector figure, ${scene.width}×${scene.height + scene.legendHeight + scene.captionHeight} units.` : `${pixelWidth}×${pixelHeight} px at ${scale}×.`}
          {capped ? ' Capped to the output limit.' : ''} Exports use the light figure theme.
        </p>

        {warnings.length > 0 && (
          <div role="note" className="mt-3 rounded-md border border-warning px-2 py-1.5 text-xs text-ink">
            <p className="font-semibold">Heads up — this figure may be incomplete:</p>
            <ul className="mt-1 list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
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
          <Button onClick={() => void onDownload()} disabled={busy || curves.length === 0} className="border-accent bg-accent font-semibold text-white hover:bg-accent-strong dark:text-white">
            {busy ? 'Rendering…' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  )
}
