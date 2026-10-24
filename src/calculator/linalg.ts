import { calculate, type AngleMode } from './evaluate.ts'
import { formatDisplay } from './format.ts'

/**
 * Vector/matrix lane (Stage 3 structured modes): native typed linear
 * algebra. No new dependency: the engine evaluates scalar elements, and
 * combination (dot, cross, elimination) lives here under explicit
 * dimension caps. No units are inferred — inputs are plain numbers.
 *
 * Limits (documented, enforced): vectors hold at most 256 entries;
 * matrices at most 8×8. Determinants and inverses run Gauss-Jordan with
 * partial pivoting; a pivot below 1e-12 of the matrix scale is reported
 * singular, never inverted into garbage. All floating-point results
 * carry finite precision — exactness is never claimed.
 */

export type Vector = number[]
export type Matrix = number[][]

export const MAX_VECTOR_LENGTH = 256
export const MAX_MATRIX_DIM = 8
const SINGULAR_PIVOT_RATIO = 1e-12

export type LinalgOutcome<T> =
  | { status: 'value'; value: T; warning?: string }
  | { status: 'error'; kind: 'syntax' | 'domain' | 'dimension' | 'limit' | 'overflow'; message: string }

/** Split on top-level commas, honouring (), [], and unary/exponent signs. */
export function splitTopLevel(source: string): string[] {
  const parts: string[] = []
  let depthRound = 0
  let depthSquare = 0
  let current = ''
  for (const char of source) {
    if (char === '(') {
      depthRound += 1
    } else if (char === ')') {
      depthRound -= 1
    } else if (char === '[') {
      depthSquare += 1
    } else if (char === ']') {
      depthSquare -= 1
    }
    if (char === ',' && depthRound === 0 && depthSquare === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

function scalarElement(text: string, mode: AngleMode, what: string): number | { error: string } {
  const outcome = calculate(text.trim(), mode)
  if (outcome.status !== 'value') {
    return { error: `${what} "${text.trim()}" is not a finite number${outcome.status === 'variable' ? ' (variables need values first)' : `: ${outcome.message}`}.` }
  }
  return outcome.value
}

/** Strict `[e1, e2, ...]` grammar; each element is an engine expression. */
export function parseVector(source: string, mode: AngleMode): LinalgOutcome<Vector> {
  const text = source.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) {
    return { status: 'error', kind: 'syntax', message: 'Vectors look like [1, 2, 3] — square brackets, comma-separated.' }
  }
  const parts = splitTopLevel(text.slice(1, -1))
  if (parts.length === 1 && parts[0]?.trim() === '') {
    return { status: 'error', kind: 'domain', message: 'Empty vector: at least one entry is required.' }
  }
  if (parts.length > MAX_VECTOR_LENGTH) {
    return { status: 'error', kind: 'limit', message: `Vectors hold at most ${MAX_VECTOR_LENGTH} entries.` }
  }
  const values: number[] = []
  for (const part of parts) {
    const value = scalarElement(part, mode, 'Entry')
    if (typeof value === 'object') {
      return { status: 'error', kind: 'syntax', message: value.error }
    }
    values.push(value)
  }
  return { status: 'value', value: values }
}

/** Strict `[[..],[..]]` grammar with rectangular validation. */
export function parseMatrix(source: string, mode: AngleMode): LinalgOutcome<Matrix> {
  const text = source.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) {
    return { status: 'error', kind: 'syntax', message: 'Matrices look like [[1, 2], [3, 4]] — bracketed rows of bracketed entries.' }
  }
  const rowTexts = splitTopLevel(text.slice(1, -1))
  if (rowTexts.length === 1 && rowTexts[0]?.trim() === '') {
    return { status: 'error', kind: 'domain', message: 'Empty matrix: at least one row is required.' }
  }
  if (rowTexts.length > MAX_MATRIX_DIM) {
    return { status: 'error', kind: 'limit', message: `Matrices are at most ${MAX_MATRIX_DIM}×${MAX_MATRIX_DIM}.` }
  }
  const rows: Matrix = []
  for (const rowText of rowTexts) {
    const row = rowText.trim()
    if (!row.startsWith('[') || !row.endsWith(']')) {
      return { status: 'error', kind: 'syntax', message: `Row "${row}" is not bracketed: use [[1, 2], [3, 4]].` }
    }
    const cells = splitTopLevel(row.slice(1, -1))
    if (cells.length > MAX_MATRIX_DIM) {
      return { status: 'error', kind: 'limit', message: `Matrices are at most ${MAX_MATRIX_DIM}×${MAX_MATRIX_DIM}.` }
    }
    const values: number[] = []
    for (const cell of cells) {
      const value = scalarElement(cell, mode, 'Cell')
      if (typeof value === 'object') {
        return { status: 'error', kind: 'syntax', message: value.error }
      }
      values.push(value)
    }
    rows.push(values)
  }
  const width = rows[0]?.length ?? 0
  if (width === 0) {
    return { status: 'error', kind: 'domain', message: 'Empty matrix: rows need at least one entry.' }
  }
  if (!rows.every((row) => row.length === width)) {
    return { status: 'error', kind: 'dimension', message: 'Ragged matrix: every row needs the same number of entries.' }
  }
  return { status: 'value', value: rows }
}

function sameLength(a: Vector, b: Vector): boolean {
  return a.length === b.length
}

/** Non-finite entries mean overflow; report it instead of displaying '—'. */
function finiteVector(value: Vector): LinalgOutcome<Vector> {
  return value.every((x) => Number.isFinite(x))
    ? { status: 'value', value }
    : { status: 'error', kind: 'overflow', message: 'Result has non-finite entries (overflow): values are outside the double range.' }
}

function finiteMatrix(value: Matrix): LinalgOutcome<Matrix> {
  return value.every((row) => row.every((x) => Number.isFinite(x)))
    ? { status: 'value', value }
    : { status: 'error', kind: 'overflow', message: 'Result has non-finite entries (overflow): values are outside the double range.' }
}

function finiteScalar(value: number): LinalgOutcome<number> {
  return Number.isFinite(value)
    ? { status: 'value', value }
    : { status: 'error', kind: 'overflow', message: 'Result is not finite (overflow): the value is outside the double range.' }
}

export function addVectors(a: Vector, b: Vector): LinalgOutcome<Vector> {
  if (!sameLength(a, b)) {
    return { status: 'error', kind: 'dimension', message: `Cannot add a length-${a.length} vector to a length-${b.length} vector.` }
  }
  return finiteVector(a.map((x, i) => x + (b[i] ?? 0)))
}

export function subVectors(a: Vector, b: Vector): LinalgOutcome<Vector> {
  if (!sameLength(a, b)) {
    return { status: 'error', kind: 'dimension', message: `Cannot subtract a length-${b.length} vector from a length-${a.length} vector.` }
  }
  return finiteVector(a.map((x, i) => x - (b[i] ?? 0)))
}

export function dotVectors(a: Vector, b: Vector): LinalgOutcome<number> {
  if (!sameLength(a, b)) {
    return { status: 'error', kind: 'dimension', message: `Dot product needs equal lengths (got ${a.length} and ${b.length}).` }
  }
  return finiteScalar(a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0))
}

