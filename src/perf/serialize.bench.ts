import { bench } from 'vitest'
import type { Dataset } from '../data/dataset.ts'
import type { ExpressionRow } from '../expressions/model.ts'
import { serializeProject, type WorkspaceSnapshot } from '../project/serialize.ts'

/**
 * Project-serialization fixtures (S7.5 baseline, 2026-10-17): the whole
 * project is re-serialized on every state change (dirty check + session
 * backup), so viewport drags pay this cost per frame. The 10k×32 case
 * is the supported maximum — imports refuse beyond it. Run with
 * `npx vitest bench src/perf`; results are recorded in
 * docs/perf/S7.5-BASELINE.md. Numbers are observations, not gates.
 */

function cartesianRow(id: string, source: string, colorIndex: number): ExpressionRow {
  return {
    kind: 'cartesian',
    id,
    source,
    visible: true,
    colorIndex,
    label: '',
    domain: null,
    branches: null,
    defaultSource: '',
  }
}

/** Dense numeric dataset, shaped exactly like a gap-free CSV import. */
function numericDataset(id: string, rowCount: number, colCount: number): Dataset {
  return {
    id,
    name: id,
    columns: Array.from({ length: colCount }, (_, c) => ({
      id: `c${c + 1}`,
      name: `col ${c + 1}`,
      type: 'numeric' as const,
    })),
    rows: Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: colCount }, (_, c) => r * 0.5 + c),
    ),
    provenance: { kind: 'manual' as const, importedAt: '2026-10-17T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

const TYPICAL: WorkspaceSnapshot = {
  title: 'Serialization bench — typical',
  rows: [
    cartesianRow('e1', 'sin(x)', 0),
    cartesianRow('e2', 'x^2', 1),
    cartesianRow('e3', '1/x', 2),
    cartesianRow('e4', 'exp(-x^2)', 3),
    cartesianRow('e5', 'a*sin(b*x)', 4),
  ],
  world: { xMin: -10, xMax: 10, yMin: -7, yMax: 7 },
  equalAspect: false,
  showGrid: true,
  parameters: [
    { name: 'a', value: 1.5, min: -10, max: 10, step: 0.1, defaultValue: 1 },
    { name: 'b', value: 2, min: -10, max: 10, step: 0.1, defaultValue: 1 },
  ],
  datasets: [numericDataset('typical-1', 500, 6)],
  analyses: {},
}

const MAX: WorkspaceSnapshot = {
  ...TYPICAL,
  title: 'Serialization bench — 10k×32 max',
  datasets: [numericDataset('max-1', 10_000, 32)],
}

bench('serialize typical project (5 expressions, 500×6 dataset)', () => {
  serializeProject(TYPICAL)
})

bench('serialize project with 10k×32 dataset (supported maximum)', () => {
  serializeProject(MAX)
})
