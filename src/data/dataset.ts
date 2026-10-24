import { compileExpression } from '../math/engine.ts'
import type { CsvTable } from './csv.ts'

/**
 * Dataset model (Stage 4 DATA-01): validated tables with stable column
 * ids, explicit types, and a cleaning log. Raw import text and user
 * transformations stay distinguishable: commit records what was
 * padded, truncated, or retyped, and nothing is ever dropped silently.
 * Pure TypeScript — no React, no DOM.
 */

export type DecimalSeparator = '.' | ','
export type ColumnType = 'numeric' | 'categorical'
export type CellValue = number | string | null

export const MAX_DATASET_ROWS = 10_000
export const MAX_DATASET_COLS = 32
const MAX_ISSUE_SAMPLES = 20

export interface DatasetColumn {
  /** Stable id (`c1`, `c2`, …); names are display only. */
  id: string
  name: string
  type: ColumnType
  unit?: string
}

export interface CleaningEntry {
  action: string
  detail: string
}

export interface DatasetProvenance {
  kind: 'paste' | 'file' | 'manual' | 'example'
  fileName?: string
  importedAt: string
  skippedEmpty: number
}

/**
 * Import choices recorded at commit so a saved project reproduces the
 * import exactly (delimiter/decimal/header/type faithfulness). Absent
 * for example datasets and pre-v6 projects.
 */
export interface DatasetImportOptions {
  delimiter: ',' | ';' | '\t'
  decimal: DecimalSeparator
  /** Null when the header was auto-detected rather than chosen. */
  hasHeader: boolean | null
  typeOverrides: Record<number, ColumnType>
}

export interface Dataset {
  id: string
  name: string
  columns: DatasetColumn[]
  rows: CellValue[][]
  provenance: DatasetProvenance
  cleaningLog: CleaningEntry[]
  importOptions?: DatasetImportOptions
}

export type ImportIssueKind =
  | 'duplicate-header'
  | 'empty-header'
  | 'ragged-short'
  | 'ragged-long'
  | 'malformed-number'
  | 'mixed-column'
  | 'type-override'

export interface ImportIssue {
  kind: ImportIssueKind
  row?: number
  column?: string
  detail: string
}

export interface ImportCounts {
  totalRows: number
  emptySkipped: number
  committed: number
  shortPadded: number
  longTruncated: number
  malformed: number
  overrideCleared: number
}

export interface ImportAnalysis {
  headers: string[]
  headerGuessed: boolean
  columnTypes: ColumnType[]
  /** Committed-form rows for preview (first 8) and commit (all). */
  committed: CellValue[][]
  issues: ImportIssue[]
  counts: ImportCounts
}

export interface ImportSpec {
  name: string
  decimal: DecimalSeparator
  /** True when the first row is a header; guessed when null. */
  hasHeader: boolean | null
  /**
   * User type overrides per column index. Numeric promotion clears
   * non-parsing cells to missing (counted, logged); categorical
   * demotion only relabels. Values are never invented.
   */
  typeOverrides?: Record<number, ColumnType>
}

let datasetCounter = 0

function nextDatasetId(): string {
  datasetCounter += 1
  return `dataset-${Date.now().toString(36)}-${datasetCounter}`
}

function isDigits(text: string): boolean {
  return /^\d+$/.test(text)
}

/**
 * Strict numeric parse under the chosen decimal rule. Returns null for
 * anything that is not a finite number — malformed text, NaN-producing
 * input, and infinities all land here, never as silent values.
 */
