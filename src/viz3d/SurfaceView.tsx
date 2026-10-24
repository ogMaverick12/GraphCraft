import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { IconButton } from '../components/ui/IconButton.tsx'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { encodePng, downloadBlob, sanitizeFigureFilename } from '../export/index.ts'
import {
  COARSE_RESOLUTION,
  clampCamera,
  colorForValue,
  compileSurface,
  DEFAULT_CAMERA,
  inspectSurface,
  makeProjectionFrame,
  projectSurface,
  projectWorldPoint,
  sampleSurface,
  shadeColor,
  SURFACE_RESOLUTIONS,
  validateSurfaceSpec,
  type Camera,
  type InspectedPoint,
  type SurfaceAppearance,
  type SurfaceDomain,
  type SurfaceViewState,
} from './surface.ts'
import { ticksForRange } from '../graph/coordinate.ts'
import { renderSurfaceSvgText } from './surfaceSvg.ts'
import { colorbarStops } from './fields.ts'

/**
 * 3D surface view (Stage 6): one bounded `z = f(x, y)` surface drawn as
 * depth-sorted height-coloured quads in an SVG figure — no WebGL, no
 * GPU requirement, the 2D renderer untouched. Camera orbit/pan/zoom,
 * resolution with honest cost labels, domain editing with loud errors,
 * axis labels, colour legend, and SVG/PNG export built from current
 * state at click time.
 */

const VIEW_SIZE = { width: 640, height: 440 }
const FONT_STACK = 'Inter, system-ui, -apple-system, \'Segoe UI\', sans-serif'
const MAX_SURFACES_NOTE = 'Surfaces are capped so painter sorting stays linear and predictable.'

