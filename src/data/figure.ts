import { createTransform, worldToScreen } from '../graph/coordinate.ts'
import { curveStyle, lightCurveHex } from '../graph/palette.ts'
import {
  buildExportScene,
  type ExportBackground,
  type ExportScene,
  type ExportSceneExtras,
  type SceneBar,
  type SceneCurveRun,
  type SceneLegendEntry,
  type ScenePoint,
  type SceneRule,
} from '../export/index.ts'
import { seriesShape, type PlotConfig, type ResolvedPlot } from './plots.ts'

/**
 * Data-figure export (Data Lab): every chart kind flows through the ONE
 * shared export scene (`src/export/scene.ts`) and its SVG/PNG renderers —
 * there is deliberately no per-chart-type export path. Series points,
 * line runs, bars, error-bar whiskers, and the fitted overlay are mapped
 * from the same resolved plot the live view draws, with the same log10
 * mapping, gap-splitting, palette, and fixed light figure theme.
 * No navigation, sidebars, buttons, cursor, or hover UI can enter: the
 * scene is built from plot data and world state only. No React/DOM.
 */

export const DATA_FIGURE_SIZE = { width: 720, height: 440 } as const

/** Figure size presets (user-selectable, persisted): base units before PNG scaling. */
export const DATA_FIGURE_SIZES = {
  S: { width: 480, height: 320 },
  M: { width: 720, height: 440 },
  L: { width: 960, height: 520 },
} as const

export type DataFigureSizeKey = keyof typeof DATA_FIGURE_SIZES
/** Light-theme accent for the fitted overlay (mirrors `--gc-accent`). */
export const FIT_OVERLAY_COLOR = '#4f46e5'
export const FIT_OVERLAY_DASH = '7 4'

export interface DataFigureFit {
  points: Array<{ x: number; y: number }>
  label: string
}

export interface DataFigureText {
  caption: string
}

export type DataFigureOutcome = { status: 'value'; scene: ExportScene } | { status: 'error'; message: string }

function isLineLike(kind: PlotConfig['kind']): boolean {
  return kind === 'scatter' || kind === 'line'
}

/**
 * Build the export scene for the CURRENT plot state: resolved series,
 * config (mapping, bounds, scales, visibility, labels), and view world.
 * Hidden series stay hidden; explicit bounds and log exclusions apply
 * exactly as on screen. Returns an error (never a fabricated figure)
 * when nothing is plottable.
 */
