import { isValidParameterName, MAX_EXPRESSION_LENGTH } from '../math/index.ts'
import {
  MAX_FILE_BRANCHES,
  MAX_LABEL_CHARS,
  MAX_PROJECT_CELL_CHARS,
  MAX_PROJECT_CLEANING_ENTRIES,
  MAX_PROJECT_DATASET_COLS,
  MAX_PROJECT_DATASET_NAME,
  MAX_PROJECT_DATASET_ROWS,
  MAX_PROJECT_DATASETS,
  MAX_PROJECT_FILE_CHARS,
  MAX_PROJECT_PARAMETERS,
  MAX_PROJECT_ROWS,
  MAX_PROJECT_FIELDS,
  MAX_PROJECT_SCATTERS,
  MAX_PROJECT_SURFACE_GRID,
  MAX_PROJECT_SURFACES,
  MIN_PROJECT_SURFACE_GRID,
  MAX_PROJECT_V6_CHARS,
  MAX_TITLE_CHARS,
  PROJECT_FORMAT_TAG,
  PROJECT_FORMAT_VERSION,
  type GraphCraftProject,
  type ProjectBranch,
  type ProjectCell,
  type ProjectDataLab,
  type ProjectDataset,
  type ProjectDatasetAnalysis,
  type ProjectDomain,
  type ProjectErrorSource,
  type ProjectExpression,
  type ProjectFitModel,
  type ProjectField,
  type ProjectParameter,
  type ProjectScatter,
  type ProjectSurface3D,
} from './schema.ts'

/**
 * Import validation: imported files are untrusted data. Everything is
 * checked — size, tag, version, field types, bounds, string lengths,
 * row count, id uniqueness, colour range — before the caller may
 * replace any current state. Math-syntax validity is NOT required here:
 * a row with bad syntax loads and shows its inline error, exactly as if
 * typed. Returns human-readable errors, never throws for bad input.
 */

export type ValidateResult = { ok: true; project: GraphCraftProject } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** v0 (pre-release sketch): no tag, no colour or visibility flags. */
function migrateV0(data: Record<string, unknown>): Record<string, unknown> {
  const expressions = Array.isArray(data['expressions']) ? data['expressions'] : []
  return {
    format: PROJECT_FORMAT_TAG,
    version: 1,
    title: typeof data['title'] === 'string' ? data['title'] : 'Untitled project',
    expressions: expressions.map((row: unknown, index: number) => {
      const source = isRecord(row) && typeof row['source'] === 'string' ? (row['source'] as string) : ''
      const id = isRecord(row) && typeof row['id'] === 'string' ? (row['id'] as string) : `migrated-${index + 1}`
      return { id, source, visible: true, colorIndex: index % 6 }
    }),
    viewport: isRecord(data['viewport']) ? data['viewport'] : undefined,
  }
}

/** v1 → v2: rows gain label, domain, branches, and defaultSource. */
function migrateV1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  const expressions = Array.isArray(data['expressions']) ? data['expressions'] : []
  return {
    ...data,
    format: PROJECT_FORMAT_TAG,
    version: 2,
    expressions: expressions.map((row: unknown) => {
      if (!isRecord(row)) {
        return row
      }
      return { label: '', domain: null, branches: null, defaultSource: '', ...row }
    }),
  }
}

/** v2 → v3: documents gain a parameter list (empty for legacy projects). */
function migrateV2ToV3(data: Record<string, unknown>): Record<string, unknown> {
  return { parameters: [], ...data, format: PROJECT_FORMAT_TAG, version: 3 }
}

/** v3 → v4: rows gain a kind discriminator (legacy rows are cartesian). */
function migrateV3ToV4(data: Record<string, unknown>): Record<string, unknown> {
  const expressions = Array.isArray(data['expressions']) ? data['expressions'] : []
  return {
    ...data,
    format: PROJECT_FORMAT_TAG,
    version: 4,
    expressions: expressions.map((row: unknown) => {
      if (!isRecord(row) || typeof row['kind'] === 'string') {
        return row
      }
      return { ...row, kind: 'cartesian' }
    }),
  }
}

/** v4 → v6: documents gain an (empty) Data Lab bundle. Format is preserved for validation. */
function migrateV4ToV6(data: Record<string, unknown>): Record<string, unknown> {
  return { format: PROJECT_FORMAT_TAG, dataLab: { datasets: [], analyses: {} }, ...data, version: 6 }
}

/** v5 → v6: unshipped intermediate; tolerate and default the bundle. Format is preserved for validation. */
function migrateV5ToV6(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data['dataLab'])) {
    return { format: PROJECT_FORMAT_TAG, dataLab: { datasets: [], analyses: {} }, ...data, version: 6 }
  }
  return { format: PROJECT_FORMAT_TAG, ...data, version: 6 }
}

const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  0: (data) => migrateV4ToV6(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(migrateV0(data))))),
  1: (data) => migrateV4ToV6(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(data)))),
  2: (data) => migrateV4ToV6(migrateV3ToV4(migrateV2ToV3(data))),
  3: (data) => migrateV4ToV6(migrateV3ToV4(data)),
  4: migrateV4ToV6,
  5: migrateV5ToV6,
}

function validateSourceText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_EXPRESSION_LENGTH
}

function validateRangePair(min: unknown, max: unknown): min is number {
  return isFiniteNumber(min) && isFiniteNumber(max) && (max as number) > (min as number)
}

