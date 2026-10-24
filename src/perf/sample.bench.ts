import { bench } from 'vitest'
import { compileExpression } from '../math/index.ts'
import { compileRow } from '../expressions/compile.ts'
import { createExpressionId } from '../expressions/model.ts'
import { sampleFunction } from '../sampling/index.ts'
import { parseCsv } from '../data/csv.ts'
import { analyzeTable, commitAnalysis, MAX_DATASET_COLS, MAX_DATASET_ROWS } from '../data/dataset.ts'
import { extractFitPairs, fitModel } from '../data/fits.ts'
import { resolvePlot, type PlotConfig } from '../data/plots.ts'
import { sampleSurface, projectSurface, compileSurface, DEFAULT_CAMERA } from '../viz3d/surface.ts'
import { contourLevels } from '../viz3d/fields.ts'

/**
 * Performance fixtures (profiling task): reproducible workloads run
 * with `npx vitest bench src/perf`. Numbers go to
 * docs/perf/PROFILING.md — never guessed, always measured on the
 * machine at hand. Budgets below are observations, not gates.
 */

function cartesianRow(source: string): Parameters<typeof compileRow>[0] {
  return { kind: 'cartesian', id: createExpressionId(), source, visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }
}

const WORLD = { xMin: -10, xMax: 10 }
const FIELD_DOMAIN = { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }

const BIG_CSV = (() => {
  const lines = ['x,y']
  for (let i = 0; i < 10000; i += 1) {
    lines.push(`${i},${(i * 0.5).toFixed(1)}`)
  }
  return lines.join('\n')
})()

function bigPlotConfig(): PlotConfig {
  return {
    kind: 'scatter', xColumn: 'c1', yColumn: 'c2', seriesColumn: null, title: 'p', xLabel: 'x', yLabel: 'y',
    sort: 'row-order', showGrid: true, hiddenSeries: [], xMin: null, xMax: null, yMin: null, yMax: null,
    xScale: 'linear', yScale: 'linear', tickX: null, tickY: null, yError: { mode: 'none' }, xError: { mode: 'none' },
  }
}

bench('compile 100 mixed expressions', () => {
  const sources = ['x^2', 'sin(x)', '1/x', 'x^3-2*x+1', 'ln(x)', 'abs(x)', 'sqrt(x^2+1)', 'tanh(x)', 'x*sin(x)', 'e^(-x^2)']
  for (let i = 0; i < 100; i += 1) {
    compileExpression(sources[i % sources.length] ?? 'x', { variables: ['x'] })
  }
})

bench('sample smooth parabola over default world', () => {
  const compiled = compileRow(cartesianRow('x^2'))
  if (compiled.evaluatorKind === 'scalar' && compiled.evaluator !== null && 'evaluate' in compiled.evaluator) {
    sampleFunction(compiled.evaluator, { ...WORLD, pixelWidth: 800, breaks: [] })
  }
})

bench('sample high-curvature tan near poles', () => {
  const compiled = compileRow(cartesianRow('tan(x)'))
  if (compiled.evaluatorKind === 'scalar' && compiled.evaluator !== null && 'evaluate' in compiled.evaluator) {
    sampleFunction(compiled.evaluator, { ...WORLD, pixelWidth: 800, breaks: [] })
  }
})

bench('resample compiled evaluator across 30 zoom views (slider/zoom storm)', () => {
  const compiled = compileRow(cartesianRow('sin(x)+x^2/50'))
  if (compiled.evaluatorKind === 'scalar' && compiled.evaluator !== null && 'evaluate' in compiled.evaluator) {
    for (let i = 0; i < 30; i += 1) {
      const span = 20 / (1 + i * 0.1)
      sampleFunction(compiled.evaluator, { xMin: -span, xMax: span, pixelWidth: 800, breaks: [] })
    }
  }
})

bench('import 10k-row CSV (parse + analyze + commit)', () => {
  const parsed = parseCsv(BIG_CSV, { delimiter: ',', maxRows: MAX_DATASET_ROWS, maxCols: MAX_DATASET_COLS })
  if (parsed.status === 'value') {
    const analysis = analyzeTable(parsed.table, { name: 'bench', decimal: '.', hasHeader: true })
    commitAnalysis(analysis, { name: 'bench', decimal: '.', hasHeader: true }, { kind: 'paste', importedAt: '2026-10-16T00:00:00.000Z' }, parsed.table.skippedEmpty)
  }
})

bench('fit OLS line over 10k points', () => {
  const xs = Array.from({ length: 10000 }, (_, i) => i)
  const ys = xs.map((x) => 2 * x + 1)
  fitModel({ model: 'line', degree: 1, xs, ys })
})

bench('resolve 10k-point scatter plot', () => {
  const dataset = {
    id: 'bench',
    name: 'bench',
    columns: [
      { id: 'c1', name: 'x', type: 'numeric' as const },
      { id: 'c2', name: 'y', type: 'numeric' as const },
    ],
    rows: Array.from({ length: 10000 }, (_, i) => [i, 2 * i + 1] as Array<number | string | null>),
    provenance: { kind: 'manual' as const, importedAt: '2026-10-16T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
  resolvePlot(dataset, bigPlotConfig())
})

bench('sample + project 128² 3D surface', () => {
  const compiled = compileSurface('sin(x)*cos(y)', [])
  if (compiled.ok) {
    const spec = { source: 'sin(x)*cos(y)', domain: FIELD_DOMAIN, resolution: 128 }
    const sampled = sampleSurface(compiled.field, spec)
    projectSurface(sampled, spec, DEFAULT_CAMERA, { width: 640, height: 440 })
  }
})

bench('trace one contour level over default domain', () => {
  const compiled = compileSurface('x^2+y^2', [])
  if (compiled.ok) {
    contourLevels(compiled.field, 'x^2+y^2', FIELD_DOMAIN, [4], 200)
  }
})

bench('extract fit pairs from 10k mixed rows', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => (i % 50 === 0 ? [null, i] : [i, 2 * i]) as Array<number | string | null>)
  extractFitPairs(rows, 0, 1)
})
