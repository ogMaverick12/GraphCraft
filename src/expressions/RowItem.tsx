import { useState } from 'react'
import { Copy, Eye, EyeOff, Settings2, Trash2 } from 'lucide-react'
import { IconButton } from '../components/ui/IconButton.tsx'
import { curveStyle } from '../graph/palette.ts'
import { displayName, type DomainRestriction, type ExpressionRow, type InequalityOperator, type RowBranch } from './model.ts'
import { PiecewiseEditor } from './PiecewiseEditor.tsx'
import { RowEditor } from './RowEditor.tsx'

interface RowItemProps {
  row: ExpressionRow
  error: string | null
  labelTaken: boolean
  selected: boolean
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
}

function RangeEditor({
  minLabel,
  maxLabel,
  min,
  max,
  onCommit,
}: {
  minLabel: string
  maxLabel: string
  min: number
  max: number
  onCommit: (patch: { tMin?: number; tMax?: number; thetaMin?: number; thetaMax?: number }) => void
}): React.JSX.Element {
  const [minText, setMinText] = useState(String(min))
  const [maxText, setMaxText] = useState(String(max))
  const [synced, setSynced] = useState<[number, number]>([min, max])
  const [message, setMessage] = useState<string | null>(null)
  if (min !== synced[0] || max !== synced[1]) {
    setSynced([min, max])
    setMinText(String(min))
    setMaxText(String(max))
    setMessage(null)
  }

  function commit(): void {
    if (minText.trim() === '' || maxText.trim() === '') {
      setMessage('Enter both bounds as numbers.')
      return
    }
    // The row kind decides which fields these fill; pass both pairs and
    // let the model apply the matching one.
    setMessage(null)
    onCommit({ tMin: Number(minText), tMax: Number(maxText), thetaMin: Number(minText), thetaMax: Number(maxText) })
  }

  const inputClass =
    'w-20 min-w-0 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-muted">from</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={minLabel}
          value={minText}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setMinText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setMinText(String(min))
              setMaxText(String(max))
              setMessage(null)
            }
          }}
          className={inputClass}
        />
        <span className="shrink-0 text-xs text-muted">to</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={maxLabel}
          value={maxText}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setMaxText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setMinText(String(min))
              setMaxText(String(max))
              setMessage(null)
            }
          }}
          className={inputClass}
        />
      </div>
      {message !== null && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  )
}

