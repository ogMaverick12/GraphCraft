import {
  absDependencies,
  acosDependencies,
  addDependencies,
  asinDependencies,
  atanDependencies,
  ceilDependencies,
  cosDependencies,
  coshDependencies,
  create,
  divideDependencies,
  eDependencies,
  expDependencies,
  floorDependencies,
  multiplyDependencies,
  parseDependencies,
  piDependencies,
  powDependencies,
  sinDependencies,
  sinhDependencies,
  sqrtDependencies,
  subtractDependencies,
  tanDependencies,
  tanhDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
} from 'mathjs/number'
import type { CompileResult, CompiledExpression, EvalResult, ParseDiagnostic } from './types.ts'

/**
 * GraphCraft math engine (GS-01).
 *
 * Wraps the mathjs number-only bundle behind a GraphCraft-owned interface
 * so the engine can be swapped later. mathjs is used for parsing only;
 * what a user expression may *do* is decided by the AST gate below, not
 * by mathjs defaults.
 *
 * Safety model:
 * - Never `eval` / `new Function` / dynamic import of user text.
 * - Parsed AST must contain only whitelisted node types, operators,
 *   functions, and symbols. Property access, assignment, arrays,
 *   objects, ranges, and conditionals are rejected before compilation,
 *   so user text cannot reach globals, browser objects, or network.
 * - Input length and AST node-count caps bound resource use. The
 *   compiled form carries its source so evaluation can later move to
 *   a Web Worker by recompiling there.
 */

// Load only the parser and the functions this engine exposes. Keep this list
// aligned with ALLOWED_OPERATORS and ALLOWED_FUNCTIONS below; the AST gate
// decides what accepted input may call. Unused mathjs features (algebra,
// matrices, statistics, units, and embedded documentation) stay out of the
// initial graphing path.
const math = create({
  parseDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
  sinhDependencies,
  coshDependencies,
  tanhDependencies,
  sqrtDependencies,
  absDependencies,
  expDependencies,
  floorDependencies,
  ceilDependencies,
  eDependencies,
  piDependencies,
})

// Student convention, independent of mathjs defaults: log is base-10,
// ln is the natural logarithm. (mathjs `log` defaults to base e.)
// factorial is integer-strict: non-negative integers only; anything else
// is not defined here (NaN → domain-error), and large values overflow
// through the normal finite check. This keeps n! honest in both the
// grapher and the calculator instead of silently using gamma.
// round is half away from zero; mod is floored (takes the divisor's
// sign); permutations/combinations are integer-strict with 0 ≤ k ≤ n.
math.import(
  {
    ln: (x: number): number => Math.log(x),
    log: (x: number, base?: number): number => {
      if (base === undefined) {
        return Math.log10(x)
      }
      if (!(x > 0) || !(base > 0) || base === 1) {
        return Number.NaN
      }
      return Math.log(x) / Math.log(base)
    },
    round: (x: number, decimals = 0): number => {
      if (!Number.isInteger(decimals)) {
        return Number.NaN
      }
      const factor = 10 ** decimals
      return Math.sign(x) * Math.round(Math.abs(x) * factor) / factor
    },
    mod: (a: number, b: number): number => {
      if (b === 0) {
        return Number.NaN
      }
      return a - b * Math.floor(a / b)
    },
    factorial: (x: number): number => {
      if (!Number.isInteger(x) || x < 0) {
        return Number.NaN
      }
      let result = 1
      for (let n = 2; n <= x; n += 1) {
        result *= n
        // x! overflows a double by 171!; stop at the first non-finite
        // product. x can be as large as 1e15, so looping to the input
        // would run unbounded work from a nine-character expression.
        if (!Number.isFinite(result)) {
          return result
        }
      }
      return result
    },
    permutations: (n: number, k: number): number => {
      if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
        return Number.NaN
      }
      let result = 1
      for (let i = 0; i < k; i += 1) {
        result *= n - i
        // Same bound as factorial: stop at the first non-finite product
        // instead of iterating up to k (which can be 1e15).
        if (!Number.isFinite(result)) {
          return result
        }
      }
      return result
    },
    combinations: (n: number, k: number): number => {
      if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
        return Number.NaN
      }
      const take = Math.min(k, n - k)
      let result = 1
      for (let i = 1; i <= take; i += 1) {
        const factor = n - take + i
        if (result > Number.MAX_VALUE / factor) {
          // The intermediate product would overflow, but the division
          // can still bring the true value back into range — e.g.
          // C(1028,514) ≈ 7.156e307 is representable while
          // C(1027,513)·1028 is not. Divide first in this rare band,
          // trading one rounding step for a value instead of a
          // spurious overflow. A genuinely overflowing binomial still
          // yields Infinity here.
          result = (result / i) * factor
          if (!Number.isFinite(result)) {
            return result
          }
        } else {
          result = (result * factor) / i
          if (!Number.isFinite(result)) {
            return result
          }
        }
      }
      return result
    },
  },
  { override: true },
)

