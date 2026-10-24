import type { CellValue, Dataset, DatasetColumn } from './dataset.ts'
import type { FitModel } from './fits.ts'
import { defaultPlotConfig } from './plot-defaults.ts'
import type { PlotConfig } from './plots.ts'
import {
  MAX_PROJECT_CELL_CHARS,
  type ProjectCell,
  type ProjectDataLab,
  type ProjectDataset,
  type ProjectDatasetAnalysis,
  type ProjectErrorSource,
  type ProjectFitConfig,
  type ProjectFitResult,
  type ProjectMissingSummary,
  type ProjectPlotConfig,
} from '../project/schema.ts'

/**
 * Data Lab persistence (v6 project bundle): conversions between live
 * session state and the versioned file shape. Raw imported rows are
 * kept verbatim (views like sort/filter never touch the store);
 * cleaning actions stay in `cleaningLog`; the missing census is
 * recomputed fresh at save so it always describes current data.
 * Fitted numbers persist at full precision with their method — never
 * rounded display text. No React, no DOM, no network.
 */

export interface PersistedFitSelection {
  model: FitModel | 'none'
  degree: number
  xId: string | null
  yId: string | null
  weightMode: 'none' | 'column' | 'fixed'
  weightColumn: string
  weightFixed: string
}

export interface PersistedFitResultMeta {
  model: FitModel
  coefficients: number[]
  degree: number
  n: number
  dof: number
  skipped: number
  rSquared: number | null
  residualStd: number
  rmse: number
  mae: number
  minResidual: number
  maxResidual: number
  warnings: string[]
  methodNote: string
}

export type ExportFormatChoice = 'svg' | 'png' | 'csv'
export type CsvTableChoice = 'dataset' | 'plotted-points' | 'residuals' | 'fit-summary'
export type FigureSizeChoice = 'S' | 'M' | 'L'

export interface PersistedExportSettings {
  format: ExportFormatChoice
  scale: number
  background: 'white' | 'transparent'
  caption: string
  csvTable: CsvTableChoice
  figureSize: FigureSizeChoice
}

export interface DatasetAnalysisSnapshot {
  plot: PlotConfig
  fit: PersistedFitSelection
  fitResult: PersistedFitResultMeta | null
  export: PersistedExportSettings
}

/** Fresh missing census over current rows (raw data untouched). */
export function summarizeMissing(dataset: Dataset): ProjectMissingSummary {
  const nullsPerColumn = dataset.columns.map((_, c) => dataset.rows.filter((row) => (row[c] ?? null) === null).length)
  return {
    nullsPerColumn,
    rowsWithMissing: dataset.rows.filter((row) => row.some((cell) => cell === null)).length,
  }
}

function clipText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text
}

function toProjectCell(cell: CellValue): ProjectCell {
  if (typeof cell === 'string') {
    return clipText(cell, MAX_PROJECT_CELL_CHARS)
  }
  return cell
}

export function datasetToProject(dataset: Dataset): ProjectDataset {
  return {
    id: dataset.id,
    name: dataset.name,
    columns: dataset.columns.map((col) => ({
      id: col.id,
      name: col.name,
      type: col.type,
      ...(col.unit === undefined ? {} : { unit: col.unit }),
    })),
    rows: dataset.rows.map((row) => dataset.columns.map((_, c) => toProjectCell(row[c] ?? null))),
    provenance: { ...dataset.provenance },
    ...(dataset.importOptions === undefined ? {} : { importOptions: { ...dataset.importOptions, typeOverrides: { ...dataset.importOptions.typeOverrides } } }),
    cleaningLog: dataset.cleaningLog.map((entry) => ({ action: entry.action, detail: entry.detail })),
    missingSummary: summarizeMissing(dataset),
  }
}

export function projectToDataset(project: ProjectDataset): Dataset {
  return {
    id: project.id,
    name: project.name,
    columns: project.columns.map(
      (col): DatasetColumn => ({ id: col.id, name: col.name, type: col.type, ...(col.unit === undefined ? {} : { unit: col.unit }) }),
    ),
    rows: project.rows.map((row) => row.map((cell) => cell)),
    provenance: { ...project.provenance },
    cleaningLog: project.cleaningLog.map((entry) => ({ ...entry })),
    ...(project.importOptions === undefined ? {} : { importOptions: { ...project.importOptions, typeOverrides: { ...project.importOptions.typeOverrides } } }),
  }
}

