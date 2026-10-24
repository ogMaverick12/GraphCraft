/**
 * GraphCraft project format (Stage 1 persistence, extended in Stage 2).
 *
 * Versioned explicitly for forward-compatible migration. Contains only
 * the state required to recreate a graph — never runtime objects,
 * compiled functions, contexts, or executable code.
 */

export const PROJECT_FORMAT_TAG = 'graphcraft-project'
export const PROJECT_FORMAT_VERSION = 6

/** Hard cap on imported file size (characters). v6 analysis projects hold datasets: 2 MB. */
export const MAX_PROJECT_FILE_CHARS = 256 * 1024
export const MAX_PROJECT_V6_CHARS = 2 * 1024 * 1024
/** Hard cap on datasets per v6 project. */
export const MAX_PROJECT_DATASETS = 20
/** Persisted dataset shape mirrors the live caps (refuse, never truncate). */
export const MAX_PROJECT_DATASET_ROWS = 10_000
export const MAX_PROJECT_DATASET_COLS = 32
/** Hard cap on expression rows per project. */
export const MAX_PROJECT_ROWS = 100
/** Hard cap on parameters per project. */
export const MAX_PROJECT_PARAMETERS = 32
/** Hard cap on project title length. */
export const MAX_TITLE_CHARS = 200
/** Hard cap on expression labels. */
export const MAX_LABEL_CHARS = 60
/** Hard cap on piecewise branches per row. */
export const MAX_FILE_BRANCHES = 20

export type BranchOperator = 'lt' | 'le' | 'gt' | 'ge'

export interface ProjectBranch {
  readonly op: BranchOperator
  readonly value: number
  readonly source: string
}

export interface ProjectDomain {
  readonly min: number
  readonly max: number
}

export interface ProjectExpressionBase {
  readonly id: string
  readonly visible: boolean
  readonly colorIndex: number
  readonly label: string
}

export interface ProjectCartesian extends ProjectExpressionBase {
  readonly kind: 'cartesian'
  readonly source: string
  readonly domain: ProjectDomain | null
  readonly branches: ProjectBranch[] | null
  readonly defaultSource: string
}

export interface ProjectParametric extends ProjectExpressionBase {
  readonly kind: 'parametric'
  readonly xSource: string
  readonly ySource: string
  readonly tMin: number
  readonly tMax: number
}

export interface ProjectPolar extends ProjectExpressionBase {
  readonly kind: 'polar'
  readonly source: string
  readonly thetaMin: number
  readonly thetaMax: number
}

export interface ProjectImplicit extends ProjectExpressionBase {
  readonly kind: 'implicit'
  readonly leftSource: string
  readonly rightSource: string
}

export type InequalitySide = '<=' | '>=' | '<' | '>'

export interface ProjectInequality extends ProjectExpressionBase {
  readonly kind: 'inequality'
  readonly leftSource: string
  readonly op: InequalitySide
  readonly rightSource: string
}

export type ProjectExpression = ProjectCartesian | ProjectParametric | ProjectPolar | ProjectImplicit | ProjectInequality

export interface ProjectViewport {
  readonly xMin: number
  readonly xMax: number
  readonly yMin: number
  readonly yMax: number
  readonly equalAspect: boolean
  readonly showGrid: boolean
}

export interface ProjectParameter {
  readonly name: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly defaultValue: number
}

export interface GraphCraftProject {
  readonly format: typeof PROJECT_FORMAT_TAG
  readonly version: typeof PROJECT_FORMAT_VERSION
  readonly title: string
  readonly expressions: ProjectExpression[]
  readonly viewport: ProjectViewport
  readonly parameters: ProjectParameter[]
  /** Data Lab bundle (v6): absent in older files, defaults to empty. */
  readonly dataLab?: ProjectDataLab
  /** Learn annotation selection (v6): template id whose root/extremum markers show; unknown ids tolerated as absent. */
  readonly learnAnnotations?: { templateId: string } | null
  /** 3D surfaces (Stage 6): absent in older files, defaults to empty. */
  readonly surfaces3d?: ProjectSurface3D[]
  /** 2D fields (Stage 6): absent in older files, defaults to empty. */
  readonly fields2d?: ProjectField[]
  /** 3D scatters (Stage 6 S6.6): absent in older files, defaults to empty. */
  readonly scatters3d?: ProjectScatter[]
}

/** One persisted 2D field display: mode, sources, domain, density, levels, scales, and flags. */
export interface ProjectField {
  readonly id: string
  readonly mode: 'contour' | 'heatmap' | 'vectors'
  readonly source: string
  readonly uSource: string
  readonly vSource: string
  readonly domain: { xMin: number; xMax: number; yMin: number; yMax: number }
  readonly resolution: number
  readonly levelCount: number
  readonly levelList: string
  readonly colorPolicy: 'viridis' | 'blue-red' | 'diverging'
  readonly scalePolicy: 'auto' | 'symmetric' | 'fixed'
  readonly fixedMin: string
  readonly fixedMax: string
  readonly arrowMode: 'magnitude' | 'unit'
  readonly showGrid: boolean
  readonly title: string
}

/** One persisted 3D surface: expression, bounded domain, grid density, camera, and display flags. */
export interface ProjectSurface3D {
  readonly id: string
  readonly source: string
  readonly domain: { xMin: number; xMax: number; yMin: number; yMax: number }
  readonly resolution: number
  readonly camera: { yaw: number; pitch: number; distance: number; panX: number; panY: number }
  readonly showGrid: boolean
  readonly title: string
  readonly appearance: 'solid' | 'wireframe' | 'shaded'
}

