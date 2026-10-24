/**
 * Expression-list domain model (workspace integration).
 * Typed data + pure operations. No React, no DOM — UI state lives in hooks.
 */

export interface DomainRestriction {
  readonly min: number
  readonly max: number
}

export type BranchOperator = 'lt' | 'le' | 'gt' | 'ge'

export interface RowBranch {
  readonly op: BranchOperator
  readonly value: number
  readonly source: string
}

export interface ExpressionRowBase {
  /** Stable identity, independent of text. Never changes across edits. */
  readonly id: string
  readonly visible: boolean
  readonly colorIndex: number
  /** Optional display label, distinct from source text. Empty means none. */
  readonly label: string
}

export interface CartesianRow extends ExpressionRowBase {
  readonly kind: 'cartesian'
  /** Committed source text (debounced from the editor draft). */
  readonly source: string
  /** Optional x-interval restriction. Null means the full view range. */
  readonly domain: DomainRestriction | null
  /**
   * Structured piecewise branches, tried first-match in order.
   * Null means the row is a single formula (`source`).
   */
  readonly branches: RowBranch[] | null
  /** Default expression for unmatched x. Only used with `branches`. */
  readonly defaultSource: string
}

export interface ParametricRow extends ExpressionRowBase {
  readonly kind: 'parametric'
  readonly xSource: string
  readonly ySource: string
  readonly tMin: number
  readonly tMax: number
}

export interface PolarRow extends ExpressionRowBase {
  readonly kind: 'polar'
  readonly source: string
  readonly thetaMin: number
  readonly thetaMax: number
}

export interface ImplicitRow extends ExpressionRowBase {
  readonly kind: 'implicit'
  readonly leftSource: string
  readonly rightSource: string
}

export type InequalityOperator = '<=' | '>=' | '<' | '>'

export interface InequalityRow extends ExpressionRowBase {
  readonly kind: 'inequality'
  readonly leftSource: string
  readonly rightSource: string
  readonly op: InequalityOperator
}

/** Any plottable row. Only cartesian rows carry source/domain/branches. */
export type ExpressionRow = CartesianRow | ParametricRow | PolarRow | ImplicitRow | InequalityRow

/** Human label: explicit label, else a kind-appropriate summary. */
export function displayName(row: ExpressionRow): string {
  if (row.label !== '') {
    return row.label
  }
  switch (row.kind) {
    case 'cartesian':
      return row.source === '' ? 'expression' : row.source
    case 'parametric':
      return `x=${row.xSource} · y=${row.ySource}`
    case 'polar':
      return `r=${row.source}`
    case 'implicit':
      return `${row.leftSource} = ${row.rightSource}`
    case 'inequality':
      return `${row.leftSource} ${row.op.replace('<=', '≤').replace('>=', '≥')} ${row.rightSource}`
  }
}

let fallbackCounter = 0

/** Stable unique row id. Prefers crypto randomness, degrades deterministically. */
export function createExpressionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the counter.
  }
  fallbackCounter += 1
  return `expr-${Date.now().toString(36)}-${fallbackCounter}`
}

export function createRow(source: string, colorIndex: number): CartesianRow {
  return { kind: 'cartesian', id: createExpressionId(), source, visible: true, colorIndex, label: '', domain: null, branches: null, defaultSource: '' }
}

export function createParametricRow(xSource: string, ySource: string, tMin: number, tMax: number, colorIndex: number): ParametricRow {
  return { kind: 'parametric', id: createExpressionId(), xSource, ySource, tMin, tMax, visible: true, colorIndex, label: '' }
}

export function createPolarRow(source: string, thetaMin: number, thetaMax: number, colorIndex: number): PolarRow {
  return { kind: 'polar', id: createExpressionId(), source, thetaMin, thetaMax, visible: true, colorIndex, label: '' }
}

export function createImplicitRow(leftSource: string, rightSource: string, colorIndex: number): ImplicitRow {
  return { kind: 'implicit', id: createExpressionId(), leftSource, rightSource, visible: true, colorIndex, label: '' }
}

export function createInequalityRow(leftSource: string, op: InequalityOperator, rightSource: string, colorIndex: number): InequalityRow {
  return { kind: 'inequality', id: createExpressionId(), leftSource, op, rightSource, visible: true, colorIndex, label: '' }
}

