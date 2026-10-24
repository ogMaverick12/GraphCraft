import {
  axisScreenPosition,
  createTransform,
  ticksForRange,
  worldToScreen,
  type WorldRect,
} from '../graph/coordinate.ts'
import type { AnalysisMarker, AnalysisMarkerKind } from '../graph/markers.ts'

/**
 * Power-of-ten ticks across a log10-space range. Mirrors
 * `logTicks` in `src/data/plots.ts` (kept local so the shared export
 * layer never depends on Data Lab): whole powers print plainly in the
 * 0.1–1M span, `1eK` beyond.
 */
function powerTicks(lo: number, hi: number): Array<{ value: number; label: string }> {
  const ticks: Array<{ value: number; label: string }> = []
  for (let k = Math.ceil(lo - 1e-9); k <= hi + 1e-9; k += 1) {
    const whole = k === 0 ? 0 : k
    const power = 10 ** whole
    ticks.push({ value: whole, label: whole === 0 ? '1' : (whole > 0 && whole <= 6) || (whole < 0 && whole >= -3) ? String(power) : `1e${whole}` })
  }
  return ticks
}

/**
 * Export scene (Stage 1 export): a renderer-neutral description of the
 * figure — viewport, grid, axes, ticks, clipped-scale curve runs, legend.
 * The SVG and PNG renderers consume the same scene, so later data
 * exports can reuse it without touching the live viewport. No UI chrome
 * can enter: the scene is built from world state and sampled segments
 * only. No React/DOM.
 */

export interface ExportCurveInput {
  readonly label: string
  readonly styleIndex: number
  readonly segments: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  readonly regions?: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>
  readonly dash?: string
}

export type ExportBackground = 'white' | 'transparent'

export interface ExportSceneOptions {
  background: ExportBackground
  showGrid: boolean
  equalAspect: boolean
  includeLegend: boolean
  /** Resolve a palette slot to a concrete colour. Defaults to the CSS var reference. */
  resolveColor?: (styleIndex: number) => string
  /** Log-axis mapping (scatter/line numeric axes only): ticks land on powers of ten. */
  xLog?: boolean
  yLog?: boolean
}

export type ScenePointShape = 'circle' | 'square' | 'triangle' | 'diamond'

export interface ScenePoint {
  readonly px: number
  readonly py: number
  readonly color: string
  readonly shape: ScenePointShape
  readonly label: string
}

export interface SceneBar {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly color: string
  readonly label: string
}

/** Plain rule segments: error-bar whiskers and caps, reference lines. */
export interface SceneRule {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly color: string
  readonly width: number
  readonly dash: string
}

