import { describe, expect, it } from 'vitest'
import { MAX_CSV_CHARS, parseCsv } from './csv.ts'
import {
  analyzeTable,
  commitAnalysis,
  guessHasHeader,
  parseNumeric,
  tableFromGrid,
  type ImportSpec,
} from './dataset.ts'

const OPTS = { delimiter: ',' as const, maxRows: 10_000, maxCols: 32 }

function spec(overrides: Partial<ImportSpec> = {}): ImportSpec {
  return { name: 'Test', decimal: '.', hasHeader: null, ...overrides }
}

describe('csv parser', () => {
  it('parses quoted commas, quotes, and embedded newlines', () => {
    const outcome = parseCsv('a,b\n"1,2",3\n"x""y""",4\n"line1\nline2",5', OPTS)
    expect(outcome.status).toBe('value')
    if (outcome.status !== 'value') {
      throw new Error('Expected a table')
    }
    expect(outcome.table.rows).toEqual([['a', 'b'], ['1,2', '3'], ['x"y"', '4'], ['line1\nline2', '5']])
  })

  it('handles CRLF, empty rows, and UTF-8 with BOM', () => {
    // Two interior blank lines count; the conventional trailing newline does not.
    const outcome = parseCsv('﻿a,b\r\n1,2\r\n\r\n\r\n3,4\r\n', OPTS)
    expect(outcome.status).toBe('value')
    if (outcome.status !== 'value') {
      throw new Error('Expected a table')
    }
    expect(outcome.table.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
    expect(outcome.table.skippedEmpty).toBe(2)
  })

  it('supports semicolon and tab delimiters', () => {
    const semi = parseCsv('a;b\n1;2', { ...OPTS, delimiter: ';' })
    expect(semi.status === 'value' && semi.table.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    const tab = parseCsv('a\tb\n1\t2', { ...OPTS, delimiter: '\t' })
    expect(tab.status === 'value' && tab.table.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('refuses empty input, oversize input, and over-wide rows', () => {
    expect(parseCsv('   ', OPTS)).toMatchObject({ status: 'error', kind: 'empty' })
    expect(parseCsv('x'.repeat(MAX_CSV_CHARS + 1), OPTS)).toMatchObject({ status: 'error', kind: 'limit' })
    expect(parseCsv(Array.from({ length: 40 }, (_, i) => `c${i}`).join(','), OPTS)).toMatchObject({ status: 'error', kind: 'limit' })
  })

  it('refuses row floods instead of truncating silently', () => {
    const big = Array.from({ length: 11 }, () => '1,2').join('\n')
    expect(parseCsv(big, { ...OPTS, maxRows: 10 })).toMatchObject({ status: 'error', kind: 'limit' })
  })
})

describe('numeric parsing with decimal rules', () => {
  it('parses point decimals and scientific notation', () => {
    expect(parseNumeric('3.14', '.')).toBe(3.14)
    expect(parseNumeric('1e3', '.')).toBe(1000)
    expect(parseNumeric('abc', '.')).toBe(null)
    expect(parseNumeric('', '.')).toBe(null)
    expect(parseNumeric('Infinity', '.')).toBe(null)
    expect(parseNumeric('NaN', '.')).toBe(null)
  })

  it('parses comma decimals with strict thousands handling', () => {
    expect(parseNumeric('3,14', ',')).toBe(3.14)
    expect(parseNumeric('1.234,56', ',')).toBe(1234.56)
    expect(parseNumeric('1.23,45', ',')).toBe(null)
    expect(parseNumeric('12,34,56', ',')).toBe(null)
  })
})

describe('header detection and validation', () => {
  it('guesses headers only for text-first tables with later numbers', () => {
    expect(guessHasHeader([['x', 'y'], ['1', '2']], '.')).toBe(true)
    expect(guessHasHeader([['1', '2'], ['3', '4']], '.')).toBe(false)
    expect(guessHasHeader([['a', 'b'], ['c', 'd']], '.')).toBe(false)
    expect(guessHasHeader([['x']], '.')).toBe(false)
  })

  it('suffixes duplicate and blank headers with issues', () => {
    const table = { rows: [['a', 'a', ''], ['1', '2', '3']], truncated: false, skippedEmpty: 0 }
    const analysis = analyzeTable(table, spec({ hasHeader: true }))
    expect(analysis.headers).toEqual(['a', 'a (2)', 'Column 3'])
    expect(analysis.issues.some((issue) => issue.kind === 'duplicate-header')).toBe(true)
    expect(analysis.issues.some((issue) => issue.kind === 'empty-header')).toBe(true)
  })

  it('pads short rows, truncates long rows, and counts both', () => {
    const table = { rows: [['a', 'b'], ['1'], ['2', '3', '4']], truncated: false, skippedEmpty: 0 }
    const analysis = analyzeTable(table, spec({ hasHeader: true }))
    expect(analysis.committed).toEqual([
      [1, null],
      [2, 3],
    ])
    expect(analysis.counts.shortPadded).toBe(1)
    expect(analysis.counts.longTruncated).toBe(1)
  })

  it('keeps malformed numbers as text and types mixed columns honestly', () => {
    const table = { rows: [['x'], ['1.5'], ['oops'], ['']], truncated: false, skippedEmpty: 0 }
    const analysis = analyzeTable(table, spec({ hasHeader: true }))
    expect(analysis.committed).toEqual([[1.5], ['oops'], [null]])
    expect(analysis.columnTypes).toEqual(['categorical'])
    expect(analysis.issues.some((issue) => issue.kind === 'malformed-number')).toBe(true)
    expect(analysis.issues.some((issue) => issue.kind === 'mixed-column')).toBe(true)
  })

  it('types clean numeric columns as numeric with null gaps', () => {
    const table = { rows: [['x', 'label'], ['1', 'a'], ['', 'b']], truncated: false, skippedEmpty: 0 }
    const analysis = analyzeTable(table, spec({ hasHeader: true }))
    expect(analysis.columnTypes).toEqual(['numeric', 'categorical'])
    expect(analysis.committed).toEqual([
      [1, 'a'],
      [null, 'b'],
    ])
  })

  it('commits with stable ids, provenance, and a cleaning log', () => {
    const table = { rows: [['x'], ['1'], ['2']], truncated: false, skippedEmpty: 1 }
    const analysis = analyzeTable(table, spec({ name: 'Run 1', hasHeader: true }))
    const outcome = commitAnalysis(analysis, spec({ name: 'Run 1', hasHeader: true }), { kind: 'paste', importedAt: '2026-10-15T00:00:00.000Z' }, 1)
    expect(outcome.status).toBe('value')
    if (outcome.status !== 'value') {
      throw new Error('Expected a dataset')
    }
    expect(outcome.dataset.columns).toEqual([{ id: 'c1', name: 'x', type: 'numeric' }])
    expect(outcome.dataset.provenance).toMatchObject({ kind: 'paste', skippedEmpty: 1 })
  })

  it('refuses empty and over-wide commits without touching anything', () => {
    const empty = analyzeTable({ rows: [], truncated: false, skippedEmpty: 0 }, spec())
    expect(commitAnalysis(empty, spec(), { kind: 'paste', importedAt: 'x' }, 0)).toMatchObject({ status: 'error', kind: 'empty' })
    const wide = analyzeTable({ rows: [Array.from({ length: 40 }, (_, i) => `c${i}`)], truncated: false, skippedEmpty: 0 }, spec())
    expect(commitAnalysis(wide, spec(), { kind: 'paste', importedAt: 'x' }, 0).status).toBe('error')
  })

  it('builds tables from manual grids, skipping blank rows with a count', () => {    const table = tableFromGrid([
      ['1', 'a'],
      ['  ', ' '],
      ['2', 'b'],
    ])
    expect(table.rows).toEqual([
      ['1', 'a'],
      ['2', 'b'],
    ])
    expect(table.skippedEmpty).toBe(1)
  })

  it('forces numeric types by clearing text to missing, with counts', () => {
    const table = { rows: [['x'], ['1'], ['oops'], ['3']], truncated: false, skippedEmpty: 0 }
    const analysis = analyzeTable(table, spec({ hasHeader: true, typeOverrides: { 0: 'numeric' } }))
    expect(analysis.columnTypes).toEqual(['numeric'])
    expect(analysis.committed).toEqual([[1], [null], [3]])
    expect(analysis.counts.overrideCleared).toBe(1)
    expect(analysis.issues.some((issue) => issue.kind === 'type-override')).toBe(true)
    const outcome = commitAnalysis(analysis, spec({ name: 'T', hasHeader: true, typeOverrides: { 0: 'numeric' } }), { kind: 'paste', importedAt: 'x' }, 0)
    expect(outcome.status).toBe('value')
    if (outcome.status === 'value') {
      expect(outcome.dataset.cleaningLog.some((entry) => entry.action === 'type-override')).toBe(true)
    }
  })

  it('forces categorical types by relabelling without touching values', () => {
    const table = { rows: [['zip'], ['02139'], ['10001']], truncated: false, skippedEmpty: 0 }
    const plain = analyzeTable(table, spec({ hasHeader: true }))
    expect(plain.columnTypes).toEqual(['numeric'])
    const forced = analyzeTable(table, spec({ hasHeader: true, typeOverrides: { 0: 'categorical' } }))
    expect(forced.columnTypes).toEqual(['categorical'])
    expect(forced.committed).toEqual([[2139], [10001]])
    expect(forced.counts.overrideCleared).toBe(0)
  })
})

describe('strict data file reading', () => {
  it('decodes valid UTF-8 bytes and refuses invalid sequences', async () => {
    const { decodeDataBytes, readDataFileText } = await import('./csv.ts')
    expect(decodeDataBytes(new Uint8Array([0x78, 0x2c, 0x79, 0x0a]).buffer as ArrayBuffer)).toBe('x,y\n')
    expect(() => decodeDataBytes(new Uint8Array([0xff, 0xfe, 0x41]).buffer as ArrayBuffer)).toThrow(/UTF-8/)
    const good = new File(['x,y\n1,2'], 'good.csv', { type: 'text/csv' })
    await expect(readDataFileText(good)).resolves.toBe('x,y\n1,2')
  })

  it('refuses oversized files before decoding bytes', async () => {
    const { readDataFileText } = await import('./csv.ts')
    const big = new File(['x,y\n1,2'], 'big.csv', { type: 'text/csv' })
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 })
    await expect(readDataFileText(big)).rejects.toThrow(/too large/)
  })
})
