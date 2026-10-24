import { AnalysisPanel } from '../analysis/AnalysisPanel.tsx'
import type { useAnalysis } from '../analysis/useAnalysis.ts'

type Analysis = ReturnType<typeof useAnalysis>

interface InspectorPanelProps {
  showGrid: boolean
  onToggleGrid: () => void
  equalAspect: boolean
  onToggleEqualAspect: () => void
  crosshair: boolean
  onToggleCrosshair: () => void
  selected: { source: string; visible: boolean; status: string } | null
  analysis: Analysis
}

/**
 * Inspector body: real View settings, selected-row inspection, and the
 * Stage 2 numerical-analysis tools (roots, intersections, extrema,
 * tangent/normal, integral) with honest estimate labelling.
 */
export function InspectorPanel({ showGrid, onToggleGrid, equalAspect, onToggleEqualAspect, crosshair, onToggleCrosshair, selected, analysis }: InspectorPanelProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">View</h3>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={onToggleGrid}
            className="h-4 w-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          Show grid
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={equalAspect}
            onChange={onToggleEqualAspect}
            className="h-4 w-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          Equal axis scales
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={crosshair}
            onChange={onToggleCrosshair}
            className="h-4 w-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          Crosshair readout
        </label>
        <p className="mt-2 text-xs text-muted">Off: each axis fills the viewport. On: 1 x-unit equals 1 y-unit on screen.</p>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Selected</h3>
        {selected === null ? (
          <p className="mt-2 text-sm text-muted">Select a row to inspect it.</p>
        ) : (
          <div className="mt-2 text-sm">
            <p className="truncate font-mono text-ink" title={selected.source}>
              {selected.source}
            </p>
            <p className="mt-1 text-xs text-muted">{selected.visible ? selected.status : 'Hidden from the graph.'}</p>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Analysis</h3>
        <div className="mt-2">
          <AnalysisPanel analysis={analysis} />
        </div>
      </div>
    </div>
  )
}
