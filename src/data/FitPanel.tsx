import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { formatDisplay } from '../calculator/format.ts'
import { DataPlot } from './DataPlot.tsx'
import { evaluateModelFit, extractFitPairs, fitModel, MAX_POLY_DEGREE, type FitModel, type FitResult } from './fits.ts'
import type { PersistedFitResultMeta, PersistedFitSelection } from './persistence.ts'
import { plotWorld, type PlotConfig, type ResolvedPlot } from './plots.ts'
import type { Dataset } from './dataset.ts'
import type { WorldRect } from '../graph/coordinate.ts'

interface FitPanelProps {
  dataset: Dataset
  plotConfig: PlotConfig
  initialFit?: PersistedFitSelection
  /** Fitted curve points for the graph overlay (null when no valid fit). */
  onFitCurve: (points: Array<{ x: number; y: number }> | null, label: string | null) => void
  /** Selection + full-precision result metadata for persistence (null when no valid fit). */
  onFitState?: (selection: PersistedFitSelection, result: PersistedFitResultMeta | null) => void
}

const CURVE_POINTS = 100

function formatEquation(fit: FitResult): string {
  const [a = NaN, b = NaN] = fit.coefficients
  if (fit.model === 'exp') {
    return `y = ${formatDisplay(a)}·e^(${formatDisplay(b)}·x)`
  }
  if (fit.model === 'log') {
    return `y = ${formatDisplay(a)} + ${formatDisplay(b)}·ln(x)`
  }
  if (fit.model === 'power') {
    return `y = ${formatDisplay(a)}·x^${formatDisplay(b)}`
  }
  const terms: string[] = []
  fit.coefficients.forEach((c, d) => {
    if (d === 0) {
      terms.push(formatDisplay(c))
      return
    }
    const variable = d === 1 ? 'x' : `x^${d}`
    terms.push(`${c < 0 ? '−' : '+'} ${formatDisplay(Math.abs(c))}·${variable}`)
  })
  const joined = terms.join(' ')
  return `y = ${joined.startsWith('+ ') ? joined.slice(2) : joined}`
}

function fitText(fit: FitResult): string {
  const lines = [
    formatEquation(fit),
    `model ${fit.model}, n = ${fit.n} observations, dof = ${fit.dof}${fit.model === 'poly' ? `, degree ${fit.degree}` : ''}`,
    fit.rSquared === null ? 'R²: undefined (constant Y)' : `R² = ${formatDisplay(fit.rSquared)}`,
    `residual std = ${formatDisplay(fit.residualStd)}, RMSE = ${formatDisplay(fit.rmse)}, MAE = ${formatDisplay(fit.mae)}, range [${formatDisplay(fit.minResidual)}, ${formatDisplay(fit.maxResidual)}]`,
    fit.methodNote,
    ...fit.warnings.map((w) => `Warning: ${w}`),
  ]
  return lines.join('\n')
}

/**
 * Fit panel (Stage 4 DATA-03, completed S4.4): line, bounded polynomial,
 * and three linearized nonlinear models (exponential, logarithmic,
 * power) over dataset columns with optional 1/σ² weighting, residual
 * plot + table, and a plot-aware overlay. The fit runs automatically
 * from explicit controls (model, degree, columns, weights); failures
 * and warnings display in place, and the fitted curve lifts to the
 * graph as a log-aware overlay clipped to explicit bounds (hidden on
 * bar/histogram). No universal solver is claimed — only the documented
 * selection above, each labelled approximate where linearization applies.
 */