/** Persisted surfaces per project (painter cost caps the list). */
export const MAX_PROJECT_SURFACES = 6
/** Persisted 3D scatters per project. */
export const MAX_PROJECT_SCATTERS = 4

/** One persisted 3D scatter: dataset + column mapping, camera, and flags. */
export interface ProjectScatter {
  readonly id: string
  readonly datasetId: string | null
  readonly xId: string | null
  readonly yId: string | null
  readonly zId: string | null
  readonly camera: { yaw: number; pitch: number; distance: number; panX: number; panY: number }
  readonly title: string
}
/** Persisted 2D fields per project (SVG DOM cost caps the list). */
export const MAX_PROJECT_FIELDS = 4
/** Persisted grid caps mirror the sampler caps (refuse, never truncate). */
export const MAX_PROJECT_SURFACE_GRID = 128
export const MIN_PROJECT_SURFACE_GRID = 8

/** Limits for persisted cell text (imported strings are bounded by the file cap). */
export const MAX_PROJECT_CELL_CHARS = 5000
export const MAX_PROJECT_DATASET_NAME = 60
export const MAX_PROJECT_CLEANING_ENTRIES = 200

export type ProjectColumnType = 'numeric' | 'categorical'

export interface ProjectDatasetColumn {
  readonly id: string
  readonly name: string
  readonly type: ProjectColumnType
  readonly unit?: string
}

export interface ProjectDatasetProvenance {
  readonly kind: 'paste' | 'file' | 'manual' | 'example'
  readonly fileName?: string
  readonly importedAt: string
  readonly skippedEmpty: number
}

export interface ProjectDatasetImportOptions {
  readonly delimiter: ',' | ';' | '\t'
  readonly decimal: '.' | ','
  readonly hasHeader: boolean | null
  readonly typeOverrides: Record<string, ProjectColumnType>
}

export interface ProjectCleaningEntry {
  readonly action: string
  readonly detail: string
}

export type ProjectCell = number | string | null

export interface ProjectMissingSummary {
  /** Null (missing) cell count per column index. */
  readonly nullsPerColumn: number[]
  /** Rows containing at least one missing value. */
  readonly rowsWithMissing: number
}

export interface ProjectDataset {
  readonly id: string
  readonly name: string
  readonly columns: ProjectDatasetColumn[]
  readonly rows: ProjectCell[][]
  readonly provenance: ProjectDatasetProvenance
  readonly importOptions?: ProjectDatasetImportOptions
  readonly cleaningLog: ProjectCleaningEntry[]
  /** Missing-value census at save time: raw rows are kept separately from filtered views. */
  readonly missingSummary: ProjectMissingSummary
}

export type ProjectPlotKind = 'scatter' | 'line' | 'bar' | 'histogram'

export interface ProjectErrorSource {
  readonly mode: 'none' | 'column' | 'asymmetric' | 'fixed'
  readonly column?: string
  readonly upper?: string
  readonly lower?: string
  readonly value?: number
}

export interface ProjectPlotConfig {
  readonly kind: ProjectPlotKind
  readonly xColumn: string | null
  readonly yColumn: string | null
  readonly seriesColumn: string | null
  readonly title: string
  readonly xLabel: string
  readonly yLabel: string
  readonly sort: 'row-order' | 'x-ascending'
  readonly showGrid: boolean
  readonly hiddenSeries: string[]
  readonly xMin: number | null
  readonly xMax: number | null
  readonly yMin: number | null
  readonly yMax: number | null
  readonly xScale: 'linear' | 'log'
  readonly yScale: 'linear' | 'log'
  readonly tickX: number | null
  readonly tickY: number | null
  readonly yError: ProjectErrorSource
  readonly xError: ProjectErrorSource
}

export type ProjectFitModel = 'line' | 'poly' | 'exp' | 'log' | 'power'

export interface ProjectFitConfig {
  readonly model: ProjectFitModel | 'none'
  readonly degree: number
  readonly xId: string | null
  readonly yId: string | null
  readonly weightMode: 'none' | 'column' | 'fixed'
  readonly weightColumn: string
  readonly weightFixed: string
}

/**
 * Fit result metadata at full precision (never rounded display text):
 * method + settings + estimates + diagnostics, so a saved analysis
 * reproduces and re-verifies instead of trusting a label.
 */
export interface ProjectFitResult {
  readonly model: ProjectFitModel
  readonly coefficients: number[]
  readonly degree: number
  readonly n: number
  readonly dof: number
  readonly skipped: number
  readonly rSquared: number | null
  readonly residualStd: number
  readonly rmse: number
  readonly mae: number
  readonly minResidual: number
  readonly maxResidual: number
  readonly warnings: string[]
  readonly methodNote: string
}

export interface ProjectExportSettings {
  readonly format: 'svg' | 'png' | 'csv'
  readonly scale: number
  readonly background: 'white' | 'transparent'
  readonly caption: string
  readonly csvTable: 'dataset' | 'plotted-points' | 'residuals' | 'fit-summary'
  readonly figureSize: 'S' | 'M' | 'L'
}

export interface ProjectDatasetAnalysis {
  readonly plot: ProjectPlotConfig
  readonly fit: ProjectFitConfig
  /** Last computed result metadata (null when no valid fit); recomputed live on load. */
  readonly fitResult: ProjectFitResult | null
  readonly export: ProjectExportSettings
}

export interface ProjectDataLab {
  readonly datasets: ProjectDataset[]
  /** Keyed by dataset id; entries for unknown datasets are ignored on load. */
  readonly analyses: Record<string, ProjectDatasetAnalysis>
}
