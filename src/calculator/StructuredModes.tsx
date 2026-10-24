import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import {
  addComplex,
  argument,
  conjugate,
  cosComplex,
  divComplex,
  expComplex,
  formatComplex,
  formatPolar,
  logComplex,
  magnitude,
  mulComplex,
  parseComplex,
  powComplex,
  rootComplex,
  sinComplex,
  subComplex,
  tanComplex,
  type Complex,
} from './complex.ts'
import type { AngleMode } from './evaluate.ts'
import { formatDisplay } from './format.ts'
import {
  addMatrices,
  addVectors,
  crossVectors,
  determinant,
  dotVectors,
  formatMatrix,
  formatVector,
  inverseMatrix,
  mulMatrices,
  normalizeVector,
  normVector,
  parseMatrix,
  parseVector,
  scaleVector,
  solveLinear,
  subMatrices,
  subVectors,
  transposeMatrix,
} from './linalg.ts'
import { calculate } from './evaluate.ts'
import { addRational, divRational, formatRational, mulRational, parseRational, rationalToDecimal, subRational } from './rational.ts'
import { convert, DIMENSIONS, type Dimension } from './units.ts'
import { formatStats, parseDataList, parseNumberList, describePaired, formatPaired, movingAverage, parseSecondList } from './stats.ts'
import {
  addUncertain,
  divUncertain,
  formatUncertain,
  mulUncertain,
  parseUncertain,
  parseUncertainList,
  powUncertain,
  subUncertain,
  weightedMean,
} from './uncertainty.ts'

export type StructuredMode = 'complex' | 'vector' | 'matrix' | 'stats' | 'uncertainty' | 'units' | 'exact'

interface StructuredModesProps {
  mode: StructuredMode
  angleMode: AngleMode
  /** Append a history row (display text + method note). */
  onRecord: (title: string, display: string, method: string) => void
}

interface ModeResult {
  display: string
  method: string
}

function fail(message: string): { error: string } {
  return { error: message }
}

function needComplex(text: string, angleMode: AngleMode, what: string): Complex | { error: string } {
  const outcome = parseComplex(text, angleMode)
  if (outcome.status !== 'value') {
    return fail(`${what}: ${outcome.message}`)
  }
  return outcome.value
}

