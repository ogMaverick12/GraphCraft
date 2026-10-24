import { describe, expect, it } from 'vitest'
import { encodePng, resolveExportScale } from '../export/png.ts'
import { renderExportSvg } from '../export/svg.ts'
import { fitModel } from './fits.ts'
import { buildDataFigureScene, DATA_FIGURE_SIZE, FIT_OVERLAY_COLOR } from './figure.ts'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'
import type { Dataset } from './dataset.ts'

function dataset(): Dataset {
  return {
    id: 'ds-fig',
    name: 'Fig',
    columns: [
      { id: 'c1', name: 'day', type: 'numeric', unit: 'd' },
      { id: 'c2', name: 'height', type: 'numeric', unit: 'cm' },
      { id: 'c3', name: 'err', type: 'numeric' },
    ],
    rows: [
      [0, 2.1, 0.2],
      [2, 2.8, 0.2],
      [4, null, 0.2],
      [6, 5.2, 0.2],
    ],
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'scatter',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'Growth (synthetic)',
    xLabel: 'day (d)',
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
    yError: { mode: 'column', column: 'c3' },
    xError: { mode: 'none' },
    ...overrides,
  }
}

function parseSvg(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBe(null)
  expect(doc.documentElement.tagName).toBe('svg')
  return doc
}

