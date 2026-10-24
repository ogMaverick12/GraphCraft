import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { calculate, HISTORY_LIMITS, type AngleMode, type CalcHistoryEntry, type CalcOutcome, type CalcRecord } from './evaluate.ts'
import { approximateFraction, formatDisplay, formatExact } from './format.ts'
import { StructuredModes, type StructuredMode } from './StructuredModes.tsx'

export type CalcMode = 'scalar' | StructuredMode
export type DisplayDigits = 6 | 8 | 10 | 12
export type FractionMode = 'decimal' | 'fraction'

const STORAGE_KEY = 'graphcraft-calculator'

interface PersistedCalc {
  mode: AngleMode
  limit: number
  digits: DisplayDigits
  fracMode: FractionMode
  memory: number | null
  history: CalcRecord[]
}

function isRecord(value: unknown): value is CalcRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as { kind?: unknown; entry?: unknown; title?: unknown; display?: unknown; method?: unknown }
  if (record.kind === 'scalar') {
    return typeof (record.entry as CalcHistoryEntry | undefined)?.entered === 'string'
  }
  return record.kind === 'structured' && typeof record.title === 'string' && typeof record.display === 'string' && typeof record.method === 'string'
}

function loadPersisted(): PersistedCalc {
  const fallback: PersistedCalc = { mode: 'radians', limit: 20, digits: 12, fracMode: 'decimal', memory: null, history: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<PersistedCalc>
    const mode: AngleMode = parsed.mode === 'degrees' ? 'degrees' : 'radians'
    const limit = typeof parsed.limit === 'number' && (HISTORY_LIMITS as readonly number[]).includes(parsed.limit) ? parsed.limit : 20
    const digits: DisplayDigits = parsed.digits === 6 || parsed.digits === 8 || parsed.digits === 10 || parsed.digits === 12 ? parsed.digits : 12
    const fracMode: FractionMode = parsed.fracMode === 'fraction' ? 'fraction' : 'decimal'
    const history = Array.isArray(parsed.history) ? parsed.history.filter(isRecord).slice(0, 50) : []
    const memory = typeof parsed.memory === 'number' && Number.isFinite(parsed.memory) ? parsed.memory : null
    return { mode, limit, digits, fracMode, memory, history }
  } catch {
    return fallback
  }
}

function persist(state: PersistedCalc): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // History is a convenience; a full/blocked store never blocks calculating.
  }
}

let nextId = 1

interface CalculatorProps {
  /** Explicit hand-off: add `source` as a graph row and show the graph. */
  onSendToGraph: (source: string) => void
}

function outcomeMessage(outcome: CalcOutcome): string | null {
  return outcome.status === 'value' ? null : outcome.message
}

/**
 * One scalar result in the current display settings. Fraction mode
 * shows the nearest simple fraction labelled ≈ with the decimal
 * beside it; integers and extreme magnitudes fall back to decimal.
 * Display only — the stored value is untouched.
 */
function ScalarValue({ value, digits, fraction }: { value: number; digits: DisplayDigits; fraction: boolean }): React.JSX.Element {
  if (fraction) {
    const approx = approximateFraction(value)
    if (approx !== null) {
      return (
        <span>
          ≈ {approx.p}/{approx.q} <span className="text-xs text-muted">(= {formatDisplay(value, digits)})</span>
        </span>
      )
    }
  }
  return <span>= {formatDisplay(value, digits)}</span>
}

/**
 * Scientific calculator workspace (Stage 3 CALC-01). State lives here,
 * independent from Graph Studio; the only bridge out is the explicit
 * send-to-graph action. Display formatting never feeds back into values.
 */