function validateExpression(row: unknown, index: number): { expression?: ProjectExpression; error?: string } {
  if (!isRecord(row)) {
    return { error: `Expression ${index + 1} is not an object.` }
  }
  const { id, visible, colorIndex, label, kind } = row
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
    return { error: `Expression ${index + 1} has an invalid id.` }
  }
  if (typeof visible !== 'boolean') {
    return { error: `Expression "${id}" has an invalid visibility flag.` }
  }
  if (!Number.isInteger(colorIndex) || (colorIndex as number) < 0 || (colorIndex as number) > 5) {
    return { error: `Expression "${id}" has an invalid colour (0–5).` }
  }
  if (typeof label !== 'string' || label.length > MAX_LABEL_CHARS) {
    return { error: `Expression "${id}" has an invalid label (text up to ${MAX_LABEL_CHARS} characters).` }
  }
  const base = { id, visible, colorIndex: colorIndex as number, label }

  if (kind === 'parametric') {
    const { xSource, ySource, tMin, tMax } = row
    if (!validateSourceText(xSource) || !validateSourceText(ySource)) {
      return { error: `Expression "${id}" needs x(t) and y(t) text (1–${MAX_EXPRESSION_LENGTH} characters).` }
    }
    if (!validateRangePair(tMin, tMax)) {
      return { error: `Expression "${id}" needs a finite t range with max above min.` }
    }
    return { expression: { ...base, kind: 'parametric', xSource, ySource, tMin: tMin as number, tMax: tMax as number } }
  }

  if (kind === 'polar') {
    const { source, thetaMin, thetaMax } = row
    if (!validateSourceText(source)) {
      return { error: `Expression "${id}" has invalid text (1–${MAX_EXPRESSION_LENGTH} characters).` }
    }
    if (!validateRangePair(thetaMin, thetaMax)) {
      return { error: `Expression "${id}" needs a finite angle range with max above min.` }
    }
    return { expression: { ...base, kind: 'polar', source, thetaMin: thetaMin as number, thetaMax: thetaMax as number } }
  }

  if (kind === 'implicit' || kind === 'inequality') {
    const { leftSource, rightSource } = row
    if (!validateSourceText(leftSource) || !validateSourceText(rightSource)) {
      return { error: `Expression "${id}" needs both sides as text (1–${MAX_EXPRESSION_LENGTH} characters).` }
    }
    if (kind === 'implicit') {
      return { expression: { ...base, kind: 'implicit', leftSource, rightSource } }
    }
    const { op } = row
    if (op !== '<=' && op !== '>=' && op !== '<' && op !== '>') {
      return { error: `Expression "${id}" has an unknown inequality operator.` }
    }
    return { expression: { ...base, kind: 'inequality', leftSource, op, rightSource } }
  }

  if (kind !== undefined && kind !== 'cartesian') {
    return { error: `Expression "${id}" has an unknown kind.` }
  }
  const { source, domain, branches, defaultSource } = row
  if (!validateSourceText(source)) {
    return { error: `Expression "${id}" has invalid text (1–${MAX_EXPRESSION_LENGTH} characters).` }
  }
  let parsedDomain: ProjectDomain | null = null
  if (domain !== null && domain !== undefined) {
    if (!isRecord(domain) || !isFiniteNumber(domain['min']) || !isFiniteNumber(domain['max']) || !((domain['max'] as number) > (domain['min'] as number))) {
      return { error: `Expression "${id}" has an invalid domain (finite min below max, or none).` }
    }
    parsedDomain = { min: domain['min'] as number, max: domain['max'] as number }
  }
  let parsedBranches: ProjectBranch[] | null = null
  if (branches !== null && branches !== undefined) {
    if (!Array.isArray(branches) || branches.length > MAX_FILE_BRANCHES) {
      return { error: `Expression "${id}" has an invalid branch list (0–${MAX_FILE_BRANCHES} branches, or none).` }
    }
    parsedBranches = []
    for (let b = 0; b < branches.length; b += 1) {
      const branch = branches[b]
      if (!isRecord(branch) || (branch['op'] !== 'lt' && branch['op'] !== 'le' && branch['op'] !== 'gt' && branch['op'] !== 'ge')) {
        return { error: `Expression "${id}" branch ${b + 1} has an unknown condition.` }
      }
      if (!isFiniteNumber(branch['value'])) {
        return { error: `Expression "${id}" branch ${b + 1} needs a finite condition value.` }
      }
      if (typeof branch['source'] !== 'string' || branch['source'].length === 0 || branch['source'].length > MAX_EXPRESSION_LENGTH) {
        return { error: `Expression "${id}" branch ${b + 1} has invalid text.` }
      }
      parsedBranches.push({ op: branch['op'], value: branch['value'], source: branch['source'] })
    }
  }
  if (typeof defaultSource !== 'string' || defaultSource.length > MAX_EXPRESSION_LENGTH) {
    return { error: `Expression "${id}" has an invalid default branch.` }
  }
  if (parsedBranches !== null && parsedBranches.length === 0 && defaultSource === '') {
    return { error: `Expression "${id}" is piecewise but has no branches or default.` }
  }
  return {
    expression: {
      kind: 'cartesian' as const,
      id,
      source,
      visible,
      colorIndex: colorIndex as number,
      label,
      domain: parsedDomain,
      branches: parsedBranches,
      defaultSource,
    },
  }
}

function withDefaults(data: Record<string, unknown>): Record<string, unknown> {
  return {
    title: 'Untitled project',
    viewport: { xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: false, showGrid: true },
    ...data,
  }
}