export function parseNumeric(text: string, decimal: DecimalSeparator): number | null {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }
  if (decimal === '.') {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
      return null
    }
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
  }
  const comma = trimmed.lastIndexOf(',')
  const intText = (comma >= 0 ? trimmed.slice(0, comma) : trimmed).trim()
  const fracText = comma >= 0 ? trimmed.slice(comma + 1).trim() : ''
  if (fracText !== '' && !isDigits(fracText)) {
    return null
  }
  const intMatch = /^([+-]?)(.*)$/.exec(intText)
  const sign = intMatch?.[1] === '-' ? -1 : 1
  const digits = (intMatch?.[2] ?? '').replace(/\./g, '')
  const grouped = intMatch?.[2] ?? ''
  if (!isDigits(digits) || digits === '') {
    return null
  }
  if (grouped.includes('.') && !/^([+-]?\d{1,3})(\.\d{3})*$/.test(intText)) {
    return null
  }
  if (/\d[eE]/.test(trimmed)) {
    return null
  }
  const value = sign * (Number.parseInt(digits, 10) + (fracText === '' ? 0 : Number.parseInt(fracText, 10) / 10 ** fracText.length))
  return Number.isFinite(value) ? value : null
}

/** Header guess: first row all non-numeric while later rows hold numbers. */
export function guessHasHeader(rows: string[][], decimal: DecimalSeparator): boolean {
  if (rows.length < 2) {
    return false
  }
  const first = rows[0] ?? []
  if (first.length === 0 || first.every((cell) => cell.trim() === '')) {
    return false
  }
  const firstIsText = first.every((cell) => cell.trim() === '' || parseNumeric(cell, decimal) === null)
  if (!firstIsText) {
    return false
  }
  return rows.slice(1).some((row) => row.some((cell) => cell.trim() !== '' && parseNumeric(cell, decimal) !== null))
}

function uniqueHeaders(raw: string[]): { headers: string[]; issues: ImportIssue[] } {
  const seen = new Map<string, number>()
  const headers: string[] = []
  const issues: ImportIssue[] = []
  raw.forEach((name, index) => {
    const trimmed = name.trim()
    if (trimmed === '') {
      headers.push(`Column ${index + 1}`)
      issues.push({ kind: 'empty-header', column: `Column ${index + 1}`, detail: `Header ${index + 1} is blank; named "Column ${index + 1}".` })
      return
    }
    const count = seen.get(trimmed) ?? 0
    seen.set(trimmed, count + 1)
    if (count === 0) {
      headers.push(trimmed)
    } else {
      headers.push(`${trimmed} (${count + 1})`)
      issues.push({ kind: 'duplicate-header', column: trimmed, detail: `Duplicate header "${trimmed}"; renamed to "${trimmed} (${count + 1})".` })
    }
  })
  return { headers, issues }
}

function pushIssue(issues: ImportIssue[], issue: ImportIssue): void {
  if (issues.length < MAX_ISSUE_SAMPLES) {
    issues.push(issue)
  }
}

