import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { lightCurveHex } from '../graph/palette.ts'
import { sanitizeExportFilename, sanitizeFigureFilename } from './filenames.ts'
import { drawSceneToCanvas, encodePng, exportPngBlob, resolveExportScale, type Canvas2DLike } from './png.ts'
import { buildExportScene, type ExportCurveInput, type ExportScene } from './scene.ts'
import { renderExportSvg } from './svg.ts'

const WORLD = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
const SIZE = { width: 800, height: 600 }
const CURVES = [
  {
    label: 'x^2',
    styleIndex: 0,
    segments: [
      [
        { x: -3, y: 9 },
        { x: 0, y: 0 },
        { x: 3, y: 9 },
      ],
    ],
  },
  {
    label: '1/x',
    styleIndex: 1,
    segments: [
      [
        { x: -5, y: -0.2 },
        { x: -1, y: -1 },
      ],
      [
        { x: 1, y: 1 },
        { x: 5, y: 0.2 },
      ],
    ],
  },
]

function testScene(): ExportScene {
  return buildExportScene(WORLD, SIZE, CURVES, {
    background: 'white',
    showGrid: true,
    equalAspect: false,
    includeLegend: true,
    resolveColor: lightCurveHex,
  })
}

function parseChunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks: Array<{ type: string; data: Uint8Array }> = []
  let at = 8
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (at < bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(bytes[at + 4] ?? 0, bytes[at + 5] ?? 0, bytes[at + 6] ?? 0, bytes[at + 7] ?? 0)
    chunks.push({ type, data: bytes.slice(at + 8, at + 8 + length) })
    at += 12 + length
  }
  return chunks
}

/** Concatenated IDAT payload (zlib stream) from encoded PNG bytes. */
function idatData(bytes: Uint8Array): Uint8Array {
  const parts = parseChunks(bytes).filter((c) => c.type === 'IDAT').map((c) => c.data)
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const joined = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    joined.set(part, at)
    at += part.length
  }
  return joined
}

interface ParsedChunk {
  type: string
  data: Uint8Array
  length: number
  storedCrc: number
  offset: number
}

/**
 * Test-only PNG chunk parser. It validates the signature and every chunk
 * boundary, then exposes the stored CRC so tests can compare it with an
 * independent implementation.
 */
function parseChunksStrict(bytes: Uint8Array): ParsedChunk[] {
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: ParsedChunk[] = []
  let at = 8
  while (at < bytes.length) {
    if (bytes.length - at < 12) {
      throw new Error(`Truncated PNG chunk header at byte ${at}`)
    }
    const length = view.getUint32(at)
    if (length > bytes.length - at - 12) {
      throw new Error(`PNG chunk at byte ${at} exceeds the file boundary`)
    }
    const type = String.fromCharCode(bytes[at + 4] ?? 0, bytes[at + 5] ?? 0, bytes[at + 6] ?? 0, bytes[at + 7] ?? 0)
    const data = bytes.slice(at + 8, at + 8 + length)
    const storedCrc = view.getUint32(at + 8 + length)
    chunks.push({ type, data, length, storedCrc, offset: at })
    at += 12 + length
    if (type === 'IEND' && at !== bytes.length) {
      throw new Error(`Trailing bytes after IEND at byte ${at}`)
    }
  }
  if (chunks.length === 0 || chunks[chunks.length - 1]?.type !== 'IEND') {
    throw new Error('PNG is missing its IEND chunk')
  }
  return chunks
}

/** Independent bitwise CRC32; deliberately does not use the production table. */
function referenceCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunkCrcInput(chunk: ParsedChunk): Uint8Array {
  const input = new Uint8Array(4 + chunk.data.length)
  for (let i = 0; i < 4; i += 1) {
    input[i] = chunk.type.charCodeAt(i)
  }
  input.set(chunk.data, 4)
  return input
}

/** Assert every stored chunk CRC against the independent reference. */
function expectValidChunkCrcs(bytes: Uint8Array): ParsedChunk[] {
  const chunks = parseChunksStrict(bytes)
  for (const chunk of chunks) {
    expect(chunk.storedCrc).toBe(referenceCrc32(chunkCrcInput(chunk)))
  }
  return chunks
}

function testRgba(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      rgba[at] = (x * 7 + y * 3) & 0xff
      rgba[at + 1] = (x * 3 + y * 11) & 0xff
      rgba[at + 2] = (x * 5 + y * 5) & 0xff
      rgba[at + 3] = 255
    }
  }
  return rgba
}

