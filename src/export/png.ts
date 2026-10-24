import type { ExportScene } from './scene.ts'

/**
 * PNG figure renderer: draws the export scene onto a 2D canvas context,
 * then encodes minimal PNG bytes (own encoder: signature, IHDR, IDAT,
 * IEND with CRC32; deflate via CompressionStream when available,
 * stored blocks otherwise — valid everywhere, no dependency).
 *
 * Figure colours are fixed light-theme values so SVG and PNG agree and
 * output is predictable in either app theme.
 */

export const GRID_COLOR = '#e7e5e4'
export const AXIS_COLOR = '#8e8985'
export const MUTED_COLOR = '#736c67'
export const INK_COLOR = '#1c1917'
export const ORIGIN_COLOR = '#4f46e5'
export const WHITE = '#ffffff'
const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

/** Output caps: never allocate unbounded images. */
export const MAX_EXPORT_DIMENSION = 2400
export const MAX_EXPORT_AREA = 6000000

export type Canvas2DLike = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'scale' | 'translate' | 'rotate' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'fillRect' | 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'stroke' | 'setLineDash' | 'fillText' | 'font' | 'textAlign' | 'textBaseline' | 'arc' | 'fill' | 'globalAlpha' | 'rect' | 'clip'
>

export function resolveExportScale(requested: number, baseWidth: number, baseHeight: number): { scale: number; capped: boolean } {
  const fitting = Math.min(requested, MAX_EXPORT_DIMENSION / Math.max(1, baseWidth), Math.sqrt(MAX_EXPORT_AREA / Math.max(1, baseWidth * baseHeight)))
  // Snap down to quarter steps so output never exceeds the caps.
  const scale = Math.max(0.25, Math.floor(Math.min(requested, fitting) * 4) / 4)
  return { scale, capped: scale < requested }
}