/** Full analysis shared by the preview dialog and the commit path. */
export function analyzeTable(table: CsvTable, spec: ImportSpec): ImportAnalysis {
  const issues: ImportIssue[] = []
  const hasHeader = spec.hasHeader ?? guessHasHeader(table.rows, spec.decimal)
  const headerRow = hasHeader ? (table.rows[0] ?? []) : []
  const dataRows = hasHeader ? table.rows.slice(1) : table.rows
  // The header (or first data row) declares the schema width; longer rows
  // truncate with an issue, shorter rows pad. Max-of-everything would make
  // truncation unreachable and silently reshape the table.
  const declared = hasHeader ? headerRow.length : (dataRows[0]?.length ?? 0)
  const width = declared > 0 ? declared : Math.max(...dataRows.map((row) => row.length), 0)
  const named = uniqueHeaders(hasHeader ? headerRow : Array.from({ length: width }, (_, i) => `Column ${i + 1}`))
  for (const issue of named.issues) {
    pushIssue(issues, issue)
  }
  const headers = named.headers
  while (headers.length < width) {
    headers.push(`Column ${headers.length + 1}`)
  }

  const malformedPerColumn: boolean[] = Array.from({ length: width }, () => false)
  const committed: CellValue[][] = []
  let shortPadded = 0
  let longTruncated = 0
  let malformed = 0
  dataRows.forEach((row, rowIndex) => {
    if (row.length < width) {
      shortPadded += 1
      pushIssue(issues, { kind: 'ragged-short', row: rowIndex + (hasHeader ? 2 : 1), detail: `Row has ${row.length} fields, expected ${width}; padded with missing.` })
    } else if (row.length > width) {
      longTruncated += 1
      pushIssue(issues, { kind: 'ragged-long', row: rowIndex + (hasHeader ? 2 : 1), detail: `Row has ${row.length} fields, expected ${width}; extras dropped.` })
    }
    const out: CellValue[] = []
    for (let col = 0; col < width; col += 1) {
      const cell = (row[col] ?? '').trim()
      if (cell === '') {
        out.push(null)
        continue
      }
      const numeric = parseNumeric(cell, spec.decimal)
      if (numeric !== null) {
        out.push(numeric)
      } else {
        out.push(cell)
        malformedPerColumn[col] = true
        malformed += 1
        pushIssue(issues, { kind: 'malformed-number', row: rowIndex + (hasHeader ? 2 : 1), column: headers[col], detail: `"${cell}" is not a number under the ${spec.decimal === ',' ? 'comma' : 'point'}-decimal rule; kept as text.` })
      }
    }
    committed.push(out)
  })

  const overrides = spec.typeOverrides ?? {}
  let overrideCleared = 0
  for (let col = 0; col < width; col += 1) {
    if (overrides[col] === 'numeric' && malformedPerColumn[col] === true) {
      let cleared = 0
      for (const row of committed) {
        if (typeof row[col] === 'string') {
          row[col] = null
          cleared += 1
        }
      }
      overrideCleared += cleared
      malformedPerColumn[col] = false
      pushIssue(issues, { kind: 'type-override', column: headers[col], detail: `"${headers[col] ?? ''}" forced numeric by choice: ${cleared} text cells cleared to missing.` })
    } else if (overrides[col] === 'categorical' && malformedPerColumn[col] !== true) {
      pushIssue(issues, { kind: 'type-override', column: headers[col], detail: `"${headers[col] ?? ''}" forced categorical by choice; values unchanged.` })
    }
  }

  const columnTypes = headers.map((_, col): ColumnType => {
    const forced = overrides[col]
    if (forced !== undefined) {
      return forced
    }
    return malformedPerColumn[col] === true ? 'categorical' : 'numeric'
  })
  for (let col = 0; col < width; col += 1) {
    if (malformedPerColumn[col] === true) {
      const numericCells = committed.filter((row) => typeof row[col] === 'number').length
      if (numericCells > 0) {
        pushIssue(issues, { kind: 'mixed-column', column: headers[col], detail: `"${headers[col] ?? ''}" mixes numbers and text; typed categorical with numbers preserved per cell.` })
      }
    }
  }

  return {
    headers,
    headerGuessed: spec.hasHeader === null,
    columnTypes,
    committed,
    issues,
    counts: {
      totalRows: dataRows.length,
      emptySkipped: table.skippedEmpty,
      committed: committed.length,
      shortPadded,
      longTruncated,
      malformed,
      overrideCleared,
    },
  }
}

export type CommitOutcome =
  | { status: 'value'; dataset: Dataset }
  | { status: 'error'; kind: 'empty' | 'limit'; message: string }