function isNullableFinite(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function validateCell(cell: unknown): cell is ProjectCell {
  if (cell === null) {
    return true
  }
  if (typeof cell === 'number') {
    return Number.isFinite(cell)
  }
  return typeof cell === 'string' && cell.length <= MAX_PROJECT_CELL_CHARS
}

function validateDataset(value: unknown, index: number): { dataset?: ProjectDataset; error?: string } {
  if (!isRecord(value)) {
    return { error: `Dataset ${index + 1} is not an object.` }
  }
  const { id, name, columns, rows, provenance, importOptions, cleaningLog, missingSummary } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
    return { error: `Dataset ${index + 1} has an invalid id.` }
  }
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_PROJECT_DATASET_NAME) {
    return { error: `Dataset "${id}" has an invalid name (1–${MAX_PROJECT_DATASET_NAME} characters).` }
  }
  if (!Array.isArray(columns) || columns.length < 1 || columns.length > MAX_PROJECT_DATASET_COLS) {
    return { error: `Dataset "${id}" must list 1–${MAX_PROJECT_DATASET_COLS} columns.` }
  }
  const seenCols = new Set<string>()
  for (let c = 0; c < columns.length; c += 1) {
    const col = columns[c]
    if (!isRecord(col) || typeof col['id'] !== 'string' || (col['id'] as string).length === 0 || (col['id'] as string).length > 16) {
      return { error: `Dataset "${id}" column ${c + 1} has an invalid id.` }
    }
    if (seenCols.has(col['id'] as string)) {
      return { error: `Dataset "${id}" has a duplicate column id "${col['id'] as string}".` }
    }
    seenCols.add(col['id'] as string)
    if (typeof col['name'] !== 'string' || (col['name'] as string).length === 0 || (col['name'] as string).length > MAX_PROJECT_DATASET_NAME) {
      return { error: `Dataset "${id}" column ${c + 1} has an invalid name.` }
    }
    if (col['type'] !== 'numeric' && col['type'] !== 'categorical') {
      return { error: `Dataset "${id}" column "${col['id'] as string}" has an unknown type.` }
    }
    if (col['unit'] !== undefined && (typeof col['unit'] !== 'string' || (col['unit'] as string).length > 24)) {
      return { error: `Dataset "${id}" column "${col['id'] as string}" has an invalid unit.` }
    }
  }
  if (!Array.isArray(rows) || rows.length > MAX_PROJECT_DATASET_ROWS) {
    return { error: `Dataset "${id}" must list 0–${MAX_PROJECT_DATASET_ROWS} rows.` }
  }
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r]
    if (!Array.isArray(row) || row.length !== columns.length || !(row as unknown[]).every(validateCell)) {
      return { error: `Dataset "${id}" row ${r + 1} does not match the column schema.` }
    }
  }
  if (!isRecord(provenance) || !['paste', 'file', 'manual', 'example'].includes(provenance['kind'] as string)) {
    return { error: `Dataset "${id}" has an invalid provenance.` }
  }
  if (provenance['fileName'] !== undefined && typeof provenance['fileName'] !== 'string') {
    return { error: `Dataset "${id}" has an invalid file name.` }
  }
  if (typeof provenance['importedAt'] !== 'string' || !Number.isInteger(provenance['skippedEmpty']) || (provenance['skippedEmpty'] as number) < 0) {
    return { error: `Dataset "${id}" has an invalid import record.` }
  }
  if (importOptions !== undefined) {
    if (
      !isRecord(importOptions) ||
      !([',', ';', '\t'] as unknown[]).includes(importOptions['delimiter']) ||
      (importOptions['decimal'] !== '.' && importOptions['decimal'] !== ',') ||
      !(importOptions['hasHeader'] === null || typeof importOptions['hasHeader'] === 'boolean') ||
      !isRecord(importOptions['typeOverrides'])
    ) {
      return { error: `Dataset "${id}" has invalid import options.` }
    }
    for (const [key, type] of Object.entries(importOptions['typeOverrides'] as Record<string, unknown>)) {
      if (!/^\d+$/.test(key) || (type !== 'numeric' && type !== 'categorical')) {
        return { error: `Dataset "${id}" has an invalid type override.` }
      }
    }
  }
  if (!Array.isArray(cleaningLog) || cleaningLog.length > MAX_PROJECT_CLEANING_ENTRIES) {
    return { error: `Dataset "${id}" has an invalid cleaning log.` }
  }
  for (const entry of cleaningLog) {
    if (!isRecord(entry) || typeof entry['action'] !== 'string' || typeof entry['detail'] !== 'string' || (entry['action'] as string).length > 80 || (entry['detail'] as string).length > 500) {
      return { error: `Dataset "${id}" has an invalid cleaning entry.` }
    }
  }
  if (
    !isRecord(missingSummary) ||
    !Array.isArray(missingSummary['nullsPerColumn']) ||
    (missingSummary['nullsPerColumn'] as unknown[]).length !== columns.length ||
    !(missingSummary['nullsPerColumn'] as unknown[]).every((n) => Number.isInteger(n) && (n as number) >= 0) ||
    !Number.isInteger(missingSummary['rowsWithMissing']) ||
    (missingSummary['rowsWithMissing'] as number) < 0
  ) {
    return { error: `Dataset "${id}" has an invalid missing summary.` }
  }
  return {
    dataset: {
      id,
      name,
      columns: (columns as unknown[]).map((col) => {
        const record = col as Record<string, unknown>
        return {
          id: record['id'] as string,
          name: record['name'] as string,
          type: record['type'] as 'numeric' | 'categorical',
          ...(typeof record['unit'] === 'string' ? { unit: record['unit'] } : {}),
        }
      }),
      rows: (rows as unknown[][]).map((row) => row.map((cell) => cell as ProjectCell)),
      provenance: {
        kind: (provenance as Record<string, unknown>)['kind'] as ProjectDataset['provenance']['kind'],
        ...((provenance as Record<string, unknown>)['fileName'] !== undefined ? { fileName: (provenance as Record<string, unknown>)['fileName'] as string } : {}),
        importedAt: (provenance as Record<string, unknown>)['importedAt'] as string,
        skippedEmpty: (provenance as Record<string, unknown>)['skippedEmpty'] as number,
      },
      ...(importOptions === undefined
        ? {}
        : {
            importOptions: {
              delimiter: (importOptions as Record<string, unknown>)['delimiter'] as ',' | ';' | '\t',
              decimal: (importOptions as Record<string, unknown>)['decimal'] as '.' | ',',
              hasHeader: (importOptions as Record<string, unknown>)['hasHeader'] as boolean | null,
              typeOverrides: { ...(importOptions as Record<string, unknown>)['typeOverrides'] as Record<string, 'numeric' | 'categorical'> },
            },
          }),
      cleaningLog: (cleaningLog as unknown[]).map((entry) => ({ action: (entry as Record<string, string>)['action'] ?? '', detail: (entry as Record<string, string>)['detail'] ?? '' })),
      missingSummary: {
        nullsPerColumn: [...(missingSummary as { nullsPerColumn: number[] })['nullsPerColumn']],
        rowsWithMissing: (missingSummary as { rowsWithMissing: number })['rowsWithMissing'],
      },
    },
  }
}