export function updateRowSource(rows: ExpressionRow[], id: string, source: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'cartesian' ? { ...row, source } : row))
}

export function updateParametricSource(rows: ExpressionRow[], id: string, field: 'xSource' | 'ySource', source: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'parametric' ? { ...row, [field]: source } : row))
}

export function updatePolarSource(rows: ExpressionRow[], id: string, source: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'polar' ? { ...row, source } : row))
}

export function updateImplicitSide(rows: ExpressionRow[], id: string, field: 'leftSource' | 'rightSource', source: string): ExpressionRow[] {
  return rows.map((row) =>
    row.id === id && (row.kind === 'implicit' || row.kind === 'inequality') ? { ...row, [field]: source } : row,
  )
}

export function updateInequalityOp(rows: ExpressionRow[], id: string, op: InequalityOperator): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'inequality' ? { ...row, op } : row))
}

export function setParameterRange(
  rows: ExpressionRow[],
  id: string,
  patch: { tMin?: number; tMax?: number; thetaMin?: number; thetaMax?: number },
): ExpressionRow[] {
  return rows.map((row) => {
    if (row.id !== id) {
      return row
    }
    if (row.kind === 'parametric') {
      return { ...row, tMin: patch.tMin ?? row.tMin, tMax: patch.tMax ?? row.tMax }
    }
    if (row.kind === 'polar') {
      return { ...row, thetaMin: patch.thetaMin ?? row.thetaMin, thetaMax: patch.thetaMax ?? row.thetaMax }
    }
    return row
  })
}

export function setRowLabel(rows: ExpressionRow[], id: string, label: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, label: label.slice(0, 60) } : row))
}

/** Returns an error message for an invalid domain, or null when usable. */
export function validateDomain(domain: DomainRestriction | null): string | null {
  if (domain === null) {
    return null
  }
  return validateParameterRange(domain.min, domain.max, 'Domain')
}

/** Shared finite ordered-range check for domains and t/theta ranges. */
export function validateParameterRange(min: number, max: number, what: string): string | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return `${what} bounds must be finite numbers.`
  }
  if (!(max > min)) {
    return `${what} needs min below max (reversed or empty ranges are rejected).`
  }
  return null
}

export function setRowDomain(rows: ExpressionRow[], id: string, domain: DomainRestriction | null): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'cartesian' ? { ...row, domain } : row))
}

export function setRowBranches(rows: ExpressionRow[], id: string, branches: RowBranch[] | null, defaultSource: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id && row.kind === 'cartesian' ? { ...row, branches, defaultSource } : row))
}

/**
 * Leave piecewise mode in a single step: clear the branches and adopt the
 * default-branch expression as the source when one is set (a blank default
 * keeps the previous source). One pure operation so the exit cannot be
 * split across competing row updates.
 */
export function exitPiecewise(rows: ExpressionRow[], id: string): ExpressionRow[] {
  return rows.map((row) => {
    if (row.id !== id || row.kind !== 'cartesian') {
      return row
    }
    const source = row.defaultSource.trim() === '' ? row.source : row.defaultSource
    return { ...row, source, branches: null, defaultSource: '' }
  })
}

export function toggleRowVisibility(rows: ExpressionRow[], id: string): ExpressionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, visible: !row.visible } : row))
}

export function cycleRowColor(rows: ExpressionRow[], id: string, paletteSize: number): ExpressionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, colorIndex: (row.colorIndex + 1) % paletteSize } : row))
}

export function duplicateRow(rows: ExpressionRow[], id: string, newRow: ExpressionRow): ExpressionRow[] {
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) {
    return rows
  }
  return [...rows.slice(0, index + 1), newRow, ...rows.slice(index + 1)]
}

export function deleteRow(rows: ExpressionRow[], id: string): ExpressionRow[] {
  return rows.filter((row) => row.id !== id)
}

/** Selection after deletion: next sibling, else previous, else null. */
export function selectionAfterDelete(rows: ExpressionRow[], deletedId: string, selectedId: string | null): string | null {
  if (selectedId !== deletedId) {
    return selectedId
  }
  const remaining = rows.filter((row) => row.id !== deletedId)
  if (remaining.length === 0) {
    return null
  }
  const index = rows.findIndex((row) => row.id === deletedId)
  const next = remaining[Math.min(index, remaining.length - 1)]
  return next === undefined ? null : next.id
}