/** Maximum accepted source length in characters. */
export const MAX_EXPRESSION_LENGTH = 500
/** Maximum accepted AST node count. */
export const MAX_EXPRESSION_NODES = 300

const ALLOWED_OPERATORS = new Set(['+', '-', '*', '/', '^', '!'])
const ALLOWED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'sqrt',
  'abs',
  'exp',
  'log',
  'ln',
  'floor',
  'ceil',
  'round',
  'mod',
  'factorial',
  'permutations',
  'combinations',
])
const ALLOWED_CONSTANTS = new Set(['pi', 'e'])

interface GateFailure {
  kind: 'unsupported' | 'limit'
  message: string
}

/**
 * Walk the parsed AST and reject anything outside the student syntax.
 * Returns a typed failure, or null when the tree is acceptable.
 */
// mathjs node types are structural; use minimal local shapes to stay engine-agnostic.
interface AstNode {
  type?: string
  toString: () => string
  traverse: (cb: (node: AstNodeRecord, path: string, parent: AstNodeRecord | null) => void) => void
}

interface AstNodeRecord {
  type?: string
  op?: string
  name?: string
  fn?: AstNodeRecord
  value?: unknown
}

/**
 * A user parameter name: 1-16 characters, letter first, then
 * letters/digits/underscores. Case-sensitive. Row variables x/y/t/theta,
 * constants pi/e, and supported function names are reserved.
 */
export function isValidParameterName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(name) && !ALLOWED_CONSTANTS.has(name) && name !== 'x' && name !== 'y' && name !== 't' && name !== 'theta' && !ALLOWED_FUNCTIONS.has(name)
}

function gateTree(root: AstNode, variables: string[], parameters: ReadonlySet<string>): GateFailure | null {
  let failure: GateFailure | null = null
  let count = 0
  root.traverse((node: AstNodeRecord, _path: string, parent: AstNodeRecord | null) => {
    if (failure !== null) {
      return
    }
    count += 1
    if (count > MAX_EXPRESSION_NODES) {
      failure = { kind: 'limit', message: `Expression is too complex (more than ${MAX_EXPRESSION_NODES} operations)` }
      return
    }
    switch (node.type) {
      case 'ParenthesisNode':
        return
      case 'ConstantNode':
        // The evaluation path is number-only; quoted text must never be
        // coerced by mathjs arithmetic (`"5" + 2` would otherwise give 7).
        if (typeof node.value !== 'number') {
          failure = { kind: 'unsupported', message: 'String literals are not supported. Use a number or expression instead.' }
        }
        return
      case 'SymbolNode':
        // A bare `sin` in `sin + 1` is not a value; only the function-name
        // position of a whitelisted call (checked under FunctionNode) is exempt.
        if (parent?.type === 'FunctionNode' && parent.fn === node) {
          return
        }
        if (node.name === undefined || (!variables.includes(node.name) && !ALLOWED_CONSTANTS.has(node.name) && !parameters.has(node.name))) {
          const hint = variables.length === 1 && variables[0] === 'x' ? 'x, pi, e' : `${variables.join(', ')}, pi, e`
          const name = node.name ?? '?'
          failure = { kind: 'unsupported', message: `Unknown symbol '${name}'. Use ${hint}, or a defined parameter.` }
        }
        return
      case 'OperatorNode':
        if (node.op === undefined || !ALLOWED_OPERATORS.has(node.op)) {
          failure = { kind: 'unsupported', message: `Unsupported operator "${node.op ?? '?'}". Use +, -, *, /, ^, ! and parentheses.` }
        }
        return
      case 'FunctionNode': {
        const fn = node.fn
        if (fn === undefined || fn.type !== 'SymbolNode' || !ALLOWED_FUNCTIONS.has(fn.name ?? '')) {
          failure = { kind: 'unsupported', message: 'Only sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, sqrt, abs, exp, log, ln, floor, ceil, round, mod, factorial, permutations, and combinations may be used.' }
        }
        return
      }
      default:
        failure = { kind: 'unsupported', message: `Unsupported construct "${node.type ?? 'unknown'}". Only arithmetic, x, pi, e, and listed functions are allowed.` }
    }
  })
  return failure
}