function runComplex(op: string, zText: string, wText: string, angleMode: AngleMode): ModeResult | { error: string } {
  const z = needComplex(zText, angleMode, 'Z')
  if ('error' in z) {
    return z
  }
  const needW = ['add', 'sub', 'mul', 'div'].includes(op)
  const w = needW ? needComplex(wText, angleMode, 'W') : null
  if (w !== null && 'error' in w) {
    return w
  }
  switch (op) {
    case 'value':
      return { display: formatComplex(z), method: 'Rectangular value as entered.' }
    case 'add':
      return { display: formatComplex(addComplex(z, (w as Complex))) , method: 'Rectangular addition.' }
    case 'sub':
      return { display: formatComplex(subComplex(z, (w as Complex))), method: 'Rectangular subtraction.' }
    case 'mul':
      return { display: formatComplex(mulComplex(z, (w as Complex))), method: 'Rectangular multiplication.' }
    case 'div': {
      const quotient = divComplex(z, (w as Complex))
      return quotient.status === 'value'
        ? { display: formatComplex(quotient.value), method: 'Rectangular division.' }
        : fail(quotient.message)
    }
    case 'abs':
      return { display: formatDisplay(magnitude(z)), method: 'Magnitude √(re² + im²).' }
    case 'conj':
      return { display: formatComplex(conjugate(z)), method: 'Conjugate negates the imaginary part.' }
    case 'arg': {
      const arg = argument(z)
      return arg.status === 'value'
        ? { display: formatDisplay(arg.value.re), method: 'Argument on the atan2 branch (−π, π], in radians.' }
        : fail(arg.message)
    }
    case 're':
      return { display: formatDisplay(z.re), method: 'Real part.' }
    case 'im':
      return { display: formatDisplay(z.im), method: 'Imaginary part.' }
    case 'square': {
      const squared = powComplex(z, 2)
      return squared.status === 'value' ? { display: formatComplex(squared.value), method: 'De Moivre integer power.' } : fail(squared.message)
    }
    case 'polar':
      return { display: formatPolar(z), method: 'Polar r∠θ with θ in radians on (−π, π].' }
    case 'root': {
      const n = calculate(wText.trim() === '' ? 'NaN' : wText, angleMode)
      if (n.status !== 'value' || !Number.isInteger(n.value) || n.value < 1) {
        return fail('Roots need W as a positive integer n.')
      }
      const root = rootComplex(z, n.value)
      return root.status === 'value'
        ? { display: formatComplex(root.value), method: `Principal ${n.value}-th root: r^(1/n)·e^(iθ/n).` }
        : fail(root.message)
    }
    case 'exp':
      return { display: formatComplex(expComplex(z)), method: 'Exact formula e^a·(cos b + i·sin b).' }
    case 'log': {
      const log = logComplex(z)
      return log.status === 'value'
        ? { display: formatComplex(log.value), method: 'Principal log ln|z| + i·arg(z); cut on the negative real axis.' }
        : fail(log.message)
    }
    case 'sin':
      return { display: formatComplex(sinComplex(z)), method: 'Exact formula sin a·cosh b + i·cos a·sinh b.' }
    case 'cos':
      return { display: formatComplex(cosComplex(z)), method: 'Exact formula cos a·cosh b − i·sin a·sinh b.' }
    case 'tan': {
      const tan = tanComplex(z)
      return tan.status === 'value' ? { display: formatComplex(tan.value), method: 'sin/cos; poles land on large finite values.' } : fail(tan.message)
    }
    default:
      return fail('Choose an operation first.')
  }
}

function runUncertainty(op: string, aText: string, bText: string, kText: string, listText: string, angleMode: AngleMode): ModeResult | { error: string } {
  if (op === 'wmean') {
    const list = parseUncertainList(listText, angleMode)
    if (list.status !== 'value') {
      return fail(`List: ${list.message}`)
    }
    const mean = weightedMean(list.value)
    return mean.status === 'value'
      ? { display: formatUncertain(mean.value), method: mean.method }
      : fail(mean.message)
  }
  const a = parseUncertain(aText, angleMode)
  if (a.status !== 'value') {
    return fail(`A: ${a.message}`)
  }
  if (op === 'pow') {
    const k = calculate(kText.trim() === '' ? 'NaN' : kText, angleMode)
    if (k.status !== 'value') {
      return fail('Powers need k as a finite exponent.')
    }
    const powered = powUncertain(a.value, k.value)
    return powered.status === 'value'
      ? { display: formatUncertain(powered.value), method: powered.method }
      : fail(powered.message)
  }
  const b = parseUncertain(bText, angleMode)
  if (b.status !== 'value') {
    return fail(`B: ${b.message}`)
  }
  const ops: Record<string, (x: { value: number; sigma: number }, y: { value: number; sigma: number }) => ReturnType<typeof addUncertain>> = {
    add: addUncertain,
    sub: subUncertain,
    mul: mulUncertain,
    div: divUncertain,
  }
  const run = ops[op]
  if (run === undefined) {
    return fail('Choose an operation first.')
  }
  const outcome = run(a.value, b.value)
  return outcome.status === 'value'
    ? { display: formatUncertain(outcome.value), method: outcome.method }
    : fail(outcome.message)
}

