import { compileExpression, type FieldEvaluator } from '../math/index.ts'

/**
 * 3D surface mathematics (Stage 6): bounded `z = f(x, y)` sampling and
 * software projection. Pure numerics — no React, no DOM, no WebGL.
 * Grids are capped (`MAX_SURFACE_GRID`), evaluations counted, and
 * invalid values become holes (quads touching one are dropped, never
 * bridged). Parametric 3D curves are a clean follow-up (a second
 * sampler over the same projection); they are deferred, not half-built.
 */

export interface SurfaceDomain {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface SurfaceSpec {
  source: string
  domain: SurfaceDomain
  /** Grid cells per side (quads N×N, vertices (N+1)²). */
  resolution: number
}

/** Offered grid densities; anything else is refused, not rounded silently. */
export const SURFACE_RESOLUTIONS = [24, 48, 80, 120] as const
export const MAX_SURFACE_GRID = 128
export const MIN_SURFACE_GRID = 8
/** Below this density the view warns that features may be missed. */
export const COARSE_RESOLUTION = 48

export interface Camera {
  /** Orbit around the z-axis, radians. */
  yaw: number
  /** Elevation above the xy-plane, radians (−π/2, π/2 exclusive). */
  pitch: number
  /** View distance in world units (perspective strength). */
  distance: number
  panX: number
  panY: number
}

export const DEFAULT_CAMERA: Camera = { yaw: -Math.PI / 4, pitch: Math.PI / 5, distance: 12, panX: 0, panY: 0 }

/** Displayed 3D scatter points cap (stride downsampling stated live). */
export const MAX_SCATTER_POINTS = 2000

/** Fixed scatter figure size (viewBox scaling keeps aspect on resize). */
export const SCATTER_VIEW_SIZE = { width: 640, height: 440 } as const

/** Clamp a camera to its stable envelope (pole exclusion, distance fence). */
export function clampCamera(camera: Camera): Camera {
  return {
    yaw: Number.isFinite(camera.yaw) ? camera.yaw : DEFAULT_CAMERA.yaw,
    pitch: Number.isFinite(camera.pitch) ? Math.min(Math.PI / 2 - 0.05, Math.max(-Math.PI / 2 + 0.05, camera.pitch)) : DEFAULT_CAMERA.pitch,
    distance: Number.isFinite(camera.distance) ? Math.min(60, Math.max(4, camera.distance)) : DEFAULT_CAMERA.distance,
    panX: Number.isFinite(camera.panX) ? Math.min(1e6, Math.max(-1e6, camera.panX)) : 0,
    panY: Number.isFinite(camera.panY) ? Math.min(1e6, Math.max(-1e6, camera.panY)) : 0,
  }
}

export type InspectedPoint = { status: 'value'; x: number; y: number; z: number } | { status: 'hole' } | { status: 'empty' }

/**
 * Click-to-inspect: nearest sampled vertex to a screen point (same
 * projection as the render, so the marker always sits on drawn
 * geometry). Holes report as holes; empty space reports empty —
 * never a fabricated coordinate.
 */
export function inspectSurface(
  sampled: SampledSurface,
  spec: SurfaceSpec,
  camera: Camera,
  size: { width: number; height: number },
  px: number,
  py: number,
  tolerancePx = 24,
): InspectedPoint {
  const n = sampled.resolution
  const frame = makeProjectionFrame(spec, camera, size)
  let best: { d2: number; i: number; j: number } | null = null
  for (let j = 0; j <= n; j += 1) {
    const y = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
    for (let i = 0; i <= n; i += 1) {
      const x = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
      const value = sampled.grid[j * (n + 1) + i]
      if (value === null || value === undefined) {
        continue
      }
      const placed = projectWorldPoint(frame, x, y, value)
      if (placed === null || !Number.isFinite(placed.px) || !Number.isFinite(placed.py)) {
        continue
      }
      const d2 = (placed.px - px) * (placed.px - px) + (placed.py - py) * (placed.py - py)
      if (best === null || d2 < best.d2) {
        best = { d2, i, j }
      }
    }
  }
  if (best === null || best.d2 > tolerancePx * tolerancePx) {
    // No vertex nearby: distinguish holes from empty space by checking
    // whether a hole vertex sits under the cursor instead.
    for (let j = 0; j <= n; j += 1) {
      const y = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
      for (let i = 0; i <= n; i += 1) {
        const x = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
        const value = sampled.grid[j * (n + 1) + i]
        if (value !== null && value !== undefined) {
          continue
        }
        // Holes have no z to project: reuse the local mean plane value.
        const neighbours: number[] = []
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const v = sampled.grid[(j + dj) * (n + 1) + (i + di)]
          if (typeof v === 'number' && Number.isFinite(v)) {
            neighbours.push(v)
          }
        }
        if (neighbours.length === 0) {
          continue
        }
        const mean = neighbours.reduce((s, v) => s + v, 0) / neighbours.length
        const placed = projectWorldPoint(frame, x, y, mean)
        if (placed === null) {
          continue
        }
        const d2 = (placed.px - px) * (placed.px - px) + (placed.py - py) * (placed.py - py)
        if (d2 <= tolerancePx * tolerancePx) {
          return { status: 'hole' }
        }
      }
    }
    return { status: 'empty' }
  }
  const j = best.j
  const i = best.i
  const x = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
  const y = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
  const z = sampled.grid[j * (n + 1) + i]
  if (typeof z !== 'number' || !Number.isFinite(z)) {
    return { status: 'hole' }
  }
  return { status: 'value', x, y, z }
}