function errorSourceToProject(mode: { mode: string; column?: string; upper?: string; lower?: string; value?: number }): ProjectErrorSource {
  // Invalid fixed values (NaN from cleared inputs) coerce to 'none':
  // JSON cannot hold NaN, so refusing would make our own files unloadable.
  if (mode.mode === 'fixed') {
    const value = mode.value
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return { mode: 'fixed', value }
    }
    return { mode: 'none' }
  }
  if (mode.mode === 'column' && typeof mode.column === 'string') {
    return { mode: 'column', column: mode.column }
  }
  if (mode.mode === 'asymmetric' && typeof mode.upper === 'string' && typeof mode.lower === 'string') {
    return { mode: 'asymmetric', upper: mode.upper, lower: mode.lower }
  }
  return { mode: 'none' }
}

function errorSourceFromProject(source: ProjectErrorSource): PlotConfig['yError'] {
  if (source.mode === 'column' && typeof source.column === 'string') {
    return { mode: 'column', column: source.column }
  }
  if (source.mode === 'asymmetric' && typeof source.upper === 'string' && typeof source.lower === 'string') {
    return { mode: 'asymmetric', upper: source.upper, lower: source.lower }
  }
  if (source.mode === 'fixed' && typeof source.value === 'number') {
    return { mode: 'fixed', value: source.value }
  }
  return { mode: 'none' }
}

function xErrorFromProject(source: ProjectErrorSource): PlotConfig['xError'] {
  if (source.mode === 'column' && typeof source.column === 'string') {
    return { mode: 'column', column: source.column }
  }
  if (source.mode === 'fixed' && typeof source.value === 'number') {
    return { mode: 'fixed', value: source.value }
  }
  return { mode: 'none' }
}

export function plotConfigToProject(config: PlotConfig): ProjectPlotConfig {
  return {
    ...config,
    hiddenSeries: [...config.hiddenSeries],
    yError: errorSourceToProject(config.yError),
    xError: errorSourceToProject(config.xError),
  }
}

export function plotConfigFromProject(project: ProjectPlotConfig): PlotConfig {
  return {
    ...project,
    hiddenSeries: [...project.hiddenSeries],
    yError: errorSourceFromProject(project.yError),
    xError: xErrorFromProject(project.xError),
  }
}

export function fitSelectionToProject(fit: PersistedFitSelection): ProjectFitConfig {
  return { ...fit }
}

export function fitResultToProject(result: PersistedFitResultMeta): ProjectFitResult {
  return { ...result, coefficients: [...result.coefficients], warnings: [...result.warnings] }
}

export function analysisToProject(analysis: DatasetAnalysisSnapshot): ProjectDatasetAnalysis {
  return {
    plot: plotConfigToProject(analysis.plot),
    fit: fitSelectionToProject(analysis.fit),
    fitResult: analysis.fitResult === null ? null : fitResultToProject(analysis.fitResult),
    export: { ...analysis.export },
  }
}

export function analysisFromProject(project: ProjectDatasetAnalysis): DatasetAnalysisSnapshot {
  return {
    plot: plotConfigFromProject(project.plot),
    fit: { ...project.fit },
    fitResult: project.fitResult === null ? null : { ...project.fitResult, coefficients: [...project.fitResult.coefficients], warnings: [...project.fitResult.warnings] },
    export: { ...project.export },
  }
}

/** Default analysis for a dataset (same defaults as a freshly opened plot). */
export function defaultAnalysis(dataset: Dataset): DatasetAnalysisSnapshot {
  const numeric = dataset.columns.filter((col) => col.type === 'numeric')
  return {
    plot: defaultPlotConfig(dataset),
    fit: {
      model: 'line',
      degree: 2,
      xId: numeric[0]?.id ?? null,
      yId: numeric[1]?.id ?? numeric[0]?.id ?? null,
      weightMode: 'none',
      weightColumn: '',
      weightFixed: '1',
    },
    fitResult: null,
    export: { format: 'svg', scale: 1, background: 'white', caption: '', csvTable: 'dataset', figureSize: 'M' },
  }
}

export function buildProjectDataLab(datasets: Dataset[], analyses: Record<string, DatasetAnalysisSnapshot>): ProjectDataLab {
  return {
    datasets: datasets.map(datasetToProject),
    analyses: Object.fromEntries(Object.entries(analyses).map(([id, analysis]) => [id, analysisToProject(analysis)])),
  }
}
