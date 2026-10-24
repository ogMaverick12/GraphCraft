import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { IconButton } from '../components/ui/IconButton.tsx'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { downloadBlob, encodePng, sanitizeFigureFilename } from '../export/index.ts'
import { lightCurveHex } from '../graph/palette.ts'
import type { Dataset } from '../data/dataset.ts'
import { clampCamera, DEFAULT_CAMERA, makeProjectionFrame, MAX_SCATTER_POINTS, projectWorldPoint, SCATTER_VIEW_SIZE, type Camera } from './surface.ts'

/**
 * 3D scatter (Stage 6 S6.6): observations from a Data Lab dataset,
 * three numeric columns mapped to x/y/z. Reads the shared dataset
 * model read-only (no import logic duplicated, nothing mutated);
 * non-finite rows skip with a count. Display caps at 2000 points
 * with a stated stride — communicated, never silent. No fit or
 * analysis overlays: 2D fit coordinates are incompatible with 3D
 * space, so none are offered (documented, not missing).
 */

const FONT_STACK = 'Inter, system-ui, -apple-system, \'Segoe UI\', sans-serif'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface Scatter3DState {
  datasetId: string | null
  xId: string | null
  yId: string | null
  zId: string | null
  camera: Camera
  title: string
}

interface PlottedPoint {
  x: number
  y: number
  z: number
  px: number
  py: number
  depth: number
}

