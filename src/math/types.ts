/**
 * Typed API for the GraphCraft math engine (GS-01).
 *
 * One compiled expression per expression row; the compiled form is reused
 * while only `x` changes. No React or DOM dependency — pure TypeScript.
 */

/** A successfully evaluated finite number. */
export interface ValueResult {
  kind: 'value'
  value: number
}

/** Valid expression, but not defined at this `x` (e.g. `sqrt(-1)`, `0/0`). */
export interface DomainErrorResult {
  kind: 'domain-error'
  reason: string
}

/** Valid expression whose result is non-finite (e.g. `1/0`, `10^1000`). */
export interface OverflowResult {
  kind: 'overflow'
  reason: string
}

/** The evaluator itself failed unexpectedly (never a user-expression fault). */
export interface EvaluationErrorResult {
  kind: 'evaluation-error'
  reason: string
}

export type EvalResult = ValueResult | DomainErrorResult | OverflowResult | EvaluationErrorResult

/** Structured compile-time diagnostic. `position` is a best-effort 0-based index. */
export interface ParseDiagnostic {
  kind: 'parse-error' | 'unsupported' | 'limit'
  message: string
  position?: number
}

/** Reusable compiled evaluator for one expression. */
export interface CompiledExpression {
  /** Original source text (allows recompilation elsewhere, e.g. a future worker). */
  readonly source: string
  /** Independent variables this was compiled for (usually one). */
  readonly variables: string[]
  /** User parameter names actually referenced, sorted. Empty when none. */
  readonly parameterNames: string[]
  /**
   * Evaluate at one input, bound to the first variable. Values arrive
   * per call, so slider ticks never recompile. Missing/non-finite
   * parameter values are evaluation errors, never silent defaults.
   */
  evaluate: (x: number, parameterValues?: Record<string, number>) => EvalResult
  /** Evaluate with an explicit record for every variable. */
  evaluateRecord: (values: Record<string, number>, parameterValues?: Record<string, number>) => EvalResult
}

/**
 * Minimal evaluator contract. The sampler and curve pipeline depend on
 * this — not on any particular engine — so single formulas, piecewise
 * definitions, and future graph types all sample through one path.
 */
export interface Evaluator {
  evaluate: (x: number, parameterValues?: Record<string, number>) => EvalResult
}

/**
 * Minimal point evaluator contract for parametric/polar rows:
 * one parameter in, one finite point or null out.
 */
export interface PointEvaluator {
  evaluatePoint: (t: number, parameterValues?: Record<string, number>) => { x: number; y: number } | null
}

/**
 * Scalar field contract for implicit/inequality rows: F(x, y), finite
 * value or null (invalid covers domain gaps, overflow, and failures —
 * contouring only needs the distinction).
 */
export interface FieldEvaluator {
  evaluateField: (x: number, y: number, parameterValues?: Record<string, number>) => { value: number } | null
}

export type CompileResult = { ok: true; expression: CompiledExpression } | { ok: false; error: ParseDiagnostic }
