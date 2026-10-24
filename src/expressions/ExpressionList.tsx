import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../components/ui/Button.tsx'
import type { DomainRestriction, ExpressionRow, InequalityOperator, RowBranch } from './model.ts'
import { RowItem } from './RowItem.tsx'

export interface ExpressionRowView {
  row: ExpressionRow
  /** Committed-text diagnostic, or null when the row is valid. */
  error: string | null
  /** Another row already uses this label. */
  labelTaken: boolean
  selected: boolean
}

interface ExpressionListProps {
  rows: ExpressionRowView[]
  onCommit: (id: string, source: string) => void
  onComponentCommit: (id: string, field: 'xSource' | 'ySource' | 'polar', source: string) => void
  onImplicitCommit: (id: string, field: 'leftSource' | 'rightSource', source: string) => void
  onInequalityOp: (id: string, op: InequalityOperator) => void
  onRange: (id: string, patch: { tMin?: number; tMax?: number; thetaMin?: number; thetaMax?: number }) => void
  onToggleVisibility: (id: string) => void
  onCycleColor: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
  onLabel: (id: string, label: string) => void
  onDomain: (id: string, domain: DomainRestriction | null) => void
  onBranches: (id: string, branches: RowBranch[] | null, defaultSource: string) => void
  onExitPiecewise: (id: string) => void
  onAdd: (source: string) => void
  onAddParametric: () => void
  onAddPolar: () => void
  onAddImplicit: () => void
  onAddInequality: () => void
}

const HINT_EXAMPLES = ['x^2', 'sin(x)', '1/x']

/**
 * Expression list: add / edit / duplicate / hide / delete / select,
 * plus per-row label, domain, and piecewise settings.
 * Errors render inline beside their row; valid rows are unaffected.
 */
export function ExpressionList({
  rows,
  onCommit,
  onComponentCommit,
  onImplicitCommit,
  onInequalityOp,
  onRange,
  onToggleVisibility,
  onCycleColor,
  onDuplicate,
  onRemove,
  onSelect,
  onLabel,
  onDomain,
  onBranches,
  onExitPiecewise,
  onAdd,
  onAddParametric,
  onAddPolar,
  onAddImplicit,
  onAddInequality,
}: ExpressionListProps): React.JSX.Element {
  const [draft, setDraft] = useState('')

  function submitNew(): void {
    if (draft.trim() === '') {
      return
    }
    onAdd(draft)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        aria-label="Add expression"
        onSubmit={(event) => {
          event.preventDefault()
          submitNew()
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={draft}
          aria-label="New expression"
          placeholder="e.g. x^2"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" aria-label="Add expression" title="Add expression">
          <Plus size={16} aria-hidden="true" />
        </Button>
      </form>

      {rows.length === 0 ? (
        <div>
          <p className="text-sm text-muted">No expressions yet. Try one:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {HINT_EXAMPLES.map((example) => (
              <Button key={example} onClick={() => onAdd(example)} className="px-2 py-1 font-mono text-xs">
                {example}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={onAddParametric} className="px-2 py-1 text-xs">
              Parametric curve
            </Button>
            <Button onClick={onAddPolar} className="px-2 py-1 text-xs">
              Polar curve
            </Button>
            <Button onClick={onAddImplicit} className="px-2 py-1 text-xs">
              Implicit curve
            </Button>
            <Button onClick={onAddInequality} className="px-2 py-1 text-xs">
              Inequality
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((view) => (
            <RowItem
              key={view.row.id}
              row={view.row}
              error={view.error}
              labelTaken={view.labelTaken}
              selected={view.selected}
              onCommit={onCommit}
              onComponentCommit={onComponentCommit}
              onImplicitCommit={onImplicitCommit}
              onInequalityOp={onInequalityOp}
              onRange={onRange}
              onToggleVisibility={onToggleVisibility}
              onCycleColor={onCycleColor}
              onDuplicate={onDuplicate}
              onRemove={onRemove}
              onSelect={onSelect}
              onLabel={onLabel}
              onDomain={onDomain}
              onBranches={onBranches}
              onExitPiecewise={onExitPiecewise}
            />
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAddParametric} className="px-2 py-1 text-xs">
            Parametric curve
          </Button>
          <Button onClick={onAddPolar} className="px-2 py-1 text-xs">
            Polar curve
          </Button>
          <Button onClick={onAddImplicit} className="px-2 py-1 text-xs">
            Implicit curve
          </Button>
          <Button onClick={onAddInequality} className="px-2 py-1 text-xs">
            Inequality
          </Button>
        </div>
      )}
    </div>
  )
}
