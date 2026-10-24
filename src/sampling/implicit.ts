import type { FieldEvaluator } from '../math/index.ts'
import type { SampleOptions, SamplePoint, SampleResult } from './types.ts'
import {
  checkCancelled,
  finalizeSampling,
  resolveOptions,
  warn,
  type RunList,
  type SamplerState,
} from './sampler.ts'

/**
 * Implicit-curve and inequality sampler (Stage 2): evaluates F(x, y) on
 * a bounded grid over the visible world and extracts the zero contour
 * F = 0 with marching squares, plus inside/outside cell runs for
 * inequalities. Pure TypeScript; shares budget, cancellation, and
 * result semantics with the other samplers.
 *
 * Method: coarse uniform grid → sign classification per cell → saddle
 * cells resolved by a freshly sampled centre value (documented choice,
 * not a proof) → edge crossings by linear interpolation → one
 * refinement pass subdividing straddling and near-miss cells.
 * Regions merge inside-cells per grid row so fills stay small.
 *
 * Approximation limits (see docs): the base grid is sized to fit the
 * evaluation budget before traversal; a deliberately reduced grid and
 * blocked refinement are reported; components smaller than a cell are
 * missed; region edges resolve at grid resolution behind a smooth
 * boundary; a constant field is reported degenerate rather than drawn.
 * The budget is the caller's `maxEvaluations` when supplied, otherwise
 * MAX_IMPLICIT_EVALUATIONS; it can be lowered but never raised past it.
 */

export type InequalityOp = '<=' | '>=' | '<' | '>'

/**
 * Default and hard cap on evaluations per implicit/inequality pass.
 * A caller-supplied `maxEvaluations` may lower the budget but never
 * raise it.
 */
export const MAX_IMPLICIT_EVALUATIONS = 30000

interface FieldGrid {
  nx: number
  ny: number
  x0: number
  y0: number
  dx: number
  dy: number
  /** NaN marks invalid samples. */
  values: Float64Array
}

/**
 * Grid dimensions for one field pass (exported for tests). A grid larger
 * than the evaluation budget used to abort mid-traversal, discard every
 * accumulated value, and report "no valid samples" beside budget
 * exhaustion; the grid is therefore sized to fit the budget before the
 * first evaluation. Density comes from the pixel hint and shape from the
 * world aspect ratio; when the request exceeds the budget both axes
 * scale down by the same factor (cells keep their shape). An under-budget
 * request is returned unchanged.
 *
 * `budget` is the caller's effective evaluation budget, capped at
 * MAX_IMPLICIT_EVALUATIONS and floored at one 2×2 cell. The public path
 * validates caller budgets to an integer ≥ 16 before sizing, so the floor
 * is defensive.
 */
export function gridDimensions(
  pixelWidth: number,
  worldSpanX: number,
  worldSpanY: number,
  budget: number = MAX_IMPLICIT_EVALUATIONS,
): { nx: number; ny: number; budgetLimited: boolean } {
  const limit = Number.isFinite(budget) ? Math.min(MAX_IMPLICIT_EVALUATIONS, Math.max(4, budget)) : MAX_IMPLICIT_EVALUATIONS
  const nx = Math.min(200, Math.max(48, Math.round(pixelWidth / 5)))
  const ny = Math.min(200, Math.max(24, Math.round((nx * worldSpanY) / Math.max(worldSpanX, 1e-300))))
  if (nx * ny <= limit) {
    return { nx, ny, budgetLimited: false }
  }
  const scale = Math.sqrt(limit / (nx * ny))
  let fitX = Math.max(2, Math.floor(nx * scale))
  let fitY = Math.max(2, Math.floor(ny * scale))
  while (fitX * fitY > limit) {
    if (fitX >= fitY && fitX > 2) {
      fitX -= 1
    } else if (fitY > 2) {
      fitY -= 1
    } else {
      // Unreachable for the validated budget floor (a 2×2 grid costs 4).
      break
    }
  }
  return { nx: fitX, ny: fitY, budgetLimited: true }
}

function evaluateGrid(
  state: SamplerState<FieldEvaluator>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  nx: number,
  ny: number,
): FieldGrid | null {
  const values = new Float64Array(nx * ny)
  const dx = (xMax - xMin) / Math.max(1, nx - 1)
  const dy = (yMax - yMin) / Math.max(1, ny - 1)
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (checkCancelled(state as SamplerState<unknown>) || state.stats.evaluations >= state.options.maxEvaluations) {
        state.budgetHit = true
        return null
      }
      const point = state.evaluator.evaluateField(xMin + i * dx, yMin + j * dy, state.options.parameters)
      state.stats.evaluations += 1
      values[j * nx + i] = point === null ? Number.NaN : point.value
    }
  }
  return { nx, ny, x0: xMin, y0: yMin, dx, dy, values }
}