export function Scatter3D({ datasets, initial, onRemove, onChange }: {
  datasets: Dataset[]
  initial?: Scatter3DState
  onRemove?: () => void
  onChange?: (state: Scatter3DState) => void
}): React.JSX.Element {
  const [datasetId, setDatasetId] = useState<string | null>(initial?.datasetId ?? datasets[0]?.id ?? null)
  const dataset = datasets.find((d) => d.id === datasetId) ?? null
  const numeric = useMemo(() => dataset?.columns.filter((col) => col.type === 'numeric') ?? [], [dataset])
  const [xId, setXId] = useState<string | null>(initial?.xId ?? numeric[0]?.id ?? null)
  const [yId, setYId] = useState<string | null>(initial?.yId ?? numeric[1]?.id ?? numeric[0]?.id ?? null)
  const [zId, setZId] = useState<string | null>(initial?.zId ?? numeric[2]?.id ?? numeric[0]?.id ?? null)
  const [camera, setCamera] = useState<Camera>(initial?.camera ?? { ...DEFAULT_CAMERA })
  const [title, setTitle] = useState(initial?.title ?? '3D scatter')
  const [exportError, setExportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onChange?.({ datasetId, xId, yId, zId, camera, title })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, xId, yId, zId, camera, title])

  const extracted = useMemo(() => {
    if (dataset === null || xId === null || yId === null || zId === null) {
      return { points: [], skipped: 0 }
    }
    const xi = dataset.columns.findIndex((col) => col.id === xId)
    const yi = dataset.columns.findIndex((col) => col.id === yId)
    const zi = dataset.columns.findIndex((col) => col.id === zId)
    if (xi < 0 || yi < 0 || zi < 0) {
      return { points: [], skipped: dataset.rows.length }
    }
    const points: Array<{ x: number; y: number; z: number }> = []
    let skipped = 0
    for (const row of dataset.rows) {
      const x = row[xi]
      const y = row[yi]
      const z = row[zi]
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) && typeof z === 'number' && Number.isFinite(z)) {
        points.push({ x, y, z })
      } else {
        skipped += 1
      }
    }
    return { points, skipped }
  }, [dataset, xId, yId, zId])

  const plotted = useMemo((): { points: PlottedPoint[]; stride: number; total: number; bounds: string } => {
    const total = extracted.points.length
    if (total === 0) {
      return { points: [], stride: 1, total, bounds: '' }
    }
    const stride = Math.max(1, Math.ceil(total / MAX_SCATTER_POINTS))
    const kept = extracted.points.filter((_, i) => i % stride === 0)
    const xs = kept.map((p) => p.x)
    const ys = kept.map((p) => p.y)
    const zs = kept.map((p) => p.z)
    const lo = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) }
    const hi = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) }
    const span = Math.max(hi.x - lo.x, hi.y - lo.y, 1e-9)
    const frame = makeProjectionFrame(
      { domain: { xMin: lo.x - span * 0.05, xMax: hi.x + span * 0.05, yMin: lo.y - span * 0.05, yMax: hi.y + span * 0.05 } },
      camera,
      SCATTER_VIEW_SIZE,
    )
    const points: PlottedPoint[] = []
    for (const p of kept) {
      // Z does not enter the 2D frame: project with the point's own z.
      const placed = projectWorldPoint(frame, p.x, p.y, p.z)
      if (placed === null || !Number.isFinite(placed.px) || !Number.isFinite(placed.py)) {
        continue
      }
      points.push({ ...p, px: placed.px, py: placed.py, depth: placed.depth })
    }
    // Far points first: later dots paint on top, so nearer points win overlaps.
    points.sort((a, b) => b.depth - a.depth)
    return { points, stride, total, bounds: `x [${lo.x}, ${hi.x}] · y [${lo.y}, ${hi.y}] · z [${lo.z}, ${hi.z}]` }
  }, [extracted, camera])

  function orbit(dYaw: number, dPitch: number): void {
    setCamera((current) => clampCamera({ ...current, yaw: current.yaw + dYaw, pitch: current.pitch + dPitch }))
  }

  function zoom(factor: number): void {
    setCamera((current) => clampCamera({ ...current, distance: current.distance * factor }))
  }

  function onViewerKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      orbit(-0.2, 0)
    } else if (event.key === 'ArrowRight') {
      orbit(0.2, 0)
    } else if (event.key === 'ArrowUp') {
      orbit(0, 0.2)
    } else if (event.key === 'ArrowDown') {
      orbit(0, -0.2)
    } else if (event.key === '+' || event.key === '=') {
      zoom(1 / 1.2)
    } else if (event.key === '-') {
      zoom(1.2)
    } else if (event.key === '0') {
      setCamera({ ...DEFAULT_CAMERA })
    } else {
      return
    }
    event.preventDefault()
  }

  const color = lightCurveHex(0)

  function svgText(): string {
    const parts: string[] = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${SCATTER_VIEW_SIZE.width}" height="${SCATTER_VIEW_SIZE.height}" viewBox="0 0 ${SCATTER_VIEW_SIZE.width} ${SCATTER_VIEW_SIZE.height}" font-family="${FONT_STACK}" role="img">`)
    parts.push(`<title>${escapeXml(title === '' ? 'GraphCraft 3D scatter' : title)} — ${plotted.total} observations</title>`)
    parts.push(`<rect x="0" y="0" width="${SCATTER_VIEW_SIZE.width}" height="${SCATTER_VIEW_SIZE.height}" fill="#ffffff"/>`)
    for (const p of plotted.points) {
      parts.push(`<circle cx="${p.px.toFixed(2)}" cy="${p.py.toFixed(2)}" r="3.5" fill="${color}"><title>(${p.x}, ${p.y}, ${p.z})</title></circle>`)
    }
    parts.push(`<g font-size="12" fill="#1c1917"><text x="${SCATTER_VIEW_SIZE.width / 2}" y="16" text-anchor="middle" font-weight="600">${escapeXml(title)}</text></g>`)
    parts.push(`</svg>`)
    return parts.join('\n')
  }

  async function downloadSvg(): Promise<void> {
    setExportError(null)
    if (!downloadBlob(sanitizeFigureFilename(title === '' ? 'scatter3d' : title, 'svg'), new Blob([svgText()], { type: 'image/svg+xml' }))) {
      setExportError('Download is unavailable in this browser.')
    }
  }

  async function downloadPng(): Promise<void> {
    setExportError(null)
    setBusy(true)
    try {
      if (typeof document === 'undefined') {
        setExportError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = SCATTER_VIEW_SIZE.width * 2
      canvas.height = SCATTER_VIEW_SIZE.height * 2
      const ctx = canvas.getContext('2d')
      if (ctx === null) {
        setExportError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      ctx.save()
      ctx.scale(2, 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SCATTER_VIEW_SIZE.width, SCATTER_VIEW_SIZE.height)
      ctx.fillStyle = color
      for (const p of plotted.points) {
        ctx.beginPath()
        ctx.arc(p.px, p.py, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const bytes = await encodePng(canvas.width, canvas.height, image.data)
      const buffer = new ArrayBuffer(bytes.length)
      new Uint8Array(buffer).set(bytes)
      if (!downloadBlob(sanitizeFigureFilename(title === '' ? 'scatter3d' : title, 'png'), new Blob([buffer], { type: 'image/png' }))) {
        setExportError('Download is unavailable in this browser.')
      }
    } finally {
      setBusy(false)
    }
  }

  function columnSelect(label: string, value: string | null, onChange: (id: string | null) => void): React.JSX.Element {
    return (
      <label className="block text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <select
          aria-label={label}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">(none)</option>
          {numeric.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Dataset</span>
          <select
            aria-label="Scatter dataset"
            value={datasetId ?? ''}
            onChange={(event) => {
              const id = event.target.value === '' ? null : event.target.value
              setDatasetId(id)
              setXId(null)
              setYId(null)
              setZId(null)
            }}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">(none)</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.rows.length} rows)
              </option>
            ))}
          </select>
        </label>
        {columnSelect('X column', xId, setXId)}
        {columnSelect('Y column', yId, setYId)}
        {columnSelect('Z column', zId, setZId)}
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Title</span>
          <input type="text" aria-label="Scatter title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
      </div>

      <div
        role="application"
        aria-label={`3D scatter viewer: ${title === '' ? 'untitled' : title}. Arrow keys orbit, plus and minus zoom, zero resets.`}
        tabIndex={0}
        onKeyDown={onViewerKeyDown}
        className="relative w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="h-80 w-full md:h-96">
          <svg role="img" aria-label={`${title}: 3D scatter of ${plotted.total} observations`} width="100%" height="100%" viewBox={`0 0 ${SCATTER_VIEW_SIZE.width} ${SCATTER_VIEW_SIZE.height}`} className="block select-none rounded-md border border-line bg-white">
            {plotted.points.map((p, i) => (
              <circle key={i} cx={p.px} cy={p.py} r={3.5} fill={color}>
                <title>{`(${p.x}, ${p.y}, ${p.z})`}</title>
              </circle>
            ))}
          </svg>
        </div>
        <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-surface p-0.5 shadow-panel">
          <IconButton label="Orbit left" title="Orbit left" onClick={() => orbit(-0.2, 0)}>
            <span aria-hidden="true">⟲</span>
          </IconButton>
          <IconButton label="Orbit right" title="Orbit right" onClick={() => orbit(0.2, 0)}>
            <span aria-hidden="true">⟳</span>
          </IconButton>
          <IconButton label="Zoom in" title="Zoom in" onClick={() => zoom(1 / 1.2)}>
            <Plus size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Zoom out" title="Zoom out" onClick={() => zoom(1.2)}>
            <Minus size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset 3D view" title="Reset 3D view" onClick={() => setCamera({ ...DEFAULT_CAMERA })}>
            <RotateCcw size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <p className="text-xs text-muted" data-testid="scatter-summary">
        {plotted.total} observations{extracted.skipped > 0 ? `, ${extracted.skipped} rows skipped (missing or non-numeric)` : ''}
        {plotted.stride > 1 ? `, showing every ${plotted.stride}nd point (${plotted.points.length} drawn)` : ''}. {plotted.bounds}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void downloadSvg()} title="Download as SVG" variant="ghost" className="px-2 py-0.5 text-xs">
          Export SVG
        </Button>
        <Button onClick={() => void downloadPng()} title="Download as PNG (1280×880)" variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy}>
          {busy ? 'Rendering…' : 'Export PNG'}
        </Button>
        {onRemove !== undefined && (
          <Button onClick={onRemove} title="Remove this scatter" variant="ghost" className="px-2 py-0.5 text-xs">
            Remove
          </Button>
        )}
      </div>
      {exportError !== null && (
        <p role="alert" className="text-xs text-danger">
          {exportError}
        </p>
      )}
    </div>
  )
}