/** Commit an analyzed table: caps enforced, cleaning log written. */
export function commitAnalysis(
  analysis: ImportAnalysis,
  spec: ImportSpec,
  provenance: Omit<DatasetProvenance, 'skippedEmpty'>,
  skippedEmpty: number,
): CommitOutcome {
  if (analysis.headers.length === 0) {
    return { status: 'error', kind: 'empty', message: 'Nothing to import: no columns survived validation.' }
  }
  if (analysis.headers.length > MAX_DATASET_COLS) {
    return { status: 'error', kind: 'limit', message: `Too many columns (maximum is ${MAX_DATASET_COLS}).` }
  }
  if (analysis.committed.length === 0) {
    return { status: 'error', kind: 'empty', message: 'Nothing to import: no data rows survived validation.' }
  }
  if (analysis.committed.length > MAX_DATASET_ROWS) {
    return { status: 'error', kind: 'limit', message: `Too many rows (maximum is ${MAX_DATASET_ROWS}). Split the input instead of truncating silently.` }
  }
  const cleaningLog: CleaningEntry[] = []
  if (analysis.headerGuessed) {
    cleaningLog.push({ action: 'header-guess', detail: 'First row treated as headers by guess; user-confirmed at import.' })
  }
  if (analysis.counts.shortPadded > 0) {
    cleaningLog.push({ action: 'pad-short-rows', detail: `${analysis.counts.shortPadded} short rows padded with missing.` })
  }
  if (analysis.counts.longTruncated > 0) {
    cleaningLog.push({ action: 'truncate-long-rows', detail: `${analysis.counts.longTruncated} long rows truncated to ${analysis.headers.length} columns.` })
  }
  const keptAsText = analysis.counts.malformed - analysis.counts.overrideCleared
  if (keptAsText > 0) {
    cleaningLog.push({ action: 'keep-malformed-as-text', detail: `${keptAsText} non-numeric cells kept as text under the ${spec.decimal === ',' ? 'comma' : 'point'}-decimal rule.` })
  }
  if (analysis.counts.overrideCleared > 0) {
    cleaningLog.push({ action: 'type-override', detail: `${analysis.counts.overrideCleared} cells cleared to missing by numeric type overrides.` })
  }
  const dataset: Dataset = {
    id: nextDatasetId(),
    name: spec.name.trim() === '' ? 'Untitled dataset' : spec.name.trim().slice(0, 60),
    columns: analysis.headers.map((name, index) => ({ id: `c${index + 1}`, name, type: analysis.columnTypes[index] ?? 'categorical' })),
    rows: analysis.committed,
    provenance: { ...provenance, skippedEmpty },
    cleaningLog,
  }
  return { status: 'value', dataset }
}

/** Manual grid cells are literal text (no quote processing); blank rows skip with a count. */
export function tableFromGrid(cells: string[][]): CsvTable {
  const rows: string[][] = []
  let skippedEmpty = 0
  for (const row of cells) {
    if (row.every((cell) => cell.trim() === '')) {
      skippedEmpty += 1
    } else {
      rows.push([...row])
    }
  }
  return { rows, truncated: false, skippedEmpty }
}

export type DatasetEditOutcome =
  | { status: 'value'; dataset: Dataset; cleared?: number; filled?: number; dropped?: number }
  | { status: 'error'; message: string }

function withLog(dataset: Dataset, action: string, detail: string): Dataset {
  return { ...dataset, cleaningLog: [...dataset.cleaningLog, { action, detail }] }
}

function columnIndex(dataset: Dataset, colId: string): number {
  return dataset.columns.findIndex((col) => col.id === colId)
}

/** Rename a column: non-empty, ≤60 chars, unique case-insensitively. */
export function renameColumn(dataset: Dataset, colId: string, name: string): DatasetEditOutcome {
  const index = columnIndex(dataset, colId)
  if (index < 0) {
    return { status: 'error', message: 'Unknown column.' }
  }
  const trimmed = name.trim()
  if (trimmed === '') {
    return { status: 'error', message: 'Column names cannot be blank.' }
  }
  if (trimmed.length > 60) {
    return { status: 'error', message: 'Column names hold at most 60 characters.' }
  }
  if (dataset.columns.some((col, i) => i !== index && col.name.toLowerCase() === trimmed.toLowerCase())) {
    return { status: 'error', message: `Another column is already named "${trimmed}".` }
  }
  const columns = dataset.columns.map((col, i) => (i === index ? { ...col, name: trimmed } : col))
  return { status: 'value', dataset: withLog({ ...dataset, columns }, 'rename-column', `"${dataset.columns[index]?.name ?? ''}" → "${trimmed}".`) }
}

/**
 * Retag a column type after import. Numeric promotion clears text cells
 * to missing (counted); categorical demotion only relabels. Same
 * honesty contract as the import-time override.
 */