function decimalInput(value: number, label: string, onChange: (value: number | null) => void): React.JSX.Element {
  return (
    <label className="block text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={String(value)}
        onChange={(event) => {
          const text = event.target.value.trim()
          if (text === '') {
            onChange(null)
            return
          }
          const parsed = Number(text)
          onChange(Number.isFinite(parsed) ? parsed : null)
        }}
        className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}

export function SurfaceView({ initial, onRemove, onChange }: { initial?: SurfaceViewState; onRemove?: () => void; onChange?: (state: SurfaceViewState) => void }): React.JSX.Element {
  const [source, setSource] = useState(initial?.source ?? 'x^2+y^2')
  const [domain, setDomain] = useState<SurfaceDomain>(initial?.domain ?? { xMin: -2, xMax: 2, yMin: -2, yMax: 2 })
  const [resolution, setResolution] = useState(initial?.resolution ?? 48)
  const [camera, setCamera] = useState<Camera>(initial?.camera ?? { ...DEFAULT_CAMERA })
  const [showGrid, setShowGrid] = useState(initial?.showGrid ?? true)
  const [title, setTitle] = useState(initial?.title ?? 'Paraboloid')
  const [appearance, setAppearance] = useState<SurfaceAppearance>(initial?.appearance ?? 'solid')
  const [exportError, setExportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dragRef = useRef<{ x: number; y: number; shift: boolean; moved: number; box: DOMRect } | null>(null)
  // Pointer events can outpace display frames: retain the latest movement and
  // apply camera changes at most once per animation frame.
  const dragFrameRef = useRef(0)
  const pendingDragRef = useRef<{ dx: number; dy: number; shift: boolean } | null>(null)

  useEffect(() => {
    onChange?.({ source, domain, resolution, camera, showGrid, title, appearance })
    // Reports live state for persistence; the callback is stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, domain, resolution, camera, showGrid, title, appearance])

  useEffect(
    () => () => {
      if (dragFrameRef.current !== 0) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(dragFrameRef.current)
        }
        dragFrameRef.current = 0
      }
      pendingDragRef.current = null
      dragRef.current = null
    },
    [],
  )

  const specError = validateSurfaceSpec({ source, domain, resolution })
  const compiled = useMemo(() => (specError === null ? compileSurface(source, []) : null), [source, specError])
  const compileError = compiled !== null && !compiled.ok ? compiled.error : null
  const sampled = useMemo(
    () => (compiled !== null && compiled.ok ? sampleSurface(compiled.field, { source, domain, resolution }) : null),
    [compiled, source, domain, resolution],
  )
  const projected = useMemo(
    () => (sampled === null ? null : projectSurface(sampled, { source, domain, resolution }, camera, VIEW_SIZE)),
    [sampled, source, domain, resolution, camera],
  )
  const coarse = resolution < COARSE_RESOLUTION
  const quads = projected?.quads ?? []
  const vMin = sampled !== null && Number.isFinite(sampled.finiteMin) ? sampled.finiteMin : 0
  const vMax = sampled !== null && Number.isFinite(sampled.finiteMax) ? sampled.finiteMax : 0
  const vertCount = (resolution + 1) * (resolution + 1)

  function orbit(dYaw: number, dPitch: number): void {
    setCamera((current) => clampCamera({ ...current, yaw: current.yaw + dYaw, pitch: current.pitch + dPitch }))
  }

  function zoom(factor: number): void {
    setCamera((current) => clampCamera({ ...current, distance: current.distance * factor }))
  }

  function pan(dx: number, dy: number): void {
    setCamera((current) => clampCamera({ ...current, panX: current.panX + dx, panY: current.panY + dy }))
  }

  function cancelDragFrame(): void {
    if (dragFrameRef.current === 0) {
      return
    }
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(dragFrameRef.current)
    }
    dragFrameRef.current = 0
  }

  function applyPendingDrag(): void {
    dragFrameRef.current = 0
    const pending = pendingDragRef.current
    pendingDragRef.current = null
    if (pending === null) {
      return
    }
    if (pending.shift) {
      pan(-pending.dx * 2, pending.dy * 2)
    } else {
      orbit(-pending.dx, -pending.dy)
    }
  }

  function flushPendingDrag(): void {
    cancelDragFrame()
    applyPendingDrag()
  }

  function cancelPendingDrag(): void {
    cancelDragFrame()
    pendingDragRef.current = null
  }

  function scheduleDragUpdate(dx: number, dy: number, shift: boolean): void {
    const pending = pendingDragRef.current
    pendingDragRef.current = pending === null ? { dx, dy, shift } : { dx: pending.dx + dx, dy: pending.dy + dy, shift }
    if (dragFrameRef.current !== 0) {
      return
    }
    if (typeof requestAnimationFrame !== 'function') {
      applyPendingDrag()
      return
    }
    dragFrameRef.current = requestAnimationFrame(applyPendingDrag)
  }

  function resetCamera(): void {
    cancelPendingDrag()
    setCamera({ ...DEFAULT_CAMERA })
    setInspected(null)
  }

  const [inspected, setInspected] = useState<InspectedPoint | null>(null)

  function inspectAt(clientX: number, clientY: number, box: DOMRect): void {
    if (sampled === null) {
      setInspected(null)
      return
    }
    // viewBox maps linearly onto the box: convert CSS pixels to view units.
    const px = ((clientX - box.left) / Math.max(1, box.width)) * VIEW_SIZE.width
    const py = ((clientY - box.top) / Math.max(1, box.height)) * VIEW_SIZE.height
    setInspected(inspectSurface(sampled, { source, domain, resolution }, camera, VIEW_SIZE, px, py))
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    const step = 0.12
    if (event.key === 'ArrowLeft') {
      if (event.shiftKey) {
        pan(-step, 0)
      } else {
        orbit(-step, 0)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      if (event.shiftKey) {
        pan(step, 0)
      } else {
        orbit(step, 0)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (event.shiftKey) {
        pan(0, step)
      } else {
        orbit(0, step)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowDown') {
      if (event.shiftKey) {
        pan(0, -step)
      } else {
        orbit(0, -step)
      }
      event.preventDefault()
    } else if (event.key === '+' || event.key === '=') {
      zoom(1 / 1.2)
      event.preventDefault()
    } else if (event.key === '-') {
      zoom(1.2)
      event.preventDefault()
    } else if (event.key === '0') {
      resetCamera()
      event.preventDefault()
    } else if (event.key === 'Escape') {
      setInspected(null)
    }
  }

  function quadPaint(quad: { value: number; shade: number }): { fill: string; stroke: string; strokeWidth: number } {
    const base = colorForValue(quad.value, vMin, vMax)
    if (appearance === 'wireframe') {
      return { fill: 'none', stroke: base, strokeWidth: 0.75 }
    }
    const shaded = appearance === 'shaded' ? shadeColor(base, quad.shade) : base
    return { fill: shaded, stroke: shaded, strokeWidth: 0.5 }
  }

  const ticks = useMemo(() => {
    if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)) {
      return { xTicks: [], yTicks: [] as Array<{ px: number; py: number; label: string }> }
    }
    const frame = makeProjectionFrame({ domain }, camera, VIEW_SIZE)
    const map = (x: number, y: number, z: number): { px: number; py: number } | null => {
      const p = projectWorldPoint(frame, x, y, z)
      return p === null || !Number.isFinite(p.px) || !Number.isFinite(p.py) ? null : { px: p.px, py: p.py }
    };
    const xTicks = ticksForRange(domain.xMin, domain.xMax, 6).flatMap((tick) => {
      const p = map(tick.value, domain.yMin, 0)
      return p === null ? [] : [{ ...p, label: tick.label }]
    })
    const yTicks = ticksForRange(domain.yMin, domain.yMax, 5).flatMap((tick) => {
      const p = map(domain.xMin, tick.value, 0)
      return p === null ? [] : [{ ...p, label: tick.label }]
    })
    return { xTicks, yTicks }
  }, [domain, camera])

  const colorbar = useMemo(() => {
    if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) {
      return null
    }
    return { stops: colorbarStops(vMin, vMax, 'blue-red'), min: vMin, max: vMax }
  }, [vMin, vMax])

  function svgText(): string {
    return renderSurfaceSvgText({
      quads,
      axes: projected?.axes ?? null,
      xTicks: ticks.xTicks,
      yTicks: ticks.yTicks,
      vMin,
      vMax,
      title,
      source,
      appearance,
      showGrid,
      size: VIEW_SIZE,
    })
  }

  async function downloadSvg(): Promise<void> {
    setExportError(null)
    const filename = sanitizeFigureFilename(title === '' ? 'surface' : title, 'svg')
    if (!downloadBlob(filename, new Blob([svgText()], { type: 'image/svg+xml' }))) {
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
      // Fixed 2× raster (1280×880): far below the 2400px / 6MP caps, so no
      // silent downscaling — dimensions are exact and stated on the button.
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(VIEW_SIZE.width * scale)
      canvas.height = Math.round(VIEW_SIZE.height * scale)
      const ctx = canvas.getContext('2d')
      if (ctx === null) {
        setExportError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      ctx.save()
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, VIEW_SIZE.width, VIEW_SIZE.height)
      for (const quad of quads) {
        const paint = quadPaint(quad)
        ctx.lineWidth = paint.strokeWidth
        ctx.strokeStyle = paint.stroke
        ctx.beginPath()
        quad.corners.forEach((c, i) => {
          if (i === 0) {
            ctx.moveTo(c.px, c.py)
          } else {
            ctx.lineTo(c.px, c.py)
          }
        })
        ctx.closePath()
        if (paint.fill !== 'none') {
          ctx.fillStyle = paint.fill
          ctx.fill()
        }
        ctx.stroke()
      }
      ctx.font = `10px ${FONT_STACK}`
      ctx.textAlign = 'end'
      ctx.fillStyle = '#1c1917'
      if (colorbar !== null) {
        colorbar.stops.forEach((stop, i) => {
          const y = 40 + ((VIEW_SIZE.height - 120) * i) / colorbar.stops.length
          ctx.fillStyle = stop.color
          ctx.fillRect(VIEW_SIZE.width - 30, y, 12, (VIEW_SIZE.height - 120) / colorbar.stops.length + 0.5)
        })
        ctx.fillStyle = '#1c1917'
        ctx.fillText(`z ${colorbar.max.toPrecision(3)}`, VIEW_SIZE.width - 32, 48)
        ctx.fillText(`z ${colorbar.min.toPrecision(3)}`, VIEW_SIZE.width - 32, VIEW_SIZE.height - 52)
      }
      ctx.restore()
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const bytes = await encodePng(canvas.width, canvas.height, image.data)
      const buffer = new ArrayBuffer(bytes.length)
      new Uint8Array(buffer).set(bytes)
      const filename = sanitizeFigureFilename(title === '' ? 'surface' : title, 'png')
      if (!downloadBlob(filename, new Blob([buffer], { type: 'image/png' }))) {
        setExportError('Download is unavailable in this browser.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Surface z = f(x, y)</span>
          <input
            type="text"
            aria-label="Surface expression"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            placeholder="x^2+y^2"
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Title</span>
          <input
            type="text"
            aria-label="Surface title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Resolution</span>
          <select
            aria-label="Surface resolution"
            value={resolution}
            onChange={(event) => setResolution(Number(event.target.value))}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SURFACE_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}×{r} grid ({((r + 1) * (r + 1)).toLocaleString()} evals)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Appearance</span>
          <select
            aria-label="Surface appearance"
            value={appearance}
            onChange={(event) => setAppearance(event.target.value as SurfaceAppearance)}
            className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="solid">Solid (height colours)</option>
            <option value="wireframe">Wireframe (mesh only)</option>
            <option value="shaded">Shaded (fixed key light)</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs text-muted">
          <input type="checkbox" aria-label="Show 3D axes" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} className="h-4 w-4 accent-accent" />
          Show axes
        </label>
        {decimalInput(domain.xMin, 'X min', (v) => v !== null && setDomain({ ...domain, xMin: v }))}
        {decimalInput(domain.xMax, 'X max', (v) => v !== null && setDomain({ ...domain, xMax: v }))}
        {decimalInput(domain.yMin, 'Y min', (v) => v !== null && setDomain({ ...domain, yMin: v }))}
        {decimalInput(domain.yMax, 'Y max', (v) => v !== null && setDomain({ ...domain, yMax: v }))}
      </div>

      {specError !== null && (
        <p role="alert" className="text-xs text-danger" data-testid="surface-error">
          {specError}
        </p>
      )}
      {compileError !== null && (
        <p role="alert" className="text-xs text-danger" data-testid="surface-error">
          Cannot plot: {compileError}
        </p>
      )}
      {coarse && specError === null && compileError === null && (
        <p className="text-xs text-warning">Coarse grid ({resolution}×{resolution}): fine features may be missed — raise the resolution to check.</p>
      )}
      {resolution >= 80 && (
        <p className="text-xs text-muted">
          {vertCount.toLocaleString()} vertices sample in milliseconds on this machine; {(resolution * resolution).toLocaleString()} quads draw as SVG polygons.
        </p>
      )}
      {sampled !== null && sampled.holes > 0 && (
        <p className="text-xs text-muted">
          {sampled.holes.toLocaleString()} invalid vertices are holes (drawn as gaps, never bridged).
        </p>
      )}

      <div
        role="application"
        aria-label={`3D surface viewer: ${title}. Arrow keys orbit, shift plus arrows pan, plus and minus zoom, zero resets.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          // A new grab settles any movement left from an interrupted drag.
          flushPendingDrag()
          // setPointerCapture is optional (jsdom and some browsers lack it); dragging still works.
          event.currentTarget.setPointerCapture?.(event.pointerId)
          dragRef.current = { x: event.clientX, y: event.clientY, shift: event.shiftKey, moved: 0, box: event.currentTarget.getBoundingClientRect() }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (drag === null) {
            return
          }
          const px = event.clientX - drag.x
          const py = event.clientY - drag.y
          drag.moved += Math.abs(px) + Math.abs(py)
          drag.x = event.clientX
          drag.y = event.clientY
          scheduleDragUpdate(px / 200, py / 200, drag.shift)
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          dragRef.current = null
          // The scheduled frame may not have run yet: apply the latest
          // pointer position before deciding whether this was a click.
          flushPendingDrag()
          // A press without dragging inspects the nearest vertex (holes
          // and empty space report as such — never a fabricated point).
          if (drag !== null && drag.moved < 5) {
            inspectAt(event.clientX, event.clientY, drag.box)
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
          cancelPendingDrag()
        }}
        className="relative w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="h-80 w-full md:h-96">
          <svg role="img" aria-label={`${title}: 3D surface of z = ${source} with ${quads.length} quads`} width="100%" height="100%" viewBox={`0 0 ${VIEW_SIZE.width} ${VIEW_SIZE.height}`} className="block select-none rounded-md border border-line bg-white">
            {quads.map((quad, i) => {
              const paint = quadPaint(quad)
              return <polygon key={i} points={quad.corners.map((c) => `${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ')} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
            })}
            {showGrid && projected !== null && (
              <g stroke="#8e8985" strokeWidth={1.5}>
                <line x1={projected.axes.origin.px} y1={projected.axes.origin.py} x2={projected.axes.xEnd.px} y2={projected.axes.xEnd.py} />
                <line x1={projected.axes.origin.px} y1={projected.axes.origin.py} x2={projected.axes.yEnd.px} y2={projected.axes.yEnd.py} />
                <line x1={projected.axes.origin.px} y1={projected.axes.origin.py} x2={projected.axes.zEnd.px} y2={projected.axes.zEnd.py} />
                <text x={projected.axes.xEnd.px} y={projected.axes.xEnd.py + 14} textAnchor="middle" fontSize={12} fill="#1c1917">x</text>
                <text x={projected.axes.yEnd.px} y={projected.axes.yEnd.py + 14} textAnchor="middle" fontSize={12} fill="#1c1917">y</text>
                <text x={projected.axes.zEnd.px + 6} y={projected.axes.zEnd.py} fontSize={12} fill="#1c1917">z</text>
              </g>
            )}
            {showGrid && (
              <g aria-hidden="true">
                {ticks.xTicks.map((tick, i) => (
                  <text key={`tx-${i}`} x={Math.min(Math.max(tick.px, 20), VIEW_SIZE.width - 4)} y={VIEW_SIZE.height - 6} textAnchor="middle" fontSize={10} fill="#736c67">
                    {tick.label}
                  </text>
                ))}
                {ticks.yTicks.map((tick, i) => (
                  <text key={`ty-${i}`} x={6} y={Math.min(Math.max(tick.py + 4, 12), VIEW_SIZE.height - 4)} textAnchor="start" fontSize={10} fill="#736c67">
                    {tick.label}
                  </text>
                ))}
              </g>
            )}
            {colorbar !== null && (
              <g fontSize={10} fill="#1c1917">
                {colorbar.stops.map((stop, i) => (
                  <rect
                    key={i}
                    x={VIEW_SIZE.width - 30}
                    y={40 + ((VIEW_SIZE.height - 120) * i) / colorbar.stops.length}
                    width={12}
                    height={(VIEW_SIZE.height - 120) / colorbar.stops.length + 0.5}
                    fill={stop.color}
                  />
                ))}
                <text x={VIEW_SIZE.width - 32} y={48} textAnchor="end">z {colorbar.min.toPrecision(3)}</text>
                <text x={VIEW_SIZE.width - 32} y={VIEW_SIZE.height - 52} textAnchor="end">z {colorbar.max.toPrecision(3)}</text>
              </g>
            )}
            {inspected !== null && inspected.status === 'value' && (() => {
              const frame = makeProjectionFrame({ domain }, camera, VIEW_SIZE)
              const placed = projectWorldPoint(frame, inspected.x, inspected.y, inspected.z)
              if (placed === null || !Number.isFinite(placed.px) || !Number.isFinite(placed.py)) {
                return null
              }
              return (
                <g aria-label={`Inspected point (${inspected.x}, ${inspected.y}, ${inspected.z})`}>
                  <circle cx={placed.px} cy={placed.py} r={7} fill="none" stroke="#4f46e5" strokeWidth={2} />
                  <circle cx={placed.px} cy={placed.py} r={2.5} fill="#4f46e5" />
                </g>
              )
            })()}
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
          <IconButton label="Reset 3D view" title="Reset 3D view" onClick={resetCamera}>
            <RotateCcw size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <p className="text-xs text-muted" data-testid="surface-summary">
        {quads.length.toLocaleString()} quads{sampled !== null && sampled.holes > 0 ? `, ${sampled.holes.toLocaleString()} holes` : ''} · z range [
        {Number.isFinite(vMin) ? vMin.toPrecision(4) : '—'}, {Number.isFinite(vMax) ? vMax.toPrecision(4) : '—'}] · drag orbits, shift-drag pans, buttons and arrow keys zoom and reset.
      </p>
      <p role="status" className="text-xs text-muted" data-testid="surface-inspection">
        {inspected === null
          ? 'Click the surface to inspect the nearest sampled point (Escape clears).'
          : inspected.status === 'value'
            ? `Inspected: x = ${inspected.x}, y = ${inspected.y}, z = ${inspected.z} (nearest sampled vertex).`
            : inspected.status === 'hole'
              ? 'Inspected: a hole — the surface is undefined here.'
              : 'Inspected: empty space — no surface nearby.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void downloadSvg()} title="Download this surface as SVG" variant="ghost" className="px-2 py-0.5 text-xs">
          Export SVG
        </Button>
        <Button onClick={() => void downloadPng()} title="Download this surface as PNG" variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy}>
          {busy ? 'Rendering…' : 'Export PNG'}
        </Button>
        {onRemove !== undefined && (
          <Button onClick={onRemove} title="Remove this surface" variant="ghost" className="px-2 py-0.5 text-xs">
            Remove
          </Button>
        )}
      </div>
      {exportError !== null && (
        <p role="alert" className="text-xs text-danger">
          {exportError}
        </p>
      )}
      <p className="text-xs text-muted">{MAX_SURFACES_NOTE}</p>
    </div>
  )
}