function runVector(op: string, aText: string, bText: string, kText: string, angleMode: AngleMode): ModeResult | { error: string } {
  const a = parseVector(aText, angleMode)
  if (a.status !== 'value') {
    return fail(`A: ${a.message}`)
  }
  const needB = ['add', 'sub', 'dot', 'cross'].includes(op)
  const b = needB ? parseVector(bText, angleMode) : null
  if (b !== null && b.status !== 'value') {
    return fail(`B: ${b.message}`)
  }
  switch (op) {
    case 'add': {
      const sum = addVectors(a.value, b?.value ?? [])
      return sum.status === 'value' ? { display: formatVector(sum.value), method: 'Elementwise addition.' } : fail(sum.message)
    }
    case 'sub': {
      const diff = subVectors(a.value, b?.value ?? [])
      return diff.status === 'value' ? { display: formatVector(diff.value), method: 'Elementwise subtraction.' } : fail(diff.message)
    }
    case 'dot': {
      const dot = dotVectors(a.value, b?.value ?? [])
      return dot.status === 'value' ? { display: formatDisplay(dot.value), method: 'Dot product Σaᵢbᵢ.' } : fail(dot.message)
    }
    case 'cross': {
      const cross = crossVectors(a.value, b?.value ?? [])
      return cross.status === 'value' ? { display: formatVector(cross.value), method: '3D cross product, right-hand rule.' } : fail(cross.message)
    }
    case 'normA': {
      const norm = normVector(a.value)
      return Number.isFinite(norm)
        ? { display: formatDisplay(norm), method: 'Euclidean norm.' }
        : fail('Norm overflows the double range: |A| is larger than the largest double. Scale the entries down before computing.')
    }
    case 'normalize': {
      const unit = normalizeVector(a.value)
      return unit.status === 'value' ? { display: formatVector(unit.value), method: 'Unit vector A/|A|.' } : fail(unit.message)
    }
    case 'scale': {
      const k = calculate(kText.trim() === '' ? '1' : kText, angleMode)
      if (k.status !== 'value') {
        return fail('k must be a finite number.')
      }
      const scaled = scaleVector(k.value, a.value)
      return scaled.status === 'value' ? { display: formatVector(scaled.value), method: 'Scalar multiplication.' } : fail(scaled.message)
    }
    default:
      return fail('Choose an operation first.')
  }
}

function runMatrix(op: string, aText: string, bText: string, rhsText: string, angleMode: AngleMode): ModeResult | { error: string } {
  const a = parseMatrix(aText, angleMode)
  if (a.status !== 'value') {
    return fail(`A: ${a.message}`)
  }
  const needB = ['add', 'sub', 'mul'].includes(op)
  const b = needB ? parseMatrix(bText, angleMode) : null
  if (b !== null && b.status !== 'value') {
    return fail(`B: ${b.message}`)
  }
  switch (op) {
    case 'add': {
      const sum = addMatrices(a.value, b?.value ?? [])
      return sum.status === 'value' ? { display: formatMatrix(sum.value), method: 'Elementwise addition.' } : fail(sum.message)
    }
    case 'sub': {
      const diff = subMatrices(a.value, b?.value ?? [])
      return diff.status === 'value' ? { display: formatMatrix(diff.value), method: 'Elementwise subtraction.' } : fail(diff.message)
    }
    case 'mul': {
      const product = mulMatrices(a.value, b?.value ?? [])
      return product.status === 'value' ? { display: formatMatrix(product.value), method: 'Matrix multiplication (row × column).' } : fail(product.message)
    }
    case 'transpose':
      return { display: formatMatrix(transposeMatrix(a.value)), method: 'Transpose swaps rows and columns.' }
    case 'det': {
      const det = determinant(a.value)
      if (det.status !== 'value') {
        return fail(det.message)
      }
      return { display: formatDisplay(det.value), method: det.warning ?? 'Determinant by Gauss-Jordan elimination with partial pivoting.' }
    }
    case 'inverse': {
      const inverse = inverseMatrix(a.value)
      if (inverse.status !== 'value') {
        return fail(inverse.message)
      }
      return { display: formatMatrix(inverse.value), method: `Inverse by Gauss-Jordan elimination with partial pivoting. ${inverse.warning ?? ''}` }
    }
    case 'solve': {
      const rhs = parseVector(rhsText, angleMode)
      if (rhs.status !== 'value') {
        return fail(`b: ${rhs.message}`)
      }
      const solved = solveLinear(a.value, rhs.value)
      if (solved.status !== 'value') {
        return fail(solved.message)
      }
      return { display: formatVector(solved.value), method: `Solved by Gauss-Jordan elimination with partial pivoting. ${solved.warning ?? ''}` }
    }
    default:
      return fail('Choose an operation first.')
  }
}

