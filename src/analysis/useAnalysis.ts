import { useMemo, useRef, useState } from 'react'
import type { Extremum } from './extrema.ts'
import type { IntegralResult } from './integral.ts'
import type { Intersection } from './intersections.ts'
import type { FoundRoot } from './roots.ts'
import type { CompiledRow } from '../expressions/compile.ts'
import type { ExpressionRow } from '../expressions/model.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import type { Evaluator } from '../math/index.ts'

export interface AnalysisSnapshot {
  world: WorldRect
  paramsKey: string
  /** Content key of the analysed function (id + text + piecewise definition). */
  targetKey: string
  /** Content key of the second function (intersections only). */
  otherKey: string
  /** True when the result depends on `otherKey` (intersections). */
  usesOther: boolean
}

export type AnalysisTool = 'roots' | 'intersections' | 'extrema' | 'tangent' | 'integral'

type AnalysisOperations = typeof import('./operations.ts')

type OperationLoad =
  | { state: 'ready'; operations: AnalysisOperations; generation: number }
  | { state: 'failed' }
  | { state: 'stale' }

const LOAD_FAILED = 'Analysis tools could not be loaded. Check your connection and try again.'

/**
 * One shared promise per page load: all five tools use the same small
 * operations chunk, and a failed fetch is retried on the next attempt.
 */
let operationsPromise: Promise<AnalysisOperations> | null = null

function loadOperations(): Promise<AnalysisOperations> {
  if (operationsPromise === null) {
    operationsPromise = import('./operations.ts').catch((error: unknown) => {
      operationsPromise = null
      throw error
    })
  }
  return operationsPromise
}

export interface TangentOverlay {
  x0: number
  y0: number
  slope: number
  at: (x: number) => number
  showNormal: boolean
  methodNote: string
}

function toEvaluator(compiled: CompiledRow | undefined): Evaluator | null {
  if (compiled?.evaluator === null || compiled?.evaluator === undefined || !('evaluate' in compiled.evaluator)) {
    return null
  }
  return compiled.evaluator
}

/**
 * Parses committed numeric text for analysis fields. Blank or
 * whitespace-only text yields null (it must never be read as 0), and a
 * non-finite parse also yields null.
 */
