import { compileExpression, compilePiecewise, MAX_EXPRESSION_LENGTH, type Evaluator, type FieldEvaluator, type PiecewiseBranch, type PointEvaluator } from '../math/index.ts'
import { validateDomain, validateParameterRange, type ExpressionRow } from './model.ts'

export type RowEvaluator = Evaluator | PointEvaluator | FieldEvaluator

export interface CompiledRow {
  row: ExpressionRow
  /** Human-readable problem, or null when the row is plottable. */
  error: string | null
  evaluator: RowEvaluator | null
  /** 'scalar' samples y over x; 'point' samples (x, y); 'field' grids F(x, y). */
  evaluatorKind: 'scalar' | 'point' | 'field' | null
  breakpoints: number[]
  /** Row domain problem (reversed/empty/non-finite), or null when usable. */
  domainError: string | null
  /** Parameter names this row actually references, sorted. */
  parameterNames: string[]
  /** Inequality side; null for non-inequality rows. */
  inequalityOp: '<=' | '>=' | '<' | '>' | null
}

/** `(${left})-(${right})` adds exactly five characters around the two sides. */
const FIELD_WRAPPER_LENGTH = 5
/** Two user-legal sides plus the wrapper; the engine AST cap still applies. */
const MAX_FIELD_SOURCE_LENGTH = MAX_EXPRESSION_LENGTH * 2 + FIELD_WRAPPER_LENGTH

function fieldSideLengthError(label: string, source: string): string | null {
  if (source.length <= MAX_EXPRESSION_LENGTH) {
    return null
  }
  return `${label}: Expression is too long (${source.length} characters; maximum is ${MAX_EXPRESSION_LENGTH}).`
}

/** F = left − right, compiled once over both variables. */
function compileField(
  left: string,
  right: string,
  parameterNames: string[],
): { ok: true; field: FieldEvaluator; parameterNames: string[] } | { ok: false; error: string } {
  // The user-input cap applies to each side, so validate before internal
  // rewriting. The synthesized source is then bounded by two legal sides
  // plus the fixed wrapper; ordinary compileExpression calls stay at 500.
  const leftError = fieldSideLengthError('Left-hand side', left)
  if (leftError !== null) {
    return { ok: false, error: leftError }
  }
  const rightError = fieldSideLengthError('Right-hand side', right)
  if (rightError !== null) {
    return { ok: false, error: rightError }
  }
  const combined = `(${left})-(${right})`
  const compiled = compileExpression(combined, { parameters: parameterNames, variables: ['x', 'y'], maxSourceLength: MAX_FIELD_SOURCE_LENGTH })
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

/** Negative radii plot through x = r·cos θ, y = r·sin θ (angle + π equivalent). */
function polarPoint(r: number, theta: number): { x: number; y: number } {
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) }
}

/**
 * Compile one row of any kind: domain/range first, then the matching
 * engine path. Only dependent state invalidates — callers memoize on
 * rows (and the parameter-name set), and view changes never reach here.
 */