export function Calculator({ onSendToGraph }: CalculatorProps): React.JSX.Element {
  const [persisted] = useState(loadPersisted)
  const [calcMode, setCalcMode] = useState<CalcMode>('scalar')
  const [expression, setExpression] = useState('')
  const [mode, setMode] = useState<AngleMode>(persisted.mode)
  const [limit, setLimit] = useState(persisted.limit)
  const [digits, setDigits] = useState<DisplayDigits>(persisted.digits)
  const [fracMode, setFracMode] = useState<FractionMode>(persisted.fracMode)
  const [memory, setMemory] = useState<number | null>(persisted.memory)
  const [history, setHistory] = useState<CalcRecord[]>(persisted.history)
  const [current, setCurrent] = useState<CalcOutcome | null>(null)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  let lastNumeric: number | null = null
  for (const record of history) {
    if (record.kind === 'scalar' && record.entry.outcome.status === 'value') {
      lastNumeric = record.entry.outcome.value
      break
    }
  }

  function save(next: Partial<PersistedCalc> & { history: CalcRecord[] }): void {
    persist({ mode: next.mode ?? mode, limit: next.limit ?? limit, digits: next.digits ?? digits, fracMode: next.fracMode ?? fracMode, memory: next.memory ?? memory, history: next.history })
  }

  function setMemoryAndSave(next: number | null): void {
    setMemory(next)
    persist({ mode, limit, digits, fracMode, memory: next, history })
  }

  function setDigitsAndSave(next: DisplayDigits): void {
    setDigits(next)
    persist({ mode, limit, digits: next, fracMode, memory, history })
  }

  function setFracModeAndSave(next: FractionMode): void {
    setFracMode(next)
    persist({ mode, limit, digits, fracMode: next, memory, history })
  }

  function setModeAndSave(next: AngleMode): void {
    setMode(next)
    persist({ mode: next, limit, digits, fracMode, memory, history })
  }

  function setLimitAndSave(next: number): void {
    setLimit(next)
    const trimmed = history.slice(0, next)
    setHistory(trimmed)
    persist({ mode, limit: next, digits, fracMode, memory, history: trimmed })
  }

  function evaluateNow(text: string): void {
    const source = text.trim()
    if (source === '') {
      return
    }
    const outcome = calculate(source, mode)
    setCurrent(outcome)
    setCopied(false)
    const entry: CalcHistoryEntry = {
      id: nextId++,
      entered: source,
      interpreted: outcome.interpreted,
      adjusted: outcome.adjusted,
      mode,
      outcome,
    }
    const next = [{ kind: 'scalar', entry } as CalcRecord, ...history].slice(0, limit)
    setHistory(next)
    save({ history: next })
  }

  function recordStructured(title: string, display: string, method: string): void {
    const record: CalcRecord = { kind: 'structured', id: nextId++, title, display, method }
    const next = [record, ...history].slice(0, limit)
    setHistory(next)
    save({ history: next })
  }

  function insert(text: string): void {
    setExpression((prev) => prev + text)
  }

  function toggleSign(): void {
    setExpression((prev) => (prev.startsWith('-') ? prev.slice(1) : `-${prev}`))
  }

  function wrapReciprocal(): void {
    setExpression((prev) => (prev.trim() === '' ? prev : `1/(${prev})`))
  }

  async function copyText(text: string): Promise<void> {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = text
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      } catch {
        setNotice('Copy is unavailable in this browser; select the result text manually.')
        return
      }
    }
    setCopied(true)
  }

  function sendEntry(entry: CalcHistoryEntry): void {
    if (entry.outcome.status === 'value') {
      onSendToGraph(formatExact(entry.outcome.value))
    } else if (entry.outcome.status === 'variable') {
      onSendToGraph(entry.entered)
    }
  }

  const currentValue = current !== null && current.status === 'value' ? current.value : null

  function memoryKey(label: string, title: string, disabled: boolean, onPress: () => void): React.JSX.Element {
    return (
      <button
        key={label}
        type="button"
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={onPress}
        className="gc-transition rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    )
  }

  function sendLabel(entry: CalcHistoryEntry): string | null {
    if (entry.outcome.status === 'value') {
      return 'Send result to graph'
    }
    if (entry.outcome.status === 'variable') {
      return 'Plot expression in graph'
    }
    return null
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      evaluateNow(expression)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setExpression('')
      setCurrent(null)
    }
  }

  function key(label: string, title: string, onPress: () => void, extra?: string): React.JSX.Element {    return (
      <button
        key={label}
        type="button"
        aria-label={title}
        title={title}
        onClick={onPress}
        className={`gc-transition rounded-md border border-line bg-surface px-2 py-2 font-mono text-sm text-ink shadow-panel hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${extra ?? ''}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="mb-3 text-sm font-semibold text-ink">Calculator</h2>
        <div role="group" aria-label="Calculator mode" className="mb-3 flex flex-wrap gap-1">
          {(['scalar', 'complex', 'vector', 'matrix', 'stats', 'uncertainty', 'units', 'exact'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={calcMode === option}
              aria-label={`${option} mode`}
              title={
                option === 'scalar'
                  ? 'Real-number calculator'
                  : option === 'stats'
                    ? 'Descriptive statistics over a value list'
                    : option === 'uncertainty'
                      ? 'Uncertainty propagation for value ± sigma measurements'
                    : option === 'units'
                      ? 'Unit conversion across twelve dimensions'
                      : option === 'exact'
                        ? 'Exact rational arithmetic'
                        : `Structured ${option} calculations`
              }
              onClick={() => setCalcMode(option)}
              className={`gc-transition rounded-md border px-2.5 py-1 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                calcMode === option ? 'border-accent bg-accent text-white dark:text-white' : 'border-line bg-bg text-ink-soft hover:text-ink'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span id="calc-angle-label" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Angle
          </span>
          <div role="group" aria-labelledby="calc-angle-label" className="flex gap-1">
            {(['radians', 'degrees'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                aria-label={`${option} mode`}
                title={option === 'degrees' ? 'Trig functions take degrees; hyperbolics stay in radians' : 'Trig functions take radians (same as the graph engine)'}
                onClick={() => setModeAndSave(option)}
                className={`gc-transition rounded-md border px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  mode === option ? 'border-accent bg-accent text-white dark:text-white' : 'border-line bg-bg text-ink-soft hover:text-ink'
                }`}
              >
                {option === 'radians' ? 'Rad' : 'Deg'}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">{mode === 'degrees' ? 'Trig in degrees; graph engine stays in radians (rewritten on send).' : 'Trig in radians, matching the graph engine.'}</span>
        </div>

        {calcMode === 'scalar' ? (
          <>
        <div className="flex flex-wrap items-center gap-2">
          <span id="calc-display-label" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Display
          </span>
          <div role="group" aria-labelledby="calc-display-label" className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={fracMode === 'decimal'}
              aria-label="Decimal display"
              title="Show decimal results"
              onClick={() => setFracModeAndSave('decimal')}
              className={`gc-transition rounded-md border px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fracMode === 'decimal' ? 'border-accent bg-accent text-white dark:text-white' : 'border-line bg-bg text-ink-soft hover:text-ink'
              }`}
            >
              0.3
            </button>
            <button
              type="button"
              aria-pressed={fracMode === 'fraction'}
              aria-label="Fraction display"
              title="Show nearest simple fraction labelled ≈ beside the decimal; exact-lane fractions stay bare"
              onClick={() => setFracModeAndSave('fraction')}
              className={`gc-transition rounded-md border px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                fracMode === 'fraction' ? 'border-accent bg-accent text-white dark:text-white' : 'border-line bg-bg text-ink-soft hover:text-ink'
              }`}
            >
              ≈ 1/3
            </button>
            <label className="ml-1 flex items-center gap-1 text-xs text-muted">
              Digits
              <select
                aria-label="Significant digits"
                value={digits}
                onChange={(event) => setDigitsAndSave(Number(event.target.value) as DisplayDigits)}
                className="rounded-md border border-line bg-bg px-1.5 py-1 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {([6, 8, 10, 12] as const).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="calc-expression">
          Expression
        </label>
        {memory !== null && (
          <p className="mt-1 font-mono text-xs text-muted" data-testid="calc-memory">
            M: {formatDisplay(memory, digits)}
          </p>
        )}
        <input
          id="calc-expression"
          type="text"
          value={expression}
          spellCheck={false}
          autoComplete="off"
          placeholder="e.g. sin(30)^2 + 50%"
          onChange={(event) => setExpression(event.target.value)}
          onKeyDown={onKeyDown}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div role="status" aria-live="polite" className="mt-2 min-h-8 rounded-md bg-bg px-3 py-2">
          {current === null && <span className="font-mono text-sm text-muted">Result appears here. Enter evaluates, Escape clears.</span>}
          {current?.status === 'value' && (
            <span className="font-mono text-lg text-ink" data-testid="calc-result">
              <ScalarValue value={current.value} digits={digits} fraction={fracMode === 'fraction'} />
            </span>
          )}
          {current !== null && current.status !== 'value' && <span className="text-sm text-warning">{current.message}</span>}
        </div>
        {current !== null && current.adjusted && (
          <p className="mt-1 font-mono text-xs text-muted">
            computed as <span data-testid="calc-interpreted">{current.interpreted}</span>
          </p>
        )}
        {current?.status === 'value' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void copyText(formatDisplay(current.value, digits))
              }}
              title="Copy the decimal result (pastes back into the calculator)"
              className="px-2 py-1 text-xs"
            >
              {copied ? 'Copied' : 'Copy result'}
            </Button>
            <Button onClick={() => onSendToGraph(formatExact(current.value))} title="Add this value as a constant row in Graph Studio" className="px-2 py-1 text-xs">
              Send result to graph
            </Button>
          </div>
        )}
        {current?.status === 'variable' && (
          <div className="mt-2">
            <Button onClick={() => onSendToGraph(expression.trim())} title="Add this expression as a function row in Graph Studio" className="px-2 py-1 text-xs">
              Plot expression in graph
            </Button>
          </div>
        )}
          </>
        ) : (
          <StructuredModes mode={calcMode} angleMode={mode} onRecord={recordStructured} />
        )}
      </div>

      {calcMode === 'scalar' && (
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Keypad</h3>
        <div className="mb-1.5 grid grid-cols-4 gap-1.5" role="group" aria-label="Memory">
          {memoryKey('MC', 'Memory clear: forget the stored value', memory === null, () => setMemoryAndSave(null))}
          {memoryKey('MR', 'Memory recall: insert the stored value', memory === null, () => {
            if (memory !== null) {
              insert(formatExact(memory))
            }
          })}
          {memoryKey('M+', 'Memory add: add the current result to memory', currentValue === null, () => {
            if (currentValue !== null) {
              setMemoryAndSave((memory ?? 0) + currentValue)
            }
          })}
          {memoryKey('M−', 'Memory subtract: subtract the current result from memory', currentValue === null, () => {
            if (currentValue !== null) {
              setMemoryAndSave((memory ?? 0) - currentValue)
            }
          })}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1.5" role="group" aria-label="Calculator keypad">
          {key('7', 'Seven', () => insert('7'))}
          {key('8', 'Eight', () => insert('8'))}
          {key('9', 'Nine', () => insert('9'))}
          {key('÷', 'Divide', () => insert('/'))}
          {key('C', 'Clear expression', () => {
            setExpression('')
            setCurrent(null)
          })}
          {key('4', 'Four', () => insert('4'))}
          {key('5', 'Five', () => insert('5'))}
          {key('6', 'Six', () => insert('6'))}
          {key('×', 'Multiply', () => insert('*'))}
          {key('⌫', 'Backspace', () => setExpression((prev) => prev.slice(0, -1)))}
          {key('1', 'One', () => insert('1'))}
          {key('2', 'Two', () => insert('2'))}
          {key('3', 'Three', () => insert('3'))}
          {key('−', 'Subtract', () => insert('-'))}
          {key('^', 'Power', () => insert('^'))}
          {key('0', 'Zero', () => insert('0'))}
          {key('.', 'Decimal point', () => insert('.'))}
          {key('%', 'Percent: divides the preceding number or group by 100', () => insert('%'))}
          {key('+', 'Add', () => insert('+'))}
          {key('!', 'Factorial of a non-negative integer', () => insert('!'))}
          {key('(', 'Open parenthesis', () => insert('('))}
          {key(')', 'Close parenthesis', () => insert(')'))}
          {key('√', 'Square root', () => insert('sqrt('))}
          {key('1/x', 'Reciprocal of the current expression', wrapReciprocal)}
          {key('±', 'Toggle sign of the current expression', toggleSign)}
          {key('sin', 'Sine', () => insert('sin('))}
          {key('cos', 'Cosine', () => insert('cos('))}
          {key('tan', 'Tangent', () => insert('tan('))}
          {key('asin', 'Inverse sine', () => insert('asin('))}
          {key('acos', 'Inverse cosine', () => insert('acos('))}
          {key('sinh', 'Hyperbolic sine (radians only)', () => insert('sinh('))}
          {key('cosh', 'Hyperbolic cosine (radians only)', () => insert('cosh('))}
          {key('tanh', 'Hyperbolic tangent (radians only)', () => insert('tanh('))}
          {key('atan', 'Inverse tangent', () => insert('atan('))}
          {key('log', 'Base-10 logarithm', () => insert('log('))}
          {key('ln', 'Natural logarithm', () => insert('ln('))}
          {key('exp', 'Exponential e to the x', () => insert('exp('))}
          {key('abs', 'Absolute value', () => insert('abs('))}
          {key('round', 'Round half away from zero', () => insert('round('))}
          {key('mod', 'Floored remainder', () => insert('mod('))}
          {key('nPr', 'Permutations', () => insert('permutations('))}
          {key('nCr', 'Combinations', () => insert('combinations('))}
          {key('π', 'Pi', () => insert('pi'))}
          {key('e', "Euler's number", () => insert('e'))}
          <button
            type="button"
            aria-label="Ans: insert last numeric result"
            title={lastNumeric === null ? 'No previous result yet' : `Insert ${formatDisplay(lastNumeric)}`}
            disabled={lastNumeric === null}
            onClick={() => {
              if (lastNumeric !== null) {
                insert(formatExact(lastNumeric))
              }
            }}
            className="gc-transition rounded-md border border-line bg-surface px-2 py-2 font-mono text-sm text-ink shadow-panel hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ans
          </button>
          <button
            type="button"
            aria-label="Equals: evaluate the expression"
            title="Evaluate (Enter)"
            onClick={() => evaluateNow(expression)}
            className="gc-transition col-span-2 rounded-md border border-accent bg-accent px-2 py-2 font-mono text-sm font-semibold text-white hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-white"
          >
            =
          </button>
        </div>
      </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">History</h3>
          <label className="ml-auto flex items-center gap-1 text-xs text-muted">
            Keep
            <select
              aria-label="History limit"
              value={limit}
              onChange={(event) => setLimitAndSave(Number(event.target.value))}
              className="rounded-md border border-line bg-bg px-1.5 py-0.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {HISTORY_LIMITS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setHistory([])
              save({ history: [] })
              setNotice(null)
            }}
            title="Clear all history"
            className="px-2 py-0.5 text-xs"
          >
            Clear
          </Button>
        </div>
        {notice !== null && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {notice}
          </p>
        )}
        {history.length === 0 && <p className="mt-2 text-sm text-muted">No calculations yet. Results keep full internal precision; display is formatted.</p>}
        <ul className="mt-2 flex flex-col gap-1.5">
          {history.map((record) =>
            record.kind === 'structured' ? (
              <li key={record.id} className="rounded-md border border-line px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={record.title}>
                    {record.title}
                  </span>
                  <Button
                    onClick={() => {
                      void copyText(record.display)
                    }}
                    title="Copy this result"
                    className="shrink-0 px-2 py-0.5 text-xs"
                    variant="ghost"
                  >
                    Copy
                  </Button>
                </div>
                <p className="mt-0.5 whitespace-pre-line font-mono text-xs text-ink">{record.display}</p>
                <p className="mt-0.5 text-xs text-muted">{record.method} Only real scalar values can be sent to the graph.</p>
              </li>
            ) : (
              <li key={record.entry.id} className="rounded-md border border-line px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Load ${record.entry.entered} for editing (${record.entry.mode === 'degrees' ? 'deg' : 'rad'})`}
                    title="Load this expression for editing"
                    onClick={() => {
                      setExpression(record.entry.entered)
                      setCurrent(record.entry.outcome.status === 'value' || record.entry.outcome.status === 'variable' ? record.entry.outcome : null)
                    }}
                    className="min-w-0 flex-1 truncate text-left font-mono text-sm text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {record.entry.entered}
                    <span className="ml-2 text-xs text-muted">({record.entry.mode === 'degrees' ? 'deg' : 'rad'})</span>
                  </button>
                  {sendLabel(record.entry) !== null && (
                    <Button onClick={() => sendEntry(record.entry)} title={sendLabel(record.entry) ?? ''} className="shrink-0 px-2 py-0.5 text-xs" variant="ghost">
                      {record.entry.outcome.status === 'value' ? 'Send' : 'Plot'}
                    </Button>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {record.entry.outcome.status === 'value' ? (
                    <span className="text-ink">
                      <ScalarValue value={record.entry.outcome.value} digits={digits} fraction={fracMode === 'fraction'} />
                    </span>
                  ) : (
                    <span className="text-warning">{outcomeMessage(record.entry.outcome)}</span>
                  )}
                </p>
              </li>
            ),
          )}
        </ul>
      </div>

      <details className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Calculator syntax</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-soft">
          <li>Operators: + − × ÷ ^ ! and parentheses. ^ is right-associative; unary minus binds loosest (−2^2 = −4).</li>
          <li>Percent: 50% means (50)/100. It applies per operand, so 50+10% = 50.1.</li>
          <li>Functions: sin cos tan asin acos atan sinh cosh tanh sqrt abs exp log (base-10, or log(x, base)) ln floor ceil round (half away from zero) mod (floored, divisor's sign) factorial permutations combinations. Use ! for factorial of a non-negative integer.</li>
          <li>Angle mode: Rad matches the graph engine. Deg wraps trig arguments (and inverse results) in degree conversions, shown as “computed as”. Hyperbolics are always radians.</li>
          <li>Results keep full double precision internally; display shows the selected significant digits or exponential form. Copy uses the decimal display so it pastes back; Send uses the full value.</li>
          <li>Display: choose 6–12 significant digits and Decimal or ≈ Fraction form. Fractions are nearest-simple-fraction approximations (denominator ≤ 1000), always labelled ≈ — only the Exact mode prints bare p/q, because only it is exact.</li>
          <li>Letters x, y, t, theta belong to the graph: such input has no numeric value here — Plot sends the expression to Graph Studio instead.</li>
          <li>Memory: M+ adds the current result, M− subtracts it, MR inserts the stored value, MC forgets it. The register persists locally and never touches history rows.</li>          <li>Modes: Complex (a+bi, magnitude, conjugate, argument on (−π, π], integer powers), Vector ([1, 2, 3], dot, 3D cross), Matrix (up to 8×8, determinant, inverse, solve), Stats (mean, median, σ vs s). Structured results record with their method; only real scalars send to the graph.</li>
        </ul>
      </details>
    </div>
  )
}