/** jsdom's Blob lacks arrayBuffer(); FileReader reads the same bytes. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
      } else {
        reject(new Error('Expected an ArrayBuffer from Blob'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Blob read failed'))
    reader.readAsArrayBuffer(blob)
  })
}

describe('export scene', () => {
  it('builds grid, axes, ticks, runs, and legend from world state', () => {
    const scene = testScene()
    expect(scene.width).toBe(800)
    expect(scene.height).toBe(600)
    expect(scene.gridLines.length).toBeGreaterThan(0)
    expect(scene.axes).toHaveLength(2)
    expect(scene.tickLabels.length).toBeGreaterThan(0)
    expect(scene.origin).not.toBe(null)
    // Three sampler segments → three runs; separation preserved.
    expect(scene.curveRuns).toHaveLength(3)
    expect(scene.legend.map((entry) => entry.label)).toEqual(['x^2', '1/x'])
    expect(scene.legend[0]?.color).toBe('#1d4ed8')
  })

  it('omits the legend when there are no curves', () => {
    const scene = buildExportScene(WORLD, SIZE, [], { background: 'white', showGrid: true, equalAspect: false, includeLegend: true })
    expect(scene.legend).toHaveLength(0)
    expect(scene.legendHeight).toBe(0)
  })
})

describe('SVG export', () => {
  it('produces a valid standalone figure with expected structure', () => {
    const text = renderExportSvg(testScene(), 1)
    const document = new DOMParser().parseFromString(text, 'text/xml')
    const root = document.documentElement
    expect(root.tagName).toBe('svg')
    expect(root.getAttribute('width')).toBe('800')
    expect(root.querySelector('parsererror')).toBe(null)
    // One path per curve run; tick + legend labels present.
    expect(root.querySelectorAll('path').length).toBe(3)
    const texts = Array.from(root.querySelectorAll('text')).map((t) => t.textContent ?? '')
    expect(texts.some((t) => t.includes('x^2'))).toBe(true)
    expect(texts.some((t) => t.includes('1/x'))).toBe(true)
    expect(texts.some((t) => t === '0')).toBe(true)
  })

  it('contains no application chrome', () => {
    const text = renderExportSvg(testScene(), 1)
    for (const marker of ['Unsaved', 'Expressions', 'Inspector', '<button', 'Switch to', 'placeholder']) {
      expect(text).not.toContain(marker)
    }
  })

  it('escapes hostile user text instead of injecting markup', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror=y>'
    const scene = buildExportScene(
      WORLD,
      SIZE,
      [{ label: hostile, styleIndex: 0, segments: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]] }],
      { background: 'white', showGrid: false, equalAspect: false, includeLegend: true },
      [],
      { text: { title: hostile, caption: hostile, xLabel: hostile, yLabel: hostile } },
    )
    const text = renderExportSvg(scene, 1)
    expect(text).not.toContain('<script>')
    expect(text).not.toContain('<img src=x')
    expect(text).toContain('&lt;script&gt;')
    // Structure survives: still parses, legend entry present (escaped).
    const document = new DOMParser().parseFromString(text, 'text/xml')
    expect(document.querySelector('parsererror')).toBe(null)
    expect(document.documentElement.textContent).toContain('<script>alert(1)</script>')
  })

  it('scales dimensions through the viewBox', () => {
    const text = renderExportSvg(testScene(), 2)
    const document = new DOMParser().parseFromString(text, 'text/xml')
    expect(document.documentElement.getAttribute('width')).toBe('1600')
    expect(document.documentElement.getAttribute('viewBox')).toContain('800')
  })
})

describe('filenames and output limits', () => {
  it('sanitizes meaningful filenames', () => {
    expect(sanitizeExportFilename('My Plot 2024!', 'svg')).toBe('my-plot-2024-graph.svg')
    expect(sanitizeExportFilename('   ', 'png')).toBe('graphcraft-graph-graph.png')
    expect(sanitizeExportFilename('a'.repeat(100), 'svg')).toContain('-graph.svg')
    // Even reserved device stems stay safe: the suffix moves the stem off the reserved list.
    expect(sanitizeExportFilename('CON', 'svg')).toBe('con-graph.svg')
  })

  it('keeps figure filenames inside the destination (no traversal)', () => {
    expect(sanitizeFigureFilename('../../evil', 'svg')).toBe('evil-figure.svg')
    expect(sanitizeFigureFilename('C:\\temp\\x', 'png')).toBe('ctempx-figure.png')
    expect(sanitizeFigureFilename('a/b\\c:d.svg', 'csv')).toBe('abcdsvg-figure.csv')
    expect(sanitizeFigureFilename('', 'svg')).toBe('graphcraft-data-figure.svg')
    for (const name of ['evil-figure.svg', 'ctempx-figure.png', 'abcdsvg-figure.csv', 'graphcraft-data-figure.svg']) {
      expect(name).not.toMatch(/[\\/ :]/)
    }
  })

  it('caps scale and dimensions deterministically', () => {
    expect(resolveExportScale(3, 800, 600)).toEqual({ scale: 3, capped: false })
    expect(resolveExportScale(2, 800, 600).capped).toBe(false)
    const huge = resolveExportScale(3, 5000, 4000)
    expect(huge.capped).toBe(true)
    expect(huge.scale * 5000).toBeLessThanOrEqual(2400 + 1)
  })
})

describe('PNG encoder', () => {
  it('writes decodable PNG bytes with expected dimensions', async () => {
    const width = 4
    const height = 3
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255
      rgba[i + 1] = 0
      rgba[i + 2] = 0
      rgba[i + 3] = 255
    }
    const bytes = await encodePng(width, height, rgba)
    const chunks = parseChunks(bytes)
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    const ihdr = chunks[0]?.data
    if (ihdr === undefined) {
      throw new Error('Missing IHDR')
    }
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength)
    expect(view.getUint32(0)).toBe(width)
    expect(view.getUint32(4)).toBe(height)

    // Pixel invariant: inflate the image data and compare every pixel.
    const idat = chunks
      .filter((c) => c.type === 'IDAT')
      .map((c) => c.data)
      .reduce((all, part) => {
        const joined = new Uint8Array(all.length + part.length)
        joined.set(all)
        joined.set(part, all.length)
        return joined
      }, new Uint8Array(0))
    const raw = inflateSync(idat)
    expect(raw.length).toBe(height * (1 + width * 4))
    for (let y = 0; y < height; y += 1) {
      expect(raw[y * (1 + width * 4)]).toBe(0) // filter byte
      for (let x = 0; x < width; x += 1) {
        const at = y * (1 + width * 4) + 1 + x * 4
        expect([raw[at], raw[at + 1], raw[at + 2], raw[at + 3]]).toEqual([255, 0, 0, 255])
      }
    }
  })

  it('writes standards-compliant CRC32s for every chunk', async () => {
    const width = 4
    const height = 3
    const rgba = testRgba(width, height)
    const bytes = await encodePng(width, height, rgba)
    const chunks = expectValidChunkCrcs(bytes)
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    const ihdr = chunks[0]?.data
    if (ihdr === undefined) {
      throw new Error('Missing IHDR')
    }
    expect(ihdr).toHaveLength(13)
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength)
    expect(view.getUint32(0)).toBe(width)
    expect(view.getUint32(4)).toBe(height)
    expect(ihdr[8]).toBe(8) // bit depth
    expect(ihdr[9]).toBe(6) // RGBA
    expect(ihdr[10]).toBe(0) // compression
    expect(ihdr[11]).toBe(0) // filter
    expect(ihdr[12]).toBe(0) // interlace
    expect(chunks[chunks.length - 1]?.storedCrc).toBe(0xae426082)

    const raw = inflateSync(idatData(bytes))
    expect(raw.length).toBe(height * (1 + width * 4))
    for (let y = 0; y < height; y += 1) {
      expect(raw[y * (1 + width * 4)]).toBe(0)
    }
    for (let i = 0; i < rgba.length; i += 4) {
      const at = Math.floor(i / (width * 4)) * (1 + width * 4) + 1 + (i % (width * 4))
      expect([raw[at], raw[at + 1], raw[at + 2], raw[at + 3]]).toEqual([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]])
    }
  })

  it('keeps CRCs valid for simple and complex figure scenes', async () => {
    const simple = buildExportScene(
      WORLD,
      { width: 480, height: 320 },
      [CURVES[0]!],
      { background: 'white', showGrid: true, equalAspect: false, includeLegend: false, resolveColor: lightCurveHex },
    )
    const scenes = [simple, testScene()]
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string): CanvasRenderingContext2D | null {
      if (contextId !== '2d') {
        return null
      }
      const { ctx } = stubContext()
      return Object.assign(ctx, {
        getImageData: (_sx: number, _sy: number, width: number, height: number): ImageData => ({
          data: testRgba(width, height),
          width,
          height,
          colorSpace: 'srgb',
        }),
      }) as unknown as CanvasRenderingContext2D
    } as typeof HTMLCanvasElement.prototype.getContext
    try {
      for (const scene of scenes) {
        const blob = await exportPngBlob(scene, 1)
        expect(blob).not.toBeNull()
        if (blob === null) {
          throw new Error('Expected a PNG blob')
        }
        const bytes = await blobBytes(blob)
        const chunks = expectValidChunkCrcs(bytes)
        expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
        const height = scene.height + scene.legendHeight + scene.captionHeight
        const ihdr = chunks[0]?.data
        if (ihdr === undefined) {
          throw new Error('Missing IHDR')
        }
        const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength)
        expect(view.getUint32(0)).toBe(scene.width)
        expect(view.getUint32(4)).toBe(height)
        const raw = inflateSync(idatData(bytes))
        expect(raw.length).toBe(height * (1 + scene.width * 4))
        for (let y = 0; y < height; y += 1) {
          expect(raw[y * (1 + scene.width * 4)]).toBe(0)
        }
        // Spot-check the encoded pixels at the first and last RGBA positions.
        const first = 1
        expect([raw[first], raw[first + 1], raw[first + 2], raw[first + 3]]).toEqual([0, 0, 0, 255])
        const lastRow = (height - 1) * (1 + scene.width * 4)
        const last = lastRow + 1 + (scene.width - 1) * 4
        expect([raw[last], raw[last + 1], raw[last + 2], raw[last + 3]]).toEqual([
          ((scene.width - 1) * 7 + (height - 1) * 3) & 0xff,
          ((scene.width - 1) * 3 + (height - 1) * 11) & 0xff,
          ((scene.width - 1) * 5 + (height - 1) * 5) & 0xff,
          255,
        ])
      }
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  it('rejects bad dimensions and mismatched buffers', async () => {
    await expect(encodePng(0, 4, new Uint8ClampedArray(0))).rejects.toThrow()
    await expect(encodePng(2, 2, new Uint8ClampedArray(4))).rejects.toThrow()
  })
})

interface RecordedCall {
  op: string
  detail: string
  align?: string
  font?: string
  x?: number
}

function stubContext(): { ctx: Canvas2DLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  let fill = ''
  let stroke = ''
  let font = ''
  let align = ''
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save: () => {},
    restore: () => {},
    scale: () => {},
    fillRect: () => {
      calls.push({ op: 'fillRect', detail: fill })
    },
    clearRect: () => {
      calls.push({ op: 'clearRect', detail: '' })
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    translate: () => {},
    rotate: () => {},
    rect: () => {},
    clip: () => {},
    stroke: () => {
      calls.push({ op: 'stroke', detail: stroke })
    },
    setLineDash: () => {},
    arc: () => {},
    fill: () => {},
    fillText: (text: string, x?: number) => {
      calls.push({ op: 'fillText', detail: `${fill}:${text}`, align, font, x: x ?? 0 })
    },
  }
  return {
    calls,
    ctx: new Proxy(ctx, {
      set(target, property: string, value: unknown): boolean {
        if (property === 'fillStyle' && typeof value === 'string') {
          fill = value
        }
        if (property === 'strokeStyle' && typeof value === 'string') {
          stroke = value
        }
        if (property === 'font' && typeof value === 'string') {
          font = value
        }
        if (property === 'textAlign' && typeof value === 'string') {
          align = value
        }
        return Reflect.set(target, property, value)
      },
    }) as unknown as Canvas2DLike,
  }
}

describe('canvas drawing', () => {
  it('paints background, grid, curves with colours, labels, and legend', () => {
    const { ctx, calls } = stubContext()
    drawSceneToCanvas(ctx, testScene())

    const ops = calls.map((c) => c.op)
    expect(ops).toContain('fillRect') // solid white background
    expect(calls.filter((c) => c.op === 'stroke' && c.detail === '#1d4ed8').length).toBeGreaterThan(0)
    expect(calls.filter((c) => c.op === 'stroke' && c.detail === '#b91c1c').length).toBeGreaterThan(0)
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.detail)
    expect(texts.some((t) => t.includes('x^2'))).toBe(true) // legend entry
    expect(texts.some((t) => t === '#736c67:0')).toBe(true) // muted tick label
  })

  it('clears instead of painting for transparent backgrounds', () => {
    const { ctx, calls } = stubContext()
    const scene = buildExportScene(WORLD, SIZE, CURVES, { background: 'transparent', showGrid: true, equalAspect: false, includeLegend: false })
    drawSceneToCanvas(ctx, scene)
    expect(calls.some((c) => c.op === 'clearRect')).toBe(true)
    expect(calls.some((c) => c.op === 'fillRect')).toBe(false)
  })

  it('carries region fills from scene to SVG and canvas', () => {
    const withRegions = CURVES.map((curve, index) =>
      index === 0 ? { ...curve, regions: [{ x0: -5, y0: -5, x1: 5, y1: 0 }] } : curve,
    )
    const scene = buildExportScene(WORLD, SIZE, withRegions, { background: 'white', showGrid: true, equalAspect: false, includeLegend: true, resolveColor: lightCurveHex })
    expect(scene.fills.length).toBeGreaterThan(0)
    for (const fill of scene.fills) {
      expect(fill.x).toBeGreaterThanOrEqual(0)
      expect(fill.y).toBeGreaterThanOrEqual(0)
      expect(fill.x + fill.width).toBeLessThanOrEqual(800 + 1e-6)
      expect(fill.y + fill.height).toBeLessThanOrEqual(600 + 1e-6)
    }

    const text = renderExportSvg(scene, 1)
    const document = new DOMParser().parseFromString(text, 'text/xml')
    const filled = Array.from(document.querySelectorAll('rect')).filter((r) => r.getAttribute('fill-opacity') === '0.15')
    expect(filled.length).toBe(scene.fills.length)

    const stubbed = stubContext()
    drawSceneToCanvas(stubbed.ctx, scene)
    expect(stubbed.calls.some((c) => c.op === 'fillRect' && c.detail === '#1d4ed8')).toBe(true)
    // Same paint order in both renderers: grid, then fills, then axes.
    expect(text.indexOf('#e7e5e4')).toBeLessThan(text.indexOf('fill-opacity="0.15"'))
    expect(text.indexOf('fill-opacity="0.15"')).toBeLessThan(text.indexOf('#8e8985'))
    const gridAt = stubbed.calls.findIndex((c) => c.op === 'stroke' && c.detail === '#e7e5e4')
    const fillAt = stubbed.calls.findIndex((c) => c.op === 'fillRect' && c.detail === '#1d4ed8')
    const axisAt = stubbed.calls.findIndex((c) => c.op === 'stroke' && c.detail === '#8e8985')
    expect(gridAt).toBeGreaterThanOrEqual(0)
    expect(fillAt).toBeGreaterThan(gridAt)
    expect(axisAt).toBeGreaterThan(fillAt)
  })

  it('anchors tick labels and sizes the title exactly like the SVG renderer', () => {
    const { ctx, calls } = stubContext()
    const scene = buildExportScene(
      WORLD,
      SIZE,
      CURVES,
      { background: 'white', showGrid: true, equalAspect: false, includeLegend: true, resolveColor: lightCurveHex },
      [],
      { text: { title: 'Trial one' } },
    )
    drawSceneToCanvas(ctx, scene)
    const tickCalls = calls.filter((c) => c.op === 'fillText' && (c.font ?? '').startsWith('11px'))
    expect(tickCalls.length).toBeGreaterThan(0)
    for (const call of tickCalls) {
      // x ticks anchor 'middle'; y ticks anchor 'start' at the 6px inset.
      expect(call.align).toBe(call.x === 6 ? 'left' : 'center')
    }
    expect(tickCalls.some((c) => c.x === 6)).toBe(true)
    expect(tickCalls.some((c) => c.x !== 6)).toBe(true)
    const title = calls.find((c) => c.op === 'fillText' && c.detail.endsWith(':Trial one'))
    expect((title?.font ?? '').startsWith('600 12px')).toBe(true)
    const svg = renderExportSvg(scene, 1)
    expect(svg).toContain('font-weight="600"')
    expect(svg).toContain('font-size="12"')
  })

  it('stays decodable without CompressionStream (zlib-wrapped stored blocks)', async () => {
    const holder = globalThis as unknown as { CompressionStream?: unknown }
    const saved = holder.CompressionStream
    holder.CompressionStream = undefined
    try {
      const width = 3
      const height = 2
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 10
        rgba[i + 1] = 20
        rgba[i + 2] = 30
        rgba[i + 3] = 255
      }
      const bytes = await encodePng(width, height, rgba)
      const raw = inflateSync(idatData(bytes))
      expect(raw.length).toBe(height * (1 + width * 4))
      for (let y = 0; y < height; y += 1) {
        expect(raw[y * (1 + width * 4)]).toBe(0)
      }
      for (let x = 0; x < width; x += 1) {
        const at = 1 + x * 4
        expect([raw[at], raw[at + 1], raw[at + 2], raw[at + 3]]).toEqual([10, 20, 30, 255])
      }
    } finally {
      holder.CompressionStream = saved
    }
  })
})

describe('browser PNG availability', () => {
  it('returns null where canvas is unavailable', async () => {
    // jsdom has no canvas implementation: the graceful path, not a crash.
    await expect(exportPngBlob(testScene(), 1)).resolves.toBe(null)
  })
})

// --- A3: plot-frame clipping regressions ---

interface ScreenPoint {
  px: number
  py: number
}

interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

/** Points from the renderer's `M x y L x y …` path strings. */
function parsePathPoints(d: string): ScreenPoint[] {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map((value) => Number(value))
  const points: ScreenPoint[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ px: numbers[index] ?? 0, py: numbers[index + 1] ?? 0 })
  }
  return points
}