function cornerValues(grid: FieldGrid, i: number, j: number): [number, number, number, number] | null {
  const { nx, ny, values } = grid
  if (i < 0 || j < 0 || i + 1 >= nx || j + 1 >= ny) {
    return null
  }
  const v0 = values[j * nx + i] ?? Number.NaN
  const v1 = values[j * nx + i + 1] ?? Number.NaN
  const v2 = values[(j + 1) * nx + i + 1] ?? Number.NaN
  const v3 = values[(j + 1) * nx + i] ?? Number.NaN
  if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2) || !Number.isFinite(v3)) {
    return null
  }
  return [v0, v1, v2, v3]
}

/** Marching-squares case index from corner signs (1 bit per negative corner). */
function caseIndex(corners: [number, number, number, number]): number {
  let index = 0
  if (corners[0] < 0) {
    index |= 1
  }
  if (corners[1] < 0) {
    index |= 2
  }
  if (corners[2] < 0) {
    index |= 4
  }
  if (corners[3] < 0) {
    index |= 8
  }
  return index
}

/**
 * Edge pairs per case. Edges: 0 bottom, 1 right, 2 top, 3 left.
 * Saddle cases (5, 10) connect by the centre sign — never by corner
 * order alone.
 */
function caseEdges(index: number, centerInside: boolean): Array<[number, number]> {
  switch (index) {
    case 1:
    case 14:
      return [[3, 0]]
    case 2:
    case 13:
      return [[0, 1]]
    case 3:
    case 12:
      return [[3, 1]]
    case 4:
    case 11:
      return [[1, 2]]
    case 6:
    case 9:
      return [[0, 2]]
    case 7:
    case 8:
      return [[3, 2]]
    case 5:
      return centerInside ? [[3, 0], [1, 2]] : [[3, 2], [0, 1]]
    case 10:
      return centerInside ? [[3, 2], [0, 1]] : [[3, 0], [1, 2]]
    default:
      return []
  }
}

const EDGE_CORNERS: Record<number, [number, number]> = { 0: [0, 1], 1: [1, 2], 2: [3, 2], 3: [0, 3] }

function cornerPosition(grid: FieldGrid, i: number, j: number, corner: number): [number, number] {
  switch (corner) {
    case 0:
      return [grid.x0 + i * grid.dx, grid.y0 + j * grid.dy]
    case 1:
      return [grid.x0 + (i + 1) * grid.dx, grid.y0 + j * grid.dy]
    case 2:
      return [grid.x0 + (i + 1) * grid.dx, grid.y0 + (j + 1) * grid.dy]
    default:
      return [grid.x0 + i * grid.dx, grid.y0 + (j + 1) * grid.dy]
  }
}

function edgePoint(grid: FieldGrid, i: number, j: number, edge: number): SamplePoint | null {
  const corners = cornerValues(grid, i, j)
  const pair = EDGE_CORNERS[edge]
  if (corners === null || pair === undefined) {
    return null
  }
  const [a, b] = pair
  const va = corners[a] ?? Number.NaN
  const vb = corners[b] ?? Number.NaN
  if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) {
    return null
  }
  const pa = cornerPosition(grid, i, j, a)
  const pb = cornerPosition(grid, i, j, b)
  const t = va / (va - vb)
  return { x: pa[0] + t * (pb[0] - pa[0]), y: pa[1] + t * (pb[1] - pa[1]) }
}

/** A cell with tiny values beside a large span may touch zero: refine it. */
function nearMiss(corners: [number, number, number, number]): boolean {
  const magnitudes = corners.map((v) => Math.abs(v))
  const smallest = Math.min(...magnitudes)
  const largest = Math.max(...magnitudes)
  return smallest <= largest * 0.25 && smallest < largest
}

/** Contour runs for one cell; the centre is sampled lazily for saddles. */
function contourCell(
  state: SamplerState<FieldEvaluator>,
  grid: FieldGrid,
  i: number,
  j: number,
  allowRefine: boolean,
): { runs: RunList; straddles: boolean } {
  const corners = cornerValues(grid, i, j)
  if (corners === null) {
    return { runs: [], straddles: false }
  }
  const index = caseIndex(corners)
  if (index === 0 || index === 15) {
    return { runs: [], straddles: nearMiss(corners) && allowRefine }
  }
  let centerInside = false
  if (index === 5 || index === 10) {
    if (checkCancelled(state as SamplerState<unknown>) || state.stats.evaluations >= state.options.maxEvaluations) {
      state.budgetHit = true
      return { runs: [], straddles: true }
    }
    const center = state.evaluator.evaluateField(grid.x0 + (i + 0.5) * grid.dx, grid.y0 + (j + 0.5) * grid.dy, state.options.parameters)
    state.stats.evaluations += 1
    // Unavailable centre falls back to the corner average (documented).
    centerInside = center === null ? (corners[0] + corners[1] + corners[2] + corners[3]) / 4 < 0 : center.value < 0
  }
  const runs: RunList = []
  for (const [e1, e2] of caseEdges(index, centerInside)) {
    const p1 = edgePoint(grid, i, j, e1)
    const p2 = edgePoint(grid, i, j, e2)
    if (p1 !== null && p2 !== null) {
      runs.push([p1, p2])
    }
  }
  return { runs, straddles: true }
}