function dashParts(dash: string): number[] {
  if (dash.trim() === '') {
    return []
  }
  return dash
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/** Draw the scene in CSS-pixel units; the caller pre-scales the context. */
export function drawSceneToCanvas(ctx: Canvas2DLike, scene: ExportScene): void {
  const totalHeight = scene.height + scene.legendHeight + scene.captionHeight
  if (scene.background === 'white') {
    ctx.fillStyle = WHITE
    ctx.fillRect(0, 0, scene.width, totalHeight)
  } else {
    ctx.clearRect(0, 0, scene.width, totalHeight)
  }

  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  for (const line of scene.gridLines) {
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
  }
  ctx.stroke()

  // Fills sit above the grid and below the axes — the same order the live
  // view and the SVG renderer use, so the two formats agree.
  ctx.save()
  ctx.globalAlpha = 0.15
  for (const fill of scene.fills) {
    ctx.fillStyle = fill.color
    ctx.fillRect(fill.x, fill.y, fill.width, fill.height)
  }
  ctx.restore()

  ctx.strokeStyle = AXIS_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (const axis of scene.axes) {
    ctx.moveTo(axis.x1, axis.y1)
    ctx.lineTo(axis.x2, axis.y2)
  }
  ctx.stroke()

  if (scene.origin !== null) {
    ctx.fillStyle = ORIGIN_COLOR
    ctx.beginPath()
    ctx.arc(scene.origin.px, scene.origin.py, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = MUTED_COLOR
  ctx.font = `11px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  for (const tick of scene.tickLabels) {
    // Same anchoring as the SVG renderer: x ticks 'middle', y ticks 'start'.
    ctx.textAlign = tick.anchor === 'middle' ? 'center' : 'left'
    ctx.fillText(tick.text, tick.x, tick.y)
  }

  for (const bar of scene.bars) {
    ctx.fillStyle = bar.color
    ctx.globalAlpha = 0.75
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height)
  }
  ctx.globalAlpha = 1

  if (scene.rules.length > 0) {
    for (const rule of scene.rules) {
      ctx.strokeStyle = rule.color
      ctx.lineWidth = rule.width
      ctx.setLineDash(dashParts(rule.dash))
      ctx.beginPath()
      ctx.moveTo(rule.x1, rule.y1)
      ctx.lineTo(rule.x2, rule.y2)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // Curve runs are plot-frame geometry: the inner plot rectangle
  // (0,0,scene.width,scene.height) — the pixel box the scene's transform
  // maps world coordinates into. The legend and caption bands extend the
  // canvas below that rectangle and stay outside the clip. The scene clamps
  // pole-adjacent world points to a finite box, which can still map beyond
  // the rectangle; the live viewport clips the same runs and the export
  // must too. Clip and restore so later layers (points, legend, labels)
  // draw unclipped.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, scene.width, scene.height)
  ctx.clip()
  for (const run of scene.curveRuns) {
    if (run.points.length < 2) {
      continue
    }
    ctx.strokeStyle = run.color
    ctx.lineWidth = run.width
    ctx.setLineDash(dashParts(run.dash))
    ctx.beginPath()
    const first = run.points[0]
    if (first !== undefined) {
      ctx.moveTo(first.px, first.py)
      for (const p of run.points.slice(1)) {
        ctx.lineTo(p.px, p.py)
      }
    }
    ctx.stroke()
  }
  ctx.restore()
  ctx.setLineDash([])

  for (const point of scene.points) {
    ctx.fillStyle = point.color
    if (point.shape === 'square') {
      ctx.fillRect(point.px - 3.5, point.py - 3.5, 7, 7)
    } else if (point.shape === 'triangle') {
      ctx.beginPath()
      ctx.moveTo(point.px, point.py - 5)
      ctx.lineTo(point.px + 5, point.py + 4)
      ctx.lineTo(point.px - 5, point.py + 4)
      ctx.closePath()
      ctx.fill()
    } else if (point.shape === 'diamond') {
      ctx.beginPath()
      ctx.moveTo(point.px, point.py - 5)
      ctx.lineTo(point.px + 5, point.py)
      ctx.lineTo(point.px, point.py + 5)
      ctx.lineTo(point.px - 5, point.py)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(point.px, point.py, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const marker of scene.markers) {
    if (marker.kind === 'intersection') {
      ctx.fillStyle = ORIGIN_COLOR
      ctx.beginPath()
      ctx.moveTo(marker.px, marker.py - 7)
      ctx.lineTo(marker.px + 7, marker.py)
      ctx.lineTo(marker.px, marker.py + 7)
      ctx.lineTo(marker.px - 7, marker.py)
      ctx.closePath()
      ctx.fill()
    } else if (marker.kind === 'extremum') {
      ctx.fillStyle = WHITE
      ctx.strokeStyle = ORIGIN_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(marker.px, marker.py - 7)
      ctx.lineTo(marker.px + 7, marker.py + 5)
      ctx.lineTo(marker.px - 7, marker.py + 5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.fillStyle = WHITE
      ctx.strokeStyle = ORIGIN_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(marker.px, marker.py, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.fillStyle = MUTED_COLOR
    ctx.font = `10px ${FONT_STACK}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(marker.label, marker.px + 9, marker.py - 9)
  }

  if (scene.legend.length > 0) {
    const top = scene.height + 10
    ctx.font = `12px ${FONT_STACK}`
    ctx.textAlign = 'left'
    scene.legend.forEach((entry, index) => {
      const y = top + index * 18 + 12
      ctx.fillStyle = entry.color
      ctx.strokeStyle = entry.color
      if (entry.shape !== undefined && entry.dash === '') {
        const cx = 22
        const cy = y - 4
        if (entry.shape === 'square') {
          ctx.fillRect(cx - 3.5, cy - 3.5, 7, 7)
        } else if (entry.shape === 'triangle') {
          ctx.beginPath()
          ctx.moveTo(cx, cy - 5)
          ctx.lineTo(cx + 5, cy + 4)
          ctx.lineTo(cx - 5, cy + 4)
          ctx.closePath()
          ctx.fill()
        } else if (entry.shape === 'diamond') {
          ctx.beginPath()
          ctx.moveTo(cx, cy - 5)
          ctx.lineTo(cx + 5, cy)
          ctx.lineTo(cx, cy + 5)
          ctx.lineTo(cx - 5, cy)
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        ctx.lineWidth = 2.5
        ctx.setLineDash(dashParts(entry.dash))
        ctx.beginPath()
        ctx.moveTo(8, y - 4)
        ctx.lineTo(36, y - 4)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.fillStyle = INK_COLOR
      ctx.fillText(entry.label, 44, y)
    })
  }

  if (scene.captionLines.length > 0) {
    const top = scene.height + scene.legendHeight + 8
    ctx.font = `11px ${FONT_STACK}`
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED_COLOR
    scene.captionLines.forEach((line, index) => {
      ctx.fillText(line, 8, top + index * 14 + 11)
    })
  }

  if (scene.title !== '' || scene.xLabel !== '' || scene.yLabel !== '') {
    ctx.fillStyle = INK_COLOR
    ctx.textAlign = 'center'
    if (scene.title !== '') {
      ctx.font = `600 12px ${FONT_STACK}`
      ctx.fillText(scene.title, scene.width / 2, 16)
    }
    ctx.font = `12px ${FONT_STACK}`
    if (scene.xLabel !== '') {
      ctx.fillText(scene.xLabel, scene.width / 2, scene.height - 6)
    }
    if (scene.yLabel !== '') {
      ctx.save()
      ctx.translate(12, scene.height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(scene.yLabel, 0, 0)
      ctx.restore()
    }
  }
}

// --- Minimal PNG encoder ---

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i) ?? 0
  }
  out.set(data, 8)
  const crc = crc32(out.slice(4, 8 + data.length))
  view.setUint32(8 + data.length, crc)
  return out
}

function storedBlocks(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  for (let offset = 0; offset < raw.length; offset += 65535) {
    const piece = raw.slice(offset, offset + 65535)
    const last = offset + piece.length >= raw.length ? 1 : 0
    const header = new Uint8Array(5)
    header[0] = last
    const view = new DataView(header.buffer)
    view.setUint16(1, piece.length, true)
    view.setUint16(3, 0xffff - piece.length, true)
    parts.push(header, piece)
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Adler-32 checksum (RFC 1950) over the uncompressed bytes. */
function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const byte of bytes) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Zlib-wrap stored blocks so IDAT is a valid RFC-1950 stream everywhere. */
function zlibStoredBlocks(raw: Uint8Array): Uint8Array {
  const stored = storedBlocks(raw)
  const out = new Uint8Array(2 + stored.length + 4)
  out[0] = 0x78 // CMF: deflate, 32K window
  out[1] = 0x01 // FLG: fastest; (0x7801 % 31) === 0
  out.set(stored, 2)
  new DataView(out.buffer).setUint32(2 + stored.length, adler32(raw))
  return out
}

async function deflateData(raw: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new CompressionStream('deflate')
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    const chunks: Uint8Array[] = []
    const pumping = (async (): Promise<void> => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        chunks.push(value)
      }
    })()
    const backing: ArrayBuffer = new ArrayBuffer(raw.length)
    new Uint8Array(backing).set(raw)
    await writer.write(new Uint8Array(backing))
    await writer.close()
    await pumping
    const total = chunks.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const part of chunks) {
      out.set(part, at)
      at += part.length
    }
    return out
  } catch {
    return zlibStoredBlocks(raw)
  }
}

/** Encode RGBA pixels as PNG bytes. Dimensions must be positive integers. */
export async function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('encodePng requires positive integer dimensions.')
  }
  if (rgba.length !== width * height * 4) {
    throw new Error('Pixel buffer does not match dimensions.')
  }
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 4)] = 0 // filter type 0 (None)
    raw.set(rgba.slice(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1)
  }
  const compressed = await deflateData(raw)

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/**
 * Render the scene to a PNG Blob at the requested scale (browser only).
 * Returns null where canvas is unavailable — the caller shows guidance.
 */
export async function exportPngBlob(scene: ExportScene, scale: number): Promise<Blob | null> {
  try {
    if (typeof document === 'undefined') {
      return null
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(scene.width * scale))
    canvas.height = Math.max(1, Math.round((scene.height + scene.legendHeight + scene.captionHeight) * scale))
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      return null
    }
    ctx.save()
    ctx.scale(scale, scale)
    drawSceneToCanvas(ctx, scene)
    ctx.restore()
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const bytes = await encodePng(canvas.width, canvas.height, image.data)
    const buffer = new ArrayBuffer(bytes.length)
    new Uint8Array(buffer).set(bytes)
    return new Blob([buffer], { type: 'image/png' })
  } catch {
    return null
  }
}