/**
 * mathjs parses lowercase `0x`/`0b`/`0o` literals into plain numeric
 * ConstantNodes, losing the source form, so the AST gate cannot see
 * them. Detect complete non-decimal tokens at the source level.
 * Malformed forms (`0b102`, `0xffg`) never match a whole token and keep
 * their parse-error classification; decimal/scientific notation and
 * implicit multiplication such as `10b` or `20x` are unaffected.
 */
const NON_DECIMAL_LITERAL = /(?:^|[^\w.])(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+)(?![\w.])/

function nonDecimalLiteralName(source: string): string | null {
  const match = NON_DECIMAL_LITERAL.exec(source)
  if (match === null) {
    return null
  }
  const literal = match[1]
  if (literal === undefined) {
    return null
  }
  if (literal.startsWith('0x')) {
    return 'Hexadecimal'
  }
  if (literal.startsWith('0b')) {
    return 'Binary'
  }
  return 'Octal'
}

function extractPosition(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'char' in error) {
    const char = (error as { char?: unknown }).char
    if (typeof char === 'number' && Number.isInteger(char) && char >= 0) {
      return char
    }
  }
  return undefined
}

function classifyResult(raw: unknown): EvalResult {
  if (typeof raw !== 'number') {
    return { kind: 'evaluation-error', reason: 'Evaluator returned a non-number.' }
  }
  if (Number.isNaN(raw)) {
    return { kind: 'domain-error', reason: 'Not defined here (for example, square root of a negative number or 0/0).' }
  }
  if (!Number.isFinite(raw)) {
    return { kind: 'overflow', reason: 'Result is not finite here (division by zero or overflow).' }
  }
  return { kind: 'value', value: raw }
}

export interface CompileOptions {
  /** Extra admittable symbols (user parameters). Values arrive per evaluation. */
  readonly parameters?: string[]
  /** Independent variables, e.g. ['x'], ['t'], ['theta'], or ['x', 'y']. */
  readonly variables?: string[]
  /**
   * Internal seam for a synthesized source: overrides the default
   * MAX_EXPRESSION_LENGTH user-input cap. Ordinary callers must omit it.
   * Callers that set it must validate every user-entered component against
   * the ordinary cap first; the AST node cap still applies.
   */
  readonly maxSourceLength?: number
}

function resolveVariables(explicit: string[] | undefined): string[] | { error: string } {
  const variables = explicit ?? ['x']
  if (variables.length === 0 || variables.length > 2) {
    return { error: 'One or two independent variables are supported.' }
  }
  const seen = new Set<string>()
  for (const name of variables) {
    if (typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(name) || ALLOWED_CONSTANTS.has(name) || ALLOWED_FUNCTIONS.has(name)) {
      return { error: `Invalid variable name "${name}".` }
    }
    if (seen.has(name)) {
      return { error: `Duplicate variable "${name}".` }
    }
    seen.add(name)
  }
  return [...seen]
}

/**
 * Validate and compile one expression. `parameters` declares which extra
 * symbols the text may reference; values are supplied per evaluation, so
 * slider ticks never recompile. `variables` names the independent
 * variables. The returned evaluator is reused while only inputs change.
 */
