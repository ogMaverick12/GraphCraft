/**
 * CSV parsing (Stage 4 DATA-01): a small RFC-4180-subset parser with
 * explicit choices and hard caps. Quoted fields may contain delimiters,
 * newlines, and `""` escapes; anything else is literal text. Files are
 * untrusted input: nothing is evaluated, linked, or executed — output
 * is plain strings for the validation layer. No dependency.
 */

export type CsvDelimiter = ',' | ';' | '\t'

export interface ParseCsvOptions {
  delimiter: CsvDelimiter
  /** Refuse beyond this many data rows (DATA_MODEL cap). */
  maxRows: number
  /** Refuse beyond this many columns per row. */
  maxCols: number
}

export const MAX_CSV_CHARS = 5_000_000

export interface CsvTable {
  /** Every parsed row, including the header row when present. */
  rows: string[][]
  /** True when maxRows cut the input (caller reports it, never hides it). */
  truncated: boolean
  /** Blank-line rows skipped during parsing (counted, not hidden). */
  skippedEmpty: number
}

export type CsvParseOutcome =
  | { status: 'value'; table: CsvTable }
  | { status: 'error'; kind: 'empty' | 'limit'; message: string }

/** Strip a UTF-8 BOM when present; everything else passes through. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Strict UTF-8 decode of raw bytes. Invalid sequences throw instead of
 * decoding as mojibake — silently changed measurements are worse than
 * a refused file. Pure and directly unit-tested.
 */
export function decodeDataBytes(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('That file is not valid UTF-8 text. Re-save it as UTF-8 CSV and try again.')
  }
}

/**
 * Read a user-picked data file as strict UTF-8. Environments without
 * `arrayBuffer` fall back to a lenient read (documented degradation;
 * all modern browsers take the strict path).
 */
export async function readDataFileText(file: File): Promise<string> {
  if (typeof file.size === 'number' && Number.isFinite(file.size) && file.size > 8 * 1024 * 1024) {
    throw new Error(`That file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; maximum is 8 MB). Split the file first.`)
  }
  if (typeof file.arrayBuffer === 'function') {
    try {
      return decodeDataBytes(await file.arrayBuffer())
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('That file is not valid UTF-8')) {
        throw error
      }
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read that file as text.'))
      }
    }
    reader.onerror = (): void => {
      reject(new Error('Could not read that file.'))
    }
    reader.readAsText(file)
  })
}

function isRowBlank(fields: string[]): boolean {
  return fields.length === 0 || fields.every((field) => field === '')
}

export function parseCsv(source: string, options: ParseCsvOptions): CsvParseOutcome {
  const text = stripBom(source)
  if (text.trim() === '') {
    return { status: 'error', kind: 'empty', message: 'Nothing to import: the text is empty.' }
  }
  if (text.length > MAX_CSV_CHARS) {
    return {
      status: 'error',
      kind: 'limit',
      message: `Input is too large (${(text.length / 1_000_000).toFixed(1)} MB; maximum is ${MAX_CSV_CHARS / 1_000_000} MB). Split the file first.`,
    }
  }
  const rows: string[][] = []
  let skippedEmpty = 0
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let truncated = false

  function endField(): void {
    record.push(field)
    field = ''
  }

  function endRecord(): { stop: boolean } {
    endField()
    if (!isRowBlank(record)) {
      if (record.length > options.maxCols) {
        return { stop: true }
      }
      rows.push(record)
      if (rows.length > options.maxRows) {
        truncated = true
        return { stop: true }
      }
    } else {
      skippedEmpty += 1
    }
    record = []
    return { stop: false }
  }

  let i = 0
  let tooWide = false
  let done = false
  while (i < text.length && !done) {
    const char = text[i] ?? ''
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        field += char
        i += 1
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
    } else if (char === options.delimiter) {
      endField()
      i += 1
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 2
      } else {
        i += 1
      }
      const result = endRecord()
      if (result.stop) {
        if (record.length > options.maxCols) {
          tooWide = true
        }
        done = true
      }
    } else {
      field += char
      i += 1
    }
  }
  if (!done) {
    if (inQuotes) {
      // Unterminated quote: keep the text as one field rather than failing
      // the whole import — the validator flags the ragged shape instead.
      endField()
      rows.push(record)
    } else if (field !== '' || record.length > 0) {
      const result = endRecord()
      if (result.stop && record.length > options.maxCols) {
        tooWide = true
      }
    }
  }
  if (tooWide) {
    return { status: 'error', kind: 'limit', message: `Too many columns (maximum is ${options.maxCols} per row).` }
  }
  if (truncated) {
    return {
      status: 'error',
      kind: 'limit',
      message: `Too many rows (maximum is ${options.maxRows}). Split the input instead of truncating silently.`,
    }
  }
  return { status: 'value', table: { rows, truncated: false, skippedEmpty } }
}
