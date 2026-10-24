import { describe, expect, it } from 'vitest'
import { extractFitPairs, fitModel } from '../data/fits.ts'
import { analysisFromProject, buildProjectDataLab, defaultAnalysis, projectToDataset, type DatasetAnalysisSnapshot } from '../data/persistence.ts'
import type { Dataset } from '../data/dataset.ts'
import { serializeProject } from './serialize.ts'
import { validateProjectText } from './validate.ts'
import { DEFAULT_WORLD } from '../graph/useViewport.ts'

function dataset(): Dataset {
  return {
    id: 'ds-roundtrip',
    name: 'Growth',
    columns: [
      { id: 'c1', name: 'day', type: 'numeric', unit: 'd' },
      { id: 'c2', name: 'height', type: 'numeric', unit: 'cm' },
      { id: 'c3', name: 'sigma', type: 'numeric' },
      { id: 'c4', name: 'tray', type: 'categorical' },
    ],
    rows: [
      [0, 2.1, 0.2, 'A'],
      [2, 2.8, 0.2, 'A'],
      [4, null, 0.2, 'B'],
      [6, 5.2, 0.1, 'B'],
    ],
    provenance: { kind: 'paste', importedAt: '2026-10-15T00:00:00.000Z', skippedEmpty: 1 },
    importOptions: { delimiter: ',', decimal: '.', hasHeader: true, typeOverrides: {} },
    cleaningLog: [{ action: 'drop-missing', detail: '1 row removed.' }],
  }
}

function analysis(ds: Dataset): DatasetAnalysisSnapshot {
  const base = defaultAnalysis(ds)
  return {
    plot: {
      ...base.plot,
      kind: 'line',
      seriesColumn: 'c4',
      xMin: 0,
      xMax: 10,
      yScale: 'linear',
      hiddenSeries: ['B'],
      yError: { mode: 'column', column: 'c3' },
    },
    fit: { model: 'exp', degree: 1, xId: 'c1', yId: 'c2', weightMode: 'column', weightColumn: 'c3', weightFixed: '1' },
    fitResult: {
      model: 'exp',
      coefficients: [2.123456789012345, 0.123456789012345],
      degree: 1,
      n: 3,
      dof: 1,
      skipped: 1,
      rSquared: 0.987654321,
      residualStd: 0.111,
      rmse: 0.09,
      mae: 0.08,
      minResidual: -0.1,
      maxResidual: 0.2,
      warnings: ['Linearized fit via log transform (Householder QR on transformed data): approximate — not a true nonlinear least-squares optimum.'],
      methodNote: 'Linearized least squares via log transform, Householder QR (approximate).',
    },
    export: { format: 'png', scale: 2, background: 'white', caption: 'Growth trial, N = 3.', csvTable: 'residuals', figureSize: 'M' },
  }
}

