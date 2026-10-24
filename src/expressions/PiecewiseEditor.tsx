import { useState } from 'react'
import type { BranchOperator, RowBranch } from './model.ts'
import { describeCondition } from '../math/index.ts'
import { RowEditor } from './RowEditor.tsx'

interface PiecewiseEditorProps {
  rowId: string
  branches: RowBranch[]
  defaultSource: string
  onChange: (branches: RowBranch[], defaultSource: string) => void
}

const OPERATORS: Array<{ value: BranchOperator; label: string }> = [
  { value: 'lt', label: 'x <' },
  { value: 'le', label: 'x ≤' },
  { value: 'gt', label: 'x >' },
  { value: 'ge', label: 'x ≥' },
]

/**
 * Boundary editor for one branch. The committed value is numeric, but the
 * field keeps a text draft so a temporarily blank edit is never read as 0:
 * blank or whitespace-only text leaves the previous boundary in place
 * (restored on blur or Escape), valid decimal/scientific text commits
 * live, and an explicit 0 commits normally.
 */
function BranchBoundaryEditor({ index, value, onChange }: { index: number; value: number; onChange: (value: number) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const [synced, setSynced] = useState(value)
  // Adopt external changes (branch removal, import) without clobbering a
  // live edit whose parsed text already matches the committed number.
  if (value !== synced) {
    setSynced(value)
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed !== value) {
      setDraft(String(value))
    }
  }

  function commit(text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') {
      setDraft(String(value))
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    setDraft(String(parsed))
    onChange(parsed)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`Branch ${index + 1} boundary value`}
      value={draft}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        const trimmed = text.trim()
        if (trimmed !== '' && Number.isFinite(Number(trimmed))) {
          onChange(Number(trimmed))
        }
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(draft)
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(String(value))
        }
      }}
      className="w-20 min-w-0 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

/**
 * Structured piecewise editor: conditions over x plus a default branch.
 * First match wins; unmatched x with a blank default stays blank.
 * No expression syntax is invented — branch bodies use the same engine.
 */
export function PiecewiseEditor({ rowId, branches, defaultSource, onChange }: PiecewiseEditorProps): React.JSX.Element {
  function updateBranch(index: number, patch: Partial<RowBranch>): void {
    onChange(
      branches.map((branch, i) => (i === index ? { ...branch, ...patch } : branch)),
      defaultSource,
    )
  }

  function removeBranch(index: number): void {
    onChange(
      branches.filter((_, i) => i !== index),
      defaultSource,
    )
  }

  function addBranch(): void {
    if (branches.length >= 20) {
      return
    }
    onChange([...branches, { op: 'lt' as BranchOperator, value: 0, source: 'x' }], defaultSource)
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-bg p-2">
      <p className="text-xs text-muted">First matching branch wins. Unmatched x uses the default; a blank default leaves gaps.</p>
      <ul className="mt-2 flex flex-col gap-2">
        {branches.map((branch, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <span className="shrink-0 text-xs text-muted" title={`Branch ${index + 1}: ${describeCondition({ op: branch.op, value: branch.value })}`}>
              {index + 1}.
            </span>
            <select
              aria-label={`Branch ${index + 1} condition`}
              value={branch.op}
              onChange={(event) => updateBranch(index, { op: event.target.value as BranchOperator })}
              className="rounded-md border border-line bg-surface px-1 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {OPERATORS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <BranchBoundaryEditor index={index} value={branch.value} onChange={(value) => updateBranch(index, { value })} />
            <input
              type="text"
              aria-label={`Branch ${index + 1} expression`}
              value={branch.source}
              spellCheck={false}
              autoComplete="off"
              placeholder="e.g. x^2"
              onChange={(event) => updateBranch(index, { source: event.target.value })}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              aria-label={`Delete branch ${index + 1}`}
              title={`Delete branch ${index + 1}`}
              onClick={() => removeBranch(index)}
              className="gc-transition shrink-0 rounded-md px-1.5 py-1 text-sm text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <label className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <span className="shrink-0">Default:</span>
        <RowEditor rowId={`${rowId}-default`} committed={defaultSource} label="Default branch expression" onCommit={(_, source) => onChange(branches, source)} />
      </label>
      <button
        type="button"
        onClick={addBranch}
        disabled={branches.length >= 20}
        className="gc-transition mt-2 rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add branch
      </button>
    </div>
  )
}
