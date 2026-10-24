import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.ts'
import {
  csvField,
  datasetToCsvTable,
  fitSummaryToCsvTable,
  plottedPointsToCsvTable,
  residualsToCsvTable,
  tablesToCsv,
} from './csvExport.ts'
import type { Dataset } from './dataset.ts'

function dataset(): Dataset {
  return {
    id: 'ds-test',
    name: 'Test',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' },
      { id: 'c2', name: 'note', type: 'categorical' },
    ],
    rows: [
      [1, 'plain'],
      [2, null],
      [3, '=2+2'],
    ],
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

describe('csv formula safety and quoting', () => {
  it('prefixes spreadsheet triggers with a single quote', () => {
    expect(csvField('=2+2')).toBe("'=2+2")
    expect(csvField('+7')).toBe("'+7")
    expect(csvField('-3')).toBe("'-3")
    expect(csvField('@user')).toBe("'@user")
    expect(csvField('2+2')).toBe('2+2')
    expect(csvField(' mail@example.com')).toBe(' mail@example.com')
  })

  it('quotes delimiters, quotes, and newlines with "" escapes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
    expect(csvField("=HYPERLINK('x')")).toBe("'=HYPERLINK('x')")
    expect(csvField('=a,"b"')).toBe("\"'=a,\"\"b\"\"\"")
  })

  it('serializes numbers at full precision and missing as empty', () => {
    expect(csvField(0.1 + 0.2)).toBe(String(0.1 + 0.2))
    expect(csvField(null)).toBe('')
  })

  it('keeps negative numeric cells bare so they stay numbers', () => {
    expect(csvField(-3)).toBe('-3')
    expect(csvField(-0.5)).toBe('-0.5')
    // Text stays guarded: a leading sign in a string can start a formula.
    expect(csvField('-3')).toBe("'-3")
  })

  it('round-trips negative numbers through our own parser as numbers', () => {
    const csv = tablesToCsv(residualsToCsvTable([{ x: -1, observed: -2.5, fitted: -2, residual: -0.5 }]))
    const parsed = parseCsv(csv, { delimiter: ',', maxRows: 100, maxCols: 10 })
    expect(parsed.status).toBe('value')
    if (parsed.status === 'value') {
      expect(parsed.table.rows[1]?.[0]).toBe('-1')
      expect(Number(parsed.table.rows[1]?.[1])).toBe(-2.5)
      expect(Number(parsed.table.rows[1]?.[3])).toBe(-0.5)
    }
  })

  it('round-trips through our own parser', () => {
    const csv = tablesToCsv({ headers: ['a', 'b'], rows: [['x,y', 'say "hi"'], ['=2+2', null]] })
    const parsed = parseCsv(csv, { delimiter: ',', maxRows: 100, maxCols: 10 })
    expect(parsed.status).toBe('value')
    if (parsed.status === 'value') {
      expect(parsed.table.rows[1]).toEqual(['x,y', 'say "hi"'])
      // Formula guard survives as text (leading quote preserved by the parser).
      expect(parsed.table.rows[2]?.[0]).toBe("'=2+2")
      expect(parsed.table.rows[2]?.[1]).toBe('')
    }
  })
})

describe('csv table selection', () => {
  it('exports the dataset with names and empty missing cells', () => {
    const csv = tablesToCsv(datasetToCsvTable(dataset()))
    expect(csv.split('\r\n')[0]).toBe('x,note')
    expect(csv).toContain('plain')
    expect(csv).toContain("'=2+2")
    expect(csv).toContain('2,\r\n')
  })

  it('exports plotted points for visible series only (caller-filtered)', () => {
    const csv = tablesToCsv(plottedPointsToCsvTable([{ label: 'A', points: [{ x: 1, y: 2, label: '' }] }]))
    expect(csv).toContain('series,x,x_label,y')
    expect(csv).toContain('A,1,1,2')
  })

  it('exports residuals and fit summaries with full-precision numbers', () => {
    const residuals = tablesToCsv(residualsToCsvTable([{ x: 0, observed: 0.1 + 0.2, fitted: 0.3, residual: 1e-17 }]))
    expect(residuals).toContain(String(0.1 + 0.2))
    const summary = tablesToCsv(
      fitSummaryToCsvTable({
        equation: 'y = 1 + 2·x',
        model: 'line',
        n: 4,
        dof: 2,
        skipped: 1,
        rSquared: 0.9983367983367983,
        residualStd: 0.12649110640673472,
        rmse: Math.sqrt(0.032 / 4),
        mae: 0.1,
        minResidual: -0.12,
        maxResidual: 0.12,
        methodNote: 'Ordinary least squares via Householder QR (no normal equations).',
        warnings: [],
      }),
    )
    expect(summary).toContain('0.9983367983367983')
    expect(summary).toContain('Householder QR')
    expect(summary).toContain('rmse')
    expect(summary).toContain('mae')
  })
})
