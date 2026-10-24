import { useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { ImportDialog } from './ImportDialog.tsx'
import { ManualGrid } from './ManualGrid.tsx'
import { PlotWorkshop } from './PlotWorkshop.tsx'
import { DatasetTable } from './DatasetTable.tsx'
import { DEMO_DATASET } from './demo.ts'
import { readDataFileText } from './csv.ts'
import { analyzeTable, commitAnalysis, MAX_DATASET_COLS, MAX_DATASET_ROWS, tableFromGrid, type Dataset, type DatasetEditOutcome } from './dataset.ts'
import type { DatasetAnalysisSnapshot } from './persistence.ts'

interface DataLabProps {
  datasets: Dataset[]
  onAddDataset: (dataset: Dataset) => void
  onRemoveDataset: (id: string) => void
  onMutate: (id: string, label: string, edit: (dataset: Dataset) => DatasetEditOutcome) => string | null
  onUndo: (id: string) => void
  onRestore: (id: string) => void
  canUndo: (id: string) => boolean
  hasHistory: (id: string) => boolean
  analyses: Record<string, DatasetAnalysisSnapshot>
  onAnalysisChange: (id: string, analysis: DatasetAnalysisSnapshot) => void
}


/**
 * Data Lab ingestion + analysis view: paste, file, and manual entry
 * into validated datasets, per-dataset plots with fitting, and figure
 * / table export. Datasets and their plot/fit/export analyses persist
 * in v6 project files (session-only before that); raw rows stay
 * separate from sort/filter views.
 */
export function DataLab({ datasets, onAddDataset, onRemoveDataset, onMutate, onUndo, onRestore, canUndo, hasHistory, analyses, onAnalysisChange }: DataLabProps): React.JSX.Element {
  const [dialog, setDialog] = useState<{ text: string; fileName: string | null } | null>(null)
  const [manual, setManual] = useState(false)
  const [plottingId, setPlottingId] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Only the newest picked/dropped file may open the import dialog; an
  // older read resolving late must not replace newer input.
  const fileSeqRef = useRef(0)

  function takeFile(file: File | undefined): void {
    setFileError(null)
    if (file === undefined) {
      return
    }
    if (/\.xlsx?$|\.xlsm$/i.test(file.name)) {
      setFileError(`Excel import (${file.name}) is not supported yet — re-save the sheet as CSV and import that. Excel files are never parsed as CSV.`)
      return
    }
    const seq = ++fileSeqRef.current
    readDataFileText(file).then(
      (text) => {
        if (seq === fileSeqRef.current) {
          setDialog({ text, fileName: file.name })
        }
      },
      (error: unknown) => {
        if (seq === fileSeqRef.current) {
          setFileError(error instanceof Error ? error.message : 'Could not read that file as text.')
        }
      },
    )
  }

  function commitManual(cells: string[][]): void {
    const table = tableFromGrid(cells)
    const analysis = analyzeTable(table, { name: 'Manual entry', decimal: '.', hasHeader: null })
    const outcome = commitAnalysis(analysis, { name: 'Manual entry', decimal: '.', hasHeader: null }, { kind: 'manual', importedAt: new Date().toISOString() }, table.skippedEmpty)
    if (outcome.status === 'value') {
      onAddDataset({ ...outcome.dataset, importOptions: { delimiter: ',', decimal: '.', hasHeader: null, typeOverrides: {} } })
      setManual(false)
    } else {
      setFileError(`${outcome.message} Nothing has been added.`)
    }
  }

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        takeFile(event.dataTransfer.files?.[0])
      }}
    >
      <div className={`rounded-lg border p-4 shadow-panel ${dragging ? 'border-accent bg-bg' : 'border-line bg-surface'}`}>
        <h2 className="text-sm font-semibold text-ink">Data Lab — ingestion</h2>
        <p className="mt-1 text-xs text-muted">
          Paste CSV, open or drop a <span className="font-mono">.csv</span>/<span className="font-mono">.tsv</span>/<span className="font-mono">.txt</span> file, or type a small table by hand. Up to{' '}
          {MAX_DATASET_ROWS.toLocaleString()} rows × {MAX_DATASET_COLS} columns. Datasets, plot settings, fits, and export choices save into v6 project files.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setDialog({ text: '', fileName: null })} title="Paste tabular text">
            Paste data
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} title="Open a CSV, TSV, or text file">
            Open file
          </Button>
          <Button onClick={() => setManual(true)} title="Type a small table by hand" variant={manual ? 'ghost' : 'default'}>
            Manual entry
          </Button>
          <Button
            onClick={() => {
              onAddDataset(DEMO_DATASET)
              setPlottingId(DEMO_DATASET.id)
            }}
            title="Load the synthetic demo dataset and open its plot"
          >
            Demo dataset
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            takeFile(file)
          }}
        />
        {fileError !== null && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {fileError}
          </p>
        )}
      </div>

      {manual && <ManualGrid onCommit={commitManual} onCancel={() => setManual(false)} />}

      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Datasets ({datasets.length})</h3>
        {datasets.length === 0 && <p className="mt-2 text-sm text-muted">No datasets yet. Import one to begin — plotting and fitting arrive next.</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {datasets.map((dataset) => (
            <li key={dataset.id} className="rounded-md border border-line px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{dataset.name}</span>
                <span className="text-xs text-muted">
                  {dataset.rows.length} rows × {dataset.columns.length} cols · {dataset.provenance.kind}
                  {dataset.cleaningLog.length > 0 ? ` · ${dataset.cleaningLog.length} cleaning note${dataset.cleaningLog.length === 1 ? '' : 's'}` : ' · clean'}
                </span>
                <Button onClick={() => onRemoveDataset(dataset.id)} title={`Delete ${dataset.name}`} variant="ghost" className="ml-auto px-2 py-0.5 text-xs">
                  Delete
                </Button>
                <Button
                  onClick={() => setPlottingId((current) => (current === dataset.id ? null : dataset.id))}
                  title={plottingId === dataset.id ? `Hide plot for ${dataset.name}` : `Plot ${dataset.name}`}
                  aria-pressed={plottingId === dataset.id}
                  variant="ghost"
                  className="px-2 py-0.5 text-xs"
                >
                  {plottingId === dataset.id ? 'Hide plot' : 'Plot'}
                </Button>
              </div>
              <DatasetTable
                dataset={dataset}
                onMutate={(label, edit) => onMutate(dataset.id, label, edit)}
                onUndo={() => onUndo(dataset.id)}
                onRestore={() => onRestore(dataset.id)}
                canUndo={canUndo(dataset.id)}
                hasHistory={hasHistory(dataset.id)}
              />
              {dataset.cleaningLog.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-warning">
                  {dataset.cleaningLog.map((entry, i) => (
                    <li key={i}>
                      {entry.action}: {entry.detail}
                    </li>
                  ))}
                </ul>
              )}
              {plottingId === dataset.id && (
                <PlotWorkshop
                  key={dataset.id}
                  dataset={dataset}
                  initialAnalysis={analyses[dataset.id]}
                  onAnalysisChange={(analysis) => onAnalysisChange(dataset.id, analysis)}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {dialog !== null && <ImportDialog initialText={dialog.text} fileName={dialog.fileName} onCommit={(dataset) => {
        onAddDataset(dataset)
        setDialog(null)
      }} onClose={() => setDialog(null)} />}
    </div>
  )
}