/** 3D cross product, right-hand rule. */
export function crossVectors(a: Vector, b: Vector): LinalgOutcome<Vector> {
  if (a.length !== 3 || b.length !== 3) {
    return { status: 'error', kind: 'dimension', message: `Cross product is 3D-only (got lengths ${a.length} and ${b.length}).` }
  }
  const [a1 = 0, a2 = 0, a3 = 0] = a
  const [b1 = 0, b2 = 0, b3 = 0] = b
  return finiteVector([a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1])
}

export function normVector(a: Vector): number {
  // Math.hypot avoids intermediate overflow; the true norm itself can
  // still exceed the double range (e.g. [1.7e308, 1.7e308] → ∞), which
  // callers must treat as unrepresentable rather than as a value.
  return Math.hypot(...a)
}

/** Unit vector; the zero vector has no direction (explicit error). */
export function normalizeVector(a: Vector): LinalgOutcome<Vector> {
  const norm = normVector(a)
  if (norm === 0) {
    return { status: 'error', kind: 'domain', message: 'The zero vector has no direction to normalize.' }
  }
  if (Number.isFinite(norm)) {
    return finiteVector(a.map((x) => x / norm))
  }
  // The norm overflows a double while the unit vector does not; scaling
  // by the largest magnitude first avoids dividing by ∞ into a silent
  // zero vector ([1.7e308, 1.7e308] → [√½, √½]).
  const scale = Math.max(...a.map((x) => Math.abs(x)))
  const scaled = a.map((x) => x / scale)
  const scaledNorm = Math.hypot(...scaled)
  return finiteVector(scaled.map((x) => x / scaledNorm))
}

