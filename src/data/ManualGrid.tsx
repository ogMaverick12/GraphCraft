import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'

interface ManualGridProps {
  onCommit: (cells: string[][]) => void
  onCancel: () => void
}

/**
 * Manual data-entry grid (Stage 4 DATA-01): small experiments typed by
 * hand. Cells are literal text into the shared validation path — the
 * same typing, issues, and commit rules as pasted CSV. Starts 3×3;
 * capped by the dataset limits at commit, never silently.
 */
export function ManualGrid({ onCommit, onCancel }: ManualGridProps): React.JSX.Element {
  const [cells, setCells] = useState<string[][]>([
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ])

  function setCell(row: number, col: number, value: string): void {
    setCells((current) => current.map((line, r) => (r === row ? line.map((cell, c) => (c === col ? value : cell)) : line)))
  }

  function addRow(): void {
    setCells((current) => [...current, Array.from({ length: current[0]?.length ?? 1 }, () => '')])
  }

  function removeRow(): void {
    setCells((current) => (current.length > 1 ? current.slice(0, -1) : current))
  }

  function addColumn(): void {
    setCells((current) => current.map((line) => [...line, '']))
  }

  function removeColumn(): void {
    setCells((current) => {
      if ((current[0]?.length ?? 1) <= 1) {
        return current
      }
      return current.map((line) => line.slice(0, -1))
    })
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Manual entry</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              {cells[0]?.map((_, c) => (
                <th key={c} scope="col" className="sr-only">
                  Column {c + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((line, r) => (
              <tr key={r}>
                {line.map((cell, c) => (
                  <td key={c} className="border border-line p-0">
                    <input
                      type="text"
                      aria-label={`Row ${r + 1} column ${c + 1}`}
                      value={cell}
                      onChange={(event) => setCell(r, c, event.target.value)}
                      className="w-28 bg-transparent px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button onClick={addRow} title="Add a row" className="px-2 py-0.5 text-xs">
          + Row
        </Button>
        <Button onClick={removeRow} title="Remove the last row" className="px-2 py-0.5 text-xs" variant="ghost">
          − Row
        </Button>
        <Button onClick={addColumn} title="Add a column" className="px-2 py-0.5 text-xs">
          + Column
        </Button>
        <Button onClick={removeColumn} title="Remove the last column" className="px-2 py-0.5 text-xs" variant="ghost">
          − Column
        </Button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button onClick={() => onCommit(cells)} title="Validate and add this grid as a dataset">
          Validate and add
        </Button>
      </div>
    </div>
  )
}