function validatePlotConfig(value: unknown, datasetId: string): { plot?: ProjectDatasetAnalysis['plot']; error?: string } {
  if (!isRecord(value)) {
    return { error: `Analysis for "${datasetId}" has an invalid plot.` }
  }
  const text = (key: string, max: number): string | null => {
    const field = value[key]
    if (typeof field !== 'string' || field.length > max) {
      return null
    }
    return field
  };
  const title = text('title', 200)
  const xLabel = text('xLabel', 120)
  const yLabel = text('yLabel', 120)
  if (title === null || xLabel === null || yLabel === null) {
    return { error: `Analysis for "${datasetId}" has invalid plot text.` }
  }
  if (!['scatter', 'line', 'bar', 'histogram'].includes(value['kind'] as string)) {
    return { error: `Analysis for "${datasetId}" has an unknown plot kind.` }
  }
  for (const key of ['xColumn', 'yColumn', 'seriesColumn'] as const) {
    const field = value[key]
    if (field !== null && (typeof field !== 'string' || field.length > 16)) {
      return { error: `Analysis for "${datasetId}" has an invalid plot column.` }
    }
  }
  if (value['sort'] !== 'row-order' && value['sort'] !== 'x-ascending') {
    return { error: `Analysis for "${datasetId}" has an unknown sort.` }
  }
  if (typeof value['showGrid'] !== 'boolean') {
    return { error: `Analysis for "${datasetId}" has an invalid grid flag.` }
  }
  if (!Array.isArray(value['hiddenSeries']) || (value['hiddenSeries'] as unknown[]).length > 32 || !(value['hiddenSeries'] as unknown[]).every((s) => typeof s === 'string')) {
    return { error: `Analysis for "${datasetId}" has an invalid series list.` }
  }
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'tickX', 'tickY'] as const) {
    if (!isNullableFinite(value[key])) {
      return { error: `Analysis for "${datasetId}" has an invalid plot bound.` }
    }
  }
  if ((value['xScale'] !== 'linear' && value['xScale'] !== 'log') || (value['yScale'] !== 'linear' && value['yScale'] !== 'log')) {
    return { error: `Analysis for "${datasetId}" has an unknown axis scale.` }
  }
  const checkError = (source: unknown, asymmetric: boolean): source is ProjectErrorSource => {
    if (!isRecord(source) || typeof source['mode'] !== 'string') {
      return false
    }
    if (source['mode'] === 'none') {
      return true
    }
    if (source['mode'] === 'column') {
      return typeof source['column'] === 'string'
    }
    if (asymmetric && source['mode'] === 'asymmetric') {
      return typeof source['upper'] === 'string' && typeof source['lower'] === 'string'
    }
    if (source['mode'] === 'fixed') {
      return isFiniteNumber(source['value']) && (source['value'] as number) >= 0
    }
    return false
  };
  if (!checkError(value['yError'], true) || !checkError(value['xError'], false)) {
    return { error: `Analysis for "${datasetId}" has an invalid uncertainty mapping.` }
  }
  return {
    plot: {
      kind: value['kind'] as ProjectDatasetAnalysis['plot']['kind'],
      xColumn: value['xColumn'] as string | null,
      yColumn: value['yColumn'] as string | null,
      seriesColumn: value['seriesColumn'] as string | null,
      title,
      xLabel,
      yLabel,
      sort: value['sort'] as 'row-order' | 'x-ascending',
      showGrid: value['showGrid'] as boolean,
      hiddenSeries: [...(value['hiddenSeries'] as string[])],
      xMin: value['xMin'] as number | null,
      xMax: value['xMax'] as number | null,
      yMin: value['yMin'] as number | null,
      yMax: value['yMax'] as number | null,
      xScale: value['xScale'] as 'linear' | 'log',
      yScale: value['yScale'] as 'linear' | 'log',
      tickX: value['tickX'] as number | null,
      tickY: value['tickY'] as number | null,
      yError: value['yError'] as ProjectErrorSource,
      xError: value['xError'] as ProjectErrorSource,
    },
  }
}

