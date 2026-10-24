import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { findUnit } from '../calculator/units.ts'
import { describe as describeStats } from '../calculator/stats.ts'
import { formatDisplay } from '../calculator/format.ts'
import {
  addDerivedColumn,
  deleteRows,
  dropRowsWithMissing,
  editCell,
  fillMissing,
  renameColumn,
  retagColumnType,
  setColumnUnit,
  type CellValue,
  type ColumnType,
  type Dataset,
  type DatasetEditOutcome,
} from './dataset.ts'

interface DatasetTableProps {
  dataset: Dataset
  /** Apply a pure edit; returns an error message, or null on success. */
  onMutate: (label: string, edit: (dataset: Dataset) => DatasetEditOutcome) => string | null
  onUndo: () => void
  onRestore: () => void
  canUndo: boolean
  hasHistory: boolean
}

type SortState = { col: number; dir: 'asc' | 'desc' } | null

interface FilterState {
  col: number
  op: string
  text: string
}

const NUMERIC_OPS = ['>', '≥', '<', '≤', '=', '≠', 'missing', 'present']
const TEXT_OPS = ['contains', 'equals', '≠', 'missing', 'present']

const DISPLAY_ROWS = 200

function cellText(cell: CellValue): string {
  if (cell === null) {
    return '∅'
  }
  return String(cell)
}

/**
 * Preparation table (Stage 4 S4.2): the full dataset with sorting,
 * filtering, cell editing, row deletion, column metadata (rename,
 * type, unit), missing-value strategies, derived columns, summaries,
 * and undo. Sort/filter are views — edits map back to source rows,
 * and raw data only changes through explicit, logged, reversible
 * mutations. Cell edits use point decimals (stated).
 */