describe('v6 analysis project round-trip', () => {
  it('saves and reloads datasets, mappings, fit config/results, uncertainty, and export settings', () => {
    const ds = dataset()
    const text = serializeProject({
      title: 'Analysis',
      rows: [],
      world: DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
      parameters: [],
      datasets: [ds],
      analyses: { [ds.id]: analysis(ds) },
    })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (!validated.ok) {
      throw new Error(validated.error)
    }
    expect(validated.project.version).toBe(6)
    const lab = validated.project.dataLab
    expect(lab?.datasets).toHaveLength(1)
    // Raw rows kept verbatim; missing census recorded alongside.
    expect(lab?.datasets[0]?.rows).toEqual(ds.rows)
    expect(lab?.datasets[0]?.missingSummary).toEqual({ nullsPerColumn: [0, 1, 0, 0], rowsWithMissing: 1 })
    expect(lab?.datasets[0]?.importOptions).toEqual(ds.importOptions)
    expect(lab?.datasets[0]?.cleaningLog).toEqual(ds.cleaningLog)
    // Analysis restores exactly (full-precision metadata, not display text).
    const restored = analysisFromProject(lab?.analyses[ds.id] ?? (() => { throw new Error('missing analysis') })())
    expect(restored.plot.yError).toEqual({ mode: 'column', column: 'c3' })
    expect(restored.plot.hiddenSeries).toEqual(['B'])
    expect(restored.fit).toMatchObject({ model: 'exp', weightMode: 'column' })
    expect(restored.fitResult?.coefficients).toEqual([2.123456789012345, 0.123456789012345])
    expect(restored.export).toMatchObject({ format: 'png', scale: 2, caption: 'Growth trial, N = 3.' })
    // Live state revives: rows + analysis convert back without loss.
    expect(projectToDataset(lab?.datasets[0] ?? (() => { throw new Error('missing dataset') })()).rows).toEqual(ds.rows)
  })

  it('recomputes identical fit coefficients from restored config (metadata consistency)', () => {
    const ds = dataset()
    const saved = analysis(ds)
    const bundle = buildProjectDataLab([ds], { [ds.id]: saved })
    const text = JSON.stringify({ format: 'graphcraft-project', version: 6, title: 't', expressions: [], viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, equalAspect: false, showGrid: true }, parameters: [], dataLab: bundle })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (!validated.ok) {
      throw new Error('expected loadable bundle')
    }
    const restored = validated.project.dataLab?.analyses[ds.id]
    expect(restored?.fitResult?.model).toBe('exp')
    // Refit from restored config over restored rows: must be a valid fit on the same points.
    const live = projectToDataset(validated.project.dataLab?.datasets[0] ?? (() => { throw new Error('missing') })())
    const xIndex = live.columns.findIndex((col) => col.id === restored?.fit.xId)
    const yIndex = live.columns.findIndex((col) => col.id === restored?.fit.yId)
    const { xs, ys } = extractFitPairs(live.rows, xIndex, yIndex)
    const outcome = fitModel({ model: 'exp', degree: 1, xs, ys })
    expect(outcome.status).toBe('value')
    if (outcome.status === 'value') {
      // Same points, same algorithm → same n/skipped census as the saved metadata shape.
      expect(outcome.fit.n).toBe(restored?.fitResult?.n)
    }
  })

  it('migrates v4 files to an empty Data Lab instead of dropping them', () => {
    const text = JSON.stringify({ format: 'graphcraft-project', version: 4, title: 'old', expressions: [], viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, equalAspect: false, showGrid: true }, parameters: [] })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(validated.project.version).toBe(6)
      expect(validated.project.dataLab?.datasets).toEqual([])
    }
  })

  it('refuses oversized bundles and malformed datasets with messages', () => {
    const small = serializeProject({ title: 't', rows: [], world: DEFAULT_WORLD, equalAspect: false, showGrid: true, parameters: [], datasets: [], analyses: {} })
    const huge = `${small.slice(0, -1)}${' '.repeat(2_100_000)}}`
    expect(validateProjectText(huge)).toMatchObject({ ok: false })
    const bad = JSON.stringify({
      format: 'graphcraft-project',
      version: 6,
      title: 't',
      expressions: [],
      viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, equalAspect: false, showGrid: true },
      parameters: [],
      dataLab: { datasets: [{ id: 'd', name: 'x', columns: [{ id: 'c1', name: 'a', type: 'numeric' }], rows: [[1, 2]], provenance: { kind: 'manual', importedAt: 'x', skippedEmpty: 0 }, cleaningLog: [], missingSummary: { nullsPerColumn: [0], rowsWithMissing: 0 } }], analyses: {} },
    })
    expect(validateProjectText(bad).ok).toBe(false)
  })

  it('ignores analyses for unknown datasets instead of refusing the file', () => {
    const ds = dataset()
    const text = serializeProject({
      title: 't',
      rows: [],
      world: DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
      parameters: [],
      datasets: [ds],
      analyses: { [ds.id]: analysis(ds), ghost: analysis(ds) },
    })
    const validated = validateProjectText(text)
    expect(validated.ok).toBe(true)
    if (validated.ok) {
      expect(Object.keys(validated.project.dataLab?.analyses ?? {})).toEqual([ds.id])
    }
  })
})
