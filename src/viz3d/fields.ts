import type { FieldEvaluator } from '../math/index.ts'
import { sampleImplicit } from '../sampling/implicit.ts'
import { sampleSurface, type SurfaceDomain } from './surface.ts'
/**
 * 2D field displays (Stage 6): contours, heatmaps, and vector arrows
 * over bounded domains. Pure numerics — no React, no DOM.
 *
 * Contours reuse the marching-squares sampler (`sampleImplicit`,
 * saddle-aware per ADR-023) on offset fields `f − c`: one documented
 * algorithm, ambiguous cells handled there, never reimplemented here.
 * Heatmaps shade the fixed sampler grid; arrows subsample the vector
 * model with a visible stride cap. Streamlines are deferred (see
 * FIELDS.md): RK integration needs step-limit and non-convergence
 * machinery this task does not build.
 */

export type ColorPolicy = 'viridis' | 'blue-red' | 'diverging'
export type ScalePolicy = 'auto' | 'symmetric' | 'fixed'

export interface ScaleSelection {
  policy: ScalePolicy
  fixedMin: number | null
  fixedMax: number | null
}

/**
 * Approximate viridis (perceptually uniform, colour-blind safe):
 * hand-transcribed LUT stops, linear in RGB between them. An
 * approximation of the matplotlib ramp — close enough for a legend,
 * never claimed exact.
 */
const VIRIDIS: Array<[number, string]> = [
  [0, '#440154'],
  [0.125, '#482878'],
  [0.25, '#3e4989'],
  [0.375, '#31688e'],
  [0.5, '#26828e'],
  [0.625, '#35b779'],
  [0.75, '#6ece58'],
  [0.875, '#b8de29'],
  [1, '#fde725'],
]

const BLUE_RED: Array<[number, string]> = [
  [0, '#1d4ed8'],
  [0.25, '#0e7490'],
  [0.5, '#047857'],
  [0.75, '#c2410c'],
  [1, '#b91c1c'],
]

/**
 * Diverging scale (colour-blind safe): deep blue through neutral
 * light grey to deep red, symmetric by construction. Zero (or the
 * reference midpoint) always lands on neutral — stated in the legend.
 */
const DIVERGING: Array<[number, string]> = [
  [0, '#1d4ed8'],
  [0.25, '#93b4fd'],
  [0.5, '#f5f3ef'],
  [0.75, '#fca5a5'],
  [1, '#b91c1c'],
]

function hexLerp(a: string, b: string, t: number): string {
  const pa = [Number.parseInt(a.slice(1, 3), 16), Number.parseInt(a.slice(3, 5), 16), Number.parseInt(a.slice(5, 7), 16)]
  const pb = [Number.parseInt(b.slice(1, 3), 16), Number.parseInt(b.slice(3, 5), 16), Number.parseInt(b.slice(5, 7), 16)]
  const mixed = pa.map((channel, i) => Math.round(channel + ((pb[i] ?? channel) - channel) * t))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Map a value through the named ramp (degenerate ranges land mid-ramp). */
export function colorForField(value: number, min: number, max: number, policy: ColorPolicy = 'viridis'): string {
  const ramp = policy === 'viridis' ? VIRIDIS : policy === 'diverging' ? DIVERGING : BLUE_RED
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
    return ramp[Math.floor(ramp.length / 2)]?.[1] ?? '#26828e'
  }
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)))
  for (let s = 0; s < ramp.length - 1; s += 1) {
    const [t0, c0] = ramp[s] ?? [0, '#440154']
    const [t1, c1] = ramp[s + 1] ?? [1, '#fde725']
    if (t >= t0 && t <= t1 && t1 > t0) {
      return hexLerp(c0, c1, (t - t0) / (t1 - t0))
    }
  }
  return ramp[ramp.length - 1]?.[1] ?? '#fde725'
}

export interface ResolvedScale {
  min: number
  max: number
  /** True when the selection fell back (degenerate data or bad fixed bounds). */
  fallback: boolean
  note: string | null
}

