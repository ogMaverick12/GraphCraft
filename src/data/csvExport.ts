import type { Dataset } from './dataset.ts'

/**
 * CSV export (Data Lab): RFC-4180 serialization for explicitly selected
 * tables only (dataset, plotted points, residuals, fit summary). Nothing
 * is ever evaluated, linked, or executed — output is plain text. Formula
 * injection is guarded: any TEXT field whose first character is `=`, `+`,
 * `-`, or `@` (the spreadsheet trigger set) is prefixed with a single
 * quote so Excel/Sheets/Calc render it as text. Numeric cells stay bare:
 * `String(value)` of a number can only produce digits, a sign, and an
 * exponent — no payload — and stripping the sign would turn negative
 * values into text for spreadsheets and our own re-import. Quoting follows the
 * `csv.ts` parser subset (delimiter, `"`, CR/LF trigger quotes with
 * `""` escapes), so our own exports re-import cleanly. Missing (`null`)
 * serializes as an empty field — the missing policy travels in the
 * project bundle, not in a magic value. Pure TypeScript: no React, no
 * DOM, no network — user data never leaves the machine through here.
 */

export type CsvExportCell = number | string | null

export interface CsvExportTable {
  headers: string[]
  rows: CsvExportCell[][]
}

/** Spreadsheet formula trigger characters (first-character position). */
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@'])

/**
 * Guard one text field against formula injection, then quote per the
 * importer's RFC-4180 subset. Numbers serialize at full precision via
 * `String(value)` — never the rounded display text.
 */
export function csvField(cell: CsvExportCell): string {
  let text = cell === null ? '' : typeof cell === 'number' ? String(cell) : cell
  if (typeof cell === 'string' && text !== '' && FORMULA_TRIGGERS.has(text[0] ?? '')) {
    text = `'${text}`
  }
  if (text.includes(',') || text.includes('"') || text.includes('\r') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Serialize headers + rows with CRLF records (our parser accepts CRLF and LF). */
export function tablesToCsv(table: CsvExportTable): string {
  const lines = [table.headers.map(csvField).join(',')]
  for (const row of table.rows) {
    lines.push(row.map(csvField).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/** Full dataset table: column names as headers, missing as empty fields. */
export function datasetToCsvTable(dataset: Dataset): CsvExportTable {
  return {
    headers: dataset.columns.map((col) => col.name),
    rows: dataset.rows.map((row) => dataset.columns.map((_, c) => (row[c] ?? null) as CsvExportCell)),
  }
}

/** Currently plotted points (visible series only — mirrors the figure). */
export function plottedPointsToCsvTable(series: Array<{ label: string; points: Array<{ x: number; y: number; label: string }> }>): CsvExportTable {
  const rows: CsvExportCell[][] = []
  for (const s of series) {
    for (const p of s.points) {
      rows.push([s.label, p.x, p.label !== '' ? p.label : p.x, p.y])
    }
  }
  return { headers: ['series', 'x', 'x_label', 'y'], rows }
}

export interface ResidualRow {
  x: number
  observed: number
  fitted: number
  residual: number
}

/** Residual table matching the FitPanel residual view. */
export function residualsToCsvTable(rows: ResidualRow[]): CsvExportTable {
  return {
    headers: ['x', 'observed', 'fitted', 'residual'],
    rows: rows.map((row) => [row.x, row.observed, row.fitted, row.residual]),
  }
}

export interface FitSummaryInput {
  equation: string
  model: string
  n: number
  dof: number
  skipped: number
  rSquared: number | null
  residualStd: number
  rmse: number
  mae: number
  minResidual: number
  maxResidual: number
  methodNote: string
  warnings: string[]
}

/** Fit summary as key/value rows (full-precision numbers as passed in). */
export function fitSummaryToCsvTable(summary: FitSummaryInput): CsvExportTable {
  const rows: CsvExportCell[][] = [
    ['equation', summary.equation],
    ['model', summary.model],
    ['n', summary.n],
    ['dof', summary.dof],
    ['skipped', summary.skipped],
    ['r_squared', summary.rSquared === null ? 'undefined (constant Y)' : summary.rSquared],
    ['residual_std', summary.residualStd],
    ['rmse', summary.rmse],
    ['mae', summary.mae],
    ['min_residual', summary.minResidual],
    ['max_residual', summary.maxResidual],
    ['method', summary.methodNote],
  ]
  summary.warnings.forEach((warning, i) => {
    rows.push([`warning_${i + 1}`, warning])
  })
  return { headers: ['key', 'value'], rows }
}