function runUnits(valueText: string, from: string, to: string, angleMode: AngleMode): ModeResult | { error: string } {
  const parsed = calculate(valueText.trim() === '' ? 'NaN' : valueText, angleMode)
  if (parsed.status !== 'value') {
    return fail('Enter a finite number to convert.')
  }
  const outcome = convert(parsed.value, from, to)
  if (outcome.status !== 'value') {
    return fail(outcome.message)
  }
  const exactNote = outcome.exact ? 'Both units are exact definitions (up to double rounding).' : 'At least one side is an approximation — see the unit note.'
  return {
    display: `${formatDisplay(parsed.value)} ${from} = ${formatDisplay(outcome.value)} ${to}`,
    method: `${DIMENSIONS[outcome.dimension].label} via base ${DIMENSIONS[outcome.dimension].base}. ${outcome.note ?? ''} ${exactNote}`,
  }
}

function runRational(op: string, pText: string, qText: string): ModeResult | { error: string } {
  const p = parseRational(pText)
  if (p.status !== 'value') {
    return fail(`P: ${p.message}`)
  }
  const q = parseRational(qText)
  if (q.status !== 'value') {
    return fail(`Q: ${q.message}`)
  }
  if (op === 'add' || op === 'sub' || op === 'mul') {
    const value = op === 'add' ? addRational(p.value, q.value) : op === 'sub' ? subRational(p.value, q.value) : mulRational(p.value, q.value)
    return { display: `${formatRational(value)} (= ${formatDisplay(rationalToDecimal(value))})`, method: 'Exact BigInt fraction arithmetic, reduced.' }
  }
  if (op === 'div') {
    const quotient = divRational(p.value, q.value)
    if (quotient.status !== 'value') {
      return fail(quotient.message)
    }
    return { display: `${formatRational(quotient.value)} (= ${formatDisplay(rationalToDecimal(quotient.value))})`, method: 'Exact BigInt fraction arithmetic, reduced.' }
  }
  return fail('Choose an operation first.')
}