function refineCell(state: SamplerState<FieldEvaluator>, grid: FieldGrid, i: number, j: number): RunList {
  const at: number[][] = []
  for (let jj = 0; jj <= 2; jj += 1) {
    const row: number[] = []
    for (let ii = 0; ii <= 2; ii += 1) {
      if (checkCancelled(state as SamplerState<unknown>) || state.stats.evaluations >= state.options.maxEvaluations) {
        state.budgetHit = true
        return []
      }
      const point = state.evaluator.evaluateField(grid.x0 + (i + ii / 2) * grid.dx, grid.y0 + (j + jj / 2) * grid.dy, state.options.parameters)
      state.stats.evaluations += 1
      row.push(point === null ? Number.NaN : point.value)
    }
    at.push(row)
  }
  const subGrid: FieldGrid = {
    nx: 3,
    ny: 3,
    x0: grid.x0 + i * grid.dx,
    y0: grid.y0 + j * grid.dy,
    dx: grid.dx / 2,
    dy: grid.dy / 2,
    values: new Float64Array([
      at[0]?.[0] ?? Number.NaN, at[0]?.[1] ?? Number.NaN, at[0]?.[2] ?? Number.NaN,
      at[1]?.[0] ?? Number.NaN, at[1]?.[1] ?? Number.NaN, at[1]?.[2] ?? Number.NaN,
      at[2]?.[0] ?? Number.NaN, at[2]?.[1] ?? Number.NaN, at[2]?.[2] ?? Number.NaN,
    ]),
  }
  const runs: RunList = []
  for (let jj = 0; jj < 2; jj += 1) {
    for (let ii = 0; ii < 2; ii += 1) {
      const corners = cornerValues(subGrid, ii, jj)
      if (corners === null) {
        continue
      }
      const index = caseIndex(corners)
      if (index === 0 || index === 15) {
        continue
      }
      const centerInside = (corners[0] + corners[1] + corners[2] + corners[3]) / 4 < 0
      for (const [e1, e2] of caseEdges(index, centerInside)) {
        const p1 = edgePoint(subGrid, ii, jj, e1)
        const p2 = edgePoint(subGrid, ii, jj, e2)
        if (p1 !== null && p2 !== null) {
          runs.push([p1, p2])
        }
      }
    }
  }
  return runs
}

function regionCells(
  grid: FieldGrid,
  test: (value: number) => boolean,
): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = []
  for (let j = 0; j + 1 < grid.ny; j += 1) {
    let runStart: number | null = null
    const closeRun = (end: number): void => {
      if (runStart !== null && end > runStart) {
        rects.push({
          x0: grid.x0 + runStart * grid.dx,
          y0: grid.y0 + j * grid.dy,
          x1: grid.x0 + end * grid.dx,
          y1: grid.y0 + (j + 1) * grid.dy,
        })
      }
      runStart = null
    }
    for (let i = 0; i + 1 < grid.nx; i += 1) {
      const corners = cornerValues(grid, i, j)
      // Any-corner inside: overfills by at most one cell; the smooth
      // boundary drawn on top covers the seam.
      const inside = corners !== null && corners.some((v) => test(v))
      if (inside && runStart === null) {
        runStart = i
      } else if (!inside && runStart !== null) {
        closeRun(i + 1)
      }
    }
    closeRun(grid.nx)
  }
  return rects
}

export interface ImplicitSample {
  contour: RunList
  regions: Array<{ x0: number; y0: number; x1: number; y1: number }>
}

