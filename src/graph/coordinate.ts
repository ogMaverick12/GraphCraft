/**
 * Coordinate utilities (GS-02): the single place where mathematical world
 * coordinates become screen pixels. UI components must use these functions
 * and never invent their own conversion. Pure TypeScript, no React/DOM.
 */

export interface WorldRect {
  readonly xMin: number
  readonly xMax: number
  readonly yMin: number
  readonly yMax: number
}

export interface SizePx {
  readonly width: number
  readonly height: number
}

export interface ScreenPoint {
  readonly px: number
  readonly py: number
}

export interface WorldPoint {
  readonly x: number
  readonly y: number
}

export interface ViewTransform {
  readonly world: WorldRect
  /** Effective visible bounds (equal-aspect may widen one axis). */
  readonly visible: WorldRect
  readonly size: SizePx
  readonly equalAspect: boolean
  /** Pixels per world unit on each axis. */
  readonly scaleX: number
  readonly scaleY: number
}

function isValidRect(world: WorldRect): boolean {
  return (
    Number.isFinite(world.xMin) &&
    Number.isFinite(world.xMax) &&
    Number.isFinite(world.yMin) &&
    Number.isFinite(world.yMax) &&
    world.xMax > world.xMin &&
    world.yMax > world.yMin
  )
}

/** Absolute coordinate fence: panning can never leave this square. */
export const MAX_WORLD_COORD = 1e12
/** Narrowest visible span per axis near the origin: zooming in stops here. */
export const MIN_WORLD_SPAN = 1e-6
/** Widest visible span per axis: zooming out stops here. */
export const MAX_WORLD_SPAN = 1e12

/**
 * Unit in the last place — the spacing between consecutive doubles — at
 * |x| = magnitude: 2^(floor(log2(magnitude)) − 52). At 1e12 that is
 * 2^-13 ≈ 1.22e-4. An offset below one ulp added to a value of this
 * magnitude does not change the number (the floating-point bug class this
 * helper exists to prevent). Returns 0 for 0, subnormals, and non-finite
 * input; callers combine it with MIN_WORLD_SPAN.
 */
function ulpAt(magnitude: number): number {
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) {
    return 0
  }
  return Math.pow(2, Math.floor(Math.log2(magnitude)) - 52)
}

/**
 * Smallest span whose two edges stay strictly ordered and exactly
 * representable around coordinates of this magnitude. Half a ulp per side
 * only reaches a rounding tie, so the policy is one full ulp per side —
 * 2 × ulp(magnitude) — which also covers binade boundaries. It replaces
 * the fixed MIN_WORLD_SPAN once magnitude makes it larger: 1e-6 near the
 * origin, 2.44e-4 at the ±1e12 fence.
 */
function minRepresentableSpan(magnitude: number): number {
  return Math.max(MIN_WORLD_SPAN, 2 * ulpAt(magnitude))
}

/** Clamp one coordinate into the absolute fence. */
function clampToFence(value: number): number {
  return Math.max(-MAX_WORLD_COORD, Math.min(MAX_WORLD_COORD, value))
}

/**
 * Build an ordered interval of `span` centred on `mid`, shifted inward when
 * the centred interval would cross the fence. Both shifted edges are exact
 * doubles: a span forced at the fence is a power-of-two multiple of the
 * local ulp, so `MAX_WORLD_COORD − span` is representable, not a rounded
 * approximation.
 */
function anchorSpan(mid: number, span: number): [number, number] {
  const half = span / 2
  if (mid - half < -MAX_WORLD_COORD) {
    return [-MAX_WORLD_COORD, -MAX_WORLD_COORD + span]
  }
  if (mid + half > MAX_WORLD_COORD) {
    return [MAX_WORLD_COORD - span, MAX_WORLD_COORD]
  }
  return [mid - half, mid + half]
}