/** The frame clip rect declared in the SVG's clipPath, or null when absent. */
function frameRectOf(doc: Document): FrameRect | null {
  const rect = doc.querySelector('clipPath rect')
  if (rect === null) {
    return null
  }
  return {
    x: Number(rect.getAttribute('x')),
    y: Number(rect.getAttribute('y')),
    width: Number(rect.getAttribute('width')),
    height: Number(rect.getAttribute('height')),
  }
}

function insideFrame(scene: ExportScene, point: ScreenPoint): boolean {
  return point.px >= 0 && point.px <= scene.width && point.py >= 0 && point.py <= scene.height
}

/** Pole-heavy curve inputs: excursions above, below, and past the frame. */
function poleCurves(): ExportCurveInput[] {
  return [
    {
      label: '1/x',
      styleIndex: 0,
      segments: [
        [
          { x: -1, y: -1 },
          { x: -0.01, y: -100 },
        ],
        [
          { x: 0.01, y: 100 },
          { x: 1, y: 1 },
        ],
      ],
    },
    {
      label: '3/(x-4)',
      styleIndex: 1,
      segments: [
        [
          { x: 2, y: -1.5 },
          { x: 3.99, y: -300 },
        ],
        [
          { x: 4.01, y: 300 },
          { x: 6, y: 1.5 },
        ],
      ],
      regions: [{ x0: -10, y0: -7, x1: 10, y1: 0 }],
    },
    {
      label: 'runaway',
      styleIndex: 2,
      segments: [
        [
          { x: 0, y: 0 },
          { x: 25, y: 1 },
        ],
      ],
    },
  ]
}