function validateAnalysis(value: unknown, datasetId: string): { analysis?: ProjectDatasetAnalysis; error?: string } {
  if (!isRecord(value)) {
    return { error: `Analysis for "${datasetId}" is not an object.` }
  }
  const plot = validatePlotConfig(value['plot'], datasetId)
  if (plot.error !== undefined || plot.plot === undefined) {
    return { error: plot.error }
  }
  if (!isRecord(value['fit'])) {
    return { error: `Analysis for "${datasetId}" has an invalid fit.` }
  }
  const fit = value['fit'] as Record<string, unknown>
  if (!['line', 'poly', 'exp', 'log', 'power', 'none'].includes(fit['model'] as string)) {
    return { error: `Analysis for "${datasetId}" has an unknown fit model.` }
  }
  if (!Number.isInteger(fit['degree'])) {
    return { error: `Analysis for "${datasetId}" has an invalid fit degree.` }
  }
  if ((fit['xId'] !== null && typeof fit['xId'] !== 'string') || (fit['yId'] !== null && typeof fit['yId'] !== 'string')) {
    return { error: `Analysis for "${datasetId}" has an invalid fit configuration.` }
  }
  if (!['none', 'column', 'fixed'].includes(fit['weightMode'] as string) || typeof fit['weightColumn'] !== 'string' || typeof fit['weightFixed'] !== 'string' || (fit['weightFixed'] as string).length > 32) {
    return { error: `Analysis for "${datasetId}" has an invalid weight configuration.` }
  }
  if (value['fitResult'] !== null) {
    const result = value['fitResult']
    if (
      !isRecord(result) ||
      !['line', 'poly', 'exp', 'log', 'power'].includes(result['model'] as string) ||
      !Array.isArray(result['coefficients']) ||
      (result['coefficients'] as unknown[]).length > 7 ||
      !(result['coefficients'] as unknown[]).every(isFiniteNumber) ||
      !Number.isInteger(result['n']) ||
      !Number.isInteger(result['skipped']) ||
      !(result['rSquared'] === null || isFiniteNumber(result['rSquared'])) ||
      !isFiniteNumber(result['residualStd']) ||
      !isFiniteNumber(result['rmse']) ||
      !isFiniteNumber(result['mae']) ||
      !Number.isInteger((result as Record<string, unknown>)['dof']) ||
      ((result as Record<string, unknown>)['dof'] as number) < 1 ||
      !isFiniteNumber(result['minResidual']) ||
      !isFiniteNumber(result['maxResidual']) ||
      !Array.isArray(result['warnings']) ||
      (result['warnings'] as unknown[]).length > 20 ||
      !(result['warnings'] as unknown[]).every((w) => typeof w === 'string' && (w as string).length <= 280) ||
      typeof result['methodNote'] !== 'string' ||
      (result['methodNote'] as string).length > 280
    ) {
      return { error: `Analysis for "${datasetId}" has invalid fit result metadata.` }
    }
  }
  if (!isRecord(value['export'])) {
    return { error: `Analysis for "${datasetId}" has invalid export settings.` }
  }
  const expo = value['export'] as Record<string, unknown>
  // figureSize arrived after v6: older bundles default to 'M' (tolerated, documented).
  const figureSize = expo['figureSize'] === undefined ? 'M' : expo['figureSize']
  if (
    !['svg', 'png', 'csv'].includes(expo['format'] as string) ||
    !isFiniteNumber(expo['scale']) ||
    (expo['background'] !== 'white' && expo['background'] !== 'transparent') ||
    typeof expo['caption'] !== 'string' ||
    (expo['caption'] as string).length > 560 ||
    !['dataset', 'plotted-points', 'residuals', 'fit-summary'].includes(expo['csvTable'] as string) ||
    !['S', 'M', 'L'].includes(figureSize as string)
  ) {
    return { error: `Analysis for "${datasetId}" has invalid export settings.` }
  }
  return {
    analysis: {
      plot: plot.plot,
      fit: {
        model: fit['model'] as ProjectDatasetAnalysis['fit']['model'],
        degree: fit['degree'] as number,
        xId: fit['xId'] as string | null,
        yId: fit['yId'] as string | null,
        weightMode: fit['weightMode'] as ProjectDatasetAnalysis['fit']['weightMode'],
        weightColumn: fit['weightColumn'] as string,
        weightFixed: fit['weightFixed'] as string,
      },
      fitResult:
        value['fitResult'] === null
          ? null
          : {
              model: (value['fitResult'] as Record<string, unknown>)['model'] as ProjectFitModel,
              coefficients: [...((value['fitResult'] as Record<string, unknown>)['coefficients'] as number[])],
              degree: (value['fitResult'] as Record<string, unknown>)['degree'] as number,
              n: (value['fitResult'] as Record<string, unknown>)['n'] as number,
              dof: (value['fitResult'] as Record<string, unknown>)['dof'] as number,
              skipped: (value['fitResult'] as Record<string, unknown>)['skipped'] as number,
              rSquared: (value['fitResult'] as Record<string, unknown>)['rSquared'] as number | null,
              residualStd: (value['fitResult'] as Record<string, unknown>)['residualStd'] as number,
              rmse: (value['fitResult'] as Record<string, unknown>)['rmse'] as number,
              mae: (value['fitResult'] as Record<string, unknown>)['mae'] as number,
              minResidual: (value['fitResult'] as Record<string, unknown>)['minResidual'] as number,
              maxResidual: (value['fitResult'] as Record<string, unknown>)['maxResidual'] as number,
              warnings: [...((value['fitResult'] as Record<string, unknown>)['warnings'] as string[])],
              methodNote: (value['fitResult'] as Record<string, unknown>)['methodNote'] as string,
            },
      export: {
        format: expo['format'] as ProjectDatasetAnalysis['export']['format'],
        scale: expo['scale'] as number,
        background: expo['background'] as ProjectDatasetAnalysis['export']['background'],
        caption: expo['caption'] as string,
        csvTable: expo['csvTable'] as ProjectDatasetAnalysis['export']['csvTable'],
        figureSize: figureSize as ProjectDatasetAnalysis['export']['figureSize'],
      },
    },
  }
}

