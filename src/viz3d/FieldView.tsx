import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { createTransform, ticksForRange, worldToScreen } from '../graph/coordinate.ts'
import { downloadBlob, encodePng, sanitizeFigureFilename } from '../export/index.ts'
import { sampleVectorField } from './surface.ts'
import { compileSurface } from './surface.ts'
import {
  autoLevels,
  colorbarStops,
  colorForField,
  contourLevels,
  defaultFieldState,
  layoutArrows,
  parseLevelList,
  probeRange,
  resolveScale,
  FIELD_RESOLUTIONS,
  FIELD_VIEW_SIZE,
  type ArrowMode,
  type ColorPolicy,
  type FieldMode,
  type FieldViewState,
  type ScalePolicy,
} from './fields.ts'
import { sampleSurface } from './surface.ts'

/**
 * 2D field view (Stage 6): contour lines, heatmaps, and vector arrows
 * over bounded domains — one shared sampler family, no per-mode
 * export path. Contours reuse marching squares; heatmaps shade the
 * fixed grid; arrows stride-cap density with a stated step. Invalid
 * cells are gaps, never bridges. Streamlines are deferred (FIELDS.md).
 */

const FONT_STACK = 'Inter, system-ui, -apple-system, \'Segoe UI\', sans-serif'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function decimalInput(value: string, label: string, onChange: (text: string) => void): React.JSX.Element {
  return (
    <label className="block text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}

function parseFinite(text: string): number | null {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) ? value : null
}

export function FieldView({ initial, onRemove, onChange }: { initial?: FieldViewState; onRemove?: () => void; onChange?: (state: FieldViewState) => void }): React.JSX.Element {
  const fallback = useMemo(defaultFieldState, [])
  const [mode, setMode] = useState<FieldMode>(initial?.mode ?? fallback.mode)
  const [source, setSource] = useState(initial?.source ?? fallback.source)
  const [uSource, setUSource] = useState(initial?.uSource ?? fallback.uSource)
  const [vSource, setVSource] = useState(initial?.vSource ?? fallback.vSource)
  const [domain, setDomain] = useState(initial?.domain ?? fallback.domain)
  const [resolution, setResolution] = useState(initial?.resolution ?? fallback.resolution)
  const [levelCount, setLevelCount] = useState(initial?.levelCount ?? fallback.levelCount)
  const [levelList, setLevelList] = useState(initial?.levelList ?? fallback.levelList)
  const [colorPolicy, setColorPolicy] = useState<ColorPolicy>(initial?.colorPolicy ?? fallback.colorPolicy)
  const [scalePolicy, setScalePolicy] = useState<ScalePolicy>(initial?.scalePolicy ?? fallback.scalePolicy)
  const [fixedMin, setFixedMin] = useState(initial?.fixedMin ?? fallback.fixedMin)
  const [fixedMax, setFixedMax] = useState(initial?.fixedMax ?? fallback.fixedMax)
  const [arrowMode, setArrowMode] = useState<ArrowMode>(initial?.arrowMode ?? fallback.arrowMode)
  const [showGrid, setShowGrid] = useState(initial?.showGrid ?? fallback.showGrid)
  const [title, setTitle] = useState(initial?.title ?? fallback.title)
  const [exportError, setExportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onChange?.({ mode, source, uSource, vSource, domain, resolution, levelCount, levelList, colorPolicy, scalePolicy, fixedMin, fixedMax, arrowMode, showGrid, title })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source, uSource, vSource, domain, resolution, levelCount, levelList, colorPolicy, scalePolicy, fixedMin, fixedMax, arrowMode, showGrid, title])

  const domainError = !(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin) ? 'Domain needs max above min on both axes.' : null
  const compiled = useMemo(() => {
    if (domainError !== null) {
      return null
    }
    if (mode === 'vectors') {
      const u = compileSurface(uSource, [])
      const v = compileSurface(vSource, [])
      if (!u.ok) {
        return { kind: 'error' as const, error: `U: ${u.error}` }
      }
      if (!v.ok) {
        return { kind: 'error' as const, error: `V: ${v.error}` }
      }
      return { kind: 'vectors' as const, u: u.field, v: v.field }
    }
    const single = compileSurface(source, [])
    if (!single.ok) {
      return { kind: 'error' as const, error: single.error }
    }
    return { kind: 'field' as const, field: single.field }
  }, [mode, source, uSource, vSource, domainError])

  const figure = useMemo(() => {
    if (compiled === null || compiled.kind === 'error') {
      return null
    }
    const transform = createTransform({ xMin: domain.xMin, xMax: domain.xMax, yMin: domain.yMin, yMax: domain.yMax }, FIELD_VIEW_SIZE, false)
    const toPx = (x: number, y: number): { px: number; py: number } | null => {
      const s = worldToScreen(transform, x, y)
      return Number.isFinite(s.px) && Number.isFinite(s.py) ? s : null
    };
    if (mode === 'vectors' && compiled.kind === 'vectors') {
      const sampled = sampleVectorField(compiled.u, compiled.v, { uSource, vSource, domain, resolution })
      const raw = sampled.arrows.map((a) => (a === null ? null : { x: a.x, y: a.y, u: a.u, v: a.v }))
      const span = Math.max(domain.xMax - domain.xMin, domain.yMax - domain.yMin)
      const grid = layoutArrows(raw, resolution, arrowMode, span / 24)
      return { kind: 'vectors' as const, grid, sampled, holes: sampled.holes, toPx, transform, scale: null as null | { min: number; max: number }, levels: [] as Array<{ value: number; segments: Array<Array<{ x: number; y: number }>> }> }
    }
    if (!('field' in compiled) || compiled.kind !== 'field') {
      return null
    }
    if (mode === 'heatmap') {
      const sampled = sampleSurface(compiled.field, { source, domain, resolution })
      const scale = resolveScale(
        sampled.finiteMin,
        sampled.finiteMax,
        { policy: scalePolicy, fixedMin: parseFinite(fixedMin), fixedMax: parseFinite(fixedMax) },
      )
      return { kind: 'heatmap' as const, sampled, toPx, transform, scale, grid: null, levels: [] as Array<{ value: number; segments: Array<Array<{ x: number; y: number }>> }> }
    }
    const range = probeRange(compiled.field, source, domain)
    const scale = resolveScale(range.min, range.max, { policy: 'auto', fixedMin: null, fixedMax: null })
    const parsed = parseLevelList(levelList)
    if ('error' in parsed) {
      return { kind: 'error' as const, message: parsed.error }
    }
    const levels = parsed.levels.length > 0 ? parsed.levels : autoLevels(scale.min, scale.max, levelCount)
    // Contour density follows the grid control (documented mapping, bounded by the sampler budget).
    const pixelWidth = resolution <= 16 ? 120 : resolution <= 24 ? 160 : resolution <= 32 ? 220 : 300
    const traced = contourLevels(compiled.field, source, domain, levels, pixelWidth)
    // One visible label per level at its longest segment's midpoint: levels
    // stay identifiable without flooding the figure.
    const labels = traced.flatMap((level) => {
      let best: Array<{ x: number; y: number }> | null = null
      for (const segment of level.segments) {
        if (best === null || segment.length > best.length) {
          best = segment
        }
      }
      if (best === null || best.length === 0) {
        return []
      }
      const mid = best[Math.floor(best.length / 2)] ?? null
      if (mid === null) {
        return []
      }
      const placed = toPx(mid.x, mid.y)
      return placed === null ? [] : [{ value: level.value, px: placed.px, py: placed.py }]
    })
    return { kind: 'contour' as const, toPx, transform, scale, levels: traced, labels, grid: null, sampled: null }
  }, [compiled, mode, domain, resolution, source, uSource, vSource, arrowMode, scalePolicy, fixedMin, fixedMax, levelList, levelCount])

  const figureError = figure !== null && figure.kind === 'error' ? figure.message : null

  function svgText(): string {
    const parts: string[] = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${FIELD_VIEW_SIZE.width}" height="${FIELD_VIEW_SIZE.height}" viewBox="0 0 ${FIELD_VIEW_SIZE.width} ${FIELD_VIEW_SIZE.height}" font-family="${FONT_STACK}" role="img">`)
    parts.push(`<title>${escapeXml(title === '' ? 'GraphCraft field' : title)}</title>`)
    parts.push(`<rect x="0" y="0" width="${FIELD_VIEW_SIZE.width}" height="${FIELD_VIEW_SIZE.height}" fill="#ffffff"/>`)
    if (figure !== null && figure.kind === 'heatmap' && figure.sampled !== null && figure.scale !== null) {
      const n = figure.sampled.resolution
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const value = figure.sampled.grid[j * (n + 1) + i]
          if (value === null || value === undefined) {
            continue
          }
          const x0 = domain.xMin + ((domain.xMax - domain.xMin) * i) / n
          const x1 = domain.xMin + ((domain.xMax - domain.xMin) * (i + 1)) / n
          const y0 = domain.yMin + ((domain.yMax - domain.yMin) * j) / n
          const y1 = domain.yMin + ((domain.yMax - domain.yMin) * (j + 1)) / n
          const a = figure.toPx(x0, y1)
          const b = figure.toPx(x1, y0)
          if (a === null || b === null) {
            continue
          }
          parts.push(`<rect x="${a.px.toFixed(2)}" y="${a.py.toFixed(2)}" width="${(b.px - a.px).toFixed(2)}" height="${(b.py - a.py).toFixed(2)}" fill="${colorForField(value, figure.scale.min, figure.scale.max, colorPolicy)}"/>`)
        }
      }
    }
    if (figure !== null && figure.kind === 'contour') {
      for (const level of figure.levels) {
        for (const segment of level.segments) {
          const pts = segment.flatMap((p) => {
            const s = figure.toPx(p.x, p.y)
            return s === null ? [] : [`${s.px.toFixed(1)},${s.py.toFixed(1)}`]
          })
          if (pts.length >= 2) {
            parts.push(`<path d="M${pts.join('L')}" fill="none" stroke="#1c1917" stroke-width="1.25"><title>z = ${level.value}</title></path>`)
          }
        }
      }
      for (const label of figure.labels) {
        parts.push(`<text x="${label.px.toFixed(1)}" y="${(label.py - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="#1c1917">${label.value}</text>`)
      }
    }
    if (figure !== null && figure.kind === 'vectors' && figure.grid !== null) {
      for (const arrow of figure.grid.arrows) {
        const base = figure.toPx(arrow.x, arrow.y)
        // Lengths live in data units: map the tip through the same transform.
        const tip = figure.toPx(arrow.x + Math.cos(arrow.angle) * arrow.length, arrow.y + Math.sin(arrow.angle) * arrow.length)
        if (base === null || tip === null) {
          continue
        }
        const color = colorForField(arrow.magnitude, 0, figure.grid.maxMagnitude, colorPolicy)
        const hx = tip.px - base.px
        const hy = tip.py - base.py
        const head = 6
        const ang = Math.atan2(hy, hx)
        const p1 = `${(tip.px - head * Math.cos(ang - 0.42)).toFixed(1)},${(tip.py - head * Math.sin(ang - 0.42)).toFixed(1)}`
        const p2 = `${(tip.px - head * Math.cos(ang + 0.42)).toFixed(1)},${(tip.py - head * Math.sin(ang + 0.42)).toFixed(1)}`
        parts.push(`<line x1="${base.px.toFixed(1)}" y1="${base.py.toFixed(1)}" x2="${tip.px.toFixed(1)}" y2="${tip.py.toFixed(1)}" stroke="${color}" stroke-width="1.5"/>`)
        parts.push(`<polygon points="${tip.px.toFixed(1)},${tip.py.toFixed(1)} ${p1} ${p2}" fill="${color}"/>`)
      }
    }
    parts.push(`<g font-size="12" fill="#1c1917"><text x="${FIELD_VIEW_SIZE.width / 2}" y="16" text-anchor="middle" font-weight="600">${escapeXml(title)}</text></g>`)
    if (showGrid) {
      const transform = createTransform({ xMin: domain.xMin, xMax: domain.xMax, yMin: domain.yMin, yMax: domain.yMax }, FIELD_VIEW_SIZE, false)
      parts.push(`<g stroke="#e7e5e4" stroke-width="1">`)
      for (const tick of ticksForRange(domain.xMin, domain.xMax, 6)) {
        const { px } = worldToScreen(transform, tick.value, 0)
        parts.push(`<line x1="${px.toFixed(2)}" y1="0" x2="${px.toFixed(2)}" y2="${FIELD_VIEW_SIZE.height}"/>`)
      }
      for (const tick of ticksForRange(domain.yMin, domain.yMax, 5)) {
        const { py } = worldToScreen(transform, 0, tick.value)
        parts.push(`<line x1="0" y1="${py.toFixed(2)}" x2="${FIELD_VIEW_SIZE.width}" y2="${py.toFixed(2)}"/>`)
      }
      parts.push(`</g>`)
    }
    parts.push(`</svg>`)
    return parts.join('\n')
  }

  async function downloadSvg(): Promise<void> {
    setExportError(null)
    if (!downloadBlob(sanitizeFigureFilename(title === '' ? 'field' : title, 'svg'), new Blob([svgText()], { type: 'image/svg+xml' }))) {
      setExportError('Download is unavailable in this browser.')
    }
  }

  function drawToCanvas(ctx: CanvasRenderingContext2D, scale: number): void {
    ctx.save()
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, FIELD_VIEW_SIZE.width, FIELD_VIEW_SIZE.height)
    if (figure !== null && figure.kind === 'heatmap' && figure.sampled !== null && figure.scale !== null) {
      const n = figure.sampled.resolution
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const value = figure.sampled.grid[j * (n + 1) + i]
          if (value === null || value === undefined) {
            continue
          }
          const x0 = domain.xMin + ((domain.xMax - domain.xMin) * i) / n
          const x1 = domain.xMin + ((domain.xMax - domain.xMin) * (i + 1)) / n
          const y0 = domain.yMin + ((domain.yMax - domain.yMin) * j) / n
          const y1 = domain.yMin + ((domain.yMax - domain.yMin) * (j + 1)) / n
          const a = figure.toPx(x0, y1)
          const b = figure.toPx(x1, y0)
          if (a === null || b === null) {
            continue
          }
          ctx.fillStyle = colorForField(value, figure.scale.min, figure.scale.max, colorPolicy)
          ctx.fillRect(a.px, a.py, b.px - a.px, b.py - a.py)
        }
      }
    }
    if (figure !== null && figure.kind === 'contour') {
      ctx.strokeStyle = '#1c1917'
      ctx.lineWidth = 1.25
      for (const level of figure.levels) {
        for (const segment of level.segments) {
          ctx.beginPath()
          let started = false
          for (const p of segment) {
            const s = figure.toPx(p.x, p.y)
            if (s === null) {
              continue
            }
            if (!started) {
              ctx.moveTo(s.px, s.py)
              started = true
            } else {
              ctx.lineTo(s.px, s.py)
            }
          }
          ctx.stroke()
        }
      }
      ctx.fillStyle = '#1c1917'
      ctx.font = `10px ${FONT_STACK}`
      ctx.textAlign = 'center'
      for (const label of figure.labels) {
        ctx.fillText(String(label.value), label.px, label.py - 6)
      }
    }
    if (figure !== null && figure.kind === 'vectors' && figure.grid !== null) {
      ctx.lineWidth = 1.5
      for (const arrow of figure.grid.arrows) {
        const paint = colorForField(arrow.magnitude, 0, figure.grid.maxMagnitude, colorPolicy)
        ctx.strokeStyle = paint
        ctx.fillStyle = paint
        const base = figure.toPx(arrow.x, arrow.y)
        const tip = figure.toPx(arrow.x + Math.cos(arrow.angle) * arrow.length, arrow.y + Math.sin(arrow.angle) * arrow.length)
        if (base === null || tip === null) {
          continue
        }
        ctx.beginPath()
        ctx.moveTo(base.px, base.py)
        ctx.lineTo(tip.px, tip.py)
        ctx.stroke()
        const head = 6
        const ang = Math.atan2(tip.py - base.py, tip.px - base.px)
        ctx.beginPath()
        ctx.moveTo(tip.px, tip.py)
        ctx.lineTo(tip.px - head * Math.cos(ang - 0.42), tip.py - head * Math.sin(ang - 0.42))
        ctx.lineTo(tip.px - head * Math.cos(ang + 0.42), tip.py - head * Math.sin(ang + 0.42))
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.restore()
  }

  async function downloadPng(): Promise<void> {
    setExportError(null)
    setBusy(true)
    try {
      if (typeof document === 'undefined') {
        setExportError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      // Fixed 2× raster (1280×880): far below output caps, dimensions exact.
      const canvas = document.createElement('canvas')
      canvas.width = FIELD_VIEW_SIZE.width * 2
      canvas.height = FIELD_VIEW_SIZE.height * 2
      const ctx = canvas.getContext('2d')
      if (ctx === null) {
        setExportError('PNG rendering needs a browser canvas, which is unavailable here.')
        return
      }
      drawToCanvas(ctx, 2)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const bytes = await encodePng(canvas.width, canvas.height, image.data)
      const buffer = new ArrayBuffer(bytes.length)
      new Uint8Array(buffer).set(bytes)
      if (!downloadBlob(sanitizeFigureFilename(title === '' ? 'field' : title, 'png'), new Blob([buffer], { type: 'image/png' }))) {
        setExportError('Download is unavailable in this browser.')
      }
    } finally {
      setBusy(false)
    }
  }

  const error = domainError ?? (compiled !== null && compiled.kind === 'error' ? compiled.error : null) ?? figureError

  const frame = useMemo(() => {
    const transform = createTransform({ xMin: domain.xMin, xMax: domain.xMax, yMin: domain.yMin, yMax: domain.yMax }, FIELD_VIEW_SIZE, false)
    const vertical = ticksForRange(domain.xMin, domain.xMax, 6).map((tick) => ({ px: worldToScreen(transform, tick.value, 0).px, label: tick.label }))
    const horizontal = ticksForRange(domain.yMin, domain.yMax, 5).map((tick) => ({ py: worldToScreen(transform, 0, tick.value).py, label: tick.label }))
    return { vertical, horizontal }
  }, [domain])

  const colorbar = useMemo(() => {
    if (figure !== null && figure.kind === 'heatmap' && figure.scale !== null) {
      return { stops: colorbarStops(figure.scale.min, figure.scale.max, colorPolicy), min: figure.scale.min, max: figure.scale.max, label: 'z' }
    }
    // Vector magnitudes colour from 0 to the sampled maximum (unit mode
    // keeps equal lengths but the same magnitude colours + note).
    if (figure !== null && figure.kind === 'vectors' && figure.grid !== null && figure.grid.maxMagnitude > 0) {
      return { stops: colorbarStops(0, figure.grid.maxMagnitude, colorPolicy), min: 0, max: figure.grid.maxMagnitude, label: '|v|' }
    }
    return null
  }, [figure, colorPolicy])

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Display</span>
          <select
            aria-label="Field display"
            value={mode}
            onChange={(event) => setMode(event.target.value as FieldMode)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="contour">Contours</option>
            <option value="heatmap">Heatmap</option>
            <option value="vectors">Vector arrows</option>
          </select>
        </label>
        {mode === 'vectors' ? (
          <>
            <label className="block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">U(x, y)</span>
              <input type="text" aria-label="U component" value={uSource} onChange={(event) => setUSource(event.target.value)} spellCheck={false} className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
            <label className="block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">V(x, y)</span>
              <input type="text" aria-label="V component" value={vSource} onChange={(event) => setVSource(event.target.value)} spellCheck={false} className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </>
        ) : (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Field z = f(x, y)</span>
            <input type="text" aria-label="Field expression" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        )}
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Title</span>
          <input type="text" aria-label="Field title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Grid resolution</span>
          <select
            aria-label="Field resolution"
            value={resolution}
            onChange={(event) => setResolution(Number(event.target.value))}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FIELD_RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}×{r} ({((r + 1) * (r + 1)).toLocaleString()} evals)
              </option>
            ))}
          </select>
        </label>
        {decimalInput(String(domain.xMin), 'X min', (text) => {
          const v = parseFinite(text)
          if (v !== null) {
            setDomain({ ...domain, xMin: v })
          }
        })}
        {decimalInput(String(domain.xMax), 'X max', (text) => {
          const v = parseFinite(text)
          if (v !== null) {
            setDomain({ ...domain, xMax: v })
          }
        })}
        {decimalInput(String(domain.yMin), 'Y min', (text) => {
          const v = parseFinite(text)
          if (v !== null) {
            setDomain({ ...domain, yMin: v })
          }
        })}
        {decimalInput(String(domain.yMax), 'Y max', (text) => {
          const v = parseFinite(text)
          if (v !== null) {
            setDomain({ ...domain, yMax: v })
          }
        })}
        {mode === 'contour' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Level count</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Contour level count"
              value={String(levelCount)}
              onChange={(event) => {
                const v = Number(event.target.value)
                if (Number.isInteger(v) && v >= 1 && v <= 24) {
                  setLevelCount(v)
                }
              }}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}
        {mode === 'contour' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Exact levels (overrides count)</span>
            <input
              type="text"
              aria-label="Exact contour levels"
              value={levelList}
              onChange={(event) => setLevelList(event.target.value)}
              placeholder="e.g. 1, 2.5, 4"
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Colours</span>
          <select
            aria-label="Colour scale"
            value={colorPolicy}
            onChange={(event) => setColorPolicy(event.target.value as ColorPolicy)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="viridis">Viridis (colour-blind safe)</option>
            <option value="diverging">Diverging blue–grey–red (zero-centred)</option>
            <option value="blue-red">Blue–red (legacy)</option>
          </select>
        </label>
        {mode === 'heatmap' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Scale</span>
            <select
              aria-label="Scale policy"
              value={scalePolicy}
              onChange={(event) => setScalePolicy(event.target.value as ScalePolicy)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Auto (data min–max)</option>
              <option value="symmetric">Symmetric about zero</option>
              <option value="fixed">Fixed bounds</option>
            </select>
          </label>
        )}
        {mode === 'heatmap' && scalePolicy === 'fixed' && decimalInput(fixedMin, 'Fixed min', setFixedMin)}
        {mode === 'heatmap' && scalePolicy === 'fixed' && decimalInput(fixedMax, 'Fixed max', setFixedMax)}
        {mode === 'vectors' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Arrow meaning</span>
            <select
              aria-label="Arrow normalisation"
              value={arrowMode}
              onChange={(event) => setArrowMode(event.target.value as ArrowMode)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="magnitude">Length shows magnitude</option>
              <option value="unit">Equal length (direction only)</option>
            </select>
          </label>
        )}
        <label className="flex items-end gap-2 pb-1 text-xs text-muted">
          <input type="checkbox" aria-label="Show field grid" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} className="h-4 w-4 accent-accent" />
          Show grid
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="text-xs text-danger" data-testid="field-error">
          {error}
        </p>
      )}

      <div className="relative w-full">
        <div className="h-80 w-full md:h-96">
          <svg
            role="img"
            aria-label={`${title}: 2D ${mode} of ${mode === 'vectors' ? `(${uSource}, ${vSource})` : source}`}
            width="100%"
            height="100%"
            viewBox={`0 0 ${FIELD_VIEW_SIZE.width} ${FIELD_VIEW_SIZE.height}`}
            className="block select-none rounded-md border border-line bg-white"
          >
            {figure !== null && figure.kind === 'heatmap' && figure.sampled !== null && figure.scale !== null
              ? figure.sampled.grid.flatMap((value, k) => {
                  if (value === null || value === undefined) {
                    return []
                  }
                  const n = figure.sampled?.resolution ?? 0
                  const i = k % (n + 1)
                  const j = Math.floor(k / (n + 1))
                  if (i >= n || j >= n) {
                    return []
                  }
                  const x0 = domain.xMin + ((domain.xMax - domain.xMin) * i) / n
                  const x1 = domain.xMin + ((domain.xMax - domain.xMin) * (i + 1)) / n
                  const y0 = domain.yMin + ((domain.yMax - domain.yMin) * j) / n
                  const y1 = domain.yMin + ((domain.yMax - domain.yMin) * (j + 1)) / n
                  const a = figure.toPx(x0, y1)
                  const b = figure.toPx(x1, y0)
                  if (a === null || b === null) {
                    return []
                  }
                  return [
                    <rect key={k} x={a.px} y={a.py} width={Math.max(0, b.px - a.px)} height={Math.max(0, b.py - a.py)} fill={colorForField(value, figure.scale?.min ?? 0, figure.scale?.max ?? 1, colorPolicy)} />,
                  ]
                })
              : null}
            {figure !== null && figure.kind === 'contour'
              ? figure.levels.flatMap((level, li) =>
                  level.segments.map((segment, si) => {
                    const pts = segment.flatMap((p) => {
                      const s = figure.toPx(p.x, p.y)
                      return s === null ? [] : [`${s.px.toFixed(1)},${s.py.toFixed(1)}`]
                    })
                    if (pts.length < 2) {
                      return null
                    }
                    return <path key={`${li}-${si}`} d={`M${pts.join('L')}`} fill="none" stroke="#1c1917" strokeWidth={1.25} />
                  }),
                )
              : null}
            {figure !== null && figure.kind === 'contour'
              ? figure.labels.map((label, i) => (
                  <text key={`cl-${i}`} x={label.px} y={label.py - 6} textAnchor="middle" fontSize={10} fill="#1c1917" stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke">
                    {label.value}
                  </text>
                ))
              : null}
            {figure !== null && figure.kind === 'vectors' && figure.grid !== null
              ? figure.grid.arrows.flatMap((arrow, k) => {
                  const base = figure.toPx(arrow.x, arrow.y)
                  const tip = figure.toPx(arrow.x + Math.cos(arrow.angle) * arrow.length, arrow.y + Math.sin(arrow.angle) * arrow.length)
                  if (base === null || tip === null) {
                    return []
                  }
                  const hx = tip.px - base.px
                  const hy = tip.py - base.py
                  const head = 6
                  const ang = Math.atan2(hy, hx)
                  const color = colorForField(arrow.magnitude, 0, figure.grid?.maxMagnitude ?? 0, colorPolicy)
                  return [
                    <g key={k}>
                      <line x1={base.px} y1={base.py} x2={tip.px} y2={tip.py} stroke={color} strokeWidth={1.5} />
                      <polygon
                        points={`${tip.px},${tip.py} ${tip.px - head * Math.cos(ang - 0.42)},${tip.py - head * Math.sin(ang - 0.42)} ${tip.px - head * Math.cos(ang + 0.42)},${tip.py - head * Math.sin(ang + 0.42)}`}
                        fill={color}
                      />
                    </g>,
                  ]
                })
              : null}
            {showGrid && (
              <g stroke="#e7e5e4" strokeWidth={1} aria-hidden="true">
                {frame.vertical.map((tick, i) => (
                  <line key={`gx-${i}`} x1={tick.px} y1={0} x2={tick.px} y2={FIELD_VIEW_SIZE.height} />
                ))}
                {frame.horizontal.map((tick, i) => (
                  <line key={`gy-${i}`} x1={0} y1={tick.py} x2={FIELD_VIEW_SIZE.width} y2={tick.py} />
                ))}
              </g>
            )}
            <g fontSize={11} fill="#736c67" aria-hidden="true">
              {frame.vertical.map((tick, i) => (
                <text key={`tx-${i}`} x={Math.min(Math.max(tick.px, 20), FIELD_VIEW_SIZE.width - 4)} y={FIELD_VIEW_SIZE.height - 6} textAnchor="middle">
                  {tick.label}
                </text>
              ))}
              {frame.horizontal.map((tick, i) => (
                <text key={`ty-${i}`} x={6} y={Math.min(Math.max(tick.py + 4, 12), FIELD_VIEW_SIZE.height - 4)} textAnchor="start">
                  {tick.label}
                </text>
              ))}
            </g>
            {colorbar !== null && (
              <g fontSize={10} fill="#1c1917">
                {colorbar.stops.map((stop, i) => (
                  <rect
                    key={i}
                    x={FIELD_VIEW_SIZE.width - 30}
                    y={40 + ((FIELD_VIEW_SIZE.height - 120) * i) / colorbar.stops.length}
                    width={12}
                    height={(FIELD_VIEW_SIZE.height - 120) / colorbar.stops.length + 0.5}
                    fill={stop.color}
                  />
                ))}
                <text x={FIELD_VIEW_SIZE.width - 32} y={48} textAnchor="end">{colorbar.max.toPrecision(3)}</text>
                <text x={FIELD_VIEW_SIZE.width - 32} y={FIELD_VIEW_SIZE.height - 52} textAnchor="end">{colorbar.min.toPrecision(3)}</text>
              </g>
            )}
          </svg>
        </div>
      </div>
      <p className="text-xs text-muted" data-testid="field-summary">
        {figure !== null && figure.kind === 'heatmap' && figure.sampled !== null ? `${figure.sampled.resolution}×${figure.sampled.resolution} cells` : null}
        {figure !== null && figure.kind === 'heatmap' && figure.scale !== null ? ` · scale [${figure.scale.min}, ${figure.scale.max}]${figure.scale.fallback ? ' (fallback)' : ''}` : null}
        {figure !== null && figure.kind === 'contour' ? `${figure.levels.length} levels, ${figure.levels.reduce((t, l) => t + l.segments.length, 0)} segments` : null}
        {figure !== null && figure.kind === 'vectors' && figure.grid !== null ? `${figure.grid.arrows.length} arrows (every ${figure.grid.stride}${figure.grid.stride === 1 ? 'st' : figure.grid.stride === 2 ? 'nd' : figure.grid.stride === 3 ? 'rd' : 'th'} grid arrow), max |v| = ${figure.grid.maxMagnitude.toPrecision(4)}${arrowMode === 'unit' ? '; equal length shows direction only' : '; colour shows magnitude'}${figure.sampled.holes > 0 ? `, ${figure.sampled.holes} invalid dropped` : ''}` : null}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void downloadSvg()} title="Download this field as SVG" variant="ghost" className="px-2 py-0.5 text-xs">
          Export SVG
        </Button>
        <Button onClick={() => void downloadPng()} title="Download this field as PNG (1280×880)" variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy}>
          {busy ? 'Rendering…' : 'Export PNG'}
        </Button>
        {onRemove !== undefined && (
          <Button onClick={onRemove} title="Remove this field" variant="ghost" className="px-2 py-0.5 text-xs">
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