/** Scalar multiple; overflow (|k·xᵢ| outside the double range) is an explicit error. */
export function scaleVector(k: number, a: Vector): LinalgOutcome<Vector> {
  return finiteVector(a.map((x) => k * x))
}

function dims(m: Matrix): [number, number] {
  return [m.length, m[0]?.length ?? 0]
}

export function addMatrices(a: Matrix, b: Matrix): LinalgOutcome<Matrix> {
  const [ar, ac] = dims(a)
  const [br, bc] = dims(b)
  if (ar !== br || ac !== bc) {
    return { status: 'error', kind: 'dimension', message: `Cannot add ${ar}×${ac} to ${br}×${bc}: dimensions must match.` }
  }
  return finiteMatrix(a.map((row, i) => row.map((x, j) => x + (b[i]?.[j] ?? 0))))
}

export function subMatrices(a: Matrix, b: Matrix): LinalgOutcome<Matrix> {
  const [ar, ac] = dims(a)
  const [br, bc] = dims(b)
  if (ar !== br || ac !== bc) {
    return { status: 'error', kind: 'dimension', message: `Cannot subtract ${br}×${bc} from ${ar}×${ac}: dimensions must match.` }
  }
  return finiteMatrix(a.map((row, i) => row.map((x, j) => x - (b[i]?.[j] ?? 0))))
}

export function mulMatrices(a: Matrix, b: Matrix): LinalgOutcome<Matrix> {
  const [ar, ac] = dims(a)
  const [br, bc] = dims(b)
  if (ac !== br) {
    return { status: 'error', kind: 'dimension', message: `Cannot multiply ${ar}×${ac} by ${br}×${bc}: inner dimensions must agree.` }
  }
  const product: Matrix = a.map((row) => Array.from({ length: bc }, (_, j) => row.reduce((sum, x, k) => sum + x * (b[k]?.[j] ?? 0), 0)))
  return finiteMatrix(product)
}

export function transposeMatrix(a: Matrix): Matrix {
  const [ar, ac] = dims(a)
  return Array.from({ length: ac }, (_, j) => Array.from({ length: ar }, (_, i) => a[i]?.[j] ?? 0))
}

function isSquare(m: Matrix): boolean {
  const [r, c] = dims(m)
  return r === c
}

/**
 * Gauss-Jordan elimination with partial pivoting over [A | B].
 * Returns the transformed right block, the determinant sign/parity
 * product, or a singularity diagnosis — never an inverted guess.
 */
function eliminate(a: Matrix, b: Matrix): { x: Matrix; det: number } | { singular: string } {
  const n = a.length
  const m = b[0]?.length ?? 0
  const left: Matrix = a.map((row) => [...row])
  const right: Matrix = b.map((row) => [...row])
  const scale = Math.max(...left.flat().map((x) => Math.abs(x)), 0)
  if (scale === 0) {
    return { singular: 'Zero matrix: every entry is 0, so no inverse or unique solution exists.' }
  }
  let det = 1
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(left[row]?.[col] ?? 0) > Math.abs(left[pivot]?.[col] ?? 0)) {
        pivot = row
      }
    }
    const pivotValue = left[pivot]?.[col] ?? 0
    det *= pivotValue
    if (Math.abs(pivotValue) < SINGULAR_PIVOT_RATIO * scale) {
      return { singular: `Numerically singular: column ${col + 1} has no usable pivot (|pivot| < 1e-12 of matrix scale). The system has no unique solution.` }
    }
    if (pivot !== col) {
      const tmpL = left[col]
      const tmpR = right[col]
      left[col] = left[pivot] ?? []
      right[col] = right[pivot] ?? []
      left[pivot] = tmpL ?? []
      right[pivot] = tmpR ?? []
      det = -det
    }
    const divisor = left[col]?.[col] ?? 1
    for (let j = 0; j < n; j += 1) {
      left[col]![j] = (left[col]?.[j] ?? 0) / divisor
    }
    for (let j = 0; j < m; j += 1) {
      right[col]![j] = (right[col]?.[j] ?? 0) / divisor
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) {
        continue
      }
      const factor = left[row]?.[col] ?? 0
      if (factor !== 0) {
        for (let j = 0; j < n; j += 1) {
          left[row]![j] = (left[row]?.[j] ?? 0) - factor * (left[col]?.[j] ?? 0)
        }
        for (let j = 0; j < m; j += 1) {
          right[row]![j] = (right[row]?.[j] ?? 0) - factor * (right[col]?.[j] ?? 0)
        }
      }
    }
  }
  return { x: right, det }
}

