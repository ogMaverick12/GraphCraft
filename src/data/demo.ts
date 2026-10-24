import type { Dataset } from './dataset.ts'

/**
 * Demo dataset (Stage 4 DATA-02): a small, original, openly synthetic
 * seedling-growth experiment — fictional measurements written for this
 * file, labelled as such everywhere it appears. Lets users try plots
 * without importing anything.
 */
export const DEMO_DATASET: Dataset = {
  id: 'dataset-demo-seedling',
  name: 'Demo: seedling growth (synthetic)',
  columns: [
    { id: 'c1', name: 'day', type: 'numeric' },
    { id: 'c2', name: 'height_cm', type: 'numeric' },
    { id: 'c3', name: 'tray', type: 'categorical' },
  ],
  rows: [
    [0, 2.1, 'A'],
    [2, 2.8, 'A'],
    [4, 3.9, 'A'],
    [6, 5.2, 'A'],
    [8, 6.1, 'A'],
    [0, 2.0, 'B'],
    [2, 2.5, 'B'],
    [4, null, 'B'],
    [6, 4.6, 'B'],
    [8, 5.8, 'B'],
    [0, 2.2, 'C'],
    [2, 3.1, 'C'],
    [4, 4.2, 'C'],
    [6, 5.0, 'C'],
    [8, 6.4, 'C'],
  ],
  provenance: { kind: 'example', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 0 },
  cleaningLog: [],
}