export function compileExpression(source: string, opts: CompileOptions = {}): CompileResult {
  if (source.trim().length === 0) {
    const error: ParseDiagnostic = { kind: 'parse-error', message: 'Expression is empty.' }
    return { ok: false, error }
  }
  const maxSourceLength = opts.maxSourceLength ?? MAX_EXPRESSION_LENGTH
  if (source.length > maxSourceLength) {
    const error: ParseDiagnostic = {
      kind: 'limit',
      message: `Expression is too long (${source.length} characters; maximum is ${maxSourceLength}).`,
    }
    return { ok: false, error }
  }

  let tree: AstNode
  try {
    tree = math.parse(source) as unknown as AstNode
  } catch (error: unknown) {
    const position = extractPosition(error)
    const errorDiagnostic: ParseDiagnostic = {
      kind: 'parse-error',
      message: `Could not parse expression${position !== undefined ? ` near character ${position + 1}` : ''}. Check brackets and operator placement.`,
      ...(position !== undefined ? { position } : {}),
    }
    return { ok: false, error: errorDiagnostic }
  }

  const resolvedVariables = resolveVariables(opts.variables)
  if (!Array.isArray(resolvedVariables)) {
    return { ok: false, error: { kind: 'unsupported', message: resolvedVariables.error } }
  }
  const parameters = new Set((opts.parameters ?? []).filter((name) => isValidParameterName(name)))
  const failure = gateTree(tree, resolvedVariables, parameters)
  if (failure !== null) {
    const error: ParseDiagnostic = { kind: failure.kind, message: failure.message }
    return { ok: false, error }
  }

  const nonDecimal = nonDecimalLiteralName(source)
  if (nonDecimal !== null) {
    const error: ParseDiagnostic = {
      kind: 'unsupported',
      message: `${nonDecimal} literals are not supported. Use decimal or scientific notation.`,
    }
    return { ok: false, error }
  }

  // Parameters actually referenced (sorted): dependency tracking for callers.
  const referenced = new Set<string>()
  tree.traverse((node: AstNodeRecord) => {
    if (node.type === 'SymbolNode' && node.name !== undefined && parameters.has(node.name)) {
      referenced.add(node.name)
    }
  })

  let compiled: { evaluate: (scope: unknown) => unknown }
  try {
    compiled = (tree as unknown as { compile: () => { evaluate: (scope: unknown) => unknown } }).compile()
  } catch {
    const error: ParseDiagnostic = { kind: 'parse-error', message: 'Expression could not be prepared for evaluation.' }
    return { ok: false, error }
  }

  const parameterList = [...referenced].sort()

  function runScope(scope: Record<string, number>): EvalResult {
    for (const name of parameterList) {
      const value = scope[name]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { kind: 'evaluation-error', reason: `Parameter "${name}" has no finite value.` }
      }
    }
    let raw: unknown
    try {
      raw = compiled.evaluate(scope)
    } catch {
      return { kind: 'evaluation-error', reason: 'Evaluation failed for the given inputs.' }
    }
    return classifyResult(raw)
  }

  const expression: CompiledExpression = {
    source,
    variables: resolvedVariables,
    parameterNames: parameterList,
    evaluate: (x: number, parameterValues?: Record<string, number>): EvalResult => {
      if (typeof x !== 'number') {
        return { kind: 'evaluation-error', reason: 'Evaluation input must be a number.' }
      }
      const first = resolvedVariables[0]
      if (first === undefined) {
        return { kind: 'evaluation-error', reason: 'No variable bound.' }
      }
      const scope: Record<string, number> = { [first]: x }
      for (const name of parameterList) {
        const value = parameterValues?.[name]
        if (value !== undefined) {
          scope[name] = value
        }
      }
      return runScope(scope)
    },
    evaluateRecord: (values: Record<string, number>, parameterValues?: Record<string, number>): EvalResult => {
      const scope: Record<string, number> = {}
      for (const name of resolvedVariables) {
        const value = values[name]
        if (typeof value !== 'number') {
          return { kind: 'evaluation-error', reason: 'Evaluation input must be a number.' }
        }
        scope[name] = value
      }
      for (const name of parameterList) {
        const value = parameterValues?.[name]
        if (value !== undefined) {
          scope[name] = value
        }
      }
      return runScope(scope)
    },
  }
  return { ok: true, expression }
}