export function determinant(a: Matrix): LinalgOutcome<number> {
  if (!isSquare(a)) {
    const [r, c] = dims(a)
    return { status: 'error', kind: 'dimension', message: `Determinant needs a square matrix (got ${r}×${c}).` }
  }
  const identity: Matrix = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)))
  const result = eliminate(a, identity)
  if ('singular' in result) {
    return { status: 'value', value: 0, warning: `Singular matrix (determinant 0): ${result.singular}` }
  }
  return finiteScalar(result.det)
}

export function inverseMatrix(a: Matrix): LinalgOutcome<Matrix> {
  if (!isSquare(a)) {
    const [r, c] = dims(a)
    return { status: 'error', kind: 'dimension', message: `Inverse needs a square matrix (got ${r}×${c}).` }
  }
  const identity: Matrix = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)))
  const result = eliminate(a, identity)
  if ('singular' in result) {
    return { status: 'error', kind: 'domain', message: result.singular }
  }
  const guarded = finiteMatrix(result.x)
  if (guarded.status === 'error') {
    return guarded
  }
  const residual = maxResidual(a, result.x, identity)
  if (residual > 1e-8) {
    return {
      status: 'value',
      value: result.x,
      warning: `Large residual (≈${formatDisplay(residual)}): ill-conditioned matrix, treat as unreliable. Multiply back (A·A⁻¹) to inspect it.`,
    }
  }
  return { status: 'value', value: result.x, warning: 'Floating-point inverse: multiply back (A·A⁻¹) to check residual error.' }
}

export function solveLinear(a: Matrix, b: Vector): LinalgOutcome<Vector> {
  if (!isSquare(a)) {
    const [r, c] = dims(a)
    return { status: 'error', kind: 'dimension', message: `Solve needs a square coefficient matrix (got ${r}×${c}).` }
  }
  if (b.length !== a.length) {
    return { status: 'error', kind: 'dimension', message: `Right-hand side has length ${b.length} but the matrix is ${a.length}×${a.length}.` }
  }
  const result = eliminate(a, b.map((x) => [x]))
  if ('singular' in result) {
    return { status: 'error', kind: 'domain', message: result.singular }
  }
  const guarded = finiteVector(result.x.map((row) => row[0] ?? 0))
  if (guarded.status === 'error') {
    return guarded
  }
  const values = guarded.value
  const residual = maxResidual(a, result.x, b.map((x) => [x]))
  if (residual > 1e-8) {
    return {
      status: 'value',
      value: values,
      warning: `Large residual (≈${formatDisplay(residual)}): ill-conditioned system, treat as unreliable. Substitute back (A·x) to inspect it.`,
    }
  }
  return { status: 'value', value: values, warning: 'Floating-point solution: substitute back (A·x) to check residual error.' }
}

/** Max |A·X − B| entry: a scale-aware reliability check for inverses/solutions. */
function maxResidual(a: Matrix, x: Matrix, b: Matrix): number {
  const n = a.length
  const m = b[0]?.length ?? 0
  let worst = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let sum = 0
      for (let k = 0; k < n; k += 1) {
        sum += (a[i]?.[k] ?? 0) * (x[k]?.[j] ?? 0)
      }
      worst = Math.max(worst, Math.abs(sum - (b[i]?.[j] ?? 0)))
    }
  }
  return worst
}

export function formatVector(v: Vector): string {
  return `[${v.map((x) => formatDisplay(x)).join(', ')}]`
}

export function formatMatrix(m: Matrix): string {
  return `[${m.map((row) => `[${row.map((x) => formatDisplay(x)).join(', ')}]`).join(', ')}]`
}