function sampleFieldGrid(
  state: SamplerState<FieldEvaluator>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  pixelWidth: number,
  test: ((value: number) => boolean) | null,
): ImplicitSample {
  const empty: ImplicitSample = { contour: [], regions: [] }
  const { nx, ny, budgetLimited } = gridDimensions(pixelWidth, xMax - xMin, yMax - yMin, state.options.maxEvaluations)
  if (budgetLimited) {
    warn(state as SamplerState<unknown>, 'under-resolved', 'Grid resolution was reduced to fit the evaluation budget; fine detail below grid resolution may be missed.')
  }
  const grid = evaluateGrid(state, xMin, xMax, yMin, yMax, nx, ny)
  if (grid === null) {
    return empty
  }

  // Degenerate constant field: report, never draw the whole plane.
  // All-invalid grids fall through to the ordinary empty result instead.
  let finiteCount = 0
  let varied = false
  let first = Number.NaN
  for (const v of grid.values) {
    if (!Number.isFinite(v)) {
      continue
    }
    finiteCount += 1
    if (Number.isNaN(first)) {
      first = v
    } else if (v !== first) {
      varied = true
      break
    }
  }
  if (finiteCount > 0 && !varied) {
    warn(state as SamplerState<unknown>, 'degenerate-field', 'The field is constant here; nothing meaningful to contour.')
    return empty
  }

  const contour: RunList = []
  let refinedAny = false
  for (let j = 0; j + 1 < grid.ny; j += 1) {
    for (let i = 0; i + 1 < grid.nx; i += 1) {
      if (checkCancelled(state as SamplerState<unknown>)) {
        return { contour, regions: [] }
      }
      const cell = contourCell(state, grid, i, j, true)
      if (cell.straddles && cell.runs.length > 0) {
        const fine = refineCell(state, grid, i, j)
        if (fine.length > 0) {
          refinedAny = true
          contour.push(...fine)
          continue
        }
      }
      contour.push(...cell.runs)
    }
  }
  if (!refinedAny && contour.length > 0) {
    warn(state as SamplerState<unknown>, 'under-resolved', 'No cell qualified for refinement; fine detail below grid resolution may be missed.')
  }

  const regions = test === null ? [] : regionCells(grid, test)
  return { contour, regions }
}

/**
 * Sample an implicit curve F(x, y) = 0 over the visible world.
 * Deterministic for identical inputs; bounded by the caller's
 * `maxEvaluations` when supplied, otherwise (and never above)
 * MAX_IMPLICIT_EVALUATIONS.
 */
export function sampleImplicit(field: FieldEvaluator, options: SampleOptions): SampleResult {
  return sampleField(field, options, null)
}

/**
 * Sample an inequality over the visible world: the boundary contour plus
 * filled inside/outside cell runs. `op` selects the kept side.
 */
export function sampleInequality(
  field: FieldEvaluator,
  op: InequalityOp,
  options: SampleOptions,
): SampleResult & { regions: Array<{ x0: number; y0: number; x1: number; y1: number }> } {
  const test = (value: number): boolean => {
    switch (op) {
      case '<=':
        return value <= 0
      case '>=':
        return value >= 0
      case '<':
        return value < 0
      case '>':
        return value > 0
    }
  }
  return sampleField(field, options, test)
}

function sampleField(
  field: FieldEvaluator,
  options: SampleOptions,
  test: ((value: number) => boolean) | null,
): SampleResult & { regions: Array<{ x0: number; y0: number; x1: number; y1: number }> } {
  const resolved = resolveOptions(options)
  if ('error' in resolved) {
    return {
      status: 'error',
      segments: [],
      stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
      warnings: [{ code: 'no-valid-samples', message: resolved.error }],
      regions: [],
    }
  }
  if (!(resolved.yMax > resolved.yMin) || !Number.isFinite(resolved.yMin) || !Number.isFinite(resolved.yMax)) {
    return {
      status: 'error',
      segments: [],
      stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
      warnings: [{ code: 'no-valid-samples', message: 'Field sampling needs a finite y range with max above min.' }],
      regions: [],
    }
  }
  // resolveOptions defaults an omitted maxEvaluations to the Cartesian
  // default (4000); the implicit sampler's documented default is the
  // module cap. An explicit caller budget is honoured up to that cap.
  const effectiveBudget =
    options.maxEvaluations === undefined
      ? MAX_IMPLICIT_EVALUATIONS
      : Math.min(resolved.maxEvaluations, MAX_IMPLICIT_EVALUATIONS)
  const state: SamplerState<FieldEvaluator> = {
    evaluator: field,
    options: { ...resolved, maxEvaluations: effectiveBudget },
    stats: { evaluations: 0, maxDepthReached: 0, segmentCount: 0, splitCount: 0 },
    warnings: [],
    warned: new Set<string>(),
    budgetHit: false,
    cancelled: false,
  }
  if (checkCancelled(state as SamplerState<unknown>)) {
    return { status: 'cancelled', segments: [], stats: state.stats, warnings: state.warnings, regions: [] }
  }
  const scene = sampleFieldGrid(state, resolved.xMin, resolved.xMax, resolved.yMin, resolved.yMax, resolved.pixelWidth, test)
  const runs: RunList = scene.contour
  state.stats.splitCount = runs.length > 0 ? runs.length - 1 : 0
  const result = finalizeSampling(state as SamplerState<unknown>, runs)
  return { ...result, regions: scene.regions }
}
