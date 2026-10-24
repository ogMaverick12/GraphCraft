import { useRef, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { displayName, type ExpressionRow } from '../expressions/model.ts'
import { shortNumber, formatSkippedPercent } from './format.ts'
import type { AnalysisTool, useAnalysis } from './useAnalysis.ts'

/**
 * Option text for the function selectors: labeled rows show their source
 * too, so duplicate labels stay distinguishable (and never collide with
 * the row's own label text in queries).
 */
function targetOptionLabel(row: ExpressionRow): string {
  if (row.kind === 'cartesian' && row.label !== '') {
    return `${row.label} (${row.source === '' ? 'expression' : row.source})`
  }
  return displayName(row)
}

type Analysis = ReturnType<typeof useAnalysis>

interface AnalysisPanelProps {
  analysis: Analysis
}

/**
 * Numerical analysis controls: roots, intersections, extrema, tangent,
 * and integral over the selected function. Every value is an estimate
 * with its method attached; stale results (function, view or sliders
 * changed since) are labelled, never silently shown as current.
 */
export function AnalysisPanel({ analysis }: AnalysisPanelProps): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null)
  const [inspected, setInspected] = useState<string | null>(null)
  const runSequence = useRef(0)

  async function run(operation: () => Promise<string | null>): Promise<void> {
    const sequence = runSequence.current + 1
    runSequence.current = sequence
    setInspected(null)
    setMessage(null)
    try {
      const next = await operation()
      if (runSequence.current === sequence && next !== null) {
        setMessage(next)
      }
    } catch {
      if (runSequence.current === sequence) {
        setMessage('Analysis could not complete. Try again.')
      }
    }
  }

  function isPending(tool: AnalysisTool): boolean {
    return analysis.pendingTools.includes(tool)
  }

  const rows = analysis.cartesianRows
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">Add a function graph to analyse it.</p>
  }

  const target = analysis.targetId ?? rows[0]?.id ?? null
  const skippedLabel = analysis.integral === null ? null : formatSkippedPercent(analysis.integral.result.skippedFraction)

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <span className="shrink-0">Function:</span>
        <select
          aria-label="Function to analyse"
          value={target ?? ''}
          onChange={(event) => analysis.setTargetId(event.target.value === '' ? null : event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {targetOptionLabel(row)}
            </option>
          ))}
        </select>
      </label>

      <section aria-label="Roots" aria-busy={isPending('roots')}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Roots</h4>
          <Button onClick={() => void run(analysis.runRoots)} disabled={isPending('roots')} className="px-2 py-0.5 text-xs">
            Find roots
          </Button>
          {analysis.roots !== null && (
            <>
              <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={analysis.visibility['roots'] ?? true}
                  onChange={(event) => analysis.setVisible('roots', event.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Show
              </label>
              <Button onClick={() => analysis.clearTool('roots')} className="px-2 py-0.5 text-xs" variant="ghost">
                Clear
              </Button>
            </>
          )}
        </div>
        {analysis.roots !== null && analysis.roots.length === 0 && <p className="mt-1 text-xs text-muted">No roots in view. Scans cannot prove absence.</p>}
        {analysis.roots !== null && !analysis.snapshotIsCurrent(analysis.rootSnapshot) && (
          <p className="mt-1 text-xs text-warning">Function, view or sliders changed — recompute for current results.</p>
        )}
        <ul aria-live="polite" className="mt-1 flex flex-col gap-1">
          {(analysis.roots ?? []).map((root, index) => {
            const key = `root-${index}`
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setInspected(inspected === key ? null : key)}
                  className="gc-transition w-full rounded-md border border-line px-2 py-1 text-left font-mono text-xs text-ink hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  x ≈ {shortNumber(root.x)}
                  <span className="ml-2 text-muted">{root.method === 'bracket' ? 'bracketed' : 'minimum'}</span>
                </button>
                {inspected === key && (
                  <p className="mt-0.5 px-1 text-[11px] text-muted">
                    residual {root.residual.toExponential(1)} · {root.method === 'bracket' ? 'sign-change bisection' : '|f| minimization'} · estimate, not analytic
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Intersections" aria-busy={isPending('intersections')}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Intersections</h4>
        </div>
        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0">With:</span>
          <select
            aria-label="Second function for intersections"
            value={analysis.otherId ?? ''}
            onChange={(event) => analysis.setOtherId(event.target.value === '' ? null : event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {rows
              .filter((row) => row.id !== target)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {targetOptionLabel(row)}
                </option>
              ))}
          </select>
          <Button onClick={() => void run(analysis.runIntersections)} disabled={isPending('intersections')} className="shrink-0 px-2 py-0.5 text-xs">
            Find
          </Button>
          {analysis.intersections !== null && (
            <>
              <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={analysis.visibility['intersections'] ?? true}
                  onChange={(event) => analysis.setVisible('intersections', event.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Show
              </label>
              <Button onClick={() => analysis.clearTool('intersections')} className="shrink-0 px-2 py-0.5 text-xs" variant="ghost">
                Clear
              </Button>
            </>
          )}
        </label>
        <ul aria-live="polite" className="mt-1 flex flex-col gap-1">
          {(analysis.intersections ?? []).map((point, index) => (
            <li key={index} className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
              ({shortNumber(point.x)}, {shortNumber(point.y)})
            </li>
          ))}
        </ul>
        {analysis.intersections !== null && !analysis.snapshotIsCurrent(analysis.intersectionSnapshot) && (
          <p className="mt-1 text-xs text-warning">Function, view or sliders changed — recompute for current results.</p>
        )}
      </section>

      <section aria-label="Extrema" aria-busy={isPending('extrema')}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Extrema</h4>
          <Button onClick={() => void run(analysis.runExtrema)} disabled={isPending('extrema')} className="px-2 py-0.5 text-xs">
            Find extrema
          </Button>
          {analysis.extrema !== null && (
            <>
              <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={analysis.visibility['extrema'] ?? true}
                  onChange={(event) => analysis.setVisible('extrema', event.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Show
              </label>
              <Button onClick={() => analysis.clearTool('extrema')} className="px-2 py-0.5 text-xs" variant="ghost">
                Clear
              </Button>
            </>
          )}
        </div>
        <ul aria-live="polite" className="mt-1 flex flex-col gap-1">
          {(analysis.extrema ?? []).map((point, index) => (
            <li key={index} className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink">
              {point.kind === 'maximum' ? 'max' : 'min'} ({shortNumber(point.x)}, {shortNumber(point.y)})
            </li>
          ))}
        </ul>
        {analysis.extrema !== null && !analysis.snapshotIsCurrent(analysis.extremumSnapshot) && (
          <p className="mt-1 text-xs text-warning">Function, view or sliders changed — recompute for current results.</p>
        )}
      </section>

      <section aria-label="Tangent" aria-busy={isPending('tangent')}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Tangent</h4>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
            <span className="shrink-0">At x:</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Tangent point x"
              value={analysis.tangentX}
              onChange={(event) => analysis.setTangentX(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={analysis.showNormal}
              onChange={(event) => analysis.setShowNormal(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Normal
          </label>
          <Button onClick={() => void run(analysis.runTangent)} disabled={isPending('tangent')} className="shrink-0 px-2 py-0.5 text-xs">
            Draw
          </Button>
          {analysis.tangent !== null && (
            <Button onClick={() => analysis.clearTool('tangent')} className="shrink-0 px-2 py-0.5 text-xs" variant="ghost">
              Clear
            </Button>
          )}
        </div>
        {analysis.tangent !== null && (
          <div aria-live="polite" className="mt-1 text-xs text-muted">
            <p className="font-mono text-ink">
              y ≈ {shortNumber(analysis.tangent.slope)}(x − {shortNumber(analysis.tangent.x0)}) + {shortNumber(analysis.tangent.y0)}
            </p>
            <p>{analysis.tangent.methodNote} · estimate</p>
            <label className="mt-1 flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={analysis.visibility['tangent'] ?? true}
                onChange={(event) => analysis.setVisible('tangent', event.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              Show tangent
            </label>
            {!analysis.snapshotIsCurrent(analysis.tangentSnapshot) && (
              <p className="mt-1 text-warning">Function, view or sliders changed — recompute for current results.</p>
            )}
          </div>
        )}
      </section>

      <section aria-label="Integral" aria-busy={isPending('integral')}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Integral</h4>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
            <span className="shrink-0">a:</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Integral lower bound"
              value={analysis.integralA}
              onChange={(event) => analysis.setIntegralA(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
            <span className="shrink-0">b:</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Integral upper bound"
              value={analysis.integralB}
              onChange={(event) => analysis.setIntegralB(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button onClick={() => void run(analysis.runIntegral)} disabled={isPending('integral')} className="shrink-0 px-2 py-0.5 text-xs">
            Compute
          </Button>
          {analysis.integral !== null && (
            <Button onClick={() => analysis.clearTool('integral')} className="shrink-0 px-2 py-0.5 text-xs" variant="ghost">
              Clear
            </Button>
          )}
        </div>
        {analysis.integral !== null && (
          <div aria-live="polite" className="mt-1 text-xs text-muted">
            <p className="font-mono text-ink">≈ {shortNumber(analysis.integral.result.value)}</p>
            <p>
              adaptive Simpson, tol 1e-9{analysis.integral.result.converged ? ', converged' : ', not fully converged'}
              {skippedLabel !== null ? `, ${skippedLabel} skipped` : ''}
            </p>
            {analysis.integral.result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {!analysis.integralIsCurrent && (
              <p className="mt-1 text-warning">Function, view or sliders changed — recompute for current results.</p>
            )}
          </div>
        )}
      </section>

      {analysis.pendingTools.length > 0 && (
        <p role="status" className="text-xs text-muted">
          Loading analysis tools…
        </p>
      )}

      {message !== null && (
        <p role="alert" className="text-xs leading-snug text-danger">
          {message}
        </p>
      )}
    </div>
  )
}
