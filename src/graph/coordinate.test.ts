import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  axisScreenPosition,
  clipPolyline,
  clampWorldRect,
  createTransform,
  formatTickValue,
  MAX_TICK_ITERATIONS,
  MAX_WORLD_COORD,
  MAX_WORLD_SPAN,
  screenToWorld,
  ticksForRange,
  tickStep,
  visibleWorldBounds,
  worldToScreen,
  type WorldRect,
} from './coordinate.ts'

const TOLERANCE = 1e-9

/** Soundness contract shared by every tick batch: finite, unique, strictly
 * increasing, inside the range tolerance band, capped, and labelled. */
function expectSoundTicks(ticks: Array<{ value: number; label: string }>, min: number, max: number): void {
  const slack = 1e-9 * Math.max(1, Math.abs(min), Math.abs(max))
  expect(ticks.length).toBeLessThanOrEqual(MAX_TICK_ITERATIONS)
  const seen = new Set<number>()
  for (let i = 0; i < ticks.length; i += 1) {
    const tick = ticks[i]
    if (tick === undefined) {
      continue
    }
    expect(Number.isFinite(tick.value)).toBe(true)
    expect(tick.value).toBeGreaterThanOrEqual(min - slack)
    expect(tick.value).toBeLessThanOrEqual(max + slack)
    expect(tick.label).not.toBe('')
    expect(tick.label).not.toMatch(/NaN|Infinity/)
    expect(seen.has(tick.value)).toBe(false)
    seen.add(tick.value)
    const previous = ticks[i - 1]
    if (previous !== undefined) {
      expect(tick.value).toBeGreaterThan(previous.value)
    }
  }
}

function expectRoundTrip(world: WorldRect, width: number, height: number, equalAspect: boolean): void {
  const t = createTransform(world, { width, height }, equalAspect)
  const visible = visibleWorldBounds(t)
  for (const [x, y] of [
    [visible.xMin, visible.yMin],
    [visible.xMax, visible.yMax],
    [(visible.xMin + visible.xMax) / 2, (visible.yMin + visible.yMax) / 2],
    [visible.xMin + (visible.xMax - visible.xMin) * 0.37, visible.yMin + (visible.yMax - visible.yMin) * 0.71],
  ] as Array<[number, number]>) {
    const screen = worldToScreen(t, x, y)
    const back = screenToWorld(t, screen.px, screen.py)
    expect(back.x).toBeCloseTo(x, 9)
    expect(back.y).toBeCloseTo(y, 9)
  }
}