export function validateProjectText(text: string): ValidateResult {
  // Absolute ceiling first (parse is bounded); per-version caps apply after the version is known.
  if (text.length > MAX_PROJECT_V6_CHARS) {
    return { ok: false, error: `Project file is too large (${(text.length / 1024 / 1024).toFixed(1)} MB; maximum is 2 MB). Export large datasets as CSV instead.` }
  }
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  if (!isRecord(data)) {
    return { ok: false, error: 'Project must be a JSON object.' }
  }

  const version = data['version']
  if (typeof version === 'number' && version < PROJECT_FORMAT_VERSION && text.length > MAX_PROJECT_FILE_CHARS) {
    return { ok: false, error: `Project file is too large (${(text.length / 1024).toFixed(0)} KB; maximum is 256 KB for pre-v6 projects).` }
  }
  const migrate = typeof version === 'number' ? MIGRATIONS[version] : undefined
  if (version !== PROJECT_FORMAT_VERSION && migrate === undefined) {
    if (Number.isInteger(version) && (version as number) > PROJECT_FORMAT_VERSION) {
      return { ok: false, error: `Project version ${String(version)} is newer than this GraphCraft (v${PROJECT_FORMAT_VERSION}). Update GraphCraft to open it — it will not be guessed.` }
    }
    return { ok: false, error: 'Project has a missing or unsupported version.' }
  }

  let migrated: Record<string, unknown> = data
  if (migrate !== undefined) {
    migrated = migrate(data)
  }
  if (migrated['format'] !== PROJECT_FORMAT_TAG) {
    return { ok: false, error: 'Not a GraphCraft project file.' }
  }
  const full = withDefaults(migrated)

  if (typeof full['title'] !== 'string' || full['title'].length > MAX_TITLE_CHARS) {
    return { ok: false, error: `Project title must be text up to ${MAX_TITLE_CHARS} characters.` }
  }
  const title = (full['title'] as string).length === 0 ? 'Untitled project' : (full['title'] as string)

  if (!Array.isArray(full['expressions']) || full['expressions'].length > MAX_PROJECT_ROWS) {
    return { ok: false, error: `Project must list 0–${MAX_PROJECT_ROWS} expressions.` }
  }
  const expressions: ProjectExpression[] = []
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()
  for (let i = 0; i < (full['expressions'] as unknown[]).length; i += 1) {
    const checked = validateExpression((full['expressions'] as unknown[])[i], i)
    if (checked.error !== undefined || checked.expression === undefined) {
      return { ok: false, error: checked.error ?? 'Invalid expression.' }
    }
    if (seenIds.has(checked.expression.id)) {
      return { ok: false, error: `Duplicate expression id "${checked.expression.id}".` }
    }
    seenIds.add(checked.expression.id)
    if (checked.expression.label !== '') {
      const folded = checked.expression.label.toLowerCase()
      if (seenLabels.has(folded)) {
        return { ok: false, error: `Duplicate expression label "${checked.expression.label}".` }
      }
      seenLabels.add(folded)
    }
    expressions.push(checked.expression)
  }

  if (!isRecord(full['viewport'])) {
    return { ok: false, error: 'Project viewport is missing or invalid.' }
  }
  const dataLab = validateDataLabSection(full['dataLab'])
  if (dataLab.error !== undefined) {
    return { ok: false, error: dataLab.error }
  }
  const surfaces = validateSurfaces3d(full['surfaces3d'])
  if (surfaces.error !== undefined) {
    return { ok: false, error: surfaces.error }
  }
  const fields = validateFields2d(full['fields2d'])
  if (fields.error !== undefined) {
    return { ok: false, error: fields.error }
  }
  const scatters = validateScatters3d(full['scatters3d'])
  if (scatters.error !== undefined) {
    return { ok: false, error: scatters.error }
  }
  const rawParameters = full['parameters'] === undefined ? [] : full['parameters']
  if (!Array.isArray(rawParameters) || rawParameters.length > MAX_PROJECT_PARAMETERS) {
    return { ok: false, error: `Project must list 0–${MAX_PROJECT_PARAMETERS} parameters.` }
  }
  const parameters: ProjectParameter[] = []
  const seenParams = new Set<string>()
  for (let i = 0; i < rawParameters.length; i += 1) {
    const param = rawParameters[i]
    if (!isRecord(param) || typeof param['name'] !== 'string' || !isValidParameterName(param['name'] as string)) {
      return { ok: false, error: `Parameter ${i + 1} has an invalid name.` }
    }
    const name = param['name'] as string
    if (seenParams.has(name)) {
      return { ok: false, error: `Duplicate parameter "${name}".` }
    }
    seenParams.add(name)
    const { value, min, max, step, defaultValue } = param
    for (const [key, field] of [['value', value], ['min', min], ['max', max], ['step', step], ['default', defaultValue]] as const) {
      if (!isFiniteNumber(field)) {
        return { ok: false, error: `Parameter "${name}" needs a finite ${key}.` }
      }
    }
    const numbers = { value: value as number, min: min as number, max: max as number, step: step as number, defaultValue: defaultValue as number }
    if (Math.abs(numbers.min) > 1e9 || Math.abs(numbers.max) > 1e9) {
      return { ok: false, error: `Parameter "${name}" bounds must stay within ±1e9.` }
    }
    if (!(numbers.max > numbers.min)) {
      return { ok: false, error: `Parameter "${name}" needs min below max.` }
    }
    if (!(numbers.step > 0) || numbers.step < 1e-9) {
      return { ok: false, error: `Parameter "${name}" needs a positive step of at least 1e-9.` }
    }
    if ((numbers.max - numbers.min) / numbers.step > 100000) {
      return { ok: false, error: `Parameter "${name}" allows more than 100000 steps.` }
    }
    if (numbers.value < numbers.min || numbers.value > numbers.max || numbers.defaultValue < numbers.min || numbers.defaultValue > numbers.max) {
      return { ok: false, error: `Parameter "${name}" value and default must stay inside [min, max].` }
    }
    parameters.push({ name, ...numbers })
  }
  const { xMin, xMax, yMin, yMax, equalAspect, showGrid } = full['viewport']
  if (!isFiniteNumber(xMin) || !isFiniteNumber(xMax) || !isFiniteNumber(yMin) || !isFiniteNumber(yMax) || !(xMax > xMin) || !(yMax > yMin)) {
    return { ok: false, error: 'Viewport ranges must be finite with max greater than min on both axes.' }
  }
  if (typeof equalAspect !== 'boolean' || typeof showGrid !== 'boolean') {
    return { ok: false, error: 'Viewport settings must be true/false flags.' }
  }

  return {
    ok: true,
    project: {
      format: PROJECT_FORMAT_TAG,
      version: PROJECT_FORMAT_VERSION,
      title,
      expressions,
      viewport: { xMin, xMax, yMin, yMax, equalAspect, showGrid },
      parameters,
      dataLab: dataLab.dataLab,
      ...validateLearnAnnotations(full['learnAnnotations']),
      ...(surfaces.surfaces3d === undefined ? {} : { surfaces3d: surfaces.surfaces3d }),
      ...(fields.fields2d === undefined ? {} : { fields2d: fields.fields2d }),
      ...(scatters.scatters3d === undefined ? {} : { scatters3d: scatters.scatters3d }),
    },
  }
}