export type SurfaceAppearance = 'solid' | 'wireframe' | 'shaded'

export interface SurfaceViewState {
  source: string
  domain: SurfaceDomain
  resolution: number
  camera: Camera
  showGrid: boolean
  title: string
  appearance: SurfaceAppearance
}

export function defaultSurfaceState(): SurfaceViewState {
  return {
    source: 'x^2+y^2',
    domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    resolution: 48,
    camera: { ...DEFAULT_CAMERA },
    showGrid: true,
    title: 'Paraboloid',
    appearance: 'solid',
  }
}

export type SurfaceCompileOutcome =
  | { ok: true; field: FieldEvaluator; parameterNames: string[] }
  | { ok: false; error: string }

/** Compile once through the gated engine (`x`, `y` only plus parameters). */
export function compileSurface(source: string, parameterNames: string[]): SurfaceCompileOutcome {
  const compiled = compileExpression(source, { parameters: parameterNames, variables: ['x', 'y'] })
  if (!compiled.ok) {
    return { ok: false, error: compiled.error.message }
  }
  return {
    ok: true,
    field: {
      evaluateField: (x, y, parameterValues) => {
        const result = compiled.expression.evaluateRecord({ x, y }, parameterValues)
        if (result.kind !== 'value') {
          return null
        }
        return { value: result.value }
      },
    },
    parameterNames: compiled.expression.parameterNames,
  }
}