describe('coordinate transforms', () => {
  it('round-trips square, non-square, and negative ranges', () => {
    expectRoundTrip({ xMin: -10, xMax: 10, yMin: -7, yMax: 7 }, 800, 600, false)
    expectRoundTrip({ xMin: -10, xMax: 10, yMin: -7, yMax: 7 }, 500, 900, false)
    expectRoundTrip({ xMin: -30, xMax: -10, yMin: -5, yMax: -1 }, 640, 480, false)
    expectRoundTrip({ xMin: 0.001, xMax: 0.002, yMin: 1e6, yMax: 2e6 }, 800, 600, false)
  })

  it('round-trips with equal aspect and keeps units square', () => {
    const world = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
    const t = createTransform(world, { width: 800, height: 600 }, true)
    expect(t.scaleX).toBeCloseTo(t.scaleY, 12)
    // Requested ranges stay visible inside the widened view.
    expect(t.visible.xMin).toBeLessThanOrEqual(world.xMin)
    expect(t.visible.xMax).toBeGreaterThanOrEqual(world.xMax)
    expect(t.visible.yMin).toBeLessThanOrEqual(world.yMin)
    expect(t.visible.yMax).toBeGreaterThanOrEqual(world.yMax)
    expectRoundTrip(world, 800, 600, true)
  })

  it('returns identical visible bounds for both sizes when aspect is free', () => {
    const world = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
    const a = visibleWorldBounds(createTransform(world, { width: 800, height: 600 }, false))
    const b = visibleWorldBounds(createTransform(world, { width: 400, height: 900 }, false))
    expect(a).toEqual(b)
    // Resize stability: the centre maps to the centre at any size.
    for (const t of [createTransform(world, { width: 800, height: 600 }, false), createTransform(world, { width: 400, height: 900 }, false)]) {
      const centre = screenToWorld(t, t.size.width / 2, t.size.height / 2)
      expect(centre.x).toBeCloseTo(0, TOLERANCE)
      expect(centre.y).toBeCloseTo(0, TOLERANCE)
    }
  })

  it('clamps axes to the viewport edge when zero is outside', () => {
    const positive = createTransform({ xMin: 2, xMax: 12, yMin: 3, yMax: 9 }, { width: 800, height: 600 }, false)
    const pos = axisScreenPosition(positive)
    expect(pos.yAxisPx).toBeCloseTo(0, TOLERANCE)
    expect(pos.xAxisPy).toBeCloseTo(600, TOLERANCE)

    const negative = createTransform({ xMin: -12, xMax: -2, yMin: -9, yMax: -3 }, { width: 800, height: 600 }, false)
    const neg = axisScreenPosition(negative)
    expect(neg.yAxisPx).toBeCloseTo(800, TOLERANCE)
    expect(neg.xAxisPy).toBeCloseTo(0, TOLERANCE)

    const centred = createTransform({ xMin: -10, xMax: 10, yMin: -7, yMax: 7 }, { width: 800, height: 600 }, false)
    const mid = axisScreenPosition(centred)
    expect(mid.yAxisPx).toBeCloseTo(400, TOLERANCE)
    expect(mid.xAxisPy).toBeCloseTo(300, TOLERANCE)
  })

  it('rejects degenerate bounds and sizes', () => {
    expect(() => createTransform({ xMin: 5, xMax: 5, yMin: 0, yMax: 1 }, { width: 8, height: 6 }, false)).toThrow()
    expect(() => createTransform({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, { width: 0, height: 6 }, false)).toThrow()
  })
})

describe('ticks', () => {
  it('uses 1/2/5 × 10^n steps across magnitudes', () => {
    expect(tickStep(-5, 5, 10)).toBe(1)
    expect(tickStep(0, 0.003, 5)).toBe(0.001)
    expect(tickStep(-2e6, 2e6, 8)).toBe(500000)
    expect(tickStep(0, 3, 6)).toBe(0.5)
  })

  it('covers the range without excessive labels', () => {
    const ticks = ticksForRange(-10, 10, 9)
    // Span 20 at target 9 → family step 5 → readable, non-overlapping labels.
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(12)
    expect(ticks[0]?.value).toBeGreaterThanOrEqual(-10)
    expect(ticks[ticks.length - 1]?.value).toBeLessThanOrEqual(10)
    for (let i = 1; i < ticks.length; i += 1) {
      const prev = ticks[i - 1]
      const current = ticks[i]
      if (prev !== undefined && current !== undefined) {
        expect(current.value).toBeGreaterThan(prev.value)
      }
    }
  })

  it('formats plain, small, and large magnitudes readably', () => {
    expect(formatTickValue(0, 1)).toBe('0')
    expect(formatTickValue(2.5, 0.5)).toBe('2.5')
    expect(formatTickValue(100, 50)).toBe('100')
    expect(formatTickValue(1e7, 1e6)).toContain('e')
    expect(formatTickValue(0.00003, 0.00001)).toContain('e')
  })

  it('keeps the ordinary 1/2/5 policy byte-for-byte', () => {
    expect(ticksForRange(-10, 10, 9).map((tick) => tick.value)).toEqual([-10, -5, 0, 5, 10])
    expect(ticksForRange(-10, 10, 9).map((tick) => tick.label)).toEqual(['-10', '-5', '0', '5', '10'])
  })

  it('terminates the previously hanging near-1e12 range with sound ticks', () => {
    const min = 1e12 - 2e-4
    const max = 1e12
    const ticks = ticksForRange(min, max, 9)
    expectSoundTicks(ticks, min, max)
    // The range spans several representable doubles, so at least one tick
    // exists; the iteration cap bounds the total either way.
    expect(ticks.length).toBeGreaterThanOrEqual(1)
  })

  it('never hangs and stays sound near both fences', () => {
    const cases: Array<[number, number]> = [
      [1e12 - 2e-4, 1e12],
      [1e12, 1e12 + 2.44140625e-4],
      [-1e12, -1e12 + 2.44140625e-4],
      [-1e12 - 2e-4, -1e12],
      [-1e12, 1e12],
    ]
    for (const [min, max] of cases) {
      expectSoundTicks(ticksForRange(min, max, 9), min, max)
    }
  })

  it('returns a documented safe result for extremely narrow intervals', () => {
    // One ulp (2^-13) wide at the fence: cannot hold 9 distinct ticks.
    const min = 1e12
    const max = 1e12 + 1.220703125e-4
    const ticks = ticksForRange(min, max, 9)
    expectSoundTicks(ticks, min, max)
    expect(ticks.length).toBeLessThanOrEqual(2)
    // Deterministic fallback: the same call returns the identical batch.
    expect(ticksForRange(min, max, 9)).toEqual(ticks)
  })

  it('returns no ticks, rather than hanging or throwing, for invalid input', () => {
    expect(ticksForRange(Number.NaN, 1, 9)).toEqual([])
    expect(ticksForRange(0, Number.POSITIVE_INFINITY, 9)).toEqual([])
    expect(ticksForRange(5, 5, 9)).toEqual([])
    expect(ticksForRange(1, 0, 9)).toEqual([])
    expect(ticksForRange(-1e12, 1e12, Number.NaN)).toEqual([])
    expect(ticksForRange(-1e12, 1e12, 1)).toEqual([])
  })
})

describe('clipping', () => {
  const t = createTransform({ xMin: -10, xMax: 10, yMin: -7, yMax: 7 }, { width: 800, height: 600 }, false)

  it('keeps fully visible polylines intact', () => {
    const runs = clipPolyline(t, [
      { x: -1, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
  })

  it('drops fully hidden polylines', () => {
    const runs = clipPolyline(t, [
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ])
    expect(runs).toHaveLength(0)
  })

  it('splits partially visible polylines at the boundary', () => {
    const runs = clipPolyline(t, [
      { x: -20, y: 0 },
      { x: -5, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ])
    expect(runs.length).toBeGreaterThanOrEqual(1)
    for (const run of runs) {
      for (const p of run) {
        expect(p.px).toBeGreaterThanOrEqual(-1e-6)
        expect(p.px).toBeLessThanOrEqual(800 + 1e-6)
        expect(p.py).toBeGreaterThanOrEqual(-1e-6)
        expect(p.py).toBeLessThanOrEqual(600 + 1e-6)
      }
    }
  })

  it('keeps pole-adjacent values finite', () => {
    const runs = clipPolyline(t, [
      { x: -0.001, y: -1000 },
      { x: 0.001, y: 1000 },
    ])
    for (const run of runs) {
      for (const p of run) {
        expect(Number.isFinite(p.px)).toBe(true)
        expect(Number.isFinite(p.py)).toBe(true)
      }
    }
  })
})

describe('viewport normalisation (representable spans)', () => {
  const ULP_AT_FENCE = 1.220703125e-4 // spacing of doubles near 1e12 (2^-13)

  function expectUsableWorldRect(world: WorldRect): void {
    for (const value of [world.xMin, world.xMax, world.yMin, world.yMax]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(Math.abs(value)).toBeLessThanOrEqual(MAX_WORLD_COORD)
    }
    expect(world.xMax).toBeGreaterThan(world.xMin)
    expect(world.yMax).toBeGreaterThan(world.yMin)
    expect(world.xMax - world.xMin).toBeLessThanOrEqual(MAX_WORLD_SPAN)
    expect(world.yMax - world.yMin).toBeLessThanOrEqual(MAX_WORLD_SPAN)
    expect(() => createTransform(world, { width: 800, height: 600 }, false)).not.toThrow()
    expect(() => createTransform(world, { width: 800, height: 600 }, true)).not.toThrow()
  }

  it('never collapses a viewport pushed beyond the positive fence', () => {
    const world = clampWorldRect({ xMin: 1e12, xMax: 2e12, yMin: 2e12, yMax: 3e12 })
    expectUsableWorldRect(world)
    expect(world.xMax).toBe(MAX_WORLD_COORD)
    expect(world.yMax).toBe(MAX_WORLD_COORD)
    expect(world.xMax - world.xMin).toBeGreaterThanOrEqual(ULP_AT_FENCE)
    expect(world.yMax - world.yMin).toBeGreaterThanOrEqual(ULP_AT_FENCE)
    // Deterministic policy: the same request normalises identically.
    expect(clampWorldRect({ xMin: 1e12, xMax: 2e12, yMin: 2e12, yMax: 3e12 })).toEqual(world)
  })

  it('mirrors the policy at the negative fence', () => {
    const world = clampWorldRect({ xMin: -2e12, xMax: -3e12, yMin: -3e12, yMax: -2e12 })
    expectUsableWorldRect(world)
    expect(world.xMin).toBe(-MAX_WORLD_COORD)
    expect(world.yMin).toBe(-MAX_WORLD_COORD)
    expect(world.xMax - world.xMin).toBeGreaterThanOrEqual(ULP_AT_FENCE)
    expect(world.yMax - world.yMin).toBeGreaterThanOrEqual(ULP_AT_FENCE)
  })

  it('preserves valid ordinary and representable ranges exactly', () => {
    const ordinary: WorldRect = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
    expect(clampWorldRect(ordinary)).toEqual(ordinary)
    // Two ulps at the fence is representable and must not be re-centred.
    const tight: WorldRect = { xMin: MAX_WORLD_COORD - 2.44140625e-4, xMax: MAX_WORLD_COORD, yMin: -1, yMax: 1 }
    expect(clampWorldRect(tight)).toEqual(tight)
  })

  it('keeps extremely small requests non-degenerate at any magnitude', () => {
    for (const mid of [0, 1e12, -1e12]) {
      const world = clampWorldRect({ xMin: mid, xMax: mid + 1e-9, yMin: -1, yMax: 1 })
      expectUsableWorldRect(world)
      expect(world.xMax - world.xMin).toBeGreaterThan(0)
    }
  })

  it('stays finite, ordered and inside the fence for adversarial inputs', () => {
    const cases: WorldRect[] = [
      { xMin: Number.NaN, xMax: Number.POSITIVE_INFINITY, yMin: Number.NEGATIVE_INFINITY, yMax: Number.NaN },
      { xMin: -1e300, xMax: 1e300, yMin: 0, yMax: 1 },
      { xMin: 5, xMax: 1, yMin: 0, yMax: 0 },
      { xMin: 1e308, xMax: 1.7e308, yMin: -1e308, yMax: -1.6e308 },
      { xMin: 1e12, xMax: 2e12, yMin: -2e12, yMax: -3e12 },
    ]
    for (const input of cases) {
      expectUsableWorldRect(clampWorldRect(input))
    }
  })

  it('produces sound ticks for the smallest representable view at the fence', () => {
    const world = clampWorldRect({ xMin: 1e12, xMax: 2e12, yMin: 1e12, yMax: 2e12 })
    expectSoundTicks(ticksForRange(world.xMin, world.xMax, 9), world.xMin, world.xMax)
    expectSoundTicks(ticksForRange(world.yMin, world.yMax, 9), world.yMin, world.yMax)
  })
})

describe('tick generation watchdog', () => {
  // The original repeated-addition loop could hang synchronously near ±1e12,
  // so the regression case also runs in an isolated child process with a
  // hard parent-side timeout: a stalled child is killed (spawnSync timeout)
  // and fails the test instead of freezing the test runner. The suite skips
  // the child run only when the child runtime cannot import TypeScript
  // sources directly (Node < 23.6 without a strip-types flag).
  const coordinateUrl = pathToFileURL(join(process.cwd(), 'src', 'graph', 'coordinate.ts')).href
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(coordinateUrl)})`], {
    encoding: 'utf8',
    timeout: 20000,
  })
  const childCanImportTypeScript = probe.status === 0

  it.skipIf(!childCanImportTypeScript)(
    'terminates near-fence ranges within a hard child-process timeout',
    () => {
      const script = `
        const { ticksForRange } = await import(${JSON.stringify(coordinateUrl)})
        const cases = [
          [1e12 - 2e-4, 1e12, 9],
          [1e12, 1e12 + 2.44140625e-4, 9],
          [1e12, 1e12 + 1.220703125e-4, 9],
          [-1e12, -1e12 + 2.44140625e-4, 9],
          [-1e12 - 2e-4, -1e12, 9],
          [1e12, 2e12, 9],
          [-1e12, 1e12, 9],
        ]
        const results = cases.map(([min, max, target]) => {
          const ticks = ticksForRange(min, max, target)
          const values = ticks.map((tick) => tick.value)
          const slack = 1e-9 * Math.max(1, Math.abs(min), Math.abs(max))
          const finite = values.every((value) => Number.isFinite(value))
          const ordered = values.every((value, index) => index === 0 || value > values[index - 1])
          const bounded = values.every((value) => value >= min - slack && value <= max + slack)
          const capped = ticks.length <= 256
          return { count: ticks.length, finite, ordered, bounded, capped }
        })
        const ok = results.every((entry) => entry.finite && entry.ordered && entry.bounded && entry.capped)
        console.log(JSON.stringify({ ok, results }))
        process.exit(ok ? 0 : 1)
      `
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 20000,
      })
      expect(run.error, `watchdog killed the child: ${run.error?.message ?? ''}`).toBeUndefined()
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).toContain('"ok":true')
    },
    30000,
  )
})