function clampAxis(min: number, max: number): [number, number] {
  const lo = Number.isFinite(min) ? clampToFence(min) : -10
  const hi = Number.isFinite(max) ? clampToFence(max) : 10
  const span = hi - lo
  if (hi > lo && span >= minRepresentableSpan(Math.max(Math.abs(lo), Math.abs(hi))) && span <= MAX_WORLD_SPAN) {
    // Already valid and representable: preserve the requested interval
    // exactly — no re-centring round trip that could perturb it.
    return [lo, hi]
  }
  const mid = clampToFence((lo + hi) / 2)
  // Inverted/collapsed intervals and below-floor spans expand to the local
  // representable floor; oversized spans compress to MAX_WORLD_SPAN. Both
  // results are deterministic and stay inside the fence via anchorSpan.
  const target = hi > lo && span > MAX_WORLD_SPAN ? MAX_WORLD_SPAN : minRepresentableSpan(Math.abs(mid))
  return anchorSpan(mid, target)
}

/**
 * Sanitize a world rectangle: finite, strictly ordered, spans within
 * [MIN_WORLD_SPAN, MAX_WORLD_SPAN] using the magnitude-aware representable
 * floor, coordinates within the fence. Pan/zoom apply this so the view can
 * never reach an unrenderable state; imported and restored viewports run
 * through the same policy before rendering.
 */
export function clampWorldRect(world: WorldRect): WorldRect {
  const [xMin, xMax] = clampAxis(world.xMin, world.xMax)
  const [yMin, yMax] = clampAxis(world.yMin, world.yMax)
  return { xMin, xMax, yMin, yMax }
}

/**
 * Build a transform for a world rectangle drawn into a pixel size.
 * With `equalAspect`, the axis with the coarser scale is widened
 * symmetrically about its centre so 1 x-unit equals 1 y-unit in pixels.
 */
export function createTransform(world: WorldRect, size: SizePx, equalAspect: boolean): ViewTransform {
  if (!isValidRect(world)) {
    throw new Error('createTransform requires finite bounds with max > min on both axes.')
  }
  if (!(size.width > 0) || !(size.height > 0) || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    throw new Error('createTransform requires a finite positive pixel size.')
  }
  let visible = world
  let scaleX = size.width / (world.xMax - world.xMin)
  let scaleY = size.height / (world.yMax - world.yMin)
  if (equalAspect) {
    const scale = Math.min(scaleX, scaleY)
    const xSpan = size.width / scale
    const ySpan = size.height / scale
    const xMid = (world.xMin + world.xMax) / 2
    const yMid = (world.yMin + world.yMax) / 2
    visible = { xMin: xMid - xSpan / 2, xMax: xMid + xSpan / 2, yMin: yMid - ySpan / 2, yMax: yMid + ySpan / 2 }
    scaleX = scale
    scaleY = scale
  }
  return { world, visible, size, equalAspect, scaleX, scaleY }
}

export function worldToScreen(t: ViewTransform, x: number, y: number): ScreenPoint {
  const { visible, size, scaleX, scaleY } = t
  return { px: (x - visible.xMin) * scaleX, py: size.height - (y - visible.yMin) * scaleY }
}

export function screenToWorld(t: ViewTransform, px: number, py: number): WorldPoint {
  const { visible, size, scaleX, scaleY } = t
  return { x: visible.xMin + px / scaleX, y: visible.yMin + (size.height - py) / scaleY }
}

/** Effective visible world bounds (accounts for equal-aspect widening). */
export function visibleWorldBounds(t: ViewTransform): WorldRect {
  return t.visible
}

/**
 * Screen position of the x/y axes. When zero lies outside the visible
 * range the axis clamps to the nearest viewport edge.
 */
export function axisScreenPosition(t: ViewTransform): { xAxisPy: number; yAxisPx: number } {
  const atLeft = worldToScreen(t, t.visible.xMin, 0).px
  const atRight = worldToScreen(t, t.visible.xMax, 0).px
  const atBottom = worldToScreen(t, 0, t.visible.yMin).py
  const atTop = worldToScreen(t, 0, t.visible.yMax).py
  const yAxisPx = t.visible.xMin <= 0 && 0 <= t.visible.xMax ? worldToScreen(t, 0, 0).px : t.visible.xMax < 0 ? atRight : atLeft
  const xAxisPy = t.visible.yMin <= 0 && 0 <= t.visible.yMax ? worldToScreen(t, 0, 0).py : t.visible.yMax < 0 ? atTop : atBottom
  return { xAxisPy, yAxisPx }
}

// --- Ticks (1/2/5 × 10^n) ---

export interface Tick {
  readonly value: number
  readonly label: string
}

