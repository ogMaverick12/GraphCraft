import { useState } from 'react'
import type { CellValue, Dataset, DatasetColumn, DatasetEditOutcome } from './dataset.ts'
import { defaultAnalysis, type DatasetAnalysisSnapshot } from './persistence.ts'

/**
 * Dataset store (Stage 4 DATA-01, extended S4.2): session-scoped tables
 * plus revision history. Every mutation snapshots the prior rows and
 * columns first; the import-time snapshot is kept separately so source
 * data is always restorable. Views (sort/filter in the table) never
 * touch the store — only explicit edits do.
 */

export interface DatasetSnapshot {
  rows: CellValue[][]
  columns: DatasetColumn[]
  label: string
}

const MAX_UNDO = 20

function snapshotOf(dataset: Dataset, label: string): DatasetSnapshot {
  return {
    rows: dataset.rows.map((row) => [...row]),
    columns: dataset.columns.map((col) => ({ ...col })),
    label,
  }
}

export function useDatasets(initial?: { datasets: Dataset[]; analyses: Record<string, DatasetAnalysisSnapshot> }): {
  datasets: Dataset[]
  addDataset: (dataset: Dataset) => void
  removeDataset: (id: string) => void
  /** Apply a pure edit; returns an error message, or null on success. */
  mutate: (id: string, label: string, edit: (dataset: Dataset) => DatasetEditOutcome) => string | null
  undo: (id: string) => boolean
  restoreSource: (id: string) => boolean
  canUndo: (id: string) => boolean
  hasHistory: (id: string) => boolean
  /** Per-dataset plot/fit/export state (defaults supplied on read). */
  analyses: Record<string, DatasetAnalysisSnapshot>
  setAnalysis: (id: string, analysis: DatasetAnalysisSnapshot) => void
  replaceAll: (datasets: Dataset[], analyses: Record<string, DatasetAnalysisSnapshot>) => void
} {
  const [datasets, setDatasets] = useState<Dataset[]>(() => initial?.datasets ?? [])
  const [past, setPast] = useState<Record<string, DatasetSnapshot[]>>({})
  const [sources, setSources] = useState<Record<string, DatasetSnapshot>>({})
  const [analyses, setAnalyses] = useState<Record<string, DatasetAnalysisSnapshot>>(() => initial?.analyses ?? {})

  function addDataset(dataset: Dataset): void {
    setDatasets((current) => {
      if (current.some((existing) => existing.id === dataset.id)) {
        return current
      }
      return [...current, dataset]
    })
    setAnalyses((current) => (current[dataset.id] === undefined ? { ...current, [dataset.id]: defaultAnalysis(dataset) } : current))
  }

  function removeDataset(id: string): void {
    setDatasets((current) => current.filter((dataset) => dataset.id !== id))
    setPast((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setSources((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setAnalyses((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  function mutate(id: string, label: string, edit: (dataset: Dataset) => DatasetEditOutcome): string | null {
    const current = datasets.find((dataset) => dataset.id === id)
    if (current === undefined) {
      return 'Dataset is gone.'
    }
    const outcome = edit(current)
    if (outcome.status === 'error') {
      return outcome.message
    }
    if (sources[id] === undefined) {
      setSources((all) => ({ ...all, [id]: snapshotOf(current, 'imported data') }))
    }
    setPast((all) => ({ ...all, [id]: [...(all[id] ?? []), snapshotOf(current, label)].slice(-MAX_UNDO) }))
    setDatasets((all) => all.map((dataset) => (dataset.id === id ? outcome.dataset : dataset)))
    return null
  }

  function applySnapshot(id: string, snapshot: DatasetSnapshot, label: string): boolean {
    const current = datasets.find((dataset) => dataset.id === id)
    if (current === undefined) {
      return false
    }
    setPast((all) => ({ ...all, [id]: [...(all[id] ?? []), snapshotOf(current, label)].slice(-MAX_UNDO) }))
    setDatasets((all) =>
      all.map((dataset) =>
        dataset.id === id
          ? { ...dataset, rows: snapshot.rows.map((row) => [...row]), columns: snapshot.columns.map((col) => ({ ...col })), cleaningLog: [...dataset.cleaningLog, { action: label, detail: `Restored: ${snapshot.label}.` }] }
          : dataset,
      ),
    )
    return true
  }

  function undo(id: string): boolean {
    const stack = past[id] ?? []
    const snapshot = stack[stack.length - 1]
    if (snapshot === undefined) {
      return false
    }
    setPast((all) => ({ ...all, [id]: stack.slice(0, -1) }))
    return applySnapshotWithoutPush(id, snapshot)
  }

  function applySnapshotWithoutPush(id: string, snapshot: DatasetSnapshot): boolean {
    const current = datasets.find((dataset) => dataset.id === id)
    if (current === undefined) {
      return false
    }
    setDatasets((all) =>
      all.map((dataset) =>
        dataset.id === id
          ? { ...dataset, rows: snapshot.rows.map((row) => [...row]), columns: snapshot.columns.map((col) => ({ ...col })), cleaningLog: [...dataset.cleaningLog, { action: 'undo', detail: `Undone to: ${snapshot.label}.` }] }
          : dataset,
      ),
    )
    return true
  }

  function restoreSource(id: string): boolean {
    const source = sources[id]
    if (source === undefined) {
      return false
    }
    return applySnapshot(id, { ...source, label: 'imported data' }, 'restore-source')
  }

  function canUndo(id: string): boolean {
    return (past[id] ?? []).length > 0
  }

  function hasHistory(id: string): boolean {
    return sources[id] !== undefined
  }

  function setAnalysis(id: string, analysis: DatasetAnalysisSnapshot): void {
    // Bail on identical snapshots: reporters fire per render and must not
    // churn the store (render loop guard — comparisons are small).
    setAnalyses((current) => {
      const previous = current[id]
      if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(analysis)) {
        return current
      }
      return { ...current, [id]: analysis }
    })
  }

  function replaceAll(nextDatasets: Dataset[], nextAnalyses: Record<string, DatasetAnalysisSnapshot>): void {
    setDatasets(nextDatasets)
    setPast({})
    setSources({})
    setAnalyses(nextAnalyses)
  }

  return { datasets, addDataset, removeDataset, mutate, undo, restoreSource, canUndo, hasHistory, analyses, setAnalysis, replaceAll }
}