/**
 * Pole-heavy scene: adjacent to each pole the sampler's world points are
 * clamped to a finite 2× box, which still maps outside the inner plot
 * rectangle — above the top, into the legend band below, and past the
 * right edge. The runaway segment exercises the x axis; the regions entry
 * stands in for inequality fills.
 */
function poleScene(): ExportScene {
  return buildExportScene(WORLD, SIZE, poleCurves(), {
    background: 'white',
    showGrid: true,
    equalAspect: false,
    includeLegend: true,
    resolveColor: lightCurveHex,
  })
}

/**
 * Same curves without a legend and with a caption: the caption band is the
 * only inner-invisible region of the canvas, and captions are text, so the
 * PNG path must stroke nothing below the inner plot rectangle at all.
 */
function poleCaptionScene(): ExportScene {
  return buildExportScene(
    WORLD,
    SIZE,
    poleCurves(),
    { background: 'white', showGrid: true, equalAspect: false, includeLegend: false, resolveColor: lightCurveHex },
    [],
    { text: { caption: 'Caption band: pole curves must not enter it.' } },
  )
}

/** The exported figure's outer rectangle: plot + legend + caption bands. */
function outerViewport(scene: ExportScene): FrameRect {
  return { x: 0, y: 0, width: scene.width, height: scene.height + scene.legendHeight + scene.captionHeight }
}