export function DatasetTable({ dataset, onMutate, onUndo, onRestore, canUndo, hasHistory }: DatasetTableProps): React.JSX.Element {
  const [sort, setSort] = useState<SortState>(null)
  const [filter, setFilter] = useState<FilterState | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [editing, setEditing] = useState<{ row: number; col: number; text: string } | null>(null)
  const [renaming, setRenaming] = useState<{ col: number; text: string } | null>(null)
  const [unitDraft, setUnitDraft] = useState('')
  const [unitCol, setUnitCol] = useState(0)
  const [fillValue, setFillValue] = useState('')
  const [derivedName, setDerivedName] = useState('')
  const [derivedSource, setDerivedSource] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function run(label: string, edit: (dataset: Dataset) => DatasetEditOutcome): void {
    const error = onMutate(label, edit)
    setMessage(error)
    if (error === null) {
      setSelected([])
      setEditing(null)
      setRenaming(null)
    }
  }

  const missingByColumn = useMemo(() => dataset.columns.map((_, c) => dataset.rows.filter((row) => row[c] === null).length), [dataset])
  const rowsWithMissing = useMemo(() => dataset.rows.filter((row) => row.some((cell) => cell === null)).length, [dataset])

  const statsByColumn = useMemo(
    () =>
      dataset.columns.map((col, c) => {
        if (col.type !== 'numeric') {
          return null
        }
        const values = dataset.rows.map((row) => row[c]).filter((cell): cell is number => typeof cell === 'number')
        return values.length === 0 ? null : describeStats(values)
      }),
    [dataset],
  )

  const view = useMemo(() => {
    let indexed = dataset.rows.map((_, i) => i)
    if (filter !== null) {
      indexed = indexed.filter((i) => {
        const cell = dataset.rows[i]?.[filter.col]
        const text = filter.text.trim()
        switch (filter.op) {
          case 'missing':
            return cell === null
          case 'present':
            return cell !== null
          case 'contains':
            return cell !== null && String(cell).toLowerCase().includes(text.toLowerCase())
          case 'equals':
            return cell !== null && String(cell) === text
          case '≠':
            return cell === null || String(cell) !== text
          default: {
            if (typeof cell !== 'number') {
              return false
            }
            const value = Number(text)
            if (!Number.isFinite(value)) {
              return false
            }
            switch (filter.op) {
              case '>':
                return cell > value
              case '≥':
                return cell >= value
              case '<':
                return cell < value
              case '≤':
                return cell <= value
              case '=':
                return cell === value
              default:
                return false
            }
          }
        }
      })
    }
    if (sort !== null) {
      const { col, dir } = sort
      indexed = [...indexed].sort((a, b) => {
        const va = dataset.rows[a]?.[col]
        const vb = dataset.rows[b]?.[col]
        if (va === null || va === undefined) {
          return 1
        }
        if (vb === null || vb === undefined) {
          return -1
        }
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return dir === 'asc' ? cmp : -cmp
      })
    }
    return indexed
  }, [dataset, filter, sort])

  function cycleSort(col: number): void {
    setSort((current) => {
      if (current === null || current.col !== col) {
        return { col, dir: 'asc' }
      }
      if (current.dir === 'asc') {
        return { col, dir: 'desc' }
      }
      return null
    })
  }

  const shown = view.slice(0, DISPLAY_ROWS)
  const allVisibleSelected = shown.length > 0 && shown.every((i) => selected.includes(i))

  function toggleSelect(row: number): void {
    setSelected((current) => (current.includes(row) ? current.filter((i) => i !== row) : [...current, row]))
  }

  function commitRename(colId: string, text: string): void {
    run('rename', (current) => renameColumn(current, colId, text))
  }

  function commitEdit(row: number, col: number, text: string): void {
    run('edit-cell', (current) => editCell(current, row, col, text, '.'))
  }

  function applyUnit(): void {
    const col = dataset.columns[unitCol]
    if (col === undefined) {
      return
    }
    const trimmed = unitDraft.trim()
    if (trimmed !== '' && findUnit(trimmed) === null) {
      setMessage(`Unknown unit "${trimmed}". Use a registry symbol (m, s, kg, …) or leave blank to clear.`)
      return
    }
    run('set-unit', (current) => setColumnUnit(current, col.id, trimmed === '' ? null : trimmed))
  }

  function applyFill(): void {
    const value = Number(fillValue.trim())
    if (fillValue.trim() === '' || !Number.isFinite(value)) {
      setMessage('Fill needs a finite number.')
      return
    }
    run('fill-missing', (current) => fillMissing(current, value))
  }

  function applyDerived(): void {
    run('derived-column', (current) => addDerivedColumn(current, derivedName, derivedSource))
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
      <p className="text-xs text-muted" data-testid="dataset-summary">
        {dataset.rows.length} rows, {dataset.columns.length} columns; {rowsWithMissing} rows with missing values. Cell edits use point decimals.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Filter column</span>
          <select
            aria-label="Filter column"
            value={filter?.col ?? ''}
            onChange={(event) => {
              const col = Number(event.target.value)
              setFilter(Number.isInteger(col) && event.target.value !== '' ? { col, op: dataset.columns[col]?.type === 'numeric' ? '>' : 'contains', text: '' } : null)
            }}
            className="mt-0.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No filter</option>
            {dataset.columns.map((col, c) => (
              <option key={col.id} value={c}>
                {col.name}
              </option>
            ))}
          </select>
        </label>
        {filter !== null && (
          <>
            <label className="block text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide">Condition</span>
              <select
                aria-label="Filter condition"
                value={filter.op}
                onChange={(event) => setFilter({ ...filter, op: event.target.value })}
                className="mt-0.5 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {(dataset.columns[filter.col]?.type === 'numeric' ? NUMERIC_OPS : TEXT_OPS).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            {!['missing', 'present'].includes(filter.op) && (
              <label className="block text-xs text-muted">
                <span className="font-semibold uppercase tracking-wide">Value</span>
                <input
                  type="text"
                  aria-label="Filter value"
                  value={filter.text}
                  onChange={(event) => setFilter({ ...filter, text: event.target.value })}
                  className="mt-0.5 w-28 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            )}
            <span className="pb-1 text-xs text-muted">
              {view.length} of {dataset.rows.length} rows shown
            </span>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="border-b border-line bg-surface px-2 py-1">
                <input
                  type="checkbox"
                  aria-label="Select all shown rows"
                  checked={allVisibleSelected}
                  onChange={() => setSelected(allVisibleSelected ? [] : [...shown])}
                  className="h-3.5 w-3.5 accent-accent"
                />
              </th>
              {dataset.columns.map((col, c) => (
                <th key={col.id} scope="col" className="border-b border-line bg-surface px-2 py-1 text-left align-top" aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  {renaming?.col === c ? (
                    <input
                      type="text"
                      aria-label={`Rename ${col.name}`}
                      value={renaming.text}
                      autoFocus
                      onChange={(event) => setRenaming({ col: c, text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitRename(col.id, renaming.text)
                        } else if (event.key === 'Escape') {
                          event.stopPropagation()
                          setRenaming(null)
                        }
                      }}
                      onBlur={() => commitRename(col.id, renaming.text)}
                      className="w-24 rounded border border-line bg-bg px-1 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <button type="button" aria-label={`Rename ${col.name}`} title={`Rename ${col.name}`} onClick={() => setRenaming({ col: c, text: col.name })} className="rounded font-mono font-semibold text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {col.name}
                    </button>
                  )}
                  <span className="ml-1 block font-sans font-normal text-muted">
                    {col.type}
                    {col.unit !== undefined ? ` · ${col.unit}` : ''}
                    {` · ${missingByColumn[c] ?? 0} missing`}
                    {statsByColumn[c] !== null && statsByColumn[c] !== undefined
                      ? ` · min ${formatDisplay(statsByColumn[c]?.min ?? 0)}, max ${formatDisplay(statsByColumn[c]?.max ?? 0)}, mean ${formatDisplay(statsByColumn[c]?.mean ?? 0)}`
                      : ''}
                  </span>
                  <span className="mt-0.5 flex gap-1">
                    <button type="button" aria-label={`Sort by ${col.name}`} title={sort?.col === c ? `Sorted ${sort.dir} — activate to change` : `Sort by ${col.name}`} onClick={() => cycleSort(c)} className="rounded text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {sort?.col === c ? (sort.dir === 'asc' ? '▲' : '▼') : '△'}
                    </button>
                    <select
                      aria-label={`Type for ${col.name}`}
                      value={col.type}
                      onChange={(event) => run('retag', (current) => retagColumnType(current, col.id, event.target.value as ColumnType))}
                      className="rounded border border-line bg-bg px-0.5 text-xs text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="numeric">numeric</option>
                      <option value="categorical">categorical</option>
                    </select>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((rowIndex) => (
              <tr key={rowIndex}>
                <td className="border-t border-line px-2 py-0.5">
                  <input type="checkbox" aria-label={`Select row ${rowIndex + 1}`} checked={selected.includes(rowIndex)} onChange={() => toggleSelect(rowIndex)} className="h-3.5 w-3.5 accent-accent" />
                </td>
                {dataset.rows[rowIndex]?.map((cell, c) => (
                  <td key={c} className="border-t border-line px-2 py-0.5 font-mono text-ink">
                    {editing?.row === rowIndex && editing.col === c ? (
                      <input
                        type="text"
                        aria-label={`Edit row ${rowIndex + 1} ${dataset.columns[c]?.name ?? ''}`}
                        value={editing.text}
                        autoFocus
                        onChange={(event) => setEditing({ row: rowIndex, col: c, text: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            commitEdit(rowIndex, c, editing.text)
                          } else if (event.key === 'Escape') {
                            event.stopPropagation()
                            setEditing(null)
                          }
                        }}
                        onBlur={() => commitEdit(rowIndex, c, editing.text)}
                        className="w-24 rounded border border-line bg-bg px-1 font-mono text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    ) : (
                      <button type="button" title={`Edit row ${rowIndex + 1} ${dataset.columns[c]?.name ?? ''}`} aria-label={`Edit row ${rowIndex + 1} ${dataset.columns[c]?.name ?? ''}`} onClick={() => setEditing({ row: rowIndex, col: c, text: cell === null ? '' : String(cell) })} className="rounded hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {cellText(cell)}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length > DISPLAY_ROWS && (
          <p className="px-2 py-1 text-xs text-muted">
            Showing {DISPLAY_ROWS} of {view.length} rows.
          </p>
        )}
      </div>

      {message !== null && (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button onClick={() => run('delete-rows', (current) => deleteRows(current, selected))} title="Delete selected rows (reversible)" disabled={selected.length === 0} className="px-2 py-0.5 text-xs">
          Delete {selected.length > 0 ? `${selected.length} ` : ''}rows
        </Button>
        <Button onClick={() => run('drop-missing', dropRowsWithMissing)} title="Remove every row containing a missing value (reversible)" className="px-2 py-0.5 text-xs" variant="ghost">
          Drop missing rows
        </Button>
        <Button onClick={onUndo} title="Undo the last table change" disabled={!canUndo} className="px-2 py-0.5 text-xs" variant="ghost">
          Undo
        </Button>
        <Button onClick={onRestore} title="Restore the imported data, keeping a log entry" disabled={!hasHistory} className="px-2 py-0.5 text-xs" variant="ghost">
          Restore source
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Fill missing with number</span>
          <span className="mt-0.5 flex gap-1">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Fill value"
              value={fillValue}
              onChange={(event) => setFillValue(event.target.value)}
              placeholder="e.g. 0"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              onClick={applyFill}
              title="Fill numeric missing values with this constant (reversible)"
              className="shrink-0 px-2 py-0.5 text-xs"
            >
              Fill
            </Button>
          </span>
        </label>
        <div className="text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Or fill with means</span>
          <span className="mt-0.5 block">
            <Button onClick={() => run('fill-mean', (current) => fillMissing(current, 'mean'))} title="Fill each numeric column with its mean (reversible)" className="px-2 py-0.5 text-xs" variant="ghost">
              Fill column means
            </Button>
          </span>
        </div>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Column unit</span>
          <span className="mt-0.5 flex gap-1">
            <select
              aria-label="Unit column"
              value={unitCol}
              onChange={(event) => setUnitCol(Number(event.target.value))}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dataset.columns.map((col, c) => (
                <option key={col.id} value={c}>
                  {col.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Unit symbol"
              value={unitDraft}
              onChange={(event) => setUnitDraft(event.target.value)}
              placeholder="m (blank clears)"
              className="w-24 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={applyUnit} title="Attach a registry unit symbol to this column" className="shrink-0 px-2 py-0.5 text-xs">
              Set
            </Button>
          </span>
        </label>
      </div>

      <div className="rounded-md border border-line p-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Derived column (ids: {dataset.columns.map((col) => col.id).join(', ')})</h4>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <input
            type="text"
            aria-label="Derived column name"
            value={derivedName}
            onChange={(event) => setDerivedName(event.target.value)}
            placeholder="Name"
            className="w-28 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="text"
            aria-label="Derived column expression"
            value={derivedSource}
            onChange={(event) => setDerivedSource(event.target.value)}
            placeholder="e.g. c1*2+c2"
            spellCheck={false}
            className="min-w-40 flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={applyDerived} title="Add a computed column through the validated engine" className="shrink-0 px-2 py-1 text-xs">
            Add column
          </Button>
        </div>
      </div>
    </div>
  )
}
