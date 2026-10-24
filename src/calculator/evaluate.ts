import { compileExpression } from '../math/engine.ts'

/**
 * Calculator evaluation (Stage 3 CALC-01): pure text → result pipeline.
 * The shared math engine owns parsing, gating, and arithmetic — this
 * module only rewrites two calculator conventions into engine syntax
 * before compiling, and reports exactly what was compiled:
 *
 * - Percent: a trailing `%` after a number or parenthesised group means
 *   `/100` of that operand (`50%` → `(50)/100`). Strictly per-operand;
 *   `50+10%` is `50+(10)/100`, not 55. Documented, not clever.
 * - Degrees: trig calls are wrapped so the engine (always radians) sees
 *   converted arguments; inverse trig results are converted back.
 *   Hyperbolics stay radian-only and are never rewritten.
 *
 * No React/DOM. No silent defaults: an expression mentioning a graph
 * variable (x/y/t/theta) is reported as variable-bearing, never
 * evaluated with a hidden zero.
 */

export type AngleMode = 'radians' | 'degrees'

export interface PreparedInput {
  /** Exactly what the user typed. */
  readonly entered: string
  /** What the engine actually compiled (rewrites applied). */
  readonly interpreted: string
  /** True when interpreted differs from entered. */
  readonly adjusted: boolean
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

/** Find the start index of the operand ending just before `end`. */
function operandStart(source: string, end: number): number | null {
  let i = end - 1
  while (i >= 0 && source[i] === ' ') {
    i -= 1
  }
  if (i < 0) {
    return null
  }
  const last = source[i]
  if (last === ')') {
    let depth = 0
    for (let j = i; j >= 0; j -= 1) {
      if (source[j] === ')') {
        depth += 1
      } else if (source[j] === '(') {
        depth -= 1
        if (depth === 0) {
          return j
        }
      }
    }
    return null
  }
  if (last !== undefined && (isDigit(last) || last === '.')) {
    let j = i
    while (j >= 0 && (isDigit(source[j] ?? '') || source[j] === '.')) {
      j -= 1
    }
    return j + 1
  }
  return null
}

/** Rewrite `operand%` as `(operand)/100`, left to right. A `%` that is
 *  directly followed by another operand character (digit, letter, `.`,
 *  `(`) is left alone so `7%3` cannot silently become `7/1003` — the
 *  engine then rejects the stray `%` honestly (use mod(a, b) instead).
 */
function applyPercent(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    if (source[i] === '%') {
      const next = source[i + 1]
      if (next !== undefined && (isDigit(next) || next === '.' || next === '(' || isNameChar(next))) {
        out += '%'
        i += 1
        continue
      }
      const start = operandStart(out, out.length)
      if (start === null) {
        out += '%'
      } else {
        const operand = out.slice(start)
        out = `${out.slice(0, start)}(${operand})/100`
      }
      i += 1
    } else {
      out += source[i]
      i += 1
    }
  }
  return out
}

const DEG_FORWARD = new Set(['sin', 'cos', 'tan'])
const DEG_INVERSE = new Set(['asin', 'acos', 'atan'])

function isNameChar(char: string | undefined): boolean {
  return char !== undefined && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char === '_')
}

/** Index of the `)` balancing the `(` at `open`, or -1. */
function matchParen(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') {
      depth += 1
    } else if (source[i] === ')') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/** Recursively wrap trig calls for degree mode. */
function rewriteDegrees(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const char = source[i]
    if (char !== undefined && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'))) {
      let j = i
      while (isNameChar(source[j])) {
        j += 1
      }
      const name = source.slice(i, j)
      let k = j
      while (source[k] === ' ') {
        k += 1
      }
      if (source[k] === '(' && (DEG_FORWARD.has(name) || DEG_INVERSE.has(name))) {
        const close = matchParen(source, k)
        if (close === -1) {
          return out + source.slice(i)
        }
        const inner = rewriteDegrees(source.slice(k + 1, close))
        out += DEG_FORWARD.has(name) ? `${name}((${inner})*pi/180)` : `((${name}(${inner}))*180/pi)`
        i = close + 1
        continue
      }
      out += name
      i = j
      continue
    }
    out += char ?? ''
    i += 1
  }
  return out
}

export function prepare(source: string, mode: AngleMode): PreparedInput {
  const percent = applyPercent(source)
  const interpreted = mode === 'degrees' ? rewriteDegrees(percent) : percent
  return { entered: source, interpreted, adjusted: interpreted !== source }
}

const VARIABLE_PATTERN = /\b(x|y|t|theta)\b/

export type CalcOutcome =
  | { status: 'value'; value: number; interpreted: string; adjusted: boolean }
  | { status: 'variable'; interpreted: string; adjusted: boolean; message: string }
  | { status: 'error'; kind: 'syntax' | 'domain' | 'overflow' | 'unsupported' | 'limit'; interpreted: string; adjusted: boolean; message: string }

/** One history row: the entry, its outcome, and the engine text that ran. */
export interface CalcHistoryEntry {
  readonly id: number
  readonly entered: string
  readonly interpreted: string
  readonly adjusted: boolean
  readonly mode: AngleMode
  readonly outcome: CalcOutcome
}

/** Calculator history row: scalar evaluations or structured results. */
export type CalcRecord = { kind: 'scalar'; entry: CalcHistoryEntry } | { kind: 'structured'; id: number; title: string; display: string; method: string }

/** Allowed history sizes for the Keep selector. */
export const HISTORY_LIMITS = [10, 20, 50] as const

/**
 * Evaluate calculator input. Variable-bearing input is reported, never
 * evaluated with a hidden binding; every other outcome carries the
 * interpreted text so the UI can show what ran.
 */
export function calculate(source: string, mode: AngleMode): CalcOutcome {
  const prepared = prepare(source, mode)
  if (VARIABLE_PATTERN.test(prepared.entered)) {
    return {
      status: 'variable',
      interpreted: prepared.interpreted,
      adjusted: prepared.adjusted,
      message: 'This mentions a graph variable, so it has no single numeric value. Plot it in Graph Studio, or replace the variable with a number.',
    }
  }
  const compiled = compileExpression(prepared.interpreted)
  if (!compiled.ok) {
    const kind = compiled.error.kind === 'parse-error' ? 'syntax' : compiled.error.kind === 'limit' ? 'limit' : 'unsupported'
    return { status: 'error', kind, interpreted: prepared.interpreted, adjusted: prepared.adjusted, message: compiled.error.message }
  }
  const result = compiled.expression.evaluate(0, {})
  if (result.kind === 'value') {
    return { status: 'value', value: result.value, interpreted: prepared.interpreted, adjusted: prepared.adjusted }
  }
  if (result.kind === 'domain-error') {
    return { status: 'error', kind: 'domain', interpreted: prepared.interpreted, adjusted: prepared.adjusted, message: result.reason }
  }
  if (result.kind === 'overflow') {
    return { status: 'error', kind: 'overflow', interpreted: prepared.interpreted, adjusted: prepared.adjusted, message: result.reason }
  }
  return { status: 'error', kind: 'domain', interpreted: prepared.interpreted, adjusted: prepared.adjusted, message: result.reason }
}