function parseNumberText(text: string): number | null {
  if (text.trim() === '') {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * Analysis workspace state: target selection, per-tool results with the
 * world/params they were computed for (stale results are labelled, never
 * silently shown as current), and overlay visibility flags. Numerical
 * code itself is loaded on the first tool run; graph overlays only need
 * the resulting values.
 */
export function useAnalysis(
  rows: ExpressionRow[],
  compiledById: Map<string, CompiledRow>,
  world: WorldRect,
  paramValues: Record<string, number>,
): {
  targetId: string | null
  otherId: string | null
  tangentX: string
  integralA: string
  integralB: string
  showNormal: boolean
  visibility: Record<string, boolean>
  roots: FoundRoot[] | null
  rootSnapshot: AnalysisSnapshot | null
  intersections: Intersection[] | null
  intersectionSnapshot: AnalysisSnapshot | null
  extrema: Extremum[] | null
  extremumSnapshot: AnalysisSnapshot | null
  tangent: TangentOverlay | null
  tangentSnapshot: AnalysisSnapshot | null
  integral: { a: number; b: number; result: IntegralResult } | null
  integralIsCurrent: boolean
  cartesianRows: ExpressionRow[]
  pendingTools: AnalysisTool[]
  setTargetId: (id: string | null) => void
  setOtherId: (id: string | null) => void
  setTangentX: (text: string) => void
  setIntegralA: (text: string) => void
  setIntegralB: (text: string) => void
  setShowNormal: (show: boolean) => void
  setVisible: (key: string, show: boolean) => void
  runRoots: () => Promise<string | null>
  runIntersections: () => Promise<string | null>
  runExtrema: () => Promise<string | null>
  runTangent: () => Promise<string | null>
  runIntegral: () => Promise<string | null>
  clearTool: (tool: AnalysisTool) => void
  snapshotIsCurrent: (snapshot: AnalysisSnapshot | null) => boolean
} {
  const cartesianRows = useMemo(() => rows.filter((row) => row.kind === 'cartesian' && row.visible), [rows])
  const [targetId, setTargetId] = useState<string | null>(null)
  const [otherId, setOtherId] = useState<string | null>(null)
  const [tangentX, setTangentX] = useState('2')
  const [integralA, setIntegralA] = useState('0')
  const [integralB, setIntegralB] = useState('1')
  const [showNormal, setShowNormal] = useState(false)
  const [visibility, setVisibility] = useState<Record<string, boolean>>({ roots: true, intersections: true, extrema: true, tangent: true })
  const [roots, setRoots] = useState<FoundRoot[] | null>(null)
  const [rootSnapshot, setRootSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [intersections, setIntersections] = useState<Intersection[] | null>(null)
  const [intersectionSnapshot, setIntersectionSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [extrema, setExtrema] = useState<Extremum[] | null>(null)
  const [extremumSnapshot, setExtremumSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [tangent, setTangent] = useState<TangentOverlay | null>(null)
  const [tangentSnapshot, setTangentSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [integral, setIntegral] = useState<{ a: number; b: number; result: IntegralResult } | null>(null)
  const [integralSnapshot, setIntegralSnapshot] = useState<{ paramsKey: string; targetKey: string } | null>(null)
  const [pendingTools, setPendingTools] = useState<AnalysisTool[]>([])
  const generations = useRef<Record<AnalysisTool, number>>({ roots: 0, intersections: 0, extrema: 0, tangent: 0, integral: 0 })

  const paramsKey = Object.keys(paramValues)
    .sort()
    .map((key) => `${key}=${paramValues[key]}`)
    .join(';')

  /** Content key of an analysable row; any change means recompute. */
  function rowInputKey(id: string | null): string {
    const row = id === null ? undefined : cartesianRows.find((candidate) => candidate.id === id)
    if (row === undefined || row.kind !== 'cartesian') {
      return ''
    }
    return `${row.id}|${row.source}|${JSON.stringify(row.branches)}|${row.defaultSource}`
  }

  const effectiveTargetId = targetId ?? cartesianRows[0]?.id ?? null
  const targetKey = rowInputKey(effectiveTargetId)
  const otherKey = rowInputKey(otherId)
  const integralIsCurrent =
    integralSnapshot !== null && integralSnapshot.paramsKey === paramsKey && integralSnapshot.targetKey === targetKey

  function snapshot(usesOther: boolean): AnalysisSnapshot {
    return { world, paramsKey, targetKey, otherKey, usesOther }
  }

  function resolveTarget(): Evaluator | null {
    return toEvaluator(compiledById.get(targetId ?? cartesianRows[0]?.id ?? ''))
  }

  function setVisible(key: string, show: boolean): void {
    setVisibility((current) => ({ ...current, [key]: show }))
  }

  function markPending(tool: AnalysisTool, pending: boolean): void {
    setPendingTools((current) => {
      const listed = current.includes(tool)
      if (listed === pending) {
        return current
      }
      return pending ? [...current, tool] : current.filter((candidate) => candidate !== tool)
    })
  }

  /** A new generation supersedes older in-flight work for the same tool. */
  function begin(tool: AnalysisTool): number {
    generations.current[tool] += 1
    markPending(tool, true)
    return generations.current[tool]
  }

  function isLatest(tool: AnalysisTool, generation: number): boolean {
    return generations.current[tool] === generation
  }

  function finish(tool: AnalysisTool, generation: number): void {
    if (isLatest(tool, generation)) {
      markPending(tool, false)
    }
  }

  async function loadFor(tool: AnalysisTool): Promise<OperationLoad> {
    const generation = begin(tool)
    let operations: AnalysisOperations
    try {
      operations = await loadOperations()
    } catch {
      if (!isLatest(tool, generation)) {
        return { state: 'stale' }
      }
      markPending(tool, false)
      return { state: 'failed' }
    }
    if (!isLatest(tool, generation)) {
      return { state: 'stale' }
    }
    return { state: 'ready', operations, generation }
  }

  async function runRoots(): Promise<string | null> {
    const evaluator = resolveTarget()
    if (evaluator === null) {
      return 'Choose a function first.'
    }
    const resultSnapshot = snapshot(false)
    const loaded = await loadFor('roots')
    if (loaded.state === 'stale') {
      return null
    }
    if (loaded.state === 'failed') {
      return LOAD_FAILED
    }
    try {
      const found = loaded.operations.findRoots(evaluator, world.xMin, world.xMax, paramValues)
      setRoots(found.roots)
      setRootSnapshot(resultSnapshot)
      setVisible('roots', true)
      return found.warnings.length > 0 ? found.warnings.join(' ') : null
    } finally {
      finish('roots', loaded.generation)
    }
  }

  async function runIntersections(): Promise<string | null> {
    const first = resolveTarget()
    const second = otherId === null ? null : toEvaluator(compiledById.get(otherId))
    if (first === null || second === null) {
      return 'Choose two functions first.'
    }
    if (otherId !== null && otherId === effectiveTargetId) {
      return 'Choose two different functions to intersect.'
    }
    const resultSnapshot = snapshot(true)
    const loaded = await loadFor('intersections')
    if (loaded.state === 'stale') {
      return null
    }
    if (loaded.state === 'failed') {
      return LOAD_FAILED
    }
    try {
      const found = loaded.operations.findIntersections(first, second, world.xMin, world.xMax, paramValues)
      setIntersections(found.points)
      setIntersectionSnapshot(resultSnapshot)
      setVisible('intersections', true)
      return found.warnings.length > 0 ? found.warnings.join(' ') : null
    } finally {
      finish('intersections', loaded.generation)
    }
  }

  async function runExtrema(): Promise<string | null> {
    const evaluator = resolveTarget()
    if (evaluator === null) {
      return 'Choose a function first.'
    }
    const resultSnapshot = snapshot(false)
    const loaded = await loadFor('extrema')
    if (loaded.state === 'stale') {
      return null
    }
    if (loaded.state === 'failed') {
      return LOAD_FAILED
    }
    try {
      const found = loaded.operations.findExtrema(evaluator, world.xMin, world.xMax, paramValues)
      setExtrema(found.extrema)
      setExtremumSnapshot(resultSnapshot)
      setVisible('extrema', true)
      return found.warnings.length > 0 ? found.warnings.join(' ') : null
    } finally {
      finish('extrema', loaded.generation)
    }
  }

  async function runTangent(): Promise<string | null> {
    const evaluator = resolveTarget()
    if (evaluator === null) {
      return 'Choose a function first.'
    }
    const x0 = parseNumberText(tangentX)
    if (x0 === null) {
      return 'Tangent needs a finite x.'
    }
    const resultSnapshot = snapshot(false)
    const normalAtRun = showNormal
    const loaded = await loadFor('tangent')
    if (loaded.state === 'stale') {
      return null
    }
    if (loaded.state === 'failed') {
      return LOAD_FAILED
    }
    try {
      const { tangent: line, warnings } = loaded.operations.tangent(evaluator, x0, paramValues)
      if (line === null) {
        return warnings.join(' ')
      }
      const overlay: TangentOverlay = {
        x0: line.x0,
        y0: line.y0,
        slope: line.slope,
        at: line.at,
        showNormal: normalAtRun,
        methodNote: `Central differences, step ${line.derivative.step.toExponential(1)}`,
      }
      setTangent(overlay)
      setTangentSnapshot(resultSnapshot)
      setVisible('tangent', true)
      return warnings.length > 0 ? warnings.join(' ') : null
    } finally {
      finish('tangent', loaded.generation)
    }
  }

  async function runIntegral(): Promise<string | null> {
    const evaluator = resolveTarget()
    if (evaluator === null) {
      return 'Choose a function first.'
    }
    const a = parseNumberText(integralA)
    const b = parseNumberText(integralB)
    if (a === null || b === null) {
      return 'Integral needs finite bounds.'
    }
    const resultSnapshot = { paramsKey, targetKey }
    const loaded = await loadFor('integral')
    if (loaded.state === 'stale') {
      return null
    }
    if (loaded.state === 'failed') {
      return LOAD_FAILED
    }
    try {
      const result = loaded.operations.integrate(evaluator, a, b, paramValues)
      setIntegral({ a, b, result })
      setIntegralSnapshot(resultSnapshot)
      return result.warnings.length > 0 && !result.converged ? result.warnings.join(' ') : null
    } finally {
      finish('integral', loaded.generation)
    }
  }

  function clearTool(tool: AnalysisTool): void {
    generations.current[tool] += 1
    markPending(tool, false)
    if (tool === 'roots') {
      setRoots(null)
      setRootSnapshot(null)
    } else if (tool === 'intersections') {
      setIntersections(null)
      setIntersectionSnapshot(null)
    } else if (tool === 'extrema') {
      setExtrema(null)
      setExtremumSnapshot(null)
    } else if (tool === 'tangent') {
      setTangent(null)
      setTangentSnapshot(null)
    } else {
      setIntegral(null)
      setIntegralSnapshot(null)
    }
  }

  function snapshotIsCurrent(snapshot: AnalysisSnapshot | null): boolean {
    if (snapshot === null || snapshot.world !== world || snapshot.paramsKey !== paramsKey || snapshot.targetKey !== targetKey) {
      return false
    }
    return !snapshot.usesOther || snapshot.otherKey === otherKey
  }

  return {
    targetId,
    otherId,
    tangentX,
    integralA,
    integralB,
    showNormal,
    visibility,
    roots,
    rootSnapshot,
    intersections,
    intersectionSnapshot,
    extrema,
    extremumSnapshot,
    tangent,
    tangentSnapshot,
    integral,
    integralIsCurrent,
    cartesianRows,
    pendingTools,
    setTargetId,
    setOtherId,
    setTangentX,
    setIntegralA,
    setIntegralB,
    setShowNormal,
    setVisible,
    runRoots,
    runIntersections,
    runExtrema,
    runTangent,
    runIntegral,
    clearTool,
    snapshotIsCurrent,
  }
}