/** Liang–Barsky clip of one screen segment to a rect; null when fully outside. */
function clipSegmentToRect(from: ScreenPoint, to: ScreenPoint, rect: FrameRect): [ScreenPoint, ScreenPoint] | null {
  let t0 = 0
  let t1 = 1
  const dx = to.px - from.px
  const dy = to.py - from.py
  const bounds: Array<[number, number]> = [
    [-dx, from.px - rect.x],
    [dx, rect.x + rect.width - from.px],
    [-dy, from.py - rect.y],
    [dy, rect.y + rect.height - from.py],
  ]
  for (const [p, q] of bounds) {
    if (p === 0) {
      if (q < 0) {
        return null
      }
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) {
        return null
      }
      if (r > t0) {
        t0 = r
      }
    } else {
      if (r < t0) {
        return null
      }
      if (r < t1) {
        t1 = r
      }
    }
  }
  return [
    { px: from.px + dx * t0, py: from.py + dy * t0 },
    { px: from.px + dx * t1, py: from.py + dy * t1 },
  ]
}

/** Portions of a polyline that fall inside the rect (one piece per segment). */
function segmentsWithinRect(points: ScreenPoint[], rect: FrameRect): Array<[ScreenPoint, ScreenPoint]> {
  const pieces: Array<[ScreenPoint, ScreenPoint]> = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from === undefined || to === undefined) {
      continue
    }
    const piece = clipSegmentToRect(from, to, rect)
    if (piece !== null) {
      pieces.push(piece)
    }
  }
  return pieces
}