export function FitPanel({ dataset, plotConfig, initialFit, onFitCurve, onFitState }: FitPanelProps): React.JSX.Element {
  const numeric = useMemo(() => dataset.columns.filter((col) => col.type === 'numeric'), [dataset])
  const [model, setModel] = useState<FitModel | 'none'>(initialFit?.model ?? 'line')
  const [degree, setDegree] = useState(initialFit?.degree ?? 2)
  const [xId, setXId] = useState<string | null>(initialFit?.xId ?? numeric[0]?.id ?? null)
  const [yId, setYId] = useState<string | null>(initialFit?.yId ?? numeric[1]?.id ?? numeric[0]?.id ?? null)
  const [copied, setCopied] = useState(false)
  const [weightMode, setWeightMode] = useState<'none' | 'column' | 'fixed'>(initialFit?.weightMode ?? 'none')
  const [weightColumn, setWeightColumn] = useState(initialFit?.weightColumn ?? '')
  const [weightFixed, setWeightFixed] = useState(initialFit?.weightFixed ?? '1')

  const outcome = useMemo(() => {
    if (model === 'none' || xId === null || yId === null) {
      return null
    }
    const xIndex = dataset.columns.findIndex((col) => col.id === xId)
    const yIndex = dataset.columns.findIndex((col) => col.id === yId)
    if (xIndex < 0 || yIndex < 0) {
      return null
    }
    const weightColumnId = weightColumn === '' ? (numeric[0]?.id ?? '') : weightColumn
    const weightIndex = dataset.columns.findIndex((col) => col.id === weightColumnId)
    const sigmaFor = (row: number): number | null => {
      if (weightMode === 'fixed') {
        const value = Number(weightFixed)
        return Number.isFinite(value) && value > 0 ? value : null
      }
      if (weightMode === 'column' && weightIndex >= 0) {
        const cell = dataset.rows[row]?.[weightIndex]
        return typeof cell === 'number' && Number.isFinite(cell) && cell > 0 ? cell : null
      }
      return null
    }
    const { xs, ys, skipped, kept } = extractFitPairs(dataset.rows, xIndex, yIndex)
    const sigmas = weightMode === 'none' ? undefined : kept.map((row) => sigmaFor(row))
    const result = fitModel({ model, degree, xs, ys, sigmas })
    return { result, skipped, xIndex, yIndex, kept, xs, ys }
  }, [dataset, model, degree, xId, yId, weightMode, weightColumn, weightFixed, numeric])

  const curve = useMemo(() => {
    if (outcome === null || outcome.result.status !== 'value') {
      return null
    }
    const { xs } = extractFitPairs(dataset.rows, outcome.xIndex, outcome.yIndex)
    if (xs.length === 0) {
      return null
    }
    let lo = Math.min(...xs)
    let hi = Math.max(...xs)
    // Respect explicit axis bounds: the overlay spans the intersection of
    // the fitted data range and the configured view, never a wider range.
    // Non-positive explicit bounds on log axes fall back to the data range.
    const lineLike = plotConfig.kind === 'scatter' || plotConfig.kind === 'line'
    const xLog = lineLike && plotConfig.xScale === 'log'
    if (plotConfig.xMin !== null && Number.isFinite(plotConfig.xMin) && (!xLog || plotConfig.xMin > 0)) {
      lo = Math.max(lo, plotConfig.xMin)
    }
    if (plotConfig.xMax !== null && Number.isFinite(plotConfig.xMax) && (!xLog || plotConfig.xMax > 0)) {
      hi = Math.min(hi, plotConfig.xMax)
    }
    if (!(hi > lo)) {
      // Degenerate intersection (e.g. bounds exclude all data): fall back to data span.
      lo = Math.min(...xs)
      hi = Math.max(...xs)
    }
    const span = hi - lo || 1
    const { coefficients, model: fitKind } = outcome.result.fit
    const sampled = Array.from({ length: CURVE_POINTS }, (_, i) => {
      const x = lo + (span * i) / (CURVE_POINTS - 1)
      return { x, y: evaluateModelFit(fitKind, coefficients, x) }
    }).filter((p) => Number.isFinite(p.y))
    // On log X the renderer maps through log10: non-positive samples have
    // no position and are dropped here with the same honesty as plot points.
    // Log/power models are additionally undefined at x ≤ 0 by domain.
    const needsPositiveX = fitKind === 'log' || fitKind === 'power'
    const filtered = (xLog || needsPositiveX ? sampled.filter((p) => p.x > 0) : sampled).filter((p) => p.y !== undefined)
    return filtered.length >= 2 ? filtered : null
  }, [dataset, outcome, plotConfig.kind, plotConfig.xScale, plotConfig.xMin, plotConfig.xMax])

  useEffect(() => {
    if (curve === null || outcome === null || outcome.result.status !== 'value') {
      onFitCurve(null, null)
      return
    }
    onFitCurve(curve, `Fit: ${formatEquation(outcome.result.fit)}`)
    // Curve identity follows the outcome; the callback is stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve])

  async function copyFit(text: string): Promise<void> {
    setCopied(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const fitted = useMemo(
    () => (outcome !== null && outcome.result.status === 'value' ? { fit: outcome.result.fit, skipped: outcome.skipped, xs: outcome.xs, ys: outcome.ys } : null),
    [outcome],
  )

  useEffect(() => {
    const selection: PersistedFitSelection = { model, degree, xId, yId, weightMode, weightColumn, weightFixed }
    const result: PersistedFitResultMeta | null =
      fitted === null
        ? null
        : {
            model: fitted.fit.model,
            coefficients: [...fitted.fit.coefficients],
            degree: fitted.fit.degree,
            n: fitted.fit.n,
            dof: fitted.fit.dof,
            skipped: fitted.skipped,
            rSquared: fitted.fit.rSquared,
            residualStd: fitted.fit.residualStd,
            rmse: fitted.fit.rmse,
            mae: fitted.fit.mae,
            minResidual: fitted.fit.minResidual,
            maxResidual: fitted.fit.maxResidual,
            warnings: [...fitted.fit.warnings],
            methodNote: fitted.fit.methodNote,
          }
    onFitState?.(selection, result)
    // Selection identity follows the outcome; the callback is stable per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, degree, xId, yId, weightMode, weightColumn, weightFixed, fitted])
  const overlaySuppressed = plotConfig.kind === 'bar' || plotConfig.kind === 'histogram'
  const fitXName = dataset.columns.find((col) => col.id === xId)?.name ?? '—'
  const fitYName = dataset.columns.find((col) => col.id === yId)?.name ?? '—'
  const plotXName = plotConfig.xColumn === null ? '(row index)' : (dataset.columns.find((col) => col.id === plotConfig.xColumn)?.name ?? '(unknown)')
  const plotYName = plotConfig.yColumn === null ? '(none)' : (dataset.columns.find((col) => col.id === plotConfig.yColumn)?.name ?? '(unknown)')
  const mappingMatches = xId !== null && yId !== null && xId === plotConfig.xColumn && yId === plotConfig.yColumn

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Model fit</h4>
      <div className="mt-1.5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Model</span>
          <select
            aria-label="Fit model"
            value={model}
            onChange={(event) => setModel(event.target.value as FitModel | 'none')}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="line">Line (OLS)</option>
            <option value="poly">Polynomial (OLS)</option>
            <option value="exp">Exponential a·e^(bx) (linearized)</option>
            <option value="log">Logarithmic a+b·ln(x) (linearized)</option>
            <option value="power">Power a·x^b (linearized)</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Degree</span>
          <select
            aria-label="Polynomial degree"
            value={degree}
            disabled={model !== 'poly'}
            onChange={(event) => setDegree(Number(event.target.value))}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {Array.from({ length: MAX_POLY_DEGREE - 1 }, (_, i) => i + 2).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Fit X</span>
          <select
            aria-label="Fit X column"
            value={xId ?? ''}
            onChange={(event) => setXId(event.target.value === '' ? null : event.target.value)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">(none)</option>
            {numeric.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Fit Y</span>
          <select
            aria-label="Fit Y column"
            value={yId ?? ''}
            onChange={(event) => setYId(event.target.value === '' ? null : event.target.value)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">(none)</option>
            {numeric.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Weights (1/σ²)</span>
          <select
            aria-label="Fit weights"
            value={weightMode}
            onChange={(event) => setWeightMode(event.target.value as 'none' | 'column' | 'fixed')}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="none">Unweighted</option>
            <option value="column">σ column</option>
            <option value="fixed">Fixed σ</option>
          </select>
        </label>
        {weightMode === 'column' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">σ column</span>
            <select
              aria-label="Weight column"
              value={weightColumn}
              onChange={(event) => setWeightColumn(event.target.value)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">(first numeric)</option>
              {numeric.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {weightMode === 'fixed' && (
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Fixed σ (&gt; 0)</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Fixed sigma"
              value={weightFixed}
              onChange={(event) => setWeightFixed(event.target.value)}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}
      </div>

      {model !== 'none' && outcome !== null && outcome.result.status === 'error' && (
        <p role="alert" className="mt-2 text-xs text-danger" data-testid="fit-error">
          Fit failed ({outcome.result.kind}): {outcome.result.message}
        </p>
      )}
      {model !== 'none' && fitted !== null && (
        <div className="mt-2 text-xs text-muted" data-testid="fit-result">
          <p className="font-mono text-sm text-ink">{formatEquation(fitted.fit)}</p>
          <p className="mt-1">
            n = {fitted.fit.n} (dof {fitted.fit.dof})
            {fitted.skipped > 0 ? ` (${fitted.skipped} rows skipped)` : ''} ·{' '}
            {fitted.fit.rSquared === null ? 'R² undefined (constant Y)' : `R² = ${formatDisplay(fitted.fit.rSquared)}`}
          </p>
          <p>
            residual std (÷dof) = {formatDisplay(fitted.fit.residualStd)} · RMSE (÷n) = {formatDisplay(fitted.fit.rmse)} · MAE ={' '}
            {formatDisplay(fitted.fit.mae)} · range [{formatDisplay(fitted.fit.minResidual)}, {formatDisplay(fitted.fit.maxResidual)}]
          </p>
          <p>Spread figures describe these points only — small errors do not prove the model right, and any single metric can mislead alone.</p>
          <p>
            Fit columns: {fitXName} → {fitYName}; plot shows: {plotXName} → {plotYName}
            {mappingMatches ? '' : ' (fit uses its own columns; overlay draws in plot coordinates).'}
          </p>
          {overlaySuppressed && <p>The fitted curve is hidden on bar/histogram plots to avoid implying a false relationship; statistics above still describe the Fit X/Y columns.</p>}
          <p>{fitted.fit.methodNote} Coefficients are estimates.</p>
          {fitted.fit.warnings.map((warning) => (
            <p key={warning} className="text-warning">
              {warning}
            </p>
          ))}
          <p>High R² means the curve follows these points — not that X causes Y, and not a guarantee the model is right.</p>
          <p>Plot error bars are display-only: only the σ selector above weights the fit, using the same w = 1/σ² convention as the weighted mean.</p>
          <div className="mt-1.5">
            <Button
              onClick={() => {
                void copyFit(fitText(fitted.fit))
              }}
              title="Copy the fit summary as text"
              className="px-2 py-0.5 text-xs"
              variant="ghost"
            >
              {copied ? 'Copied' : 'Copy fit'}
            </Button>
          </div>
          <Residuals xs={fitted.xs} ys={fitted.ys} model={fitted.fit.model} coefficients={fitted.fit.coefficients} residualStd={fitted.fit.residualStd} />
        </div>
      )}
    </div>
  )
}

/** Residuals vs X with a zero reference line, outlier flags, and the value table. */
function Residuals({ xs, ys, model, coefficients, residualStd }: { xs: number[]; ys: number[]; model: FitModel; coefficients: number[]; residualStd: number }): React.JSX.Element {
  const [zoomed, setZoomed] = useState<WorldRect | null>(null)
  const plot: ResolvedPlot = useMemo(
    () => ({
      series: [
        {
          key: 'residuals',
          label: 'Residuals',
          colorIndex: 1,
          points: xs.map((x, i) => ({ x, y: (ys[i] ?? 0) - evaluateModelFit(model, coefficients, x), label: '' })),
          skipped: 0,
          gapXs: [],
        },
      ],
      xMode: 'numeric',
      totalPoints: xs.length,
      totalSkipped: 0,
      notes: [],
    }),
    [xs, ys, model, coefficients],
  )
  const config = useMemo(
    () => ({
      kind: 'scatter' as const,
      xColumn: null,
      yColumn: null,
      seriesColumn: null,
      title: 'Residuals vs X',
      xLabel: 'X',
      yLabel: 'residual',
      sort: 'row-order' as const,
      showGrid: true,
      hiddenSeries: [],
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      xScale: 'linear' as const,
      yScale: 'linear' as const,
      tickX: null,
      tickY: null,
      yError: { mode: 'none' } as const,
      xError: { mode: 'none' } as const,
    }),
    [],
  )
  const auto = useMemo(() => plotWorld(plot, config), [plot, config])
  const world = zoomed ?? auto
  const rows = useMemo(
    () =>
      xs.map((x, i) => {
        const observed = ys[i] ?? 0
        const fitted = evaluateModelFit(model, coefficients, x)
        const residual = observed - fitted
        // Large-residual flag: |r| beyond twice the residual spread is
        // worth inspecting — a hint, never a deletion (nothing is removed).
        const flagged = residualStd > 0 && Number.isFinite(residual) && Math.abs(residual) > 2 * residualStd
        return { x, observed, fitted, residual, flagged }
      }),
    [xs, ys, model, coefficients, residualStd],
  )
  const flaggedCount = rows.filter((row) => row.flagged).length
  const largest = rows.reduce((top, row) => (Math.abs(row.residual) > Math.abs(top.residual) ? row : top), { x: 0, observed: 0, fitted: 0, residual: 0, flagged: false })
  return (
    <div className="mt-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted">Residuals</h5>
      <DataPlot
        plot={plot}
        config={config}
        world={world}
        referenceLines={[0]}
        compact
        onZoomIn={() => {
          if (world !== null) {
            const cx = (world.xMin + world.xMax) / 2
            const cy = (world.yMin + world.yMax) / 2
            setZoomed({ xMin: cx - (cx - world.xMin) / 1.2, xMax: cx + (world.xMax - cx) / 1.2, yMin: cy - (cy - world.yMin) / 1.2, yMax: cy + (world.yMax - cy) / 1.2 })
          }
        }}
        onZoomOut={() => {
          if (world !== null) {
            const cx = (world.xMin + world.xMax) / 2
            const cy = (world.yMin + world.yMax) / 2
            setZoomed({ xMin: cx - (cx - world.xMin) * 1.2, xMax: cx + (world.xMax - cx) * 1.2, yMin: cy - (cy - world.yMin) * 1.2, yMax: cy + (world.yMax - cy) * 1.2 })
          }
        }}
        onResetView={() => setZoomed(null)}
      />
      <details className="mt-1">
        <summary className="cursor-pointer text-xs font-semibold text-ink">
          Residual table ({rows.length} rows{flaggedCount > 0 ? `, ${flaggedCount} flagged` : ''})
        </summary>
        <p className="mt-1 text-xs text-muted">
          Largest |residual|: {formatDisplay(largest.residual)} at X = {formatDisplay(largest.x)}. Flagged rows exceed twice the residual spread — inspect
          them, never auto-delete: no observation is removed by this panel.
        </p>
        <div className="mt-1 max-h-40 overflow-auto rounded-md border border-line">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {['X', 'Observed', 'Fitted', 'Residual', 'Flag'].map((h) => (
                  <th key={h} scope="col" className="border-b border-line bg-surface px-2 py-1 text-left text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, i) => (
                <tr key={i}>
                  <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{formatDisplay(row.x)}</td>
                  <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{formatDisplay(row.observed)}</td>
                  <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{formatDisplay(row.fitted)}</td>
                  <td className="border-t border-line px-2 py-0.5 font-mono text-ink">{formatDisplay(row.residual)}</td>
                  <td className="border-t border-line px-2 py-0.5 font-mono text-warning">{row.flagged ? 'large' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && <p className="px-2 py-1 text-xs text-muted">Showing 100 of {rows.length}.</p>}
        </div>
      </details>
    </div>
  )
}