export function validateSurfaceSpec(spec: SurfaceSpec): string | null {
  const { domain, resolution } = spec
  for (const [key, value] of [['xMin', domain.xMin], ['xMax', domain.xMax], ['yMin', domain.yMin], ['yMax', domain.yMax]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Surface domain ${key} must be finite.`
    }
  }
  if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)) {
    return 'Surface domain needs max above min on both axes.'
  }
  if (!Number.isInteger(resolution) || resolution < MIN_SURFACE_GRID || resolution > MAX_SURFACE_GRID) {
    return `Resolution must be an integer from ${MIN_SURFACE_GRID} to ${MAX_SURFACE_GRID} (offered: ${SURFACE_RESOLUTIONS.join(', ')}).`
  }
  if (spec.source.trim() === '') {
    return 'The surface needs an expression in x and y.'
  }
  return null
}

export interface SampledSurface {
  /** (N+1)² values row-major; null = hole (invalid at that vertex). */
  grid: Array<number | null>
  resolution: number
  evals: number
  holes: number
  finiteMin: number
  finiteMax: number
}

/** Sample the bounded grid; every vertex evaluated once, holes counted. */
export function sampleSurface(
  field: FieldEvaluator,
  spec: SurfaceSpec,
  parameterValues: Record<string, number> = {},
): SampledSurface {
  const n = spec.resolution
  const grid: Array<number | null> = new Array((n + 1) * (n + 1)).fill(null)
  let holes = 0
  let finiteMin = Number.POSITIVE_INFINITY
  let finiteMax = Number.NEGATIVE_INFINITY
  for (let j = 0; j <= n; j += 1) {
    const y = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
    for (let i = 0; i <= n; i += 1) {
      const x = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
      const result = field.evaluateField(x, y, parameterValues)
      const value = result !== null && Number.isFinite(result.value) ? result.value : null
      grid[j * (n + 1) + i] = value
      if (value === null) {
        holes += 1
      } else {
        finiteMin = Math.min(finiteMin, value)
        finiteMax = Math.max(finiteMax, value)
      }
    }
  }
  return { grid, resolution: n, evals: (n + 1) * (n + 1), holes, finiteMin, finiteMax }
}

export interface ProjectedQuad {
  /** Screen-space corners (already in pixels for the target size). */
  corners: [{ px: number; py: number }, { px: number; py: number }, { px: number; py: number }, { px: number; py: number }]
  /** Mean view depth; larger = farther (painter order: far first). */
  depth: number
  /** Mean z value (colour mapping). */
  value: number
  /** Flat-shading factor from the face normal (1 = fully lit). */
  shade: number
}

export interface ProjectedAxes {
  origin: { px: number; py: number }
  xEnd: { px: number; py: number }
  yEnd: { px: number; py: number }
  zEnd: { px: number; py: number }
}

function rotateYawPitch(x: number, y: number, z: number, yaw: number, pitch: number): { x: number; y: number; z: number } {
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const x1 = x * cosY - y * sinY
  const y1 = x * sinY + y * cosY
  const cosP = Math.cos(pitch)
  const sinP = Math.sin(pitch)
  return { x: x1, y: y1 * cosP - z * sinP, z: y1 * sinP + z * cosP }
}

export interface ProjectionFrame {
  cx: number
  cy: number
  span: number
  camera: Camera
  size: { width: number; height: number }
}

/** Shared frame: domain centre, span, camera, and target size. */
export function makeProjectionFrame(spec: { domain: SurfaceDomain }, camera: Camera, size: { width: number; height: number }): ProjectionFrame {
  return {
    cx: (spec.domain.xMin + spec.domain.xMax) / 2 + camera.panX,
    cy: (spec.domain.yMin + spec.domain.yMax) / 2 + camera.panY,
    span: Math.max(spec.domain.xMax - spec.domain.xMin, spec.domain.yMax - spec.domain.yMin, 1e-9),
    camera,
    size,
  }
}

/** Project one world point to pixels (null when behind the camera math). */
export function projectWorldPoint(frame: ProjectionFrame, x: number, y: number, z: number): { px: number; py: number; depth: number } | null {
  const rotated = rotateYawPitch(x - frame.cx, y - frame.cy, z, frame.camera.yaw, frame.camera.pitch)
  const depth = rotated.y
  const factor = frame.camera.distance / Math.max(1e-9, frame.camera.distance + depth)
  if (!Number.isFinite(factor)) {
    return null
  }
  const scale = Math.min(frame.size.width, frame.size.height) / (frame.span * 1.9)
  return { px: frame.size.width / 2 + rotated.x * scale * factor, py: frame.size.height / 2 - rotated.z * scale * factor, depth }
}

/**
 * Project the grid to pixels: centre on the domain, orbit, then
 * perspective-divide by view distance. Quads touching a hole are
 * dropped (never bridged); output is depth-sorted far-to-near
 * (largest view depth first — larger depth means farther, so painting
 * in array order lets nearer quads cover farther ones).
 */
export function projectSurface(
  sampled: SampledSurface,
  spec: SurfaceSpec,
  camera: Camera,
  size: { width: number; height: number },
): { quads: ProjectedQuad[]; axes: ProjectedAxes; dropped: number } {
  const n = sampled.resolution
  const frame = makeProjectionFrame(spec, camera, size)
  const place = (x: number, y: number, z: number): { px: number; py: number; depth: number } | null => projectWorldPoint(frame, x, y, z)
  const at = (i: number, j: number): number | null => sampled.grid[j * (n + 1) + i] ?? null
  const quads: ProjectedQuad[] = []
  let dropped = 0
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x0 = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
      const x1 = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * (i + 1)) / n
      const y0 = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
      const y1 = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * (j + 1)) / n
      const v00 = at(i, j)
      const v10 = at(i + 1, j)
      const v01 = at(i, j + 1)
      const v11 = at(i + 1, j + 1)
      if (v00 === null || v10 === null || v01 === null || v11 === null) {
        dropped += 1
        continue
      }
      const p00 = place(x0, y0, v00)
      const p10 = place(x1, y0, v10)
      const p11 = place(x1, y1, v11)
      const p01 = place(x0, y1, v01)
      if (p00 === null || p10 === null || p11 === null || p01 === null) {
        dropped += 1
        continue
      }
      quads.push({
        corners: [{ px: p00.px, py: p00.py }, { px: p10.px, py: p10.py }, { px: p11.px, py: p11.py }, { px: p01.px, py: p01.py }],
        depth: (p00.depth + p10.depth + p11.depth + p01.depth) / 4,
        value: (v00 + v10 + v11 + v01) / 4,
        shade: shadeFactor(-(v10 - v00) * (y1 - y0), -(x1 - x0) * (v01 - v00), (x1 - x0) * (y1 - y0)),
      })
    }
  }
  // Far first: larger view depth means farther (perspective shrinks it), and
  // both renderers paint in array order — later polygons sit on top — so
  // nearest quads must come last to win their occlusion overlaps.
  quads.sort((a, b) => b.depth - a.depth)
  const zTop = sampled.finiteMin <= sampled.finiteMax ? sampled.finiteMax : 0
  const corner = (x: number, y: number, z: number): { px: number; py: number } => {
    const placed = place(x, y, z)
    return { px: placed?.px ?? Number.NaN, py: placed?.py ?? Number.NaN }
  };
  const axes: ProjectedAxes = {
    origin: corner(spec.domain.xMin, spec.domain.yMin, 0),
    xEnd: corner(spec.domain.xMax, spec.domain.yMin, 0),
    yEnd: corner(spec.domain.xMin, spec.domain.yMax, 0),
    zEnd: corner(spec.domain.xMin, spec.domain.yMin, zTop),
  }
  return { quads, axes, dropped }
}

/** Fixed height ramp (light-theme figure convention): low blue → high red. */
const RAMP: Array<[number, string]> = [
  [0, '#1d4ed8'],
  [0.25, '#0e7490'],
  [0.5, '#047857'],
  [0.75, '#c2410c'],
  [1, '#b91c1c'],
]

function hexLerp(a: string, b: string, t: number): string {
  const pa = [Number.parseInt(a.slice(1, 3), 16), Number.parseInt(a.slice(3, 5), 16), Number.parseInt(a.slice(5, 7), 16)]
  const pb = [Number.parseInt(b.slice(1, 3), 16), Number.parseInt(b.slice(3, 5), 16), Number.parseInt(b.slice(5, 7), 16)]
  const mixed = pa.map((channel, i) => Math.round(channel + ((pb[i] ?? channel) - channel) * t))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Fixed key-light direction for flat shading (documented, deterministic). */
export const SHADE_LIGHT = { x: -0.35, y: 0.5, z: 0.79 }

/** Multiply a hex colour by a non-negative factor (flat-shading application). */
export function shadeColor(hex: string, factor: number): string {
  const channels = [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)]
  const scaled = channels.map((channel) => Math.min(255, Math.max(0, Math.round(channel * factor))))
  return `#${scaled.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Flat-shading factor from a world-space face: 0.45 + 0.55 × max(0, n·L). */
export function shadeFactor(nx: number, ny: number, nz: number): number {
  const length = Math.hypot(nx, ny, nz)
  if (!(length > 0)) {
    return 0.45
  }
  const dot = (nx * SHADE_LIGHT.x + ny * SHADE_LIGHT.y + nz * SHADE_LIGHT.z) / length / Math.hypot(SHADE_LIGHT.x, SHADE_LIGHT.y, SHADE_LIGHT.z)
  return 0.45 + 0.55 * Math.max(0, dot)
}

/** Map a z value to the ramp (constant surfaces land mid-ramp with a note from the caller). */
export function colorForValue(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
    return RAMP[2]?.[1] ?? '#047857'
  }
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)))
  for (let s = 0; s < RAMP.length - 1; s += 1) {
    const [t0, c0] = RAMP[s] ?? [0, '#1d4ed8']
    const [t1, c1] = RAMP[s + 1] ?? [1, '#b91c1c']
    if (t >= t0 && t <= t1 && t1 > t0) {
      return hexLerp(c0, c1, (t - t0) / (t1 - t0))
    }
  }
  return RAMP[RAMP.length - 1]?.[1] ?? '#b91c1c'
}

