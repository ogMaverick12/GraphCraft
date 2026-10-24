/**
 * Analysis markers (Stage 2 numerical analysis): world-space points for
 * roots, intersections, and extrema. Pure data — the graph view positions
 * them with the existing world→screen transform and clips them to the
 * viewport, and the export scene maps them the same way. No math lives
 * here; callers build markers from analysis results that are current for
 * the visible viewport (stale results are suppressed upstream, never
 * drawn as if current).
 */

export type AnalysisMarkerKind = 'root' | 'intersection' | 'extremum'

export interface AnalysisMarker {
  readonly x: number
  readonly y: number
  readonly kind: AnalysisMarkerKind
  readonly label: string
}