function validateSurfaces3d(value: unknown): { surfaces3d?: ProjectSurface3D[]; error?: string } {
  if (value === undefined) {
    return {}
  }
  if (!Array.isArray(value) || value.length > MAX_PROJECT_SURFACES) {
    return { error: `Project must list 0–${MAX_PROJECT_SURFACES} 3D surfaces.` }
  }
  const surfaces: ProjectSurface3D[] = []
  const seenIds = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { error: 'A 3D surface entry is not an object.' }
    }
    const { id, source, domain, resolution, camera, showGrid, title } = entry
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || seenIds.has(id)) {
      return { error: 'A 3D surface has a missing, overlong, or duplicate id.' }
    }
    seenIds.add(id)
    if (typeof source !== 'string' || source.trim() === '' || source.length > MAX_EXPRESSION_LENGTH) {
      return { error: `3D surface "${id}" needs source text (1–${MAX_EXPRESSION_LENGTH} characters).` }
    }
    if (
      !isRecord(domain) ||
      !isFiniteNumber(domain['xMin']) ||
      !isFiniteNumber(domain['xMax']) ||
      !isFiniteNumber(domain['yMin']) ||
      !isFiniteNumber(domain['yMax']) ||
      !((domain['xMax'] as number) > (domain['xMin'] as number)) ||
      !((domain['yMax'] as number) > (domain['yMin'] as number))
    ) {
      return { error: `3D surface "${id}" has an invalid domain (finite bounds, max above min).` }
    }
    if (!Number.isInteger(resolution) || (resolution as number) < MIN_PROJECT_SURFACE_GRID || (resolution as number) > MAX_PROJECT_SURFACE_GRID) {
      return { error: `3D surface "${id}" has an invalid resolution (${MIN_PROJECT_SURFACE_GRID}–${MAX_PROJECT_SURFACE_GRID}).` }
    }
    if (
      !isRecord(camera) ||
      !isFiniteNumber(camera['yaw']) ||
      !isFiniteNumber(camera['pitch']) ||
      !isFiniteNumber(camera['distance']) ||
      !isFiniteNumber(camera['panX']) ||
      !isFiniteNumber(camera['panY']) ||
      (camera['distance'] as number) <= 0
    ) {
      return { error: `3D surface "${id}" has an invalid camera (finite angles, positive distance).` }
    }
    if (typeof showGrid !== 'boolean' || typeof title !== 'string' || title.length > MAX_TITLE_CHARS) {
      return { error: `3D surface "${id}" has invalid display flags.` }
    }
    // Appearance arrived with shaded/wireframe modes; older files default to solid.
    const appearance = (entry as Record<string, unknown>)['appearance']
    if (appearance !== undefined && appearance !== 'solid' && appearance !== 'wireframe' && appearance !== 'shaded') {
      return { error: `3D surface "${id}" has an unknown appearance.` }
    }
    surfaces.push({
      id,
      source,
      domain: { xMin: domain['xMin'] as number, xMax: domain['xMax'] as number, yMin: domain['yMin'] as number, yMax: domain['yMax'] as number },
      resolution: resolution as number,
      camera: { yaw: (camera as Record<string, number>)['yaw'] ?? 0, pitch: (camera as Record<string, number>)['pitch'] ?? 0, distance: (camera as Record<string, number>)['distance'] ?? 12, panX: (camera as Record<string, number>)['panX'] ?? 0, panY: (camera as Record<string, number>)['panY'] ?? 0 },
      showGrid,
      title,
      appearance: (appearance ?? 'solid') as ProjectSurface3D['appearance'],
    })
  }
  return { surfaces3d: surfaces }
}

function validateFields2d(value: unknown): { fields2d?: ProjectField[]; error?: string } {
  if (value === undefined) {
    return {}
  }
  if (!Array.isArray(value) || value.length > MAX_PROJECT_FIELDS) {
    return { error: `Project must list 0–${MAX_PROJECT_FIELDS} 2D fields.` }
  }
  const fields: ProjectField[] = []
  const seenIds = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { error: 'A 2D field entry is not an object.' }
    }
    const { id, mode, source, uSource, vSource, domain, resolution, levelCount, levelList, colorPolicy, scalePolicy, fixedMin, fixedMax, arrowMode, showGrid, title } = entry
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || seenIds.has(id)) {
      return { error: 'A 2D field has a missing, overlong, or duplicate id.' }
    }
    seenIds.add(id)
    if (mode !== 'contour' && mode !== 'heatmap' && mode !== 'vectors') {
      return { error: `2D field "${id}" has an unknown display mode.` }
    }
    for (const [key, text] of [['source', source], ['uSource', uSource], ['vSource', vSource], ['levelList', levelList], ['fixedMin', fixedMin], ['fixedMax', fixedMax]] as const) {
      if (typeof text !== 'string' || (text as string).length > MAX_EXPRESSION_LENGTH) {
        return { error: `2D field "${id}" has invalid ${key} text.` }
      }
    }
    if ((source as string).trim() === '' || (uSource as string).trim() === '' || (vSource as string).trim() === '') {
      return { error: `2D field "${id}" needs source expressions.` }
    }
    if (
      !isRecord(domain) ||
      !isFiniteNumber(domain['xMin']) ||
      !isFiniteNumber(domain['xMax']) ||
      !isFiniteNumber(domain['yMin']) ||
      !isFiniteNumber(domain['yMax']) ||
      !((domain['xMax'] as number) > (domain['xMin'] as number)) ||
      !((domain['yMax'] as number) > (domain['yMin'] as number))
    ) {
      return { error: `2D field "${id}" has an invalid domain (finite bounds, max above min).` }
    }
    if (!Number.isInteger(resolution) || (resolution as number) < 8 || (resolution as number) > 128) {
      return { error: `2D field "${id}" has an invalid resolution (8–128).` }
    }
    if (!Number.isInteger(levelCount) || (levelCount as number) < 1 || (levelCount as number) > 24) {
      return { error: `2D field "${id}" has an invalid level count (1–24).` }
    }
    if ((colorPolicy !== 'viridis' && colorPolicy !== 'blue-red' && colorPolicy !== 'diverging') || !['auto', 'symmetric', 'fixed'].includes(scalePolicy as string) || (arrowMode !== 'magnitude' && arrowMode !== 'unit')) {
      return { error: `2D field "${id}" has an invalid colour, scale, or arrow policy.` }
    }
    if (typeof showGrid !== 'boolean' || typeof title !== 'string' || title.length > MAX_TITLE_CHARS) {
      return { error: `2D field "${id}" has invalid display flags.` }
    }
    fields.push({
      id,
      mode,
      source: source as string,
      uSource: uSource as string,
      vSource: vSource as string,
      domain: { xMin: domain['xMin'] as number, xMax: domain['xMax'] as number, yMin: domain['yMin'] as number, yMax: domain['yMax'] as number },
      resolution: resolution as number,
      levelCount: levelCount as number,
      levelList: levelList as string,
      colorPolicy: colorPolicy as ProjectField['colorPolicy'],
      scalePolicy: scalePolicy as ProjectField['scalePolicy'],
      fixedMin: fixedMin as string,
      fixedMax: fixedMax as string,
      arrowMode: arrowMode as ProjectField['arrowMode'],
      showGrid,
      title,
    })
  }
  return { fields2d: fields }
}