interface PixelContext {
  ctx: Canvas2DLike
  /** Painted pixel (`"x,y"`) → stroke colour, after clip and canvas bounds. */
  painted: Map<string, string>
  texts: string[]
  /** Unbalanced save/restore would be a clip-state bug. */
  depth: () => number
}

/**
 * Canvas mock that rasterizes stroked polylines sample by sample under the
 * active clip rectangle — enough of the real 2D semantics to tell whether
 * curve ink lands outside the frame. Fill operations are not needed by the
 * clipping assertions and stay no-ops.
 */
function pixelContext(width: number, height: number): PixelContext {
  const painted = new Map<string, string>()
  const texts: string[] = []
  const stack: Array<{ clip: FrameRect | null; strokeStyle: string }> = []
  let clip: FrameRect | null = null
  let pending: FrameRect | null = null
  let strokeStyle = ''
  let path: ScreenPoint[] = []

  function paint(x: number, y: number, color: string): void {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= width || py >= height) {
      return
    }
    if (clip !== null && (px < clip.x || py < clip.y || px > clip.x + clip.width || py > clip.y + clip.height)) {
      return
    }
    painted.set(`${px},${py}`, color)
  }

  const api = {
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    get strokeStyle(): string {
      return strokeStyle
    },
    set strokeStyle(value: string) {
      strokeStyle = value
    },
    save(): void {
      stack.push({ clip, strokeStyle })
    },
    restore(): void {
      const state = stack.pop()
      if (state !== undefined) {
        clip = state.clip
        strokeStyle = state.strokeStyle
      }
    },
    scale: (): void => {},
    translate: (): void => {},
    rotate: (): void => {},
    rect(x: number, y: number, w: number, h: number): void {
      pending = { x, y, width: w, height: h }
    },
    clip(): void {
      if (pending === null) {
        return
      }
      const next = pending
      pending = null
      clip =
        clip === null
          ? next
          : {
              x: Math.max(clip.x, next.x),
              y: Math.max(clip.y, next.y),
              width: Math.max(0, Math.min(clip.x + clip.width, next.x + next.width) - Math.max(clip.x, next.x)),
              height: Math.max(0, Math.min(clip.y + clip.height, next.y + next.height) - Math.max(clip.y, next.y)),
            }
    },
    beginPath(): void {
      path = []
    },
    moveTo(x: number, y: number): void {
      path.push({ px: x, py: y })
    },
    lineTo(x: number, y: number): void {
      path.push({ px: x, py: y })
    },
    closePath: (): void => {},
    stroke(): void {
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1]
        const to = path[index]
        if (from === undefined || to === undefined) {
          continue
        }
        const steps = Math.max(1, Math.ceil(Math.hypot(to.px - from.px, to.py - from.py) * 2))
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps
          paint(from.px + (to.px - from.px) * t, from.py + (to.py - from.py) * t, strokeStyle)
        }
      }
    },
    setLineDash: (): void => {},
    fillRect: (): void => {},
    clearRect: (): void => {},
    arc: (): void => {},
    fill: (): void => {},
    fillText(text: string): void {
      texts.push(text)
    },
  }

  return { ctx: api as unknown as Canvas2DLike, painted, texts, depth: () => stack.length }
}