export interface Scatter3DState {
  datasetId: string | null
  xId: string | null
  yId: string | null
  zId: string | null
  camera: Camera
  title: string
}

export function defaultScatterState(): Scatter3DState {
  return { datasetId: null, xId: null, yId: null, zId: null, camera: { ...DEFAULT_CAMERA }, title: '3D scatter' }
}

export interface VectorFieldSpec {
  /** u-component source in x and y. */
  uSource: string
  /** v-component source in x and y. */
  vSource: string
  domain: SurfaceDomain
  /** Arrow grid cells per side (arrows (N+1)², same caps as surfaces). */
  resolution: number
}

export interface SampledVector {
  x: number
  y: number
  u: number
  v: number
}

export interface SampledVectorField {
  arrows: Array<SampledVector | null>
  resolution: number
  evals: number
  holes: number
  maxMagnitude: number
}

/**
 * Vector-field model (Stage 6 S6.1 foundation): two engine-gated
 * components sampled on a bounded grid. No renderer yet — the model,
 * validation, and sampling land first so a future renderer cannot
 * reshape the mathematics. Invalid components become holes, exactly
 * like surface vertices.
 */
export function validateVectorFieldSpec(spec: VectorFieldSpec): string | null {
  for (const [key, source] of [['u', spec.uSource], ['v', spec.vSource]] as const) {
    if (typeof source !== 'string' || source.trim() === '') {
      return `Vector component ${key} needs an expression in x and y.`
    }
  }
  if (!Number.isInteger(spec.resolution) || spec.resolution < MIN_SURFACE_GRID || spec.resolution > MAX_SURFACE_GRID) {
    return `Resolution must be an integer from ${MIN_SURFACE_GRID} to ${MAX_SURFACE_GRID}.`
  }
  const { domain } = spec
  for (const [key, value] of [['xMin', domain.xMin], ['xMax', domain.xMax], ['yMin', domain.yMin], ['yMax', domain.yMax]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Vector domain ${key} must be finite.`
    }
  }
  if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)) {
    return 'Vector domain needs max above min on both axes.'
  }
  return null
}

export function sampleVectorField(
  uField: FieldEvaluator,
  vField: FieldEvaluator,
  spec: VectorFieldSpec,
  parameterValues: Record<string, number> = {},
): SampledVectorField {
  const n = spec.resolution
  const arrows: Array<SampledVector | null> = []
  let holes = 0
  let maxMagnitude = 0
  for (let j = 0; j <= n; j += 1) {
    const y = spec.domain.yMin + ((spec.domain.yMax - spec.domain.yMin) * j) / n
    for (let i = 0; i <= n; i += 1) {
      const x = spec.domain.xMin + ((spec.domain.xMax - spec.domain.xMin) * i) / n
      const u = uField.evaluateField(x, y, parameterValues)
      const v = vField.evaluateField(x, y, parameterValues)
      const uu = u !== null && Number.isFinite(u.value) ? u.value : null
      const vv = v !== null && Number.isFinite(v.value) ? v.value : null
      if (uu === null || vv === null) {
        holes += 1
        arrows.push(null)
        continue
      }
      maxMagnitude = Math.max(maxMagnitude, Math.hypot(uu, vv))
      arrows.push({ x, y, u: uu, v: vv })
    }
  }
  return { arrows, resolution: n, evals: 2 * (n + 1) * (n + 1), holes, maxMagnitude }
}
