import { compileExpression } from './engine.ts'
import type { EvalResult, Evaluator, ParseDiagnostic } from './types.ts'

/**
 * Structured piecewise definitions (Stage 2).
 *
 * Semantics (documented, first-match wins):
 * - Branches are tried in order; the first branch whose condition holds
 *   for `x` supplies the value.
 * - `x` values matching no branch fall through to `defaultSource`.
 * - A missing/blank default means "leave blank": unmatched regions
 *   evaluate to a domain error, which the sampler renders as gaps.
 * - Overlapping conditions are permitted; the earliest branch wins.
 *   Gaps (nothing matches and no default) are legitimate and drawn as gaps.
 */

export type BranchOperator = 'lt' | 'le' | 'gt' | 'ge'

export interface BranchCondition {
  readonly op: BranchOperator
  readonly value: number
}

export interface PiecewiseBranch {
  readonly condition: BranchCondition
  readonly source: string
}

export interface CompiledPiecewise {
  readonly branches: ReadonlyArray<{ condition: BranchCondition; evaluate: (x: number, parameterValues?: Record<string, number>) => EvalResult }>
  readonly defaultEvaluate: ((x: number, parameterValues?: Record<string, number>) => EvalResult) | null
  /** Boundary x-positions the sampler must never connect across. */
  readonly breakpoints: number[]
  /** User parameter names referenced anywhere, sorted. */
  readonly parameterNames: string[]
  readonly evaluate: (x: number, parameterValues?: Record<string, number>) => EvalResult
}

export const MAX_PIECEWISE_BRANCHES = 20

const OPERATOR_LABELS: Record<BranchOperator, string> = {
  lt: 'x <',
  le: 'x ≤',
  gt: 'x >',
  ge: 'x ≥',
}

export function describeCondition(condition: BranchCondition): string {
  return `${OPERATOR_LABELS[condition.op]} ${condition.value}`
}

function testCondition(condition: BranchCondition, x: number): boolean {
  switch (condition.op) {
    case 'lt':
      return x < condition.value
    case 'le':
      return x <= condition.value
    case 'gt':
      return x > condition.value
    case 'ge':
      return x >= condition.value
  }
}

function validateCondition(condition: BranchCondition, index: number): string | null {
  if (condition.op !== 'lt' && condition.op !== 'le' && condition.op !== 'gt' && condition.op !== 'ge') {
    return `Branch ${index + 1}: unknown condition.`
  }
  if (!Number.isFinite(condition.value)) {
    return `Branch ${index + 1}: condition value must be a finite number.`
  }
  return null
}

/**
 * Compile branches + default into one evaluator. Branch sources go
 * through the same engine gate as single formulas (same syntax, same
 * safety). Errors name their branch.
 */
export function compilePiecewise(
  branches: PiecewiseBranch[],
  defaultSource: string,
  parameterNames: string[] = [],
): { ok: true; piecewise: CompiledPiecewise } | { ok: false; error: ParseDiagnostic } {
  if (branches.length > MAX_PIECEWISE_BRANCHES) {
    return { ok: false, error: { kind: 'limit', message: `Too many branches (maximum is ${MAX_PIECEWISE_BRANCHES}).` } }
  }
  const trimmedDefault = defaultSource.trim()
  if (branches.length === 0 && trimmedDefault === '') {
    return { ok: false, error: { kind: 'parse-error', message: 'Piecewise needs at least one branch or a default expression.' } }
  }

  const compiledBranches: Array<{ condition: BranchCondition; evaluate: (x: number, parameterValues?: Record<string, number>) => EvalResult }> = []
  const referenced = new Set<string>()
  for (let i = 0; i < branches.length; i += 1) {
    const branch = branches[i]
    if (branch === undefined) {
      continue
    }
    const conditionError = validateCondition(branch.condition, i)
    if (conditionError !== null) {
      return { ok: false, error: { kind: 'unsupported', message: conditionError } }
    }
    const compiled = compileExpression(branch.source, { parameters: parameterNames })
    if (!compiled.ok) {
      return { ok: false, error: { kind: compiled.error.kind, message: `Branch ${i + 1} (${describeCondition(branch.condition)}): ${compiled.error.message}` } }
    }
    for (const name of compiled.expression.parameterNames) {
      referenced.add(name)
    }
    compiledBranches.push({ condition: branch.condition, evaluate: compiled.expression.evaluate })
  }

  let defaultEvaluate: ((x: number, parameterValues?: Record<string, number>) => EvalResult) | null = null
  if (trimmedDefault !== '') {
    const compiledDefault = compileExpression(trimmedDefault, { parameters: parameterNames })
    if (!compiledDefault.ok) {
      return { ok: false, error: { kind: compiledDefault.error.kind, message: `Default branch: ${compiledDefault.error.message}` } }
    }
    for (const name of compiledDefault.expression.parameterNames) {
      referenced.add(name)
    }
    defaultEvaluate = compiledDefault.expression.evaluate
  }

  const breakpoints = [...new Set(compiledBranches.map((branch) => branch.condition.value))].sort((a, b) => a - b)
  const names = [...referenced].sort()

  const evaluate: Evaluator['evaluate'] = (x: number, parameterValues?: Record<string, number>): EvalResult => {
    if (typeof x !== 'number') {
      return { kind: 'evaluation-error', reason: 'Evaluation input must be a number.' }
    }
    for (const branch of compiledBranches) {
      if (testCondition(branch.condition, x)) {
        return branch.evaluate(x, parameterValues)
      }
    }
    if (defaultEvaluate !== null) {
      return defaultEvaluate(x, parameterValues)
    }
    return { kind: 'domain-error', reason: `No branch matches x=${x} and no default is set.` }
  }

  return { ok: true, piecewise: { branches: compiledBranches, defaultEvaluate, breakpoints, parameterNames: names, evaluate } }
}