function field(label: string, name: string, value: string, placeholder: string, onChange: (text: string) => void): React.JSX.Element {
  return (
    <label className="block text-xs text-muted">
      <span className="font-semibold uppercase tracking-wide">{label}</span>
      <input
        type="text"
        aria-label={label}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        name={name}
        className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}

/**
 * Structured entry panes: complex, vector, matrix, and statistics.
 * Free text is only accepted where the grammar is strict (`a+bi`,
 * brackets); everything else is an operation choice, never a guess.
 * Results record into the shared history with their method attached.
 */
export function StructuredModes({ mode, angleMode, onRecord }: StructuredModesProps): React.JSX.Element {
  const [zText, setZText] = useState('')
  const [wText, setWText] = useState('')
  const [complexOp, setComplexOp] = useState('value')
  const [aText, setAText] = useState('')
  const [bText, setBText] = useState('')
  const [kText, setKText] = useState('2')
  const [vectorOp, setVectorOp] = useState('add')
  const [matrixOp, setMatrixOp] = useState('mul')
  const [rhsText, setRhsText] = useState('')
  const [listText, setListText] = useState('')
  const [statsOp, setStatsOp] = useState('describe')
  const [yListText, setYListText] = useState('')
  const [windowText, setWindowText] = useState('3')
  const [alignOp, setAlignOp] = useState<'trailing' | 'centered'>('trailing')
  const [dimension, setDimension] = useState<Dimension>('length')
  const [fromUnit, setFromUnit] = useState('m')
  const [toUnit, setToUnit] = useState('ft')
  const [unitValue, setUnitValue] = useState('1')
  const [pText, setPText] = useState('')
  const [qText, setQText] = useState('')
  const [rationalOp, setRationalOp] = useState('add')
  const [uncertaintyOp, setUncertaintyOp] = useState('add')
  const [result, setResult] = useState<ModeResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  function compute(title: string, run: () => ModeResult | { error: string }): void {
    const outcome = run()
    if ('error' in outcome) {
      setResult(null)
      setProblem(outcome.error)
      return
    }
    setResult(outcome)
    setProblem(null)
    onRecord(title, outcome.display, outcome.method)
  }

  function opSelect(label: string, value: string, options: Array<{ value: string; label: string }>, onChange: (text: string) => void): React.JSX.Element {
    return (
      <label className="block text-xs text-muted">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
      {mode === 'complex' && (
        <div className="flex flex-col gap-2">
          {field('Z — complex number a+bi', 'complex-z', zText, 'e.g. 3+4i', setZText)}
          {field('W — second operand (binary ops only)', 'complex-w', wText, 'e.g. 1-i', setWText)}
          {opSelect('Operation', complexOp, [
            { value: 'value', label: 'Value of Z' },
            { value: 'add', label: 'Z + W' },
            { value: 'sub', label: 'Z − W' },
            { value: 'mul', label: 'Z × W' },
            { value: 'div', label: 'Z ÷ W' },
            { value: 'abs', label: '|Z| magnitude' },
            { value: 'conj', label: 'conjugate' },
            { value: 'arg', label: 'arg(Z), radians (−π, π]' },
            { value: 're', label: 'Real part' },
            { value: 'im', label: 'Imaginary part' },
            { value: 'square', label: 'Z²' },
            { value: 'polar', label: 'Polar form r∠θ' },
            { value: 'root', label: 'Principal nth root (n = W)' },
            { value: 'exp', label: 'exp(Z)' },
            { value: 'log', label: 'log(Z), principal' },
            { value: 'sin', label: 'sin(Z)' },
            { value: 'cos', label: 'cos(Z)' },
            { value: 'tan', label: 'tan(Z)' },
          ], setComplexOp)}
          <Button onClick={() => compute(`complex ${complexOp} (${zText})`, () => runComplex(complexOp, zText, wText, angleMode))} title="Run the complex operation" className="mt-1">
            Compute
          </Button>
        </div>
      )}
      {mode === 'vector' && (
        <div className="flex flex-col gap-2">
          {field('A — vector [1, 2, 3]', 'vector-a', aText, 'e.g. [1, 2, 3]', setAText)}
          {field('B — second vector (binary ops only)', 'vector-b', bText, 'e.g. [4, 5, 6]', setBText)}
          {field('k — scalar (for k·A)', 'vector-k', kText, 'e.g. 2', setKText)}
          {opSelect('Operation', vectorOp, [
            { value: 'add', label: 'A + B' },
            { value: 'sub', label: 'A − B' },
            { value: 'dot', label: 'A · B (dot)' },
            { value: 'cross', label: 'A × B (3D cross)' },
            { value: 'normA', label: '|A| (norm)' },
            { value: 'normalize', label: 'Normalize A (unit vector)' },
            { value: 'scale', label: 'k · A' },
          ], setVectorOp)}
          <Button onClick={() => compute(`vector ${vectorOp}`, () => runVector(vectorOp, aText, bText, kText, angleMode))} title="Run the vector operation" className="mt-1">
            Compute
          </Button>
        </div>
      )}
      {mode === 'matrix' && (
        <div className="flex flex-col gap-2">
          {field('A — matrix [[1, 2], [3, 4]]', 'matrix-a', aText, 'e.g. [[1, 2], [3, 4]]', setAText)}
          {field('B — second matrix (binary ops only)', 'matrix-b', bText, 'e.g. [[5, 6], [7, 8]]', setBText)}
          {field('b — right-hand side for solve (vector)', 'matrix-rhs', rhsText, 'e.g. [5, 6]', setRhsText)}
          {opSelect('Operation', matrixOp, [
            { value: 'mul', label: 'A × B' },
            { value: 'add', label: 'A + B' },
            { value: 'sub', label: 'A − B' },
            { value: 'transpose', label: 'Aᵀ transpose' },
            { value: 'det', label: 'det(A)' },
            { value: 'inverse', label: 'A⁻¹ inverse' },
            { value: 'solve', label: 'Solve A·x = b' },
          ], setMatrixOp)}
          <Button onClick={() => compute(`matrix ${matrixOp}`, () => runMatrix(matrixOp, aText, bText, rhsText, angleMode))} title="Run the matrix operation" className="mt-1">
            Compute
          </Button>
        </div>
      )}
      {mode === 'stats' && (
        <div className="flex flex-col gap-2">
          {field('Data — list [2, 4, 4, 5]', 'stats-list', listText, 'e.g. [2, 4, 4, 4, 5, 5, 7, 9]', setListText)}
          {opSelect('Analysis', statsOp, [
            { value: 'describe', label: 'Descriptive summary' },
            { value: 'paired', label: 'Paired covariance + correlation' },
            { value: 'moving', label: 'Moving average' },
          ], setStatsOp)}
          {statsOp === 'paired' && field('Y — second list (paired by position)', 'stats-ylist', yListText, 'e.g. [1, 3, 2, 5]', setYListText)}
          {statsOp === 'moving' && field('Window k (≥ 2, full windows only)', 'stats-window', windowText, 'e.g. 3', setWindowText)}
          {statsOp === 'moving' && opSelect('Alignment', alignOp, [
            { value: 'trailing', label: 'Trailing (causal, ends at i)' },
            { value: 'centered', label: 'Centered (odd k only)' },
          ], (text) => setAlignOp(text as 'trailing' | 'centered'))}
          <Button
            onClick={() =>
              compute('descriptive statistics', () => {
                if (statsOp === 'paired' || statsOp === 'moving') {
                  const parsed = parseNumberList(listText, angleMode)
                  if (parsed.status !== 'value') {
                    return fail(parsed.message)
                  }
                  if (statsOp === 'paired') {
                    const other = parseSecondList(yListText, angleMode)
                    if (other.status !== 'value') {
                      return fail(other.message)
                    }
                    if (other.value.length !== parsed.value.length) {
                      return fail(`Paired lists need equal lengths (X has ${parsed.value.length}, Y has ${other.value.length}); rows match by position, never by value.`)
                    }
                    if (parsed.value.length === 0) {
                      return fail('Paired analysis needs at least one row.')
                    }
                    const summary = describePaired(parsed.value, other.value)
                    return { display: formatPaired(summary), method: `${summary.notes.join(' ')} Correlation never implies causation.` }
                  }
                  const k = Number(windowText.trim())
                  if (!Number.isInteger(k)) {
                    return fail('Window k must be an integer ≥ 2.')
                  }
                  const averaged = movingAverage(parsed.value, k, alignOp)
                  if (averaged.status !== 'value') {
                    return fail(averaged.message)
                  }
                  return {
                    display: `k = ${k} ${alignOp} average of ${parsed.value.length} values → ${averaged.value.length} points:\n[${averaged.value.map((v) => formatDisplay(v)).join(', ')}]`,
                    method: 'Trailing windows end at each point (no look-ahead); centered needs odd k; full windows only, never padded.',
                  }
                }
                const parsed = parseDataList(listText, angleMode)
                if (parsed.status !== 'value') {
                  return fail(parsed.message)
                }
                return { display: formatStats(parsed.value), method: parsed.value.notes.join(' ') }
              })
            }
            title="Summarise the dataset"
            className="mt-1"
          >
            Compute
          </Button>
        </div>
      )}
      {mode === 'uncertainty' && (
        <div className="flex flex-col gap-2">
          {field('A — measurement value ± sigma', 'uncertainty-a', aText, 'e.g. 10 ± 0.2', setAText)}
          {field('B — second measurement (binary ops only)', 'uncertainty-b', bText, 'e.g. 5 ± 0.1', setBText)}
          {field('k — exponent (for A^k)', 'uncertainty-k', kText, 'e.g. 2', setKText)}
          {field('List — weighted mean [(10, 0.2), …]', 'uncertainty-list', listText, 'e.g. [(10, 0.2), (12, 0.3)]', setListText)}
          {opSelect('Operation', uncertaintyOp, [
            { value: 'add', label: 'A + B' },
            { value: 'sub', label: 'A − B' },
            { value: 'mul', label: 'A × B' },
            { value: 'div', label: 'A ÷ B' },
            { value: 'pow', label: 'A^k power' },
            { value: 'wmean', label: 'Weighted mean of list' },
          ], setUncertaintyOp)}
          <Button
            onClick={() =>
              compute('uncertainty propagation', () => runUncertainty(uncertaintyOp, aText, bText, kText, listText, angleMode))
            }
            title="Propagate the uncertainties"
            className="mt-1"
          >
            Compute
          </Button>
        </div>
      )}
      {mode === 'units' && (
        <div className="flex flex-col gap-2">
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Dimension</span>
            <select
              aria-label="Dimension"
              value={dimension}
              onChange={(event) => {
                const next = event.target.value as Dimension
                setDimension(next)
                const units = DIMENSIONS[next].units
                setFromUnit(units[0]?.symbol ?? '')
                setToUnit(units[1]?.symbol ?? units[0]?.symbol ?? '')
              }}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(DIMENSIONS) as Dimension[]).map((key) => (
                <option key={key} value={key}>
                  {DIMENSIONS[key].label}
                </option>
              ))}
            </select>
          </label>
          {field('Value to convert', 'units-value', unitValue, 'e.g. 100', setUnitValue)}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">From</span>
              <select
                aria-label="From unit"
                value={fromUnit}
                onChange={(event) => setFromUnit(event.target.value)}
                className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DIMENSIONS[dimension].units.map((unit) => (
                  <option key={unit.symbol} value={unit.symbol}>
                    {unit.symbol} — {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">To</span>
              <select
                aria-label="To unit"
                value={toUnit}
                onChange={(event) => setToUnit(event.target.value)}
                className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {DIMENSIONS[dimension].units.map((unit) => (
                  <option key={unit.symbol} value={unit.symbol}>
                    {unit.symbol} — {unit.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button onClick={() => compute(`convert ${unitValue} ${fromUnit} to ${toUnit}`, () => runUnits(unitValue, fromUnit, toUnit, angleMode))} title="Convert between the selected units" className="mt-1">
            Compute
          </Button>
        </div>
      )}
      {mode === 'exact' && (
        <div className="flex flex-col gap-2">
          {field('P — rational like 1/3, -5, 0.25, 1e-3', 'rational-p', pText, 'e.g. 1/3', setPText)}
          {field('Q — second rational (binary ops only)', 'rational-q', qText, 'e.g. 1/6', setQText)}
          {opSelect('Operation', rationalOp, [
            { value: 'add', label: 'P + Q (exact)' },
            { value: 'sub', label: 'P − Q (exact)' },
            { value: 'mul', label: 'P × Q (exact)' },
            { value: 'div', label: 'P ÷ Q (exact)' },
          ], setRationalOp)}
          <Button onClick={() => compute(`exact ${rationalOp} (${pText}, ${qText})`, () => runRational(rationalOp, pText, qText))} title="Run exact rational arithmetic" className="mt-1">
            Compute
          </Button>
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3 min-h-8 rounded-md bg-bg px-3 py-2">
        {result === null && problem === null && <span className="font-mono text-sm text-muted">The result appears here with its method.</span>}
        {result !== null && (
          <div>
            <p className="whitespace-pre-line font-mono text-sm text-ink">{result.display}</p>
            <p className="mt-1 text-xs text-muted">{result.method}</p>
          </div>
        )}
        {problem !== null && <span className="text-sm text-warning">{problem}</span>}
      </div>
      <p className="mt-2 text-xs text-muted">Structured results stay in the calculator: only real scalar values can be sent to the graph.</p>
    </div>
  )
}