export function retagColumnType(dataset: Dataset, colId: string, type: ColumnType): DatasetEditOutcome {
  const index = columnIndex(dataset, colId)
  if (index < 0) {
    return { status: 'error', message: 'Unknown column.' }
  }
  if (dataset.columns[index]?.type === type) {
    return { status: 'value', dataset }
  }
  if (type === 'categorical') {
    const columns = dataset.columns.map((col, i) => (i === index ? { ...col, type } : col))
    return { status: 'value', dataset: withLog({ ...dataset, columns }, 'retag-column', `"${dataset.columns[index]?.name ?? ''}" relabelled categorical; values unchanged.`) }
  }
  let cleared = 0
  const rows = dataset.rows.map((row) =>
    row.map((cell, c) => {
      if (c !== index || cell === null || typeof cell === 'number') {
        return cell
      }
      cleared += 1
      return null
    }),
  )
  const columns = dataset.columns.map((col, i) => (i === index ? { ...col, type } : col))
  return {
    status: 'value',
    dataset: withLog({ ...dataset, columns, rows }, 'retag-column', `"${dataset.columns[index]?.name ?? ''}" forced numeric: ${cleared} text cells cleared to missing.`),
    cleared,
  }
}

/** Attach or clear a unit label (validation against the registry lives in the UI). */
export function setColumnUnit(dataset: Dataset, colId: string, unit: string | null): DatasetEditOutcome {
  const index = columnIndex(dataset, colId)
  if (index < 0) {
    return { status: 'error', message: 'Unknown column.' }
  }
  const columns = dataset.columns.map((col, i) => {
    if (i !== index) {
      return col
    }
    if (unit === null) {
      const { unit: _removed, ...rest } = col
      return rest
    }
    return { ...col, unit }
  })
  return { status: 'value', dataset: withLog({ ...dataset, columns }, 'set-unit', `"${dataset.columns[index]?.name ?? ''}" unit ${unit ?? 'cleared'}.`) }
}

/**
 * Correct one cell. Numeric columns accept finite numbers (blank clears
 * to missing); text in a numeric column is refused rather than coerced —
 * retag the column first. Categorical cells accept any text.
 */
export function editCell(dataset: Dataset, rowIndex: number, colIndex: number, text: string, decimal: DecimalSeparator): DatasetEditOutcome {
  const column = dataset.columns[colIndex]
  const row = dataset.rows[rowIndex]
  if (column === undefined || row === undefined || colIndex >= row.length) {
    return { status: 'error', message: 'Unknown cell.' }
  }
  const trimmed = text.trim()
  let value: CellValue
  if (trimmed === '') {
    value = null
  } else if (column.type === 'numeric') {
    const numeric = parseNumeric(trimmed, decimal)
    if (numeric === null) {
      return { status: 'error', message: `"${trimmed}" is not a finite number; retag the column categorical to keep text.` }
    }
    value = numeric
  } else {
    value = trimmed
  }
  const rows = dataset.rows.map((line, r) => (r === rowIndex ? line.map((cell, c) => (c === colIndex ? value : cell)) : line))
  return { status: 'value', dataset: withLog({ ...dataset, rows }, 'edit-cell', `Row ${rowIndex + 1} "${column.name}" set to ${value === null ? 'missing' : JSON.stringify(value)}; was ${JSON.stringify(row[colIndex] ?? null)}.`) }
}

/** Remove rows by source index (callers map view positions back first). */
export function deleteRows(dataset: Dataset, indices: number[]): DatasetEditOutcome {
  const doomed = new Set(indices.filter((i) => i >= 0 && i < dataset.rows.length))
  if (doomed.size === 0) {
    return { status: 'error', message: 'No rows selected.' }
  }
  const rows = dataset.rows.filter((_, i) => !doomed.has(i))
  return { status: 'value', dataset: withLog({ ...dataset, rows }, 'delete-rows', `${doomed.size} rows removed; reversible with Undo.`), dropped: doomed.size }
}