function DomainEditor({ rowId, domain, onDomain }: { rowId: string; domain: DomainRestriction | null; onDomain: (domain: DomainRestriction | null) => void }): React.JSX.Element {
  const [minText, setMinText] = useState(domain === null ? '' : String(domain.min))
  const [maxText, setMaxText] = useState(domain === null ? '' : String(domain.max))
  const [synced, setSynced] = useState(domain)
  const [message, setMessage] = useState<string | null>(null)
  if (domain !== synced) {
    setSynced(domain)
    setMinText(domain === null ? '' : String(domain.min))
    setMaxText(domain === null ? '' : String(domain.max))
    setMessage(null)
  }

  function commit(): void {
    const minBlank = minText.trim() === ''
    const maxBlank = maxText.trim() === ''
    // Clearing both sides removes the restriction; a single blank side is
    // an incomplete edit and must not silently become the number 0.
    if (minBlank && maxBlank) {
      setMessage(null)
      onDomain(null)
      return
    }
    if (minBlank || maxBlank) {
      setMessage('Enter both bounds as numbers, or clear both.')
      return
    }
    const min = Number(minText)
    const max = Number(maxText)
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setMessage('Enter both bounds as numbers, or clear both.')
      return
    }
    setMessage(null)
    onDomain({ min, max })
  }

  const inputClass =
    'w-20 min-w-0 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span id={`${rowId}-domain-label`} className="shrink-0 text-xs text-muted">
          x from
        </span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Domain minimum"
          value={minText}
          placeholder="min"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setMinText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setMinText(domain === null ? '' : String(domain.min))
              setMaxText(domain === null ? '' : String(domain.max))
              setMessage(null)
            }
          }}
          className={inputClass}
        />
        <span className="shrink-0 text-xs text-muted">to</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Domain maximum"
          value={maxText}
          placeholder="max"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setMaxText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              event.stopPropagation()
              setMinText(domain === null ? '' : String(domain.min))
              setMaxText(domain === null ? '' : String(domain.max))
              setMessage(null)
            }
          }}
          className={inputClass}
        />
        {domain !== null && (
          <button
            type="button"
            onClick={() => {
              setMinText('')
              setMaxText('')
              setMessage(null)
              onDomain(null)
            }}
            aria-label="Clear domain restriction"
            className="gc-transition shrink-0 rounded-md px-1.5 py-1 text-xs text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </button>
        )}
      </div>
      {message !== null && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * One expression row of any kind: editors, visibility/duplicate/delete,
 * colour, selection, plus an expandable section for label, ranges, and
 * the structured piecewise editor (cartesian only).
 */
export function RowItem({
  row,
  error,
  labelTaken,
  selected,
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
}: RowItemProps): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const style = curveStyle(row.colorIndex)
  const name = displayName(row)
  const piecewise = row.kind === 'cartesian' && row.branches !== null

  function togglePiecewise(): void {
    if (row.kind !== 'cartesian') {
      return
    }
    if (piecewise) {
      onExitPiecewise(row.id)
    } else {
      onBranches(row.id, [], row.source)
    }
  }

  return (
    <li
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button,input,select') === null) {
          onSelect(row.id)
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault()
          onSelect(row.id)
        }
      }}
      aria-current={selected ? 'true' : undefined}
      tabIndex={0}
      className={`rounded-lg border p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-accent bg-bg' : 'border-line bg-bg'}`}
    >
      <span className="sr-only">{selected ? `${name} selected for inspection.` : `${name}. Press Enter to select for inspection.`}</span>
      <div className="flex items-center gap-1.5">
        <IconButton label={`Change colour for ${name}`} title={`Change colour for ${name}`} onClick={() => onCycleColor(row.id)}>
          <svg width={22} height={10} aria-hidden="true">
            <line x1={0} y1={5} x2={22} y2={5} stroke={style.color} strokeWidth={3} {...(style.dash === '' ? {} : { strokeDasharray: style.dash })} />
          </svg>
        </IconButton>
        {row.kind === 'cartesian' ? (
          piecewise ? (
            <p className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title="Piecewise definition; edit branches below">
              piecewise
            </p>
          ) : (
            <RowEditor rowId={row.id} committed={row.source} onCommit={onCommit} />
          )
        ) : row.kind === 'parametric' ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <RowEditor rowId={row.id} committed={row.xSource} label="x(t) expression" onCommit={(_, source) => onComponentCommit(row.id, 'xSource', source)} />
            <RowEditor rowId={row.id} committed={row.ySource} label="y(t) expression" onCommit={(_, source) => onComponentCommit(row.id, 'ySource', source)} />
          </div>
        ) : row.kind === 'polar' ? (
          <RowEditor rowId={row.id} committed={row.source} label="r(theta) expression" onCommit={(id, source) => onComponentCommit(id, 'polar', source)} />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <RowEditor rowId={row.id} committed={row.leftSource} label="Left-hand side" onCommit={(_, source) => onImplicitCommit(row.id, 'leftSource', source)} />
            <div className="flex items-center gap-1.5">
              {row.kind === 'inequality' ? (
                <select
                  aria-label="Inequality operator"
                  value={row.op}
                  onChange={(event) => onInequalityOp(row.id, event.target.value as InequalityOperator)}
                  className="shrink-0 rounded-md border border-line bg-surface px-1 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="<=">≤</option>
                  <option value=">=">≥</option>
                  <option value="<">&lt;</option>
                  <option value=">">&gt;</option>
                </select>
              ) : (
                <span aria-hidden="true" className="shrink-0 px-1 font-mono text-sm text-muted">
                  =
                </span>
              )}
              <RowEditor rowId={row.id} committed={row.rightSource} label="Right-hand side" onCommit={(_, source) => onImplicitCommit(row.id, 'rightSource', source)} />
            </div>
          </div>
        )}
        <IconButton
          label={`${row.visible ? 'Hide' : 'Show'} ${name}`}
          title={`${row.visible ? 'Hide' : 'Show'} ${name}`}
          aria-pressed={row.visible}
          onClick={() => onToggleVisibility(row.id)}
        >
          {row.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
        </IconButton>
        <IconButton label={`Duplicate ${name}`} title={`Duplicate ${name}`} onClick={() => onDuplicate(row.id)}>
          <Copy size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label={`Delete ${name}`} title={`Delete ${name}`} onClick={() => onRemove(row.id)}>
          <Trash2 size={16} aria-hidden="true" />
        </IconButton>
        <IconButton
          label={`${settingsOpen ? 'Close' : 'Open'} settings for ${name}`}
          title={`${settingsOpen ? 'Close' : 'Open'} settings for ${name}`}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={16} aria-hidden="true" />
        </IconButton>
      </div>

      {error !== null && (
        <p role="alert" className="mt-1.5 text-xs leading-snug text-danger">
          {error}
        </p>
      )}
      {row.label !== '' && (
        <p className="mt-1.5 truncate text-xs font-medium text-ink" title={row.label}>
          {row.label}
        </p>
      )}
      {labelTaken && (
        <p role="note" className="mt-1.5 text-xs leading-snug text-warning">
          This label is already used by another expression.
        </p>
      )}
      {!row.visible && error === null && <p className="mt-1.5 text-xs text-muted">Hidden from the graph.</p>}

      {settingsOpen && (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0">Label:</span>
            <RowEditor rowId={`${row.id}-label`} committed={row.label} label="Expression label" onCommit={(_, label) => onLabel(row.id, label)} />
          </label>
          {row.kind === 'cartesian' && <DomainEditor rowId={row.id} domain={row.domain} onDomain={(domain) => onDomain(row.id, domain)} />}
          {row.kind === 'parametric' && (
            <RangeEditor minLabel="t minimum" maxLabel="t maximum" min={row.tMin} max={row.tMax} onCommit={(patch) => onRange(row.id, patch)} />
          )}
          {row.kind === 'polar' && (
            <RangeEditor minLabel="Theta minimum" maxLabel="Theta maximum" min={row.thetaMin} max={row.thetaMax} onCommit={(patch) => onRange(row.id, patch)} />
          )}
          {row.kind === 'cartesian' && (
            <div>
              <button
                type="button"
                onClick={togglePiecewise}
                aria-pressed={piecewise}
                className="gc-transition rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {piecewise ? 'Use single formula' : 'Make piecewise'}
              </button>
              {piecewise && (
                <PiecewiseEditor
                  rowId={row.id}
                  branches={row.branches ?? []}
                  defaultSource={row.defaultSource}
                  onChange={(branches, defaultSource) => onBranches(row.id, branches, defaultSource)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