/** Painted pixels of a mock context as `{px, py, color}` records. */
function paintedPixels(mock: PixelContext): Array<{ px: number; py: number; color: string }> {
  return Array.from(mock.painted.entries()).map(([key, color]) => {
    const [px = 0, py = 0] = key.split(',').map(Number)
    return { px, py, color }
  })
}

describe('plot-frame clipping (A3)', () => {
  it('confines pole-heavy curve geometry to the inner plot rectangle in SVG', () => {
    const scene = poleScene()
    const outer = outerViewport(scene)
    // The figure is genuinely taller than the plot rectangle: the legend
    // band below the plot is inside the exported viewBox, so any bleed
    // there would be visible — it is not hidden by the outer viewport.
    expect(scene.legendHeight).toBeGreaterThan(0)
    expect(outer.height).toBeGreaterThan(scene.height)

    const text = renderExportSvg(scene, 1)
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    expect(doc.querySelector('parsererror')).toBe(null)

    const innerRect: FrameRect = { x: 0, y: 0, width: scene.width, height: scene.height }
    // The declared clip rect is exactly the inner plot rectangle — not the
    // outer export viewport that includes the legend band.
    expect(frameRectOf(doc)).toEqual(innerRect)
    expect(frameRectOf(doc)?.height).not.toBe(outer.height)

    const paths = Array.from(doc.querySelectorAll('path')).filter((element) => element.getAttribute('d') !== null)
    expect(paths.length).toBeGreaterThan(0)

    // Reproducer: raw geometry leaves the inner rectangle on both axes, and
    // pole segments genuinely cross into the band between the inner
    // rectangle and the outer viewport (the legend band).
    const bandRect: FrameRect = { x: 0, y: scene.height, width: scene.width, height: outer.height - scene.height }
    const bandEntries = paths.filter((element) => {
      const points = parsePathPoints(element.getAttribute('d') ?? '')
      return segmentsWithinRect(points, bandRect).some(([from, to]) => Math.hypot(to.px - from.px, to.py - from.py) > 0.5)
    })
    expect(bandEntries.length).toBeGreaterThan(0)

    const allPoints = paths.flatMap((element) => parsePathPoints(element.getAttribute('d') ?? ''))
    expect(allPoints.some((point) => point.py < 0)).toBe(true)
    expect(allPoints.some((point) => point.px < 0 || point.px > scene.width)).toBe(true)
    expect(allPoints.some((point) => insideFrame(scene, point))).toBe(true)

    // Every path that leaves the inner rectangle — including every path that
    // reaches into the legend band — sits inside the clip group, so a
    // renderer clips its excursions at the plot rectangle.
    const clipId = doc.querySelector('clipPath')?.getAttribute('id') ?? ''
    for (const element of paths) {
      const points = parsePathPoints(element.getAttribute('d') ?? '')
      if (points.some((point) => !insideFrame(scene, point))) {
        const group = element.closest('[clip-path]')
        expect(group).not.toBe(null)
        expect(group?.getAttribute('clip-path')).toBe(`url(#${clipId})`)
      }
    }
    for (const element of bandEntries) {
      expect(element.closest('[clip-path]')).not.toBe(null)
    }

    // Rendered-result model: applying the declared clip to the emitted
    // geometry leaves ink inside the plot rectangle only — nothing survives
    // in the legend band — while the pole curve still reaches the plot's
    // bottom edge, so the clip cuts excursions rather than whole curves.
    const effective = paths.flatMap((element) => {
      const points = parsePathPoints(element.getAttribute('d') ?? '')
      return segmentsWithinRect(points, innerRect).flatMap(([from, to]) => [from, to])
    })
    expect(effective.length).toBeGreaterThan(0)
    for (const point of effective) {
      expect(point.px).toBeGreaterThanOrEqual(-1e-6)
      expect(point.px).toBeLessThanOrEqual(scene.width + 1e-6)
      expect(point.py).toBeGreaterThanOrEqual(-1e-6)
      expect(point.py).toBeLessThanOrEqual(scene.height + 1e-6)
    }
    expect(effective.some((point) => Math.abs(point.py - scene.height) < 1e-6)).toBe(true)

    // Grid and axes (lines) are never clipped, and no text — ticks, legend,
    // title — is clipped away.
    expect(doc.querySelectorAll('[clip-path] line')).toHaveLength(0)
    const texts = Array.from(doc.querySelectorAll('text'))
    expect(texts.some((element) => element.textContent === '1/x')).toBe(true)
    for (const element of texts) {
      expect(element.closest('[clip-path]')).toBe(null)
    }

    // The caption variant keeps the same inner clip; its caption stays
    // visible below the plot rectangle.
    const captionDoc = new DOMParser().parseFromString(renderExportSvg(poleCaptionScene(), 1), 'text/xml')
    expect(captionDoc.querySelector('parsererror')).toBe(null)
    expect(frameRectOf(captionDoc)).toEqual(innerRect)
    const caption = Array.from(captionDoc.querySelectorAll('text')).find((element) => element.textContent?.startsWith('Caption band'))
    expect(caption).not.toBeUndefined()
    expect(caption?.closest('[clip-path]')).toBe(null)

    // Inequality-style fills stay drawn, clamped to the plot rectangle.
    const fills = Array.from(doc.querySelectorAll('rect')).filter((element) => element.getAttribute('fill-opacity') === '0.15')
    expect(fills).toHaveLength(scene.fills.length)
  })

  it('keeps clip identifiers deterministic and collision-free across exports', () => {
    const first = renderExportSvg(poleScene(), 1)
    const second = renderExportSvg(poleScene(), 1)
    expect(first).toBe(second)
    const firstId = /clipPath id="([^"]+)"/.exec(first)?.[1] ?? ''
    expect(firstId).toMatch(/^gc-export-frame-\d+x\d+$/)
    // Same frame geometry → same identifier and identical referenced rect.
    expect(/clipPath id="([^"]+)"/.exec(renderExportSvg(poleScene(), 2))?.[1]).toBe(firstId)
    // Different frame sizes can never share an identifier.
    const small = buildExportScene(WORLD, { width: 400, height: 300 }, [], {
      background: 'white',
      showGrid: true,
      equalAspect: false,
      includeLegend: false,
    })
    const smallText = renderExportSvg(small, 1)
    expect(/clipPath id="([^"]+)"/.exec(smallText)?.[1]).not.toBe(firstId)
    const smallDoc = new DOMParser().parseFromString(smallText, 'text/xml')
    expect(frameRectOf(smallDoc)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('confines pole-heavy curve ink to the inner plot rectangle in the PNG path', () => {
    const scene = poleScene()
    const outer = outerViewport(scene)
    expect(outer.height).toBeGreaterThan(scene.height)
    const mock = pixelContext(scene.width, outer.height)
    drawSceneToCanvas(mock.ctx, scene)

    const entries = paintedPixels(mock)
    // Below the inner rectangle the canvas holds the legend band: the only
    // intentional stroke ink there is the legend swatch (x ≤ 36); the plot
    // area must be free of curve ink — unclipped poles would ink it.
    expect(entries.some((pixel) => pixel.py > scene.height && pixel.px > 40)).toBe(false)
    // In-frame curve ink is preserved …
    expect(entries.some((pixel) => pixel.py <= scene.height && pixel.px < scene.width)).toBe(true)
    // … the legend swatch still paints after the clip is restored …
    expect(entries.some((pixel) => pixel.px <= 40 && pixel.py > scene.height)).toBe(true)
    // … labels are still drawn, and save/restore is balanced.
    expect(mock.texts.some((label) => label === '1/x')).toBe(true)
    expect(mock.texts.some((label) => label === '0')).toBe(true)
    expect(mock.depth()).toBe(0)
  })

  it('strokes nothing below the inner plot rectangle when only a caption follows (PNG)', () => {
    const scene = poleCaptionScene()
    const outer = outerViewport(scene)
    // Legend off and captions are text: no stroke belongs below the plot
    // rectangle, while the canvas still extends into the caption band — so
    // any ink below the rectangle can only be an unclipped curve excursion.
    expect(scene.legendHeight).toBe(0)
    expect(outer.height).toBeGreaterThan(scene.height)
    const mock = pixelContext(scene.width, outer.height)
    drawSceneToCanvas(mock.ctx, scene)

    const entries = paintedPixels(mock)
    expect(entries.length).toBeGreaterThan(0)
    for (const pixel of entries) {
      expect(pixel.px).toBeGreaterThanOrEqual(0)
      expect(pixel.px).toBeLessThan(scene.width)
      expect(pixel.py).toBeGreaterThanOrEqual(0)
      expect(pixel.py).toBeLessThanOrEqual(scene.height)
    }
    // The caption itself still draws, and save/restore is balanced.
    expect(mock.texts.some((label) => label.startsWith('Caption band'))).toBe(true)
    expect(mock.depth()).toBe(0)
  })
})