/**
 * Resolve the colour-scale bounds honestly: auto follows finite data;
 * symmetric centres on zero; fixed needs finite min below max.
 * Anything unusable falls back to the data range (or 0–1 when even
 * that is degenerate) with a stated note — never a silent range.
 */
export function resolveScale(dataMin: number, dataMax: number, selection: ScaleSelection): ResolvedScale {
  const finiteData = Number.isFinite(dataMin) && Number.isFinite(dataMax) && dataMax > dataMin;
  if (selection.policy === 'fixed') {
    const { fixedMin, fixedMax } = selection
    if (fixedMin !== null && fixedMax !== null && Number.isFinite(fixedMin) && Number.isFinite(fixedMax) && fixedMax > fixedMin) {
      return { min: fixedMin, max: fixedMax, fallback: false, note: null }
    }
    if (finiteData) {
      return { min: dataMin, max: dataMax, fallback: true, note: 'Fixed bounds invalid: fell back to the data range.' }
    }
    return { min: 0, max: 1, fallback: true, note: 'No finite values: fell back to 0–1.' }
  }
  if (!finiteData) {
    return { min: 0, max: 1, fallback: true, note: 'No finite values: fell back to 0–1.' }
  }
  if (selection.policy === 'symmetric') {
    const m = Math.max(Math.abs(dataMin), Math.abs(dataMax))
    if (!(m > 0)) {
      return { min: -1, max: 1, fallback: true, note: 'Constant zero field: fell back to −1–1.' }
    }
    return { min: -m, max: m, fallback: false, note: null }
  }
  return { min: dataMin, max: dataMax, fallback: false, note: null }
}

export interface ContourLevel {
  value: number
  segments: Array<Array<{ x: number; y: number }>>
}

/**
 * Level contours via the shared marching-squares sampler: each level
 * `c` contours the offset field `f − c`. Levels come from an explicit
 * list or evenly span the probed finite range. Singular cells are the
 * sampler's business (documented there); levels with no crossings
 * return empty segment lists, never errors.
 */
export function contourLevels(
  field: FieldEvaluator,
  source: string,
  domain: SurfaceDomain,
  levels: number[],
  pixelWidth: number,
): ContourLevel[] {
  return levels.map((value) => {
    if (!Number.isFinite(value)) {
      return { value, segments: [] }
    }
    const offset: FieldEvaluator = {
      evaluateField: (x, y, parameters) => {
        const result = field.evaluateField(x, y, parameters)
        if (result === null || !Number.isFinite(result.value)) {
          return null
        }
        const shifted = result.value - value
        return Number.isFinite(shifted) ? { value: shifted } : null
      },
    }
    const sampled = sampleImplicit(offset, { xMin: domain.xMin, xMax: domain.xMax, yMin: domain.yMin, yMax: domain.yMax, pixelWidth })
    void source
    return {
      value,
      segments: sampled.segments.map((segment) => segment.points.map((point) => ({ x: point.x, y: point.y }))),
    }
  })
}

/** Parse an explicit level list (`1, 2.5, 4`); blanks ignored, garbage named. */
export function parseLevelList(text: string): { levels: number[] } | { error: string } {
  const parts = text.split(',').map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0) {
    return { levels: [] }
  }
  const levels: number[] = []
  for (const part of parts) {
    const value = Number(part)
    if (!Number.isFinite(value)) {
      return { error: `"${part}" is not a finite contour level.` }
    }
    levels.push(value)
  }
  return { levels }
}

/** Evenly spaced levels across a finite range (count ≥ 1). */
export function autoLevels(min: number, max: number, count: number): number[] {
  if (!(max > min) || !Number.isInteger(count) || count < 1) {
    return []
  }
  if (count === 1) {
    return [(min + max) / 2]
  }
  return Array.from({ length: count }, (_, i) => min + ((max - min) * (i + 1)) / (count + 1))
}