describe('data figure export (shared scene)', () => {
  it('renders a valid SVG with labels, units, legend, error bars, and fit overlay', () => {
    const ds = dataset()
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const world = plotWorld(plot, cfg)
    const outcome = fitModel({ model: 'line', degree: 1, xs: [0, 2, 6], ys: [2.1, 2.8, 5.2] })
    expect(outcome.status).toBe('value')
    const fit = outcome.status === 'value' ? { points: [0, 2, 4, 6].map((x) => ({ x, y: outcome.fit.coefficients[0]! + outcome.fit.coefficients[1]! * x })), label: 'Fit: y = a + b·x' } : null
    const built = buildDataFigureScene(plot, cfg, world, fit, { caption: 'N = 3 fitted, 1 skipped.' }, 'white')
    expect(built.status).toBe('value')
    if (built.status !== 'value') {
      throw new Error('expected a figure')
    }
    const svg = renderExportSvg(built.scene, 1)
    const doc = parseSvg(svg)
    const text = doc.documentElement.textContent ?? ''
    expect(text).toContain('Growth (synthetic)')
    expect(text).toContain('day (d)')
    expect(text).toContain('height (cm)')
    expect(text).toContain('N = 3 fitted')
    // Points + whiskers + fit overlay present; no app chrome.
    expect(doc.querySelectorAll('circle').length).toBeGreaterThan(0)
    expect(text).toContain('Fit:')
    expect(built.scene.legend.some((entry) => entry.label.startsWith('Fit:'))).toBe(true)
    expect(svg).not.toContain('Data Lab')
    expect(svg).not.toContain('Plot type')
    expect(built.scene.rules.length).toBeGreaterThan(0)
    expect(built.scene.points).toHaveLength(3)
  })

  it('keeps aspect, hides hidden series, and refuses empty plots', () => {
    const ds = dataset()
    const base = config()
    const first = resolvePlot(ds, base)
    const hiddenKey = first.series[0]?.key ?? 'height'
    const cfg = config({ hiddenSeries: [hiddenKey] })
    const plot = resolvePlot(ds, cfg)
    const world = plotWorld(plot, cfg)
    const built = buildDataFigureScene(plot, cfg, world, null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status === 'value') {
      expect(built.scene.width).toBe(DATA_FIGURE_SIZE.width)
      expect(built.scene.height).toBe(DATA_FIGURE_SIZE.height)
      expect(built.scene.points).toHaveLength(0)
      expect(built.scene.legend).toHaveLength(0)
    }
    const empty = buildDataFigureScene({ series: [], xMode: 'numeric', totalPoints: 0, totalSkipped: 2, notes: [] }, cfg, null, null, { caption: '' }, 'white')
    expect(empty).toMatchObject({ status: 'error' })
  })

  it('draws bars through the same scene path with counts in the legend', () => {
    const ds: Dataset = {
      ...dataset(),
      columns: [
        { id: 'c1', name: 'tray', type: 'categorical' },
        { id: 'c2', name: 'height', type: 'numeric' },
      ],
      rows: [
        ['A', 2],
        ['B', 3],
      ],
    }
    const cfg = config({ kind: 'bar', xColumn: 'c1', yColumn: 'c2', yError: { mode: 'none' } })
    const plot = resolvePlot(ds, cfg)
    const built = buildDataFigureScene(plot, cfg, plotWorld(plot, cfg), null, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status === 'value') {
      expect(built.scene.bars).toHaveLength(2)
      const svg = renderExportSvg(built.scene, 1)
      parseSvg(svg)
      expect(svg).toContain('(2)')
    }
  })

  it('maps log axes through powers of ten and keeps the fit finite', () => {
    const ds: Dataset = {
      ...dataset(),
      rows: [
        [1, 10, 0.5],
        [10, 100, 0.5],
        [100, 1000, 0.5],
      ],
    }
    const cfg = config({ yScale: 'log' })
    const plot = resolvePlot(ds, cfg)
    const world = plotWorld(plot, cfg)
    const built = buildDataFigureScene(
      plot,
      cfg,
      world,
      { points: [1, 10, 100].map((x) => ({ x, y: 10 * x })), label: 'Fit' },
      { caption: '' },
      'white',
    )
    expect(built.status).toBe('value')
    if (built.status === 'value') {
      const bad = built.scene.curveRuns.flatMap((run) => run.points).filter((p) => !Number.isFinite(p.px) || !Number.isFinite(p.py))
      expect(bad).toHaveLength(0)
      const svg = renderExportSvg(built.scene, 1)
      parseSvg(svg)
      expect(svg).toContain('1000')
    }
  })

  it('exposes explicit pixel dimensions with capped scales', () => {
    const { scale, capped } = resolveExportScale(3, DATA_FIGURE_SIZE.width, DATA_FIGURE_SIZE.height)
    expect(capped).toBe(false)
    expect(Math.round(DATA_FIGURE_SIZE.width * scale)).toBe(DATA_FIGURE_SIZE.width * 3)
    const tight = resolveExportScale(8, DATA_FIGURE_SIZE.width, DATA_FIGURE_SIZE.height)
    expect(tight.capped).toBe(true)
  })

  it('encodes raster bytes with matching IHDR dimensions', async () => {
    const width = 4
    const height = 3
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
    const bytes = await encodePng(width, height, rgba)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(view.getUint32(16)).toBe(width)
    expect(view.getUint32(20)).toBe(height)
  })

  it('paints the fit overlay in the accent colour', () => {
    const ds = dataset()
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const built = buildDataFigureScene(plot, cfg, plotWorld(plot, cfg), { points: [{ x: 0, y: 2 }, { x: 6, y: 5 }], label: 'Fit' }, { caption: '' }, 'white')
    expect(built.status).toBe('value')
    if (built.status === 'value') {
      expect(built.scene.curveRuns.some((run) => run.color === FIT_OVERLAY_COLOR)).toBe(true)
    }
  })

  it('honours figure size presets in scene dimensions', () => {
    const ds = dataset()
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const world = plotWorld(plot, cfg)
    for (const [key, dims] of [['S', { width: 480, height: 320 }], ['M', { width: 720, height: 440 }], ['L', { width: 960, height: 520 }]] as const) {
      const built = buildDataFigureScene(plot, cfg, world, null, { caption: '' }, 'white', key)
      expect(built.status).toBe('value')
      if (built.status === 'value') {
        expect(built.scene.width).toBe(dims.width)
        expect(built.scene.height).toBe(dims.height)
      }
    }
  })

  it('renders transparent backgrounds without a white plate', () => {
    const ds = dataset()
    const cfg = config()
    const plot = resolvePlot(ds, cfg)
    const solid = buildDataFigureScene(plot, cfg, plotWorld(plot, cfg), null, { caption: '' }, 'white')
    const clear = buildDataFigureScene(plot, cfg, plotWorld(plot, cfg), null, { caption: '' }, 'transparent')
    expect(solid.status).toBe('value')
    expect(clear.status).toBe('value')
    if (solid.status === 'value' && clear.status === 'value') {
      expect(renderExportSvg(solid.scene, 1)).toContain('fill="#ffffff"')
      expect(renderExportSvg(clear.scene, 1)).not.toContain('fill="#ffffff"')
    }
  })

  it('keeps every label, tick, legend, and caption mark inside the frame', () => {
    const ds = dataset()
    const cfg = config({
      title: 'A deliberately long figure title that still must not clip outside the frame',
      xLabel: 'day (d) with an extended label tail',
      yLabel: 'height (cm) with an extended label tail',
    })
    const plot = resolvePlot(ds, cfg)
    const built = buildDataFigureScene(plot, cfg, plotWorld(plot, cfg), null, { caption: 'First caption row.\nSecond caption row.' }, 'white')
    expect(built.status).toBe('value')
    if (built.status !== 'value') {
      throw new Error('expected a figure')
    }
    const { scene } = built
    const totalHeight = scene.height + scene.legendHeight + scene.captionHeight
    for (const tick of scene.tickLabels) {
      expect(tick.x).toBeGreaterThanOrEqual(0)
      expect(tick.x).toBeLessThanOrEqual(scene.width)
      expect(tick.y).toBeGreaterThanOrEqual(0)
      expect(tick.y).toBeLessThanOrEqual(totalHeight)
    }
    const svg = renderExportSvg(scene, 1)
    const doc = parseSvg(svg)
    const texts = Array.from(doc.querySelectorAll('text'))
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      const x = Number(text.getAttribute('x'))
      const y = Number(text.getAttribute('y'))
      // Rotated y-label carries a transform; its stored x/y still sit in-frame.
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(-scene.height)
      expect(x).toBeLessThanOrEqual(scene.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(totalHeight)
    }
    expect(svg).toContain('Second caption row.')
  })
})
