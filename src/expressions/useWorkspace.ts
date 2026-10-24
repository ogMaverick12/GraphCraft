import { useEffect, useMemo, useRef, useState } from 'react'
import { CURVE_STYLE_COUNT } from '../graph/palette.ts'
import {
  createImplicitRow,
  createInequalityRow,
  createParametricRow,
  createPolarRow,
  createRow,
  cycleRowColor,
  deleteRow,
  duplicateRow,
  exitPiecewise,
  selectionAfterDelete,
  setParameterRange,
  setRowBranches,
  setRowDomain,
  setRowLabel,
  toggleRowVisibility,
  updateImplicitSide,
  updateInequalityOp,
  updateParametricSource,
  updatePolarSource,
  updateRowSource,
  type DomainRestriction,
  type ExpressionRow,
  type InequalityOperator,
  type RowBranch,
} from './model.ts'
import { FULL_TURN } from './templates.ts'

export type { ExpressionRow }

/**
 * Workspace expression state: ordered rows, single selection, and a
 * monotonically increasing colour cursor so colours stay distinct and
 * stable (never derived from position, never reassigned on delete).
 *
 * Actions read a ref mirror of the rows (synced in an effect) and set
 * plain next-values, keeping every updater pure and every action atomic.
 */
export function useWorkspace(initialRows: ExpressionRow[] = []): {
  rows: ExpressionRow[]
  selectedId: string | null
  addRow: (source: string) => string | null
  addParametricRow: () => string
  addPolarRow: () => string
  addImplicitRow: () => string
  addInequalityRow: () => string
  /** Insert a caller-built row (templates): colour cursor and selection follow. */
  addCustomRow: (build: (colorIndex: number) => ExpressionRow) => string
  /** Insert caller-built rows atomically (multi-row templates): colours follow the cursor in order. */
  addCustomRows: (builds: Array<(colorIndex: number) => ExpressionRow>) => string[]
  commitSource: (id: string, source: string) => void
  commitComponentSource: (id: string, field: 'xSource' | 'ySource' | 'polar', source: string) => void
  commitImplicitSide: (id: string, field: 'leftSource' | 'rightSource', source: string) => void
  setInequalityOp: (id: string, op: InequalityOperator) => void
  setParameterRange: (id: string, patch: { tMin?: number; tMax?: number; thetaMin?: number; thetaMax?: number }) => void
  toggleVisibility: (id: string) => void
  cycleColor: (id: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  /** Replace the whole list (validated import): selection and colour cursor follow. */
  replaceAll: (rows: ExpressionRow[]) => void
  setLabel: (id: string, label: string) => void
  setDomain: (id: string, domain: DomainRestriction | null) => void
  setBranches: (id: string, branches: RowBranch[] | null, defaultSource: string) => void
  /** Exit piecewise mode: adopts the default branch as the single formula, in one update. */
  exitPiecewise: (id: string) => void
} {
  const initialSelection = initialRows.length > 0 && initialRows[0] !== undefined ? initialRows[0].id : null
  const initialCursor = initialRows.reduce((max, row) => Math.max(max, row.colorIndex), -1) + 1
  const [rows, setRows] = useState<ExpressionRow[]>(initialRows)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelection)
  const [colorCursor, setColorCursor] = useState(initialCursor)
  const rowsRef = useRef(rows)
  const selectedRef = useRef(selectedId)
  const cursorRef = useRef(colorCursor)

  useEffect(() => {
    rowsRef.current = rows
    selectedRef.current = selectedId
    cursorRef.current = colorCursor
  })

  // Single atomic append shared by one-shot and batch adds: repeated
  // addCustomRow calls in one tick would each read the same stale ref
  // and drop all but the last row, so batches build first, then commit.
  function addBatch(builds: Array<(colorIndex: number) => ExpressionRow>): string[] {
    if (builds.length === 0) {
      return []
    }
    let cursor = cursorRef.current
    const fresh = builds.map((build) => {
      const row = build(cursor % CURVE_STYLE_COUNT)
      cursor += 1
      return row
    })
    setColorCursor(cursor)
    setRows([...rowsRef.current, ...fresh])
    const last = fresh[fresh.length - 1]
    if (last !== undefined) {
      setSelectedId(last.id)
    }
    return fresh.map((row) => row.id)
  }

  const actions = useMemo(
    () => ({
      addRow: (source: string): string | null => {
        const text = source.trim()
        if (text === '') {
          return null // Empty adds are no-ops: Enter on an empty box creates nothing.
        }
        const row = createRow(text, cursorRef.current % CURVE_STYLE_COUNT)
        setColorCursor(cursorRef.current + 1)
        setRows([...rowsRef.current, row])
        setSelectedId(row.id)
        return row.id
      },
      addParametricRow: (): string => {
        const row = createParametricRow('cos(t)', 'sin(t)', 0, FULL_TURN, cursorRef.current % CURVE_STYLE_COUNT)
        setColorCursor(cursorRef.current + 1)
        setRows([...rowsRef.current, row])
        setSelectedId(row.id)
        return row.id
      },
      addPolarRow: (): string => {
        const row = createPolarRow('2*cos(3*theta)', 0, FULL_TURN, cursorRef.current % CURVE_STYLE_COUNT)
        setColorCursor(cursorRef.current + 1)
        setRows([...rowsRef.current, row])
        setSelectedId(row.id)
        return row.id
      },
      addImplicitRow: (): string => {
        const row = createImplicitRow('x^2 + y^2', '1', cursorRef.current % CURVE_STYLE_COUNT)
        setColorCursor(cursorRef.current + 1)
        setRows([...rowsRef.current, row])
        setSelectedId(row.id)
        return row.id
      },
      addInequalityRow: (): string => {
        const row = createInequalityRow('y', '<=', 'x^2', cursorRef.current % CURVE_STYLE_COUNT)
        setColorCursor(cursorRef.current + 1)
        setRows([...rowsRef.current, row])
        setSelectedId(row.id)
        return row.id
      },
      addCustomRow: (build: (colorIndex: number) => ExpressionRow): string => {
        const ids = addBatch([build])
        return ids[0] ?? ''
      },
      addCustomRows: (builds: Array<(colorIndex: number) => ExpressionRow>): string[] => addBatch(builds),
      commitSource: (id: string, source: string): void => {
        setRows(updateRowSource(rowsRef.current, id, source))
      },
      commitComponentSource: (id: string, field: 'xSource' | 'ySource' | 'polar', source: string): void => {
        if (field === 'polar') {
          setRows(updatePolarSource(rowsRef.current, id, source))
        } else {
          setRows(updateParametricSource(rowsRef.current, id, field, source))
        }
      },
      commitImplicitSide: (id: string, field: 'leftSource' | 'rightSource', source: string): void => {
        setRows(updateImplicitSide(rowsRef.current, id, field, source))
      },
      setInequalityOp: (id: string, op: InequalityOperator): void => {
        setRows(updateInequalityOp(rowsRef.current, id, op))
      },
      setParameterRange: (id: string, patch: { tMin?: number; tMax?: number; thetaMin?: number; thetaMax?: number }): void => {
        setRows(setParameterRange(rowsRef.current, id, patch))
      },
      toggleVisibility: (id: string): void => {
        setRows(toggleRowVisibility(rowsRef.current, id))
      },
      cycleColor: (id: string): void => {
        setRows(cycleRowColor(rowsRef.current, id, CURVE_STYLE_COUNT))
      },
      duplicate: (id: string): void => {
        const current = rowsRef.current
        const original = current.find((row) => row.id === id)
        if (original === undefined) {
          return
        }
        const colorIndex = cursorRef.current % CURVE_STYLE_COUNT
        let copy: ExpressionRow
        if (original.kind === 'parametric') {
          copy = { ...createParametricRow(original.xSource, original.ySource, original.tMin, original.tMax, colorIndex), label: original.label, visible: original.visible }
        } else if (original.kind === 'polar') {
          copy = { ...createPolarRow(original.source, original.thetaMin, original.thetaMax, colorIndex), label: original.label, visible: original.visible }
        } else if (original.kind === 'implicit') {
          copy = { ...createImplicitRow(original.leftSource, original.rightSource, colorIndex), label: original.label, visible: original.visible }
        } else if (original.kind === 'inequality') {
          copy = { ...createInequalityRow(original.leftSource, original.op, original.rightSource, colorIndex), label: original.label, visible: original.visible }
        } else {
          const blank = createRow(original.source, colorIndex)
          copy = {
            ...blank,
            label: original.label,
            domain: original.domain === null ? null : { min: original.domain.min, max: original.domain.max },
            branches: original.branches === null ? null : original.branches.map((branch) => ({ ...branch })),
            defaultSource: original.defaultSource,
            visible: original.visible,
          }
        }
        setColorCursor(cursorRef.current + 1)
        setRows(duplicateRow(current, id, copy))
        setSelectedId(copy.id)
      },
      remove: (id: string): void => {
        const current = rowsRef.current
        setSelectedId(selectionAfterDelete(current, id, selectedRef.current))
        setRows(deleteRow(current, id))
      },
      select: (id: string | null): void => {
        setSelectedId(id)
      },
      setLabel: (id: string, label: string): void => {
        setRows(setRowLabel(rowsRef.current, id, label))
      },
      setDomain: (id: string, domain: DomainRestriction | null): void => {
        setRows(setRowDomain(rowsRef.current, id, domain))
      },
      setBranches: (id: string, branches: RowBranch[] | null, defaultSource: string): void => {
        setRows(setRowBranches(rowsRef.current, id, branches, defaultSource))
      },
      exitPiecewise: (id: string): void => {
        setRows(exitPiecewise(rowsRef.current, id))
      },
      replaceAll: (next: ExpressionRow[]): void => {
        setRows(next)
        setSelectedId(next.length > 0 && next[0] !== undefined ? next[0].id : null)
        const maxColor = next.reduce((max, row) => Math.max(max, row.colorIndex), -1)
        setColorCursor(maxColor + 1)
      },
    }),
    [],
  )

  return { rows, selectedId, ...actions }
}
