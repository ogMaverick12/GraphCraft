import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { useDialogFocus } from '../components/ui/useDialogFocus.ts'
import { MAX_DATASET_COLS, MAX_DATASET_ROWS, analyzeTable, commitAnalysis, type ColumnType, type Dataset, type DecimalSeparator } from './dataset.ts'
import { parseCsv, type CsvDelimiter } from './csv.ts'

interface ImportDialogProps {
  initialText: string
  fileName: string | null
  onCommit: (dataset: Dataset) => void
  onClose: () => void
}

const PREVIEW_ROWS = 8

/**
 * Import dialog (Stage 4 DATA-01): paste or file text in, choices for
 * delimiter/decimal/header, a live preview of the first rows, and a
 * full accounting of issues before anything is committed. Cancel and
 * parse failures commit nothing — existing datasets are untouched.
 */
export function ImportDialog({ initialText, fileName, onCommit, onClose }: ImportDialogProps): React.JSX.Element {
  const [text, setText] = useState(initialText)
  const [name, setName] = useState(fileName?.replace(/\.[^.]+$/, '') ?? '')
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',')
  const [decimal, setDecimal] = useState<DecimalSeparator>('.')
  const [headerChoice, setHeaderChoice] = useState<'auto' | 'yes' | 'no'>('auto')
  const [typeOverrides, setTypeOverrides] = useState<Record<number, ColumnType>>({})

  const parsed = useMemo(() => parseCsv(text, { delimiter, maxRows: MAX_DATASET_ROWS, maxCols: MAX_DATASET_COLS }), [text, delimiter])
  const analysis = useMemo(() => {
    if (parsed.status !== 'value') {
      return null
    }
    return analyzeTable(parsed.table, { name, decimal, hasHeader: headerChoice === 'auto' ? null : headerChoice === 'yes', typeOverrides })
  }, [parsed, name, decimal, headerChoice, typeOverrides])

  function confirm(): void {
    if (analysis === null) {
      return
    }
    const outcome = commitAnalysis(analysis, { name, decimal, hasHeader: headerChoice === 'auto' ? null : headerChoice === 'yes', typeOverrides }, {
      kind: fileName !== null ? 'file' : 'paste',
      ...(fileName !== null ? { fileName } : {}),
      importedAt: new Date().toISOString(),
    }, parsed.status === 'value' ? parsed.table.skippedEmpty : 0)
    if (outcome.status === 'value') {
      onCommit({ ...outcome.dataset, importOptions: { delimiter, decimal, hasHeader: headerChoice === 'auto' ? null : headerChoice === 'yes', typeOverrides: { ...typeOverrides } } })
    }
  }

  const committed = analysis?.counts.committed ?? 0
  const closeRef = useRef<HTMLButtonElement>(null)
  const { dialogRef, onKeyDown } = useDialogFocus()

  // Focus lands on Cancel (the safe choice); Escape cancels without importing.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={dialogRef} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Import data" className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-elevated p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">Import data{fileName !== null ? ` — ${fileName}` : ''}</h2>

        <label className="mt-3 block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Data text</span>
          <textarea
            aria-label="Data text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={'x,y\n1,2\n3,4'}
            className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Dataset name</span>
            <input
              type="text"
              aria-label="Dataset name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Delimiter</span>
            <select
              aria-label="Delimiter"
              value={delimiter}
              onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value=",">Comma (,)</option>
              <option value=";">Semicolon (;)</option>
              <option value="	">Tab</option>
            </select>
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Decimal</span>
            <select
              aria-label="Decimal separator"
              value={decimal}
              onChange={(event) => setDecimal(event.target.value as DecimalSeparator)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value=".">Point (3.14)</option>
              <option value=",">Comma (3,14 — needs ; or tab delimiter)</option>
            </select>
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Header</span>
            <select
              aria-label="Header row"
              value={headerChoice}
              onChange={(event) => setHeaderChoice(event.target.value as 'auto' | 'yes' | 'no')}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="auto">Auto-detect</option>
              <option value="yes">First row is a header</option>
              <option value="no">No header row</option>
            </select>
          </label>
        </div>

        {parsed.status === 'error' && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {parsed.message} Nothing has been imported.
          </p>
        )}

        {analysis !== null && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Preview{analysis.headerGuessed ? ' — first row guessed as header (change above if wrong)' : ''}
            </h3>
            <div className="mt-1 overflow-x-auto rounded-md border border-line">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    {analysis.headers.map((header, i) => (
                      <th key={i} scope="col" className="border-b border-line bg-bg px-2 py-1 text-left align-top">
                        <span className="block font-mono font-semibold text-ink">{header}</span>
                        <select
                          aria-label={`Type for ${header}`}
                          value={typeOverrides[i] ?? 'auto'}
                          onChange={(event) => {
                            const value = event.target.value
                            setTypeOverrides((current) => {
                              if (value === 'auto') {
                                const next = { ...current }
                                delete next[i]
                                return next
                              }
                              return { ...current, [i]: value as ColumnType }
                            })
                          }}
                          className="mt-0.5 rounded border border-line bg-surface px-1 font-sans text-xs font-normal text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="auto">Auto ({analysis.columnTypes[i]})</option>
                          <option value="numeric">Numeric</option>
                          <option value="categorical">Categorical</option>
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.committed.slice(0, PREVIEW_ROWS).map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border-t border-line px-2 py-1 font-mono text-ink">
                          {cell === null ? <span className="text-muted">∅</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted" data-testid="import-summary">
              {analysis.counts.committed} rows, {analysis.headers.length} columns
              {analysis.counts.emptySkipped > 0 ? `; ${analysis.counts.emptySkipped} blank skipped` : ''}
              {analysis.counts.shortPadded > 0 ? `; ${analysis.counts.shortPadded} padded` : ''}
              {analysis.counts.longTruncated > 0 ? `; ${analysis.counts.longTruncated} truncated` : ''}
              {analysis.counts.malformed - analysis.counts.overrideCleared > 0 ? `; ${analysis.counts.malformed - analysis.counts.overrideCleared} kept as text` : ''}
              {analysis.counts.overrideCleared > 0 ? `; ${analysis.counts.overrideCleared} cleared by type override` : ''}.
            </p>
            {analysis.issues.length > 0 && (
              <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5 text-xs text-warning">
                {analysis.issues.map((issue, i) => (
                  <li key={i}>{issue.detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} ref={closeRef}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={analysis === null || committed === 0} title={committed === 0 ? 'Nothing valid to import' : `Import ${committed} rows`}>
            {committed === 0 ? 'Nothing to import' : `Import ${committed} rows`}
          </Button>
        </div>
      </div>
    </div>
  )
}