export function buildDataFigureScene(
  plot: ResolvedPlot,
  config: PlotConfig,
  world: { xMin: number; yMin: number; xMax: number; yMax: number } | null,
  fit: DataFigureFit | null,
  text: DataFigureText,
  background: ExportBackground,
  sizeKey: DataFigureSizeKey = 'M',
): DataFigureOutcome {
  if (world === null || plot.totalPoints === 0) {
    return { status: 'error', message: 'No plottable points: every row is missing or non-numeric in the mapped columns.' }
  }
  const lineLike = isLineLike(config.kind)
  const xLog = lineLike && config.xScale === 'log'
  const yLog = lineLike && config.yScale === 'log'
  const toDisplayX = (x: number): number => (xLog ? Math.log10(x) : x)
  const toDisplayY = (y: number): number => (yLog ? Math.log10(y) : y)
  const size = { ...DATA_FIGURE_SIZES[sizeKey] }
  const transform = createTransform(world, size, false)

  const visible = plot.series.filter((s) => !(config.hiddenSeries.includes(s.key) || s.points.length === 0))
  const screenOf = (x: number, y: number): { px: number; py: number } | null => {
    if ((xLog && x <= 0) || (yLog && y <= 0)) {
      return null
    }
    const s = worldToScreen(transform, toDisplayX(x), toDisplayY(y))
    return Number.isFinite(s.px) && Number.isFinite(s.py) ? s : null
  }

  const screenRuns: SceneCurveRun[] = []
  const points: ScenePoint[] = []
  const bars: SceneBar[] = []
  const rules: SceneRule[] = []
  const dataLegend: SceneLegendEntry[] = []
  const CAP = 4

  const isBar = config.kind === 'bar' || config.kind === 'histogram'
  if (isBar) {
    const zero = worldToScreen(transform, 0, 0)
    visible.forEach((s, si) => {
      const color = lightCurveHex(s.colorIndex)
      s.points.forEach((p) => {
        const lo = p.lo ?? p.x - 0.3
        const hi = p.hi ?? p.x + 0.3
        const slot = (hi - lo) / Math.max(1, visible.length)
        const x0 = lo + si * slot
        const x1 = lo + (si + 1) * slot
        const a = worldToScreen(transform, x0, p.y)
        const b = worldToScreen(transform, x1, 0)
        if (![a.px, a.py, b.px].every(Number.isFinite)) {
          return
        }
        const yTop = Math.min(a.py, zero.py)
        const yBottom = Math.max(a.py, zero.py)
        bars.push({ x: a.px, y: yTop, width: Math.max(0, b.px - a.px), height: Math.max(0, yBottom - yTop), color, label: `${s.label}: ${p.label} = ${p.y}` })
      })
      dataLegend.push({ label: `${s.label} (${s.points.length})`, color, dash: '', shape: seriesShape(s.colorIndex) })
    });
  } else {
    for (const s of visible) {
      const color = lightCurveHex(s.colorIndex)
      const shape = seriesShape(s.colorIndex)
      if (config.kind === 'line') {
        // Runs break across recorded gaps, exactly like the live view.
        const runs: typeof s.points[] = []
        let current: typeof s.points = []
        for (const p of s.points) {
          const prev = current[current.length - 1]
          if (prev !== undefined && s.gapXs.some((g) => g > Math.min(prev.x, p.x) && g < Math.max(prev.x, p.x))) {
            runs.push(current)
            current = []
          }
          current.push(p)
        }
        if (current.length > 0) {
          runs.push(current)
        }
        const dash = curveStyle(s.colorIndex).dash
        runs.forEach((run, ri) => {
          const segment = run.flatMap((p) => {
            const placed = screenOf(p.x, p.y)
            return placed === null ? [] : [placed]
          })
          if (segment.length >= 2) {
            screenRuns.push({ points: segment, color, dash, width: 2, label: s.label, part: ri + 1 })
          }
        })
        dataLegend.push({ label: `${s.label} (${s.points.length})`, color, dash: curveStyle(s.colorIndex).dash })
      } else {
        dataLegend.push({ label: `${s.label} (${s.points.length})`, color, dash: '', shape })
      }
      for (const p of s.points) {
        const placed = screenOf(p.x, p.y)
        if (placed === null) {
          continue
        }
        points.push({ px: placed.px, py: placed.py, color, shape, label: `${s.label}: (${p.x}, ${p.y})` })
        if (p.yErr !== undefined) {
          const top = screenOf(p.x, p.y + p.yErr[1])
          const bottom = screenOf(p.x, p.y - p.yErr[0])
          if (top !== null && bottom !== null) {
            rules.push({ x1: placed.px, y1: top.py, x2: placed.px, y2: bottom.py, color, width: 1.25, dash: '' })
            rules.push({ x1: placed.px - CAP, y1: top.py, x2: placed.px + CAP, y2: top.py, color, width: 1.25, dash: '' })
            rules.push({ x1: placed.px - CAP, y1: bottom.py, x2: placed.px + CAP, y2: bottom.py, color, width: 1.25, dash: '' })
          }
        }
        if (p.xErr !== undefined) {
          const leftPlaced = screenOf(p.x - p.xErr[0], p.y)
          const rightPlaced = screenOf(p.x + p.xErr[1], p.y)
          if (leftPlaced !== null && rightPlaced !== null) {
            rules.push({ x1: leftPlaced.px, y1: placed.py, x2: rightPlaced.px, y2: placed.py, color, width: 1.25, dash: '' })
            rules.push({ x1: leftPlaced.px, y1: placed.py - CAP, x2: leftPlaced.px, y2: placed.py + CAP, color, width: 1.25, dash: '' })
            rules.push({ x1: rightPlaced.px, y1: placed.py - CAP, x2: rightPlaced.px, y2: placed.py + CAP, color, width: 1.25, dash: '' })
          }
        }
      }
    }
    if (fit !== null && fit.points.length >= 2) {
      const segment = fit.points.flatMap((p) => {
        const placed = screenOf(p.x, p.y)
        return placed === null ? [] : [placed]
      })
      if (segment.length >= 2) {
        screenRuns.push({ points: segment, color: FIT_OVERLAY_COLOR, dash: FIT_OVERLAY_DASH, width: 2, label: fit.label, part: 1 })
        dataLegend.push({ label: fit.label, color: FIT_OVERLAY_COLOR, dash: FIT_OVERLAY_DASH })
      }
    }
  }

  const extras: ExportSceneExtras = {
    points,
    bars,
    rules,
    screenRuns,
    legend: dataLegend,
    text: { title: config.title, xLabel: config.xLabel, yLabel: config.yLabel, caption: text.caption },
  }
  const scene = buildExportScene(
    world,
    size,
    [],
    {
      background,
      showGrid: config.showGrid,
      equalAspect: false,
      includeLegend: true,
      resolveColor: lightCurveHex,
      xLog,
      yLog,
    },
    [],
    extras,
  )
  return { status: 'value', scene }
}