/** Drop every row containing a missing value. */
export function dropRowsWithMissing(dataset: Dataset): DatasetEditOutcome {
  const kept = dataset.rows.filter((row) => row.every((cell) => cell !== null))
  const dropped = dataset.rows.length - kept.length
  if (dropped === 0) {
    return { status: 'value', dataset, dropped: 0 }
  }
  return { status: 'value', dataset: withLog({ ...dataset, rows: kept }, 'drop-missing', `${dropped} rows with missing values removed; reversible with Undo.`), dropped }
}

/** Fill missing values in numeric columns: a constant, or the column mean. */
export function fillMissing(dataset: Dataset, fill: number | 'mean'): DatasetEditOutcome {
  const means = dataset.columns.map((col, c) => {
    if (col.type !== 'numeric') {
      return null
    }
    const values = dataset.rows.map((row) => row[c]).filter((cell): cell is number => typeof cell === 'number')
    return values.length === 0 ? null : values.reduce((sum, x) => sum + x, 0) / values.length
  })
  let filled = 0
  const rows = dataset.rows.map((row) =>
    row.map((cell, c) => {
      if (cell !== null || dataset.columns[c]?.type !== 'numeric') {
        return cell
      }
      const replacement = fill === 'mean' ? means[c] : fill
      if (replacement === null || replacement === undefined || !Number.isFinite(replacement)) {
        return cell
      }
      filled += 1
      return replacement
    }),
  )
  return {
    status: 'value',
    dataset: withLog({ ...dataset, rows }, 'fill-missing', `${filled} missing values filled with ${fill === 'mean' ? 'column means' : fill}; reversible with Undo.`),
    filled,
  }
}

/**
 * Derived column from an expression over stable column ids (`c1`, `c2`,
 * …) through the validated math engine — the same gate as graphing, so
 * no second semantics. `x` is rejected (it would silently bind 0);
 * unknown names fail at compile; non-value cells become missing with
 * a count. The new column is numeric.
 */
export function addDerivedColumn(dataset: Dataset, name: string, source: string): DatasetEditOutcome {
  const trimmed = name.trim()
  if (trimmed === '') {
    return { status: 'error', message: 'The new column needs a name.' }
  }
  if (trimmed.length > 60) {
    return { status: 'error', message: 'Column names hold at most 60 characters.' }
  }
  if (dataset.columns.some((col) => col.name.toLowerCase() === trimmed.toLowerCase())) {
    return { status: 'error', message: `A column is already named "${trimmed}".` }
  }
  if (dataset.columns.length >= MAX_DATASET_COLS) {
    return { status: 'error', message: `Too many columns (maximum is ${MAX_DATASET_COLS}).` }
  }
  if (/\bx\b/.test(source)) {
    return { status: 'error', message: 'Reference columns by id (c1, c2, …); bare x would silently bind 0.' }
  }
  const parameters = dataset.columns.filter((col) => col.type === 'numeric').map((col) => col.id)
  const compiled = compileExpression(source, { parameters, variables: ['x'] })
  if (!compiled.ok) {
    return { status: 'error', message: `Derived expression rejected: ${compiled.error.message} Use column ids (${parameters.join(', ') || 'no numeric columns yet'}).` }
  }
  const id = `c${dataset.columns.length + 1}`
  let missing = 0
  const rows = dataset.rows.map((row) => {
    const scope: Record<string, number> = {}
    for (const col of dataset.columns) {
      const cell = row[dataset.columns.indexOf(col)]
      if (col.type === 'numeric' && typeof cell === 'number') {
        scope[col.id] = cell
      }
    }
    const result = compiled.expression.evaluate(0, scope)
    if (result.kind !== 'value') {
      missing += 1
      return [...row, null]
    }
    return [...row, result.value]
  })
  const columns = [...dataset.columns, { id, name: trimmed, type: 'numeric' as ColumnType }]
  return {
    status: 'value',
    dataset: withLog({ ...dataset, columns, rows }, 'derived-column', `"${trimmed}" (${id}) = ${source}${missing > 0 ? `; ${missing} rows evaluated to missing` : ''}.`),
  }
}