/** Step from the 1/2/5 × 10^n family near range/targetCount. */
export function tickStep(min: number, max: number, targetCount: number): number {
  const span = max - min
  if (!(span > 0) || !Number.isFinite(span) || !(targetCount >= 2)) {
    throw new Error('tickStep requires a positive finite span and targetCount >= 2.')
  }
  return familyStep(span / targetCount)
}

/** Smallest 1/2/5 × 10^n value that is ≥ raw. */
function familyStep(raw: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const multiple of [1, 2, 5, 10]) {
    if (multiple * power >= raw) {
      return multiple * power
    }
  }
  return 10 * power
}

/** Human label: plain decimals near 1, exponential for extreme magnitudes. */
export function formatTickValue(value: number, step: number): string {
  if (value === 0) {
    return '0'
  }
  const magnitude = Math.abs(value)
  if (magnitude >= 1e6 || magnitude < 1e-4) {
    return value.toExponential(1).replace('e+', 'e')
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const fixed = value.toFixed(Math.min(decimals, 12))
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

/** Documented hard cap on tick-generation loop iterations per call. */
export const MAX_TICK_ITERATIONS = 256

/**
 * Ticks spanning [min, max] at the family step nearest the target count.
 *
 * Numerically sound by construction:
 * - invalid input (non-finite bounds or target count, empty/inverted or
 *   non-finite span) returns [] instead of throwing;
 * - the step is floored at one ulp of the largest magnitude in range, so
 *   `value + step` always changes the value — at 1e12 the ulp is ≈1.22e-4
 *   and any smaller family step would stall a repeated-addition loop;
 * - at most MAX_TICK_ITERATIONS iterations run, and every iteration either
 *   advances the value by a strictly larger double or breaks, which is the
 *   structural termination guarantee (no reliance on wall time);
 * - a tick is only emitted when it is finite, inside the loop's tolerance
 *   band and strictly greater than the previous one, so rounding cannot
 *   produce duplicates or out-of-range values;
 * - when the range cannot hold targetCount distinct representable ticks
 *   (a sub-ulp span near the fence), fewer — possibly zero — ticks are
 *   returned; that is the documented, deterministic fallback.
 * Ordinary ranges produce exactly the previous 1/2/5 ticks and labels.
 */
export function ticksForRange(min: number, max: number, targetCount: number): Tick[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !Number.isFinite(targetCount) || !(targetCount >= 2)) {
    return []
  }
  const span = max - min
  if (!(span > 0) || !Number.isFinite(span)) {
    return []
  }
  const floor = Math.max(span / targetCount, ulpAt(Math.max(Math.abs(min), Math.abs(max))))
  const step = familyStep(floor)
  if (!(step > 0) || !Number.isFinite(step)) {
    return []
  }
  const tolerance = step * 1e-9
  const ticks: Tick[] = []
  let v = Math.ceil(min / step - 1e-9) * step
  if (v < min) {
    // Rounding of the product pushed the first tick below the range; one
    // guarded bump restores it (step ≥ one ulp guarantees progress).
    const bumped = v + step
    if (bumped > v) {
      v = bumped
    }
  }
  for (let i = 0; i < MAX_TICK_ITERATIONS && Number.isFinite(v) && v <= max + tolerance; i += 1) {
    const value = Math.abs(v) < tolerance ? 0 : v
    const previous = ticks.length > 0 ? ticks[ticks.length - 1] : undefined
    if ((previous === undefined || value > previous.value) && value >= min - tolerance) {
      ticks.push({ value, label: formatTickValue(value, step) })
    }
    const next = v + step
    if (!(next > v)) {
      break // adding the step no longer progresses: structural termination
    }
    v = next
  }
  return ticks
}

// --- Clipping (Cohen–Sutherland, screen space, finite arithmetic) ---

export interface ClipRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

const INSIDE = 0
const LEFT = 1
const RIGHT = 2
const BOTTOM = 4
const TOP = 8

function outCode(p: ScreenPoint, rect: ClipRect): number {
  let code = INSIDE
  if (p.px < rect.x0) {
    code |= LEFT
  } else if (p.px > rect.x1) {
    code |= RIGHT
  }
  if (p.py < rect.y0) {
    code |= TOP
  } else if (p.py > rect.y1) {
    code |= BOTTOM
  }
  return code
}

/** Clip one segment; returns the visible sub-segment or null. */
function clipSegment(a: ScreenPoint, b: ScreenPoint, rect: ClipRect): [ScreenPoint, ScreenPoint] | null {
  let ax = a.px
  let ay = a.py
  let bx = b.px
  let by = b.py
  let codeA = outCode({ px: ax, py: ay }, rect)
  let codeB = outCode({ px: bx, py: by }, rect)
  for (let i = 0; i < 8; i += 1) {
    if ((codeA | codeB) === INSIDE) {
      return [
        { px: ax, py: ay },
        { px: bx, py: by },
      ]
    }
    if ((codeA & codeB) !== INSIDE) {
      return null
    }
    const code = codeA !== INSIDE ? codeA : codeB
    let x = 0
    let y = 0
    if ((code & TOP) !== 0) {
      x = ax + ((bx - ax) * (rect.y0 - ay)) / (by - ay)
      y = rect.y0
    } else if ((code & BOTTOM) !== 0) {
      x = ax + ((bx - ax) * (rect.y1 - ay)) / (by - ay)
      y = rect.y1
    } else if ((code & RIGHT) !== 0) {
      y = ay + ((by - ay) * (rect.x1 - ax)) / (bx - ax)
      x = rect.x1
    } else {
      y = ay + ((by - ay) * (rect.x0 - ax)) / (bx - ax)
      x = rect.x0
    }
    if (code === codeA) {
      ax = x
      ay = y
      codeA = outCode({ px: ax, py: ay }, rect)
    } else {
      bx = x
      by = y
      codeB = outCode({ px: bx, py: by }, rect)
    }
  }
  return null
}

/**
 * Clip a world polyline to the drawing rect. World points are first
 * clamped to a finite box (2× the visible span) so pole-adjacent values
 * cannot produce non-finite screen arithmetic, then mapped and clipped
 * per sub-segment. Returns visible runs — separation is preserved.
 */
export function clipPolyline(t: ViewTransform, points: ReadonlyArray<{ x: number; y: number }>): ScreenPoint[][] {
  const rect: ClipRect = { x0: 0, y0: 0, x1: t.size.width, y1: t.size.height }
  const spanX = t.visible.xMax - t.visible.xMin
  const spanY = t.visible.yMax - t.visible.yMin
  const box = {
    xMin: t.visible.xMin - spanX,
    xMax: t.visible.xMax + spanX,
    yMin: t.visible.yMin - spanY,
    yMax: t.visible.yMax + spanY,
  }
  const screen = points.map((p) => {
    const cx = Math.min(box.xMax, Math.max(box.xMin, p.x))
    const cy = Math.min(box.yMax, Math.max(box.yMin, p.y))
    return worldToScreen(t, cx, cy)
  })
  const runs: ScreenPoint[][] = []
  let current: ScreenPoint[] = []
  for (let i = 0; i + 1 < screen.length; i += 1) {
    const a = screen[i]
    const b = screen[i + 1]
    if (a === undefined || b === undefined) {
      continue
    }
    const clipped = clipSegment(a, b, rect)
    if (clipped === null) {
      if (current.length > 0) {
        runs.push(current)
        current = []
      }
      continue
    }
    const [ca, cb] = clipped
    if (current.length === 0) {
      current.push(ca)
    } else {
      const last = current[current.length - 1]
      if (last === undefined || Math.abs(last.px - ca.px) > 1e-9 || Math.abs(last.py - ca.py) > 1e-9) {
        runs.push(current)
        current = [ca]
      }
    }
    current.push(cb)
  }
  if (current.length > 0) {
    runs.push(current)
  }
  return runs.filter((run) => run.length >= 2)
}

/** Compact world-coordinate readout (text carries the information, not colour). */
export function formatReadout(value: number, span: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return formatTickValue(value, Math.max(span / 1000, 1e-12))
}

/** Compact current-view text, e.g. `x [-10, 10] · y [-7, 7]`. */
export function formatViewLabel(world: WorldRect): string {
  const xSpan = world.xMax - world.xMin
  const ySpan = world.yMax - world.yMin
  const x = `${formatTickValue(world.xMin, xSpan / 100)}…${formatTickValue(world.xMax, xSpan / 100)}`
  const y = `${formatTickValue(world.yMin, ySpan / 100)}…${formatTickValue(world.yMax, ySpan / 100)}`
  return `x [${x}] · y [${y}]`
}