/** Probe the finite data range over a coarse grid (documented cost: one extra pass). */
export function probeRange(
  field: FieldEvaluator,
  source: string,
  domain: SurfaceDomain,
  parameterValues: Record<string, number> = {},
): { min: number; max: number } {
  const sampled = sampleSurface(field, { source, domain, resolution: 48 }, parameterValues)
  return { min: sampled.finiteMin, max: sampled.finiteMax }
}

export type ArrowMode = 'magnitude' | 'unit'
export type FieldMode = 'contour' | 'heatmap' | 'vectors'

export const FIELD_VIEW_SIZE = { width: 640, height: 440 } as const
export const FIELD_RESOLUTIONS = [16, 24, 32, 48] as const

export interface FieldViewState {
  mode: FieldMode
  source: string
  uSource: string
  vSource: string
  domain: SurfaceDomain
  resolution: number
  levelCount: number
  levelList: string
  colorPolicy: ColorPolicy
  scalePolicy: ScalePolicy
  fixedMin: string
  fixedMax: string
  arrowMode: ArrowMode
  showGrid: boolean
  title: string
}

export function defaultFieldState(): FieldViewState {
  return {
    mode: 'contour',
    source: 'x^2+y^2',
    uSource: '-y',
    vSource: 'x',
    domain: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
    resolution: 32,
    levelCount: 8,
    levelList: '',
    colorPolicy: 'viridis',
    scalePolicy: 'auto',
    fixedMin: '',
    fixedMax: '',
    arrowMode: 'magnitude',
    showGrid: true,
    title: 'Field',
  }
}

/** Swatch stops for a legend colorbar (count boxes from min to max). */
export function colorbarStops(min: number, max: number, policy: ColorPolicy, count = 12): Array<{ t: number; color: string }> {
  return Array.from({ length: Math.max(2, count) }, (_, i) => {
    const t = i / (Math.max(2, count) - 1)
    return { t, color: colorForField(min + t * (max - min), min, max, policy) }
  })
}

export interface ArrowLayout {
  x: number
  y: number
  angle: number
  /** Display length in data units (unit mode: constant — direction only). */
  length: number
  magnitude: number
}

export interface ArrowGrid {
  arrows: ArrowLayout[]
  /** Stride applied (every k-th grid arrow drawn); 1 means all. */
  stride: number
  maxMagnitude: number
}

/** Arrow density cap per side (visible, bounded, tested). */
export const MAX_ARROWS_PER_SIDE = 32

/**
 * Lay out arrows from sampled vectors: stride downsampling bounds
 * density at MAX_ARROWS_PER_SIDE sampled columns per side plus the
 * boundary column (at most 33; the test pins that bound and the view
 * states the exact drawn count and step); magnitude mode scales length
 * by |v|/max with a 15% floor so zeros stay visible as dots;
 * unit mode draws equal arrows and says direction-only.
 */
export function layoutArrows(
  vectors: Array<{ x: number; y: number; u: number; v: number } | null>,
  gridN: number,
  mode: ArrowMode,
  baseLength: number,
): ArrowGrid {
  const perSide = gridN + 1
  const stride = Math.max(1, Math.ceil(perSide / (MAX_ARROWS_PER_SIDE + 1)))
  const finite = vectors.filter((arrow): arrow is { x: number; y: number; u: number; v: number } => arrow !== null)
  const maxMagnitude = finite.reduce((top, arrow) => Math.max(top, Math.hypot(arrow.u, arrow.v)), 0)
  const arrows: ArrowLayout[] = []
  for (let j = 0; j < perSide; j += stride) {
    for (let i = 0; i < perSide; i += stride) {
      const arrow = vectors[j * perSide + i]
      if (arrow === null || arrow === undefined) {
        continue
      }
      const magnitude = Math.hypot(arrow.u, arrow.v)
      const length = mode === 'unit' ? baseLength : baseLength * (maxMagnitude > 0 ? 0.15 + (0.85 * magnitude) / maxMagnitude : 0.15)
      arrows.push({ x: arrow.x, y: arrow.y, angle: Math.atan2(arrow.v, arrow.u), length, magnitude })
    }
  }
  return { arrows, stride, maxMagnitude }
}