export interface SceneGridLine {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export interface SceneTickLabel {
  readonly x: number
  readonly y: number
  readonly anchor: 'middle' | 'start'
  readonly text: string
}

export interface SceneCurveRun {
  readonly points: Array<{ px: number; py: number }>
  readonly color: string
  readonly dash: string
  readonly width: number
  readonly label: string
  readonly part: number
}

export interface SceneLegendEntry {
  readonly label: string
  readonly color: string
  readonly dash: string
  /** Point glyph for scatter series (line swatch when absent). */
  readonly shape?: ScenePointShape
}

export interface SceneMarker {
  readonly px: number
  readonly py: number
  readonly kind: AnalysisMarkerKind
  readonly label: string
}

export interface ExportScene {
  readonly width: number
  readonly height: number
  readonly legendHeight: number
  readonly captionHeight: number
  readonly background: ExportBackground
  readonly gridLines: SceneGridLine[]
  readonly axes: SceneGridLine[]
  readonly tickLabels: SceneTickLabel[]
  readonly origin: { px: number; py: number } | null
  readonly curveRuns: SceneCurveRun[]
  readonly fills: Array<{ x: number; y: number; width: number; height: number; color: string }>
  readonly markers: SceneMarker[]
  readonly legend: SceneLegendEntry[]
  /** Data-figure elements (empty for equation figures). */
  readonly points: ScenePoint[]
  readonly bars: SceneBar[]
  readonly rules: SceneRule[]
  /** Figure text (empty when unset): title + axis labels draw inside, caption below the legend. */
  readonly title: string
  readonly captionLines: string[]
  readonly xLabel: string
  readonly yLabel: string
}

const DASHES = ['', '7 4', '2 3', '9 3 2 3', '7 4 2 4', '2 2']
const CURVE_COUNT = 6
const PADDING = 8
const LABEL_INSET_X = 6
const LABEL_INSET_Y = 6
const LEGEND_ROW_HEIGHT = 18
const LEGEND_TOP_GAP = 10

const CAPTION_ROW_HEIGHT = 14
const MAX_CAPTION_ROWS = 4

function defaultResolveColor(styleIndex: number): string {
  const slot = ((styleIndex % CURVE_COUNT) + CURVE_COUNT) % CURVE_COUNT
  return `var(--gc-curve-${slot + 1})`
}

/** Figure text for data exports; equation figures leave every field empty. */
export interface ExportFigureText {
  title?: string
  caption?: string
  xLabel?: string
  yLabel?: string
}

/** Extra scene content for data figures; equation callers omit it. */
export interface ExportSceneExtras {
  points?: ScenePoint[]
  bars?: SceneBar[]
  rules?: SceneRule[]
  /** Pre-mapped screen-space runs (data figures map through log scales themselves). */
  screenRuns?: SceneCurveRun[]
  legend?: SceneLegendEntry[]
  text?: ExportFigureText
}

function dashFor(styleIndex: number): string {
  const slot = ((styleIndex % CURVE_COUNT) + CURVE_COUNT) % CURVE_COUNT
  return DASHES[slot] ?? ''
}

/**
 * Build the figure scene at CSS-pixel size. Points are clamped to a
 * finite box (2× the visible span) before mapping so pole-adjacent
 * magnitudes stay finite; the renderers additionally clip to the frame.
 */
export function buildExportScene(
  world: WorldRect,
  size: { width: number; height: number },
  curves: ExportCurveInput[],
  options: ExportSceneOptions,
  worldMarkers: AnalysisMarker[] = [],
  extras: ExportSceneExtras = {},
): ExportScene {
  const width = Math.max(1, Math.round(size.width))
  const height = Math.max(1, Math.round(size.height))
  const transform = createTransform(world, { width, height }, options.equalAspect)
  const visible = transform.visible
  const resolveColor = options.resolveColor ?? defaultResolveColor
  const xLog = options.xLog === true
  const yLog = options.yLog === true

  function xRangeTicks(): Array<{ value: number; label: string }> {
    if (xLog) {
      return powerTicks(visible.xMin, visible.xMax)
    }
    return ticksForRange(visible.xMin, visible.xMax, Math.max(2, Math.round(width / 90)))
  }

  function yRangeTicks(): Array<{ value: number; label: string }> {
    if (yLog) {
      return powerTicks(visible.yMin, visible.yMax)
    }
    return ticksForRange(visible.yMin, visible.yMax, Math.max(2, Math.round(height / 70)))
  }

  const gridLines: SceneGridLine[] = []
  if (options.showGrid) {
    for (const tick of xRangeTicks()) {
      const { px } = worldToScreen(transform, tick.value, 0)
      gridLines.push({ x1: px, y1: 0, x2: px, y2: height })
    }
    for (const tick of yRangeTicks()) {
      const { py } = worldToScreen(transform, 0, tick.value)
      gridLines.push({ x1: 0, y1: py, x2: width, y2: py })
    }
  }

  const { xAxisPy, yAxisPx } = axisScreenPosition(transform)
  const axes: SceneGridLine[] = [
    { x1: 0, y1: xAxisPy, x2: width, y2: xAxisPy },
    { x1: yAxisPx, y1: 0, x2: yAxisPx, y2: height },
  ]

  const tickLabels: SceneTickLabel[] = []
  for (const tick of xRangeTicks()) {
    const { px } = worldToScreen(transform, tick.value, 0)
    tickLabels.push({ x: Math.min(Math.max(px, 20), width - 4), y: height - LABEL_INSET_Y, anchor: 'middle', text: tick.label })
  }
  for (const tick of yRangeTicks()) {
    const { py } = worldToScreen(transform, 0, tick.value)
    tickLabels.push({ x: LABEL_INSET_X, y: Math.min(Math.max(py + 4, 12), height - 4), anchor: 'start', text: tick.label })
  }

  const originVisible = visible.xMin <= 0 && 0 <= visible.xMax && visible.yMin <= 0 && 0 <= visible.yMax
  const origin = originVisible ? worldToScreen(transform, 0, 0) : null

  const spanX = visible.xMax - visible.xMin
  const spanY = visible.yMax - visible.yMin
  const box = { xMin: visible.xMin - spanX, xMax: visible.xMax + spanX, yMin: visible.yMin - spanY, yMax: visible.yMax + spanY }

  const curveRuns: SceneCurveRun[] = []
  const fills: ExportScene['fills'] = []
  const legend: SceneLegendEntry[] = []
  curves.forEach((curve) => {
    const color = resolveColor(curve.styleIndex)
    const dash = curve.dash ?? dashFor(curve.styleIndex)
    legend.push({ label: curve.label, color, dash })
    curve.segments.forEach((segment, part) => {
      const points = segment.map((p) => {
        const cx = Math.min(box.xMax, Math.max(box.xMin, p.x))
        const cy = Math.min(box.yMax, Math.max(box.yMin, p.y))
        return worldToScreen(transform, cx, cy)
      })
      if (points.length >= 2) {
        curveRuns.push({ points, color, dash, width: 2, label: curve.label, part: part + 1 })
      }
    })
    for (const region of curve.regions ?? []) {
      const topLeft = worldToScreen(transform, region.x0, region.y1)
      const bottomRight = worldToScreen(transform, region.x1, region.y0)
      const fx = Math.max(0, topLeft.px)
      const fy = Math.max(0, topLeft.py)
      const fw = Math.max(0, Math.min(width, bottomRight.px) - fx)
      const fh = Math.max(0, Math.min(height, bottomRight.py) - fy)
      if (fw > 0 && fh > 0) {
        fills.push({ x: fx, y: fy, width: fw, height: fh, color })
      }
    }
  })

  const dataLegend = extras.legend ?? []
  const legendHeight = options.includeLegend && legend.length + dataLegend.length > 0 ? LEGEND_TOP_GAP + (legend.length + dataLegend.length) * LEGEND_ROW_HEIGHT + PADDING : 0

  const markers: SceneMarker[] = []
  for (const marker of worldMarkers) {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
      continue
    }
    if (marker.x < visible.xMin || marker.x > visible.xMax || marker.y < visible.yMin || marker.y > visible.yMax) {
      continue
    }
    const { px, py } = worldToScreen(transform, marker.x, marker.y)
    markers.push({ px, py, kind: marker.kind, label: marker.label })
  }

  const title = extras.text?.title?.slice(0, 120) ?? ''
  const xLabel = extras.text?.xLabel?.slice(0, 120) ?? ''
  const yLabel = extras.text?.yLabel?.slice(0, 120) ?? ''
  const captionLines = (extras.text?.caption ?? '')
    .split('\n')
    .map((line) => line.trim().slice(0, 140))
    .filter((line) => line !== '')
    .slice(0, MAX_CAPTION_ROWS)
  const captionHeight = captionLines.length > 0 ? captionLines.length * CAPTION_ROW_HEIGHT + PADDING : 0
  for (const run of extras.screenRuns ?? []) {
    if (run.points.length >= 2) {
      curveRuns.push(run)
    }
  }

  return {
    width,
    height,
    legendHeight,
    captionHeight,
    background: options.background,
    gridLines,
    axes,
    tickLabels,
    origin,
    curveRuns,
    fills,
    markers,
    legend: options.includeLegend ? [...legend, ...dataLegend] : [],
    points: extras.points ?? [],
    bars: extras.bars ?? [],
    rules: extras.rules ?? [],
    title,
    captionLines,
    xLabel,
    yLabel,
  }
}
