import { describe, expect, it } from 'vitest'
import {
  addDerivedColumn,
  deleteRows,
  dropRowsWithMissing,
  editCell,
  fillMissing,
  renameColumn,
  retagColumnType,
  setColumnUnit,
  type Dataset,
} from './dataset.ts'

function sample(): Dataset {
  return {
    id: 'ds-1',
    name: 'Sample',
    columns: [
      { id: 'c1', name: 'a', type: 'numeric' },
      { id: 'c2', name: 'b', type: 'numeric' },
      { id: 'c3', name: 'g', type: 'categorical' },
    ],
    rows: [
      [1, 10, 'x'],
      [2, null, 'y'],
      [3, 30, 'x'],
    ],
    provenance: { kind: 'manual', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

describe('column metadata edits', () => {
  it('renames with uniqueness validation', () => {
    const renamed = renameColumn(sample(), 'c1', 'alpha')
    expect(renamed.status).toBe('value')
    if (renamed.status === 'value') {
      expect(renamed.dataset.columns[0]?.name).toBe('alpha')
      expect(renamed.dataset.cleaningLog).toHaveLength(1)
    }
    expect(renameColumn(sample(), 'c1', 'B')).toMatchObject({ status: 'error' })
    expect(renameColumn(sample(), 'c1', '  ')).toMatchObject({ status: 'error' })
    expect(renameColumn(sample(), 'c9', 'z')).toMatchObject({ status: 'error' })
  })

  it('retags types with the override contract and logs it', () => {
    const mixed: Dataset = {
      ...sample(),
      columns: [
        { id: 'c1', name: 'a', type: 'categorical' },
        { id: 'c2', name: 'b', type: 'categorical' },
      ],
      rows: [
        [1, 'oops'],
        [2, 'ok'],
      ],
    }
    const forced = retagColumnType(mixed, 'c2', 'numeric')
    expect(forced.status).toBe('value')
    if (forced.status === 'value') {
      expect(forced.dataset.columns[1]?.type).toBe('numeric')
      expect(forced.dataset.rows).toEqual([
        [1, null],
        [2, null],
      ])
      expect(forced.cleared).toBe(2)
    }
    const demoted = retagColumnType(sample(), 'c1', 'categorical')
    expect(demoted.status).toBe('value')
    if (demoted.status === 'value') {
      expect(demoted.dataset.rows[0]).toEqual([1, 10, 'x'])
    }
  })

  it('attaches unit labels', () => {
    const withUnit = setColumnUnit(sample(), 'c1', 'm')
    expect(withUnit.status).toBe('value')
    if (withUnit.status === 'value') {
      expect(withUnit.dataset.columns[0]).toMatchObject({ name: 'a', unit: 'm' })
    }
    const cleared = setColumnUnit(sample(), 'c1', null)
    expect(cleared.status).toBe('value')
  })
})

describe('row edits and missing-value strategies', () => {
  it('edits cells with type safety', () => {
    const edited = editCell(sample(), 0, 0, '5', '.')
    expect(edited.status).toBe('value')
    if (edited.status === 'value') {
      expect(edited.dataset.rows[0]).toEqual([5, 10, 'x'])
    }
    expect(editCell(sample(), 0, 0, 'oops', '.')).toMatchObject({ status: 'error' })
    const cleared = editCell(sample(), 0, 1, '  ', '.')
    expect(cleared.status === 'value' && cleared.dataset.rows[0]).toEqual([1, null, 'x'])
    const text = editCell(sample(), 0, 2, 'zzz', '.')
    expect(text.status === 'value' && text.dataset.rows[0]).toEqual([1, 10, 'zzz'])
  })

  it('deletes selected rows with a log entry', () => {
    const outcome = deleteRows(sample(), [0, 2])
    expect(outcome.status).toBe('value')
    if (outcome.status === 'value') {
      expect(outcome.dataset.rows).toEqual([[2, null, 'y']])
      expect(outcome.dropped).toBe(2)
    }
    expect(deleteRows(sample(), [])).toMatchObject({ status: 'error' })
  })

  it('drops missing rows and fills with constants or means', () => {
    const dropped = dropRowsWithMissing(sample())
    expect(dropped.status).toBe('value')
    if (dropped.status === 'value') {
      expect(dropped.dataset.rows).toEqual([
        [1, 10, 'x'],
        [3, 30, 'x'],
      ])
      expect(dropped.dropped).toBe(1)
    }
    const filled = fillMissing(sample(), 0)
    expect(filled.status).toBe('value')
    if (filled.status === 'value') {
      expect(filled.dataset.rows[1]).toEqual([2, 0, 'y'])
      expect(filled.filled).toBe(1)
    }
    const meanded = fillMissing(sample(), 'mean')
    expect(meanded.status).toBe('value')
    if (meanded.status === 'value') {
      expect(meanded.dataset.rows[1]).toEqual([2, 20, 'y'])
    }
  })
})

describe('derived columns', () => {
  it('computes from stable ids through the gated engine', () => {
    const outcome = addDerivedColumn(sample(), 'total', 'c1*2+c2')
    expect(outcome.status).toBe('value')
    if (outcome.status !== 'value') {
      throw new Error('Expected a derived column')
    }
    expect(outcome.dataset.columns[3]).toMatchObject({ id: 'c4', name: 'total', type: 'numeric' })
    expect(outcome.dataset.rows.map((row) => row[3])).toEqual([12, null, 36])
  })

  it('refuses x, unknown names, and duplicates honestly', () => {
    expect(addDerivedColumn(sample(), 't', 'x+1')).toMatchObject({ status: 'error' })
    expect(addDerivedColumn(sample(), 't', 'zzz+1')).toMatchObject({ status: 'error' })
    expect(addDerivedColumn(sample(), 'a', 'c1')).toMatchObject({ status: 'error' })
    expect(addDerivedColumn(sample(), '', 'c1')).toMatchObject({ status: 'error' })
  })
})