export function compileRow(row: ExpressionRow, parameterNames: string[] = []): CompiledRow {
  if (row.kind === 'parametric') {
    const rangeError = validateParameterRange(row.tMin, row.tMax, 'Parameter range')
    if (rangeError !== null) {
      return { row, error: rangeError, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: rangeError, inequalityOp: null, parameterNames: [] }
    }
    const compiledX = compileExpression(row.xSource, { parameters: parameterNames, variables: ['t'] })
    if (!compiledX.ok) {
      return { row, error: `x(t): ${compiledX.error.message}`, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: null, inequalityOp: null, parameterNames: [] }
    }
    const compiledY = compileExpression(row.ySource, { parameters: parameterNames, variables: ['t'] })
    if (!compiledY.ok) {
      return { row, error: `y(t): ${compiledY.error.message}`, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: null, inequalityOp: null, parameterNames: [] }
    }
    const names = [...new Set([...compiledX.expression.parameterNames, ...compiledY.expression.parameterNames])].sort()
    const evaluatePoint: PointEvaluator['evaluatePoint'] = (t, parameterValues) => {
      const x = compiledX.expression.evaluate(t, parameterValues)
      const y = compiledY.expression.evaluate(t, parameterValues)
      if (x.kind !== 'value' || y.kind !== 'value') {
        return null
      }
      return { x: x.value, y: y.value }
    }
    return { row, error: null, evaluator: { evaluatePoint }, evaluatorKind: 'point', breakpoints: [], domainError: null, inequalityOp: null, parameterNames: names }
  }

  if (row.kind === 'polar') {
    const rangeError = validateParameterRange(row.thetaMin, row.thetaMax, 'Angle range')
    if (rangeError !== null) {
      return { row, error: rangeError, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: rangeError, inequalityOp: null, parameterNames: [] }
    }
    const compiled = compileExpression(row.source, { parameters: parameterNames, variables: ['theta'] })
    if (!compiled.ok) {
      return { row, error: `r(θ): ${compiled.error.message}`, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: null, inequalityOp: null, parameterNames: [] }
    }
    const evaluatePoint: PointEvaluator['evaluatePoint'] = (theta, parameterValues) => {
      const r = compiled.expression.evaluate(theta, parameterValues)
      if (r.kind !== 'value') {
        return null
      }
      return polarPoint(r.value, theta)
    }
    return { row, error: null, evaluator: { evaluatePoint }, evaluatorKind: 'point', breakpoints: [], domainError: null, inequalityOp: null, parameterNames: compiled.expression.parameterNames }
  }

  if (row.kind === 'implicit' || row.kind === 'inequality') {
    const field = compileField(row.leftSource, row.rightSource, parameterNames)
    if (!field.ok) {
      return { row, error: field.error, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: null, inequalityOp: null, parameterNames: [] }
    }
    return {
      row,
      error: null,
      evaluator: field.field,
      evaluatorKind: 'field',
      breakpoints: [],
      domainError: null,
      parameterNames: field.parameterNames,
      inequalityOp: row.kind === 'inequality' ? row.op : null,
    }
  }

  const domainError = validateDomain(row.domain)
  if (row.branches !== null) {
    const branches: PiecewiseBranch[] = row.branches.map((branch) => ({
      condition: { op: branch.op, value: branch.value },
      source: branch.source,
    }))
    const result = compilePiecewise(branches, row.defaultSource, parameterNames)
    if (!result.ok) {
      return { row, error: result.error.message, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: domainError, inequalityOp: null, parameterNames: [] }
    }
    return { row, error: null, evaluator: result.piecewise, evaluatorKind: 'scalar', breakpoints: result.piecewise.breakpoints, domainError, parameterNames: result.piecewise.parameterNames, inequalityOp: null }
  }
  const result = compileExpression(row.source, { parameters: parameterNames })
  if (!result.ok) {
    return { row, error: result.error.message, evaluator: null, evaluatorKind: null, breakpoints: [], domainError: domainError, inequalityOp: null, parameterNames: [] }
  }
  return { row, error: null, evaluator: result.expression, breakpoints: [], domainError, parameterNames: result.expression.parameterNames, evaluatorKind: 'scalar', inequalityOp: null }
}

/**
 * Sampling range for a row against the view: cartesian rows intersect
 * their domain with the view x-range; parametric/polar rows use their
 * own parameter range; implicit/inequality rows grid the whole visible
 * world. Null when nothing overlaps (cartesian) — other ranges are
 * validated at compile time instead.
 */
export function rangeForRow(row: ExpressionRow, view: { xMin: number; xMax: number }): { xMin: number; xMax: number } | null {
  if (row.kind === 'parametric') {
    return { xMin: row.tMin, xMax: row.tMax }
  }
  if (row.kind === 'polar') {
    return { xMin: row.thetaMin, xMax: row.thetaMax }
  }
  if (row.kind === 'implicit' || row.kind === 'inequality') {
    return { xMin: view.xMin, xMax: view.xMax }
  }
  const lo = row.domain === null ? view.xMin : Math.max(view.xMin, row.domain.min)
  const hi = row.domain === null ? view.xMax : Math.min(view.xMax, row.domain.max)
  if (!(hi > lo)) {
    return null
  }
  return { xMin: lo, xMax: hi }
}
