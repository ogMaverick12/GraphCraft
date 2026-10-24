import { describe, expect, it } from 'vitest'
import {
  createExpressionId,
  createParametricRow,
  createPolarRow,
  createRow,
  cycleRowColor,
  deleteRow,
  displayName,
  duplicateRow,
  exitPiecewise,
  selectionAfterDelete,
  setParameterRange,
  setRowBranches,
  setRowDomain,
  setRowLabel,
  toggleRowVisibility,
  updateParametricSource,
  updateRowSource,
  validateDomain,
} from './model.ts'

describe('expression model', () => {
  it('creates unique stable ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createExpressionId()))
    expect(ids.size).toBe(50)
  })

  it('edits text without touching identity or colour', () => {
    const rows = [createRow('x^2', 0)]
    const id = rows[0]?.id ?? ''
    const edited = updateRowSource(rows, id, 'x^3')
    expect(edited[0]?.id).toBe(id)
    expect(edited[0]).toMatchObject({ source: 'x^3', colorIndex: 0 })
  })

  it('toggles visibility and cycles colours within the palette', () => {
    const rows = [createRow('x', 2)]
    const id = rows[0]?.id ?? ''
    expect(toggleRowVisibility(rows, id)[0]?.visible).toBe(false)
    expect(toggleRowVisibility(toggleRowVisibility(rows, id), id)[0]?.visible).toBe(true)
    expect(cycleRowColor(rows, id, 6)[0]?.colorIndex).toBe(3)
    const last = createRow('x', 5)
    expect(cycleRowColor([last], last.id, 6)[0]?.colorIndex).toBe(0)
    expect(cycleRowColor(rows, 'missing-id', 6)).toEqual(rows) // unknown id: unchanged
  })

  it('duplicates after the original with its own identity', () => {
    const original = createRow('sin(x)', 1)
    const rows = [original]
    const copy = createRow(original.source, 2)
    const next = duplicateRow(rows, original.id, copy)
    expect(next).toHaveLength(2)
    expect(next[1]?.id).not.toBe(original.id)
    expect(next[1]).toMatchObject({ source: 'sin(x)' })
    expect(duplicateRow(rows, 'missing', copy)).toEqual(rows)
  })

  it('moves selection sensibly on delete', () => {
    const rows = [createRow('a', 0), createRow('b', 1), createRow('c', 2)]
    const ids = rows.map((r) => r.id)
    const [a, b, c] = ids as [string, string, string]
    expect(selectionAfterDelete(rows, b, b)).toBe(c)
    expect(selectionAfterDelete(rows, c, c)).toBe(b)
    expect(selectionAfterDelete(rows, a, 'other')).toBe('other')
    expect(selectionAfterDelete([rows[0]], a, a)).toBe(null)
  })

  it('deletes without touching survivors', () => {
    const rows = [createRow('x', 0), createRow('y', 1)]
    const kept = rows[0]?.id ?? ''
    const next = deleteRow(rows, rows[1]?.id ?? '')
    expect(next.map((r) => r.id)).toEqual([kept])
  })

  it('creates parametric and polar rows with kinds and display names', () => {
    const param = createParametricRow('cos(t)', 'sin(t)', 0, 6.2832, 0)
    expect(param.kind).toBe('parametric')
    expect(displayName(param)).toBe('x=cos(t) · y=sin(t)')
    const polar = createPolarRow('2', 0, 6.2832, 1)
    expect(polar.kind).toBe('polar')
    expect(displayName(polar)).toBe('r=2')
    expect(displayName(createRow('', 0))).toBe('expression')
    expect(displayName({ ...createRow('x^2', 0), label: 'P' })).toBe('P')

    const rows = [param]
    expect(updateParametricSource(rows, param.id, 'xSource', 't')[0]).toMatchObject({ xSource: 't' })
    expect(setParameterRange(rows, param.id, { tMin: -1, tMax: 1 })[0]).toMatchObject({ tMin: -1, tMax: 1 })
    // Cartesian-only ops ignore other kinds without corrupting them.
    expect(updateRowSource(rows, param.id, 'x^2')[0]).toEqual(param)
    expect(setRowDomain(rows, param.id, { min: 0, max: 1 })[0]).toEqual(param)
    expect(exitPiecewise(rows, param.id)[0]).toEqual(param)
  })

  it('creates rows with empty label, domain, and branches', () => {
    const row = createRow('x^2', 0)
    expect(row.label).toBe('')
    expect(row.domain).toBe(null)
    expect(row.branches).toBe(null)
    expect(row.defaultSource).toBe('')
  })

  it('validates domains and edits label, domain, and branches', () => {
    expect(validateDomain(null)).toBe(null)
    expect(validateDomain({ min: 0, max: 4 })).toBe(null)
    expect(validateDomain({ min: 4, max: 4 })).toMatch(/min below max/)
    expect(validateDomain({ min: 5, max: 2 })).toMatch(/min below max/)
    expect(validateDomain({ min: Number.NaN, max: 2 })).toMatch(/finite/)

    const rows = [createRow('x', 0)]
    const id = rows[0]?.id ?? ''
    expect(setRowLabel(rows, id, 'Parabola')[0]).toMatchObject({ label: 'Parabola' })
    expect(setRowLabel(rows, id, 'x'.repeat(100))[0]?.label).toHaveLength(60)
    expect(setRowDomain(rows, id, { min: 0, max: 1 })[0]).toMatchObject({ domain: { min: 0, max: 1 } })
    expect(setRowDomain(rows, id, null)[0]).toMatchObject({ domain: null })
    const branches = [{ op: 'lt' as const, value: 0, source: '-x' }]
    const pieced = setRowBranches(rows, id, branches, 'x')
    expect(pieced[0]).toMatchObject({ branches, defaultSource: 'x' })
    expect(setRowBranches(rows, id, null, '')[0]).toMatchObject({ branches: null })
  })

  it('exits piecewise mode atomically, adopting the default formula', () => {
    const rows = [createRow('x', 0)]
    const id = rows[0]?.id ?? ''
    const branches = [{ op: 'lt' as const, value: 0, source: '-x' }]
    const pieced = setRowBranches(rows, id, branches, 'x+1')
    expect(exitPiecewise(pieced, id)[0]).toMatchObject({ source: 'x+1', branches: null, defaultSource: '' })
    // A blank (or whitespace-only) default keeps the previous source.
    const blank = setRowBranches(rows, id, branches, '   ')
    expect(exitPiecewise(blank, id)[0]).toMatchObject({ source: 'x', branches: null, defaultSource: '' })
    // Unknown ids are left alone.
    expect(exitPiecewise(rows, 'missing')).toEqual(rows)
  })
})