function validateScatters3d(value: unknown): { scatters3d?: ProjectScatter[]; error?: string } {
  if (value === undefined) {
    return {}
  }
  if (!Array.isArray(value) || value.length > MAX_PROJECT_SCATTERS) {
    return { error: `Project must list 0–${MAX_PROJECT_SCATTERS} 3D scatters.` }
  }
  const scatters: ProjectScatter[] = []
  const seenIds = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { error: 'A 3D scatter entry is not an object.' }
    }
    const { id, datasetId, xId, yId, zId, camera, title } = entry
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || seenIds.has(id)) {
      return { error: 'A 3D scatter has a missing, overlong, or duplicate id.' }
    }
    seenIds.add(id)
    // Dataset/column ids are references, not guarantees: unknown ids
    // render as empty selections, never refuse the file.
    for (const [key, ref] of [['datasetId', datasetId], ['xId', xId], ['yId', yId], ['zId', zId]] as const) {
      if (ref !== null && (typeof ref !== 'string' || (ref as string).length > 64)) {
        return { error: `3D scatter "${id}" has an invalid ${key} reference.` }
      }
    }
    if (
      !isRecord(camera) ||
      !isFiniteNumber(camera['yaw']) ||
      !isFiniteNumber(camera['pitch']) ||
      !isFiniteNumber(camera['distance']) ||
      !isFiniteNumber(camera['panX']) ||
      !isFiniteNumber(camera['panY']) ||
      (camera['distance'] as number) <= 0
    ) {
      return { error: `3D scatter "${id}" has an invalid camera (finite angles, positive distance).` }
    }
    if (typeof title !== 'string' || title.length > MAX_TITLE_CHARS) {
      return { error: `3D scatter "${id}" has an invalid title.` }
    }
    scatters.push({
      id,
      datasetId: datasetId as string | null,
      xId: xId as string | null,
      yId: yId as string | null,
      zId: zId as string | null,
      camera: {
        yaw: camera['yaw'] as number,
        pitch: camera['pitch'] as number,
        distance: camera['distance'] as number,
        panX: camera['panX'] as number,
        panY: camera['panY'] as number,
      },
      title,
    })
  }
  return { scatters3d: scatters }
}

function validateLearnAnnotations(value: unknown): { learnAnnotations?: { templateId: string } } {  // Unknown template ids are tolerated as absent (the library evolves separately).
  if (value === undefined || value === null) {
    return {}
  }
  if (!isRecord(value) || typeof value['templateId'] !== 'string' || (value['templateId'] as string).length > 48) {
    return {}
  }
  return { learnAnnotations: { templateId: value['templateId'] as string } }
}

function validateDataLabSection(value: unknown): { dataLab?: ProjectDataLab; error?: string } {
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value)) {
    return { error: 'Project Data Lab section is not an object.' }
  }
  if (!Array.isArray(value['datasets']) || (value['datasets'] as unknown[]).length > MAX_PROJECT_DATASETS) {
    return { error: `Project must list 0–${MAX_PROJECT_DATASETS} datasets.` }
  }
  const datasets: ProjectDataset[] = []
  const seenIds = new Set<string>()
  for (let i = 0; i < (value['datasets'] as unknown[]).length; i += 1) {
    const checked = validateDataset((value['datasets'] as unknown[])[i], i)
    if (checked.error !== undefined || checked.dataset === undefined) {
      return { error: checked.error }
    }
    if (seenIds.has(checked.dataset.id)) {
      return { error: `Duplicate dataset id "${checked.dataset.id}".` }
    }
    seenIds.add(checked.dataset.id)
    datasets.push(checked.dataset)
  }
  if (!isRecord(value['analyses'])) {
    return { error: 'Project analyses section is not an object.' }
  }
  const analyses: Record<string, ProjectDatasetAnalysis> = {}
  for (const [datasetId, analysis] of Object.entries(value['analyses'] as Record<string, unknown>)) {
    // Analyses for unknown datasets are ignored (tolerated, not refused).
    if (!seenIds.has(datasetId)) {
      continue
    }
    const checked = validateAnalysis(analysis, datasetId)
    if (checked.error !== undefined || checked.analysis === undefined) {
      return { error: checked.error }
    }
    analyses[datasetId] = checked.analysis
  }
  return { dataLab: { datasets, analyses } }
}
