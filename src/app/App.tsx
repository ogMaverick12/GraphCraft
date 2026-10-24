import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../components/ui/Button.tsx'
import { IconButton } from '../components/ui/IconButton.tsx'
import { containTabFocus } from '../components/ui/useDialogFocus.ts'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx'
import { Panel } from '../components/ui/Panel.tsx'
import { applyTheme, readTheme, type ThemeMode } from '../storage/theme.ts'
import { ExpressionList } from '../expressions/ExpressionList.tsx'
import { compileRow, rangeForRow } from '../expressions/compile.ts'
import { displayName, createParametricRow } from '../expressions/model.ts'
import { TRANSFORM_TEMPLATES, type TransformTemplate } from '../expressions/templates.ts'
import { useWorkspace, type ExpressionRow } from '../expressions/useWorkspace.ts'
import { shortNumber } from '../analysis/format.ts'
import { useAnalysis } from '../analysis/useAnalysis.ts'
import { ParametersPanel } from '../parameters/ParametersPanel.tsx'
import { useParameters, type Parameter } from '../parameters/useParameters.ts'
import { InspectorPanel } from './InspectorPanel.tsx'
import { StatusBar } from './StatusBar.tsx'
import { ExportDialogBoundary, GraphStudioBoundary, WorkspaceBoundary } from './WorkspaceBoundary.tsx'
import { formatViewLabel } from '../graph/coordinate.ts'
import { TopBar } from './TopBar.tsx'
import { GraphView, type GraphCurveInput } from '../graph/GraphView.tsx'
import type { AnalysisMarker } from '../graph/markers.ts'
import { useSampledCurves, type CompiledCurveInput } from '../graph/useCurves.ts'
import { DEFAULT_WORLD, useViewport } from '../graph/useViewport.ts'
import { useDatasets } from '../data/useDatasets.ts'
import { analysisFromProject, projectToDataset } from '../data/persistence.ts'
import type { PersistedField, PersistedScatter, PersistedSurface } from '../viz3d/Viz3D.tsx'
import { createRow } from '../expressions/model.ts'
import type { LearnTemplate, RowBuilder } from '../learn/library.ts'
import { loadLearnTemplates, type LearnTemplateData } from '../learn/load-templates.ts'

/** Calculator loads on demand so graphing starts without its weight. */
const Calculator = lazy(() => import('../calculator/Calculator.tsx').then((module) => ({ default: module.Calculator })))
/** Data Lab loads on demand for the same reason. */
const DataLab = lazy(() => import('../data/DataLab.tsx').then((module) => ({ default: module.DataLab })))
/** Learn library loads on demand for the same reason. */
const LearnLibrary = lazy(() => import('../learn/LearnLibrary.tsx').then((module) => ({ default: module.LearnLibrary })))
/** 3D surfaces load on demand for the same reason; 2D graphing never waits for them. */
const Viz3D = lazy(() => import('../viz3d/Viz3D.tsx').then((module) => ({ default: module.Viz3D })))
/** Export is user-triggered: its dialog, scene builder, and SVG/PNG renderers stay out of startup. */
const ExportDialog = lazy(() => import('../export/ExportDialog.tsx').then((module) => ({ default: module.ExportDialog })))

/** Accessible placeholder while the export chunk is fetched; it cannot be mistaken for the real dialog. */
function ExportDialogLoading({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Loading export graph"
        aria-busy="true"
        className="relative w-full max-w-md rounded-lg border border-line bg-elevated p-4 shadow-panel"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose()
          }
        }}
      >
        <p role="status" aria-live="polite" className="text-sm text-ink">
          Loading export dialog...
        </p>
        <div className="mt-4 flex justify-end">
          <Button autoFocus onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
import { clampWorldRect, type SizePx, type WorldRect } from '../graph/coordinate.ts'
import { applyOfflineUpdate, registerOffline } from '../offline/register.ts'
import { useOnlineStatus } from '../offline/useOnlineStatus.ts'
import {
  buildProjectDocument,
  downloadTextFile,
  loadBackup,
  loadPreferences,
  readFileText,
  sanitizeFilename,
  saveBackup,
  savePreferences,
  serializeDocument,
  validateProjectText,
  type GraphCraftProject,
} from '../project/index.ts'

export type DrawerPanel = 'expressions' | 'inspector'

/** Top-level workspace: graph studio, calculator, data lab, learn library, or 3D surfaces. */
export type StudioView = 'graph' | 'calculator' | 'data' | 'learn' | 'viz3d'

const LEFT_WIDTH_MIN = 192
const LEFT_WIDTH_MAX = 384
const LEFT_WIDTH_STEP = 16

type PendingAction = { type: 'new' } | { type: 'open'; project: GraphCraftProject } | null

const LEARN_ANNOTATION_LOAD_ERROR =
  'Learn annotations could not load. Check your connection and try again; your graph and saved work are unaffected.'

/** One session-backup write per window while state changes rapidly. */
const SESSION_BACKUP_COALESCE_MS = 200

interface SavedProject {
  /** Stable document text without the high-frequency viewport bounds. */
  readonly base: string
  readonly world: WorldRect
}

function sameWorld(a: WorldRect, b: WorldRect): boolean {
  return a.xMin === b.xMin && a.xMax === b.xMax && a.yMin === b.yMin && a.yMax === b.yMax
}

/**
 * Best-effort session backup with leading + trailing coalescing.
 *
 * Viewport updates stay synchronous for rendering and dirty checks; only the
 * full document serialization and storage write are shared across a burst.
 * Page lifecycle events and unmount flush the latest committed document.
 */
function useSessionBackup(project: GraphCraftProject, onFailure: () => void): (reportFailure?: boolean) => void {
  const latestRef = useRef(project)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef(false)
  const lastWrittenRef = useRef<string | null>(null)
  const onFailureRef = useRef(onFailure)

  useLayoutEffect(() => {
    latestRef.current = project
  }, [project])
  useEffect(() => {
    onFailureRef.current = onFailure
  }, [onFailure])

  const flush = useCallback((reportFailure = true): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = false
    const text = serializeDocument(latestRef.current)
    if (text === lastWrittenRef.current) {
      return
    }
    if (saveBackup(text)) {
      lastWrittenRef.current = text
    } else if (reportFailure) {
      onFailureRef.current()
    }
  }, [])

  useEffect(() => {
    if (timerRef.current !== null) {
      pendingRef.current = true
      return
    }
    flush()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (pendingRef.current) {
        flush()
      }
    }, SESSION_BACKUP_COALESCE_MS)
  }, [project, flush])

  useEffect(() => {
    const flushOnHide = (): void => {
      flush(false)
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        flush(false)
      }
    }
    window.addEventListener('pagehide', flushOnHide)
    window.addEventListener('beforeunload', flushOnHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushOnHide)
      window.removeEventListener('beforeunload', flushOnHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      flush(false)
    }
  }, [flush])

  return flush
}

function clampWidth(px: number): number {
  return Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, px))
}

/** Restore the last session backup when it validates; otherwise start empty. */
function initialRestore(): { project: GraphCraftProject | null; backupNotice: string | null; storageFailed: boolean } {
  const { text, storageFailed } = loadBackup()
  if (text === null) {
    return { project: null, backupNotice: null, storageFailed }
  }
  const validated = validateProjectText(text)
  if (!validated.ok) {
    return { project: null, backupNotice: `Last session backup was corrupted (${validated.error}) Started empty instead.`, storageFailed }
  }
  return { project: validated.project, backupNotice: null, storageFailed }
}

function rowsFromProject(project: GraphCraftProject): ExpressionRow[] {
  return project.expressions.map((row): ExpressionRow => {
    const base = { id: row.id, visible: row.visible, colorIndex: row.colorIndex, label: row.label }
    if (row.kind === 'parametric') {
      return { ...base, kind: 'parametric', xSource: row.xSource, ySource: row.ySource, tMin: row.tMin, tMax: row.tMax }
    }
    if (row.kind === 'polar') {
      return { ...base, kind: 'polar', source: row.source, thetaMin: row.thetaMin, thetaMax: row.thetaMax }
    }
    if (row.kind === 'implicit') {
      return { ...base, kind: 'implicit', leftSource: row.leftSource, rightSource: row.rightSource }
    }
    if (row.kind === 'inequality') {
      return { ...base, kind: 'inequality', leftSource: row.leftSource, op: row.op, rightSource: row.rightSource }
    }
    return {
      ...base,
      kind: 'cartesian',
      source: row.source,
      domain: row.domain,
      branches: row.branches === null ? null : row.branches.map((branch) => ({ ...branch })),
      defaultSource: row.defaultSource,
    }
  })
}

function parametersFromProject(project: GraphCraftProject): Parameter[] {
  return project.parameters.map((p) => ({ name: p.name, value: p.value, min: p.min, max: p.max, step: p.step, defaultValue: p.defaultValue }))
}

function worldFromProject(project: GraphCraftProject): WorldRect {
  return clampWorldRect({ xMin: project.viewport.xMin, xMax: project.viewport.xMax, yMin: project.viewport.yMin, yMax: project.viewport.yMax })
}

/**
 * Graph Studio workspace (end-to-end plotting + local persistence).
 * Sources compile once per text; pan/zoom/resize resample without
 * recompiling. Documents are files the user owns; preferences and a
 * session backup live in guarded browser storage.
 */
export function App(): React.JSX.Element {
  const [prefs] = useState(() => loadPreferences())
  const [restored] = useState(() => initialRestore())
  const initialProject = restored.project

  const [theme, setTheme] = useState<ThemeMode>(() => readTheme())
  const [leftOpen, setLeftOpen] = useState(prefs.prefs.leftOpen)
  const [rightOpen, setRightOpen] = useState(prefs.prefs.rightOpen)
  const [leftWidth, setLeftWidth] = useState(prefs.prefs.leftWidth)
  const [showGrid, setShowGrid] = useState(initialProject?.viewport.showGrid ?? true)
  const [equalAspect, setEqualAspect] = useState(initialProject?.viewport.equalAspect ?? false)
  const [crosshair, setCrosshair] = useState(prefs.prefs.crosshair)
  const [title, setTitle] = useState(initialProject?.title ?? 'Untitled project')
  const [pixelSize, setPixelSize] = useState<SizePx>({ width: 800, height: 600 })
  const [drawer, setDrawer] = useState<DrawerPanel | 'none'>('none')
  const [notice, setNotice] = useState<string | null>(() => prefs.storageNotice ?? restored.backupNotice)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [view, setStudioView] = useState<StudioView>('graph')
  const [lastSaved, setLastSaved] = useState<SavedProject | null>(null)
  const online = useOnlineStatus()
  const [updateAvailable, setUpdateAvailable] = useState(false)

  // Offline worker (production only): installs in the background, waits,
  // and only activates on the user's explicit Refresh — never mid-session.
  useEffect(() => {
    let cancelled = false
    void registerOffline(() => {
      if (!cancelled) {
        setUpdateAvailable(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  const drawerCloseRef = useRef<HTMLButtonElement>(null)
  const drawerPanelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Project-file reads are async: only the newest pick may touch state (an
  // older read resolving late must not replace newer input), and the dirty
  // check must read the live flag — a read's render-time closure could
  // otherwise silently discard edits made while it was pending.
  const pickSeqRef = useRef(0)
  const dirtyRef = useRef(false)

  const { world, panByWorld, zoomAtWorld, setView, reset } = useViewport(
    initialProject !== null
      ? { xMin: initialProject.viewport.xMin, xMax: initialProject.viewport.xMax, yMin: initialProject.viewport.yMin, yMax: initialProject.viewport.yMax }
      : DEFAULT_WORLD,
  )
  const workspace = useWorkspace(initialProject !== null ? rowsFromProject(initialProject) : [])
  const { rows, selectedId } = workspace
  const restoredDatasets = useMemo(
    () => (initialProject?.dataLab?.datasets ?? []).map(projectToDataset),
    // One-shot restore; never re-runs (mirrors rows/parameters above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const restoredAnalyses = useMemo(
    () => Object.fromEntries(Object.entries(initialProject?.dataLab?.analyses ?? {}).map(([id, analysis]) => [id, analysisFromProject(analysis)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const datasetStore = useDatasets({ datasets: restoredDatasets, analyses: restoredAnalyses })
  const [surfaces3d, setSurfaces3d] = useState<PersistedSurface[]>(() =>
    (initialProject?.surfaces3d ?? []).map((surface) => ({
      id: surface.id,
      source: surface.source,
      domain: { ...surface.domain },
      resolution: surface.resolution,
      camera: { ...surface.camera },
      showGrid: surface.showGrid,
      title: surface.title,
      appearance: surface.appearance ?? 'solid',
    })),
  )
  const [fields2d, setFields2d] = useState<PersistedField[]>(() =>
    (initialProject?.fields2d ?? []).map((field) => ({
      id: field.id,
      mode: field.mode,
      source: field.source,
      uSource: field.uSource,
      vSource: field.vSource,
      domain: { ...field.domain },
      resolution: field.resolution,
      levelCount: field.levelCount,
      levelList: field.levelList,
      colorPolicy: field.colorPolicy,
      scalePolicy: field.scalePolicy,
      fixedMin: field.fixedMin,
      fixedMax: field.fixedMax,
      arrowMode: field.arrowMode,
      showGrid: field.showGrid,
      title: field.title,
    })),
  )
  const [scatters3d, setScatters3d] = useState<PersistedScatter[]>(() =>
    (initialProject?.scatters3d ?? []).map((scatter) => ({
      id: scatter.id,
      datasetId: scatter.datasetId,
      xId: scatter.xId,
      yId: scatter.yId,
      zId: scatter.zId,
      camera: { ...scatter.camera },
      title: scatter.title,
    })),
  )
  const [annotationTemplateId, setAnnotationTemplateId] = useState<string | null>(() => {
    const saved = initialProject?.learnAnnotations?.templateId
    return typeof saved === 'string' ? saved : null
  })
  // Template data and its marker projection are lazy: an annotation id alone
  // must not pull them into the initial graph bundle. Row construction stays
  // inside the lazy Learn library, so opening a template stays synchronous.
  const [learnTemplateData, setLearnTemplateData] = useState<LearnTemplateData | null>(null)
  useEffect(() => {
    if (annotationTemplateId === null || learnTemplateData !== null) {
      return
    }
    let cancelled = false
    void loadLearnTemplates()
      .then((data) => {
        if (!cancelled) {
          setLearnTemplateData(data)
          setNotice((current) => (current === LEARN_ANNOTATION_LOAD_ERROR ? null : current))
        }
      })
      .catch(() => {
        // Markers are optional; the graph remains usable if the Learn chunk
        // cannot be fetched. Keep the id rather than silently rewriting it.
        if (!cancelled) {
          setNotice((current) => current ?? LEARN_ANNOTATION_LOAD_ERROR)
        }
      })
    return () => {
      cancelled = true
    }
  }, [annotationTemplateId, learnTemplateData])
  useEffect(() => {
    if (annotationTemplateId === null || learnTemplateData === null) {
      return
    }
    if (!learnTemplateData.templates.some((template) => template.id === annotationTemplateId)) {
      setAnnotationTemplateId(null)
    }
  }, [annotationTemplateId, learnTemplateData])
  const parameterStore = useParameters(initialProject !== null ? parametersFromProject(initialProject) : [])
  const { parameters } = parameterStore

  // Names drive compilation (stable); values drive sampling (stable object).
  const paramNamesKey = parameters.map((p) => p.name).join(',')
  const paramNames = useMemo(() => paramNamesKey.split(',').filter((name) => name !== ''), [paramNamesKey])
  const paramValuesKey = parameters.map((p) => `${p.name}=${p.value}`).join(';')
  const paramValues = useMemo(() => {
    // Rebuilt from the key text so ticks change values without identity churn.
    const values: Record<string, number> = {}
    for (const entry of paramValuesKey.split(';')) {
      const separator = entry.indexOf('=')
      if (separator > 0) {
        values[entry.slice(0, separator)] = Number(entry.slice(separator + 1))
      }
    }
    return values
  }, [paramValuesKey])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Persist UI preferences (best effort; failures surface once as a notice).
  useEffect(() => {
    const ok = savePreferences({ leftOpen, rightOpen, leftWidth, crosshair })
    if (!ok) {
      setNotice((current) => current ?? 'Browser storage is unavailable; preferences will not persist, but files still work.')
    }
  }, [leftOpen, rightOpen, leftWidth, crosshair])

  // Escape closes the mobile drawer; focus returns to its opener.
  useEffect(() => {
    if (drawer === 'none') {
      return
    }
    drawerCloseRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDrawer('none')
        openerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  // Only viewport bounds change during pan/zoom. Keep the expensive project
  // document (rows, datasets, analyses, 3D state) memoized separately so a
  // frame does not rebuild and serialize the whole project.
  const projectBase = useMemo(
    () =>
      buildProjectDocument({
        title,
        rows,
        world: DEFAULT_WORLD,
        equalAspect,
        showGrid,
        parameters,
        datasets: datasetStore.datasets,
        analyses: datasetStore.analyses,
        learnAnnotations: annotationTemplateId === null ? null : { templateId: annotationTemplateId },
        surfaces3d,
        fields2d,
        scatters3d,
      }),
    [title, rows, equalAspect, showGrid, parameters, datasetStore.datasets, datasetStore.analyses, annotationTemplateId, surfaces3d, fields2d, scatters3d],
  )
  const baseSnapshot = useMemo(() => serializeDocument(projectBase), [projectBase])
  const projectDocument = useMemo(
    () => ({
      ...projectBase,
      viewport: {
        xMin: world.xMin,
        xMax: world.xMax,
        yMin: world.yMin,
        yMax: world.yMax,
        equalAspect,
        showGrid,
      },
    }),
    [projectBase, world, equalAspect, showGrid],
  )
  const emptyBaseSnapshot = useMemo(
    () =>
      serializeDocument(
        buildProjectDocument({
          title: 'Untitled project',
          rows: [],
          world: DEFAULT_WORLD,
          equalAspect: false,
          showGrid: true,
          parameters: [],
          datasets: [],
          analyses: {},
          surfaces3d: [],
          fields2d: [],
          scatters3d: [],
        }),
      ),
    [],
  )
  const dirty =
    lastSaved === null
      ? baseSnapshot !== emptyBaseSnapshot || !sameWorld(world, DEFAULT_WORLD)
      : baseSnapshot !== lastSaved.base || !sameWorld(world, lastSaved.world)
  const flushSessionBackup = useSessionBackup(projectDocument, () => {
    setNotice((current) => current ?? 'Local backup unavailable (storage full or blocked). Use Save to file.')
  })

  // Keep the live dirty flag reachable from async continuations (file reads),
  // where the captured render value would be stale.
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  // Mark a restored session clean on mount.
  useEffect(() => {
    if (initialProject !== null) {
      setLastSaved({ base: baseSnapshot, world: worldFromProject(initialProject) })
    }
    // One-shot restore; never re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const compiledRows = useMemo(() => rows.map((row) => compileRow(row, paramNames)), [rows, paramNames])
  const compiledById = useMemo(() => new Map(compiledRows.map((compiled) => [compiled.row.id, compiled])), [compiledRows])

  const sampleInputs: CompiledCurveInput[] = useMemo(
    () =>
      rows.flatMap((row): CompiledCurveInput[] => {
        if (!row.visible) {
          return []
        }
        const compiled = compiledById.get(row.id)
        if (compiled === undefined || compiled.evaluator === null || compiled.evaluatorKind === null) {
          return []
        }
        if (compiled.evaluatorKind === 'field' && 'evaluateField' in compiled.evaluator) {
          return [{ id: row.id, kind: 'field' as const, expression: compiled.evaluator, op: compiled.inequalityOp }]
        }
        if (compiled.evaluatorKind === 'point' && 'evaluatePoint' in compiled.evaluator) {
          return [{ id: row.id, kind: 'point' as const, expression: compiled.evaluator, range: rangeForRow(row, world), breaks: compiled.breakpoints }]
        }
        if (compiled.evaluatorKind === 'scalar' && 'evaluate' in compiled.evaluator) {
          return [{ id: row.id, kind: 'scalar' as const, expression: compiled.evaluator, range: rangeForRow(row, world), breaks: compiled.breakpoints }]
        }
        return []
      }),
    [rows, compiledById, world],
  )
  const analysis = useAnalysis(rows, compiledById, world, paramValues)
  const { tangent: analysisTangent, tangentSnapshot: analysisTangentSnapshot, visibility: analysisVisibility } = analysis
  const tangentCurrent = analysis.snapshotIsCurrent(analysisTangentSnapshot)

  /** Overlay evaluators for tangent/normal lines (sampled, never compiled). */
  const overlayInputs: CompiledCurveInput[] = useMemo(() => {
    const items: CompiledCurveInput[] = []
    const overlay = analysisTangent
    if (overlay !== null && tangentCurrent && (analysisVisibility['tangent'] ?? true)) {
      const { x0, y0, slope } = overlay
      if (Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(slope)) {
      items.push({
        id: 'analysis-tangent',
        kind: 'scalar',
        expression: { evaluate: (x: number) => ({ kind: 'value' as const, value: slope * (x - x0) + y0 }) },
        range: { xMin: world.xMin, xMax: world.xMax },
        breaks: [],
      })
      if (overlay.showNormal) {
        if (Math.abs(slope) < 1e-12) {
          items.push({
            id: 'analysis-normal',
            kind: 'point',
            expression: { evaluatePoint: (t: number) => ({ x: x0, y: t }) },
            range: { xMin: world.yMin, xMax: world.yMax },
            breaks: [],
          })
        } else {
          const normalSlope = -1 / slope
          items.push({
            id: 'analysis-normal',
            kind: 'scalar',
            expression: { evaluate: (x: number) => ({ kind: 'value' as const, value: normalSlope * (x - x0) + y0 }) },
            range: { xMin: world.xMin, xMax: world.xMax },
            breaks: [],
          })
        }
      }
      }
    }
    return items
  }, [analysisTangent, tangentCurrent, analysisVisibility, world])

  const allInputs = useMemo(() => [...sampleInputs, ...overlayInputs], [sampleInputs, overlayInputs])
  const sampled = useSampledCurves(
    allInputs,
    world,
    Math.max(1, Math.round(pixelSize.width)),
    paramValues,
    Math.max(1, Math.round(pixelSize.height)),
  )
  const sampledById = useMemo(() => new Map(sampled.map((curve) => [curve.id, curve])), [sampled])
  const exportWarnings = useMemo(() => [...new Set(sampled.flatMap((curve) => curve.warnings))], [sampled])

  /** Row labels (or sources) per referenced parameter — who depends on what. */
  const parameterUsage = useMemo(() => {
    const usage: Record<string, string[]> = {}
    for (const compiled of compiledRows) {
      const label = displayName(compiled.row)
      for (const name of compiled.parameterNames) {
        const list = usage[name] ?? []
        list.push(label)
        usage[name] = list
      }
    }
    return usage
  }, [compiledRows])

  function applyTemplate(template: TransformTemplate): void {
    for (const spec of template.parameters) {
      parameterStore.ensureParameter(spec)
    }
    if (template.kind === 'parametric') {
      workspace.addCustomRow((colorIndex) => createParametricRow(template.xSource, template.ySource, template.tMin, template.tMax, colorIndex))
    } else {
      workspace.addRow(template.expression)
    }
  }

  const rowViews = useMemo(
    () =>
      rows.map((row) => {
        const compiled = compiledById.get(row.id)
        const problems = [
          compiled?.error ?? null,
          compiled?.domainError ?? null,
        ].filter((problem): problem is string => problem !== null)
        return {
          row,
          labelTaken:
            row.label !== '' && rows.some((other) => other.id !== row.id && other.label !== '' && other.label.toLowerCase() === row.label.toLowerCase()),
          error: problems.length > 0 ? problems.join(' ') : null,
          selected: row.id === selectedId,
        }
      }),
    [rows, compiledById, selectedId],
  )

  const {
    roots: analysisRoots,
    rootSnapshot: analysisRootSnapshot,
    intersections: analysisIntersections,
    intersectionSnapshot: analysisIntersectionSnapshot,
    extrema: analysisExtrema,
    extremumSnapshot: analysisExtremumSnapshot,
  } = analysis
  const rootsCurrent = analysis.snapshotIsCurrent(analysisRootSnapshot)
  const intersectionsCurrent = analysis.snapshotIsCurrent(analysisIntersectionSnapshot)
  const extremaCurrent = analysis.snapshotIsCurrent(analysisExtremumSnapshot)

  /**
   * Current analysis points for the graph: roots sit on y = 0 by
   * definition. Only results computed for this exact view and slider
   * set are drawn — stale results stay listed in the panel with a
   * recompute warning instead of appearing on the graph.
   */
  const analysisMarkers: AnalysisMarker[] = useMemo(() => {
    const markers: AnalysisMarker[] = []
    if ((analysisVisibility['roots'] ?? true) && rootsCurrent && analysisRoots !== null) {
      for (const root of analysisRoots) {
        markers.push({ x: root.x, y: 0, kind: 'root', label: `x ≈ ${shortNumber(root.x)}` })
      }
    }
    if ((analysisVisibility['intersections'] ?? true) && intersectionsCurrent && analysisIntersections !== null) {
      for (const point of analysisIntersections) {
        markers.push({ x: point.x, y: point.y, kind: 'intersection', label: `(${shortNumber(point.x)}, ${shortNumber(point.y)})` })
      }
    }
    if ((analysisVisibility['extrema'] ?? true) && extremaCurrent && analysisExtrema !== null) {
      for (const point of analysisExtrema) {
        markers.push({ x: point.x, y: point.y, kind: 'extremum', label: `${point.kind === 'maximum' ? 'max' : 'min'} (${shortNumber(point.x)}, ${shortNumber(point.y)})` })
      }
    }
    return markers
  }, [analysisVisibility, rootsCurrent, analysisRoots, intersectionsCurrent, analysisIntersections, extremaCurrent, analysisExtrema])

  /** Sampled tangent/normal lines as graph curves: dashed overlays that never touch row state. */
  const overlayCurves: GraphCurveInput[] = useMemo(() => {
    const curves: GraphCurveInput[] = []
    if (analysisTangent !== null && tangentCurrent) {
      const tangentPoints = sampledById.get('analysis-tangent')?.points ?? []
      if (tangentPoints.length > 0) {
        curves.push({
          id: 'analysis-tangent',
          label: `Tangent at x ≈ ${shortNumber(analysisTangent.x0)}`,
          styleIndex: 1,
          segments: tangentPoints,
          regions: [],
          dash: '6 3',
        })
      }
      const normalPoints = sampledById.get('analysis-normal')?.points ?? []
      if (analysisTangent.showNormal && normalPoints.length > 0) {
        curves.push({
          id: 'analysis-normal',
          label: `Normal at x ≈ ${shortNumber(analysisTangent.x0)}`,
          styleIndex: 4,
          segments: normalPoints,
          regions: [],
          dash: '2 2',
        })
      }
    }
    return curves
  }, [analysisTangent, tangentCurrent, sampledById])

  const graphCurves: GraphCurveInput[] = useMemo(
    () => [
      ...rows
        .filter((row) => {
          const compiled = compiledById.get(row.id)
          return row.visible && compiled !== undefined && compiled.evaluator !== null
        })
        .map((row) => ({
          id: row.id,
          label: displayName(row),
          styleIndex: row.colorIndex,
          segments: sampledById.get(row.id)?.points ?? [],
          regions: sampledById.get(row.id)?.regions ?? [],
          ...(row.kind === 'inequality' && (row.op === '<' || row.op === '>')
            ? { dash: '6 4' }
            : {}),
        })),
      ...overlayCurves,
    ],
    [rows, compiledById, sampledById, overlayCurves],
  )

  const exportCurves = useMemo(
    () =>
      graphCurves.map(({ label, styleIndex, segments, regions, dash }) => ({ label, styleIndex, segments, regions, dash })),
    [graphCurves],
  )

  const selectedDetail = useMemo(() => {
    const row = rows.find((candidate) => candidate.id === selectedId)
    if (row === undefined) {
      return null
    }
    const compiled = compiledById.get(row.id)
    const sampled = sampledById.get(row.id)
    const points = (sampled?.points ?? []).reduce((total, segment) => total + segment.length, 0)
    const warnings = sampled?.warnings ?? []
    const base =
      compiled === undefined || compiled.error !== null
        ? (compiled?.error ?? 'Not compiled.')
        : `${points} sampled points`
    // Under-resolved sampling (e.g. budget-exhausted refinement) is
    // disclosed with the row, not only at export time.
    const status = warnings.length > 0 ? `${base} — ${warnings.join(' ')}` : base
    return {
      source: displayName(row),
      visible: row.visible,
      status,
    }
  }, [rows, selectedId, compiledById, sampledById])

  const onViewportSizeChange = useCallback((size: SizePx): void => {
    setPixelSize((prev) => (prev.width === size.width && prev.height === size.height ? prev : size))
  }, [])

  function applyProject(project: GraphCraftProject): void {
    // Flush the outgoing project before its state is replaced. The new
    // document schedules its own backup after this switch commits.
    flushSessionBackup()
    const nextRows = rowsFromProject(project)
    const nextWorld = worldFromProject(project)
    const nextParameters = parametersFromProject(project)
    setTitle(project.title)
    workspace.replaceAll(nextRows)
    parameterStore.replaceAll(nextParameters)
    const nextDatasets = (project.dataLab?.datasets ?? []).map(projectToDataset)
    const nextAnalyses = Object.fromEntries(
      Object.entries(project.dataLab?.analyses ?? {}).map(([id, analysis]) => [id, analysisFromProject(analysis)]),
    )
    datasetStore.replaceAll(nextDatasets, nextAnalyses)
    const nextSurfaces = (project.surfaces3d ?? []).map((surface) => ({
      id: surface.id,
      source: surface.source,
      domain: { ...surface.domain },
      resolution: surface.resolution,
      camera: { ...surface.camera },
      showGrid: surface.showGrid,
      title: surface.title,
      appearance: surface.appearance ?? 'solid',
    }))
    setSurfaces3d(nextSurfaces)
    const nextFields = (project.fields2d ?? []).map((field) => ({
      id: field.id,
      mode: field.mode,
      source: field.source,
      uSource: field.uSource,
      vSource: field.vSource,
      domain: { ...field.domain },
      resolution: field.resolution,
      levelCount: field.levelCount,
      levelList: field.levelList,
      colorPolicy: field.colorPolicy,
      scalePolicy: field.scalePolicy,
      fixedMin: field.fixedMin,
      fixedMax: field.fixedMax,
      arrowMode: field.arrowMode,
      showGrid: field.showGrid,
      title: field.title,
    }))
    setFields2d(nextFields)
    const nextScatters = (project.scatters3d ?? []).map((scatter) => ({
      id: scatter.id,
      datasetId: scatter.datasetId,
      xId: scatter.xId,
      yId: scatter.yId,
      zId: scatter.zId,
      camera: { ...scatter.camera },
      title: scatter.title,
    }))
    setScatters3d(nextScatters)
    const savedAnnotation = project.learnAnnotations?.templateId
    setAnnotationTemplateId(typeof savedAnnotation === 'string' ? savedAnnotation : null)
    setView(nextWorld)
    setEqualAspect(project.viewport.equalAspect)
    setShowGrid(project.viewport.showGrid)
    setImportError(null)
    setLastSaved({
      base: serializeDocument(
        buildProjectDocument({
          title: project.title,
          rows: nextRows,
          world: DEFAULT_WORLD,
          equalAspect: project.viewport.equalAspect,
          showGrid: project.viewport.showGrid,
          parameters: nextParameters,
          datasets: nextDatasets,
          analyses: nextAnalyses,
          learnAnnotations: project.learnAnnotations ?? null,
          surfaces3d: nextSurfaces,
          fields2d: nextFields,
          scatters3d: nextScatters,
        }),
      ),
      world: nextWorld,
    })
  }

  function applyNew(): void {
    flushSessionBackup()
    setTitle('Untitled project')
    workspace.replaceAll([])
    parameterStore.replaceAll([])
    datasetStore.replaceAll([], {})
    setSurfaces3d([])
    setFields2d([])
    setScatters3d([])
    setAnnotationTemplateId(null)
    setView(DEFAULT_WORLD)
    setEqualAspect(false)
    setShowGrid(true)
    setImportError(null)
    setLastSaved({ base: emptyBaseSnapshot, world: DEFAULT_WORLD })
  }

  /** Explicit calculator hand-off: add the source as a graph row and show it. */
  function sendToGraph(source: string): void {
    workspace.addRow(source)
    setStudioView('graph')
  }

  /**
   * Explicit template hand-off: each template row becomes a new editable
   * graph row (existing rows untouched), then the graph shows them.
   * Viewport changes stay behind the card's own "recommended view" button.
   */
  function openLearnTemplate(builds: RowBuilder[]): void {
    workspace.addCustomRows(builds)
    setStudioView('graph')
  }

  /**
   * Explicit compare hand-off: the original function plus every
   * template row, added atomically as editable copies. Parameters
   * stay live afterwards — edit an opened source to reference a
   * slider (e.g. `(x-h)^2` with an `h` slider) and both curves respond.
   */
  function openCompareTemplate(baseSource: string, builds: RowBuilder[]): void {
    workspace.addCustomRows([(colorIndex: number) => ({ ...createRow(baseSource, colorIndex), label: 'original' }), ...builds])
    setStudioView('graph')
  }

  /** Root/extremum markers for the annotated template (text-only kinds never reach the graph). */
  const templateMarkers: AnalysisMarker[] = useMemo(() => {
    if (learnTemplateData === null) {
      return []
    }
    const template = learnTemplateData.templates.find((entry) => entry.id === annotationTemplateId)
    if (template === undefined) {
      return []
    }
    return learnTemplateData.markersFromTemplate(template).map((marker) => ({ x: marker.x, y: marker.y, kind: marker.kind, label: marker.label }))
  }, [annotationTemplateId, learnTemplateData])

  function toggleTemplateAnnotations(template: LearnTemplate, enabled: boolean): void {
    setAnnotationTemplateId(enabled ? template.id : null)
  }

  function saveToFile(): boolean {
    const ok = downloadTextFile(sanitizeFilename(title), serializeDocument(projectDocument))
    if (ok) {
      setLastSaved({ base: baseSnapshot, world })
      // The user explicitly saved the current view; do not leave its session
      // backup waiting for the coalescing window.
      flushSessionBackup()
    } else {
      setNotice((current) => current ?? 'Download is unavailable in this browser; your work is kept in the local backup only.')
    }
    return ok
  }

  function runPending(action: PendingAction): void {
    if (action?.type === 'new') {
      applyNew()
    } else if (action?.type === 'open') {
      applyProject(action.project)
    }
    setPendingAction(null)
  }

  function requestNew(): void {
    if (dirty) {
      setPendingAction({ type: 'new' })
    } else {
      applyNew()
    }
  }

  function requestOpenText(text: string): void {
    const validated = validateProjectText(text)
    if (!validated.ok) {
      // Invalid files never touch the current graph.
      setImportError(validated.error)
      return
    }
    setImportError(null)
    if (dirtyRef.current) {
      setPendingAction({ type: 'open', project: validated.project })
    } else {
      applyProject(validated.project)
    }
  }

  async function onPickFile(file: File | undefined): Promise<void> {
    if (file === undefined) {
      return
    }
    const seq = ++pickSeqRef.current
    try {
      const text = await readFileText(file)
      if (seq !== pickSeqRef.current) {
        // A newer pick superseded this read; drop it.
        return
      }
      requestOpenText(text)
    } catch {
      if (seq !== pickSeqRef.current) {
        return
      }
      setImportError('Could not read file.')
    }
  }

  function openDrawer(panel: DrawerPanel, opener: HTMLElement): void {
    openerRef.current = opener
    setDrawer(panel)
  }

  const sidebarBody = (
    <>
      <ExpressionList
        rows={rowViews}
        onCommit={workspace.commitSource}
        onComponentCommit={workspace.commitComponentSource}
        onImplicitCommit={workspace.commitImplicitSide}
        onInequalityOp={workspace.setInequalityOp}
        onRange={workspace.setParameterRange}
        onToggleVisibility={workspace.toggleVisibility}
        onCycleColor={workspace.cycleColor}
        onDuplicate={workspace.duplicate}
        onRemove={workspace.remove}
        onSelect={workspace.select}
        onLabel={workspace.setLabel}
        onDomain={workspace.setDomain}
        onBranches={workspace.setBranches}
        onExitPiecewise={workspace.exitPiecewise}
        onAdd={workspace.addRow}
        onAddParametric={workspace.addParametricRow}
        onAddPolar={workspace.addPolarRow}
        onAddImplicit={workspace.addImplicitRow}
        onAddInequality={workspace.addInequalityRow}
      />
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink">Starting points</h3>
        <p className="mt-1 text-xs text-muted">Templates add a new row (never rewrite one).</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {TRANSFORM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              title={template.description}
              onClick={() => applyTemplate(template)}
              className="gc-transition rounded-md border border-line bg-bg px-2 py-1.5 text-left text-xs text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block font-semibold">{template.label}</span>
              <span className="block font-mono text-muted">{template.kind === 'parametric' ? `x=${template.xSource} · y=${template.ySource}` : template.expression}</span>
            </button>
          ))}
        </div>
      </div>
      <ParametersPanel
        parameters={parameters}
        usage={parameterUsage}
        onAdd={parameterStore.addParameter}
        onSetValue={parameterStore.setValue}
        onReset={parameterStore.resetValue}
        onUpdateBounds={parameterStore.updateBounds}
        onRemove={parameterStore.removeParameter}
      />
    </>
  )

  function closeDrawer(): void {
    setDrawer('none')
    openerRef.current?.focus()
  }

  function onDividerPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = leftWidth
    const onMove = (moveEvent: PointerEvent): void => {
      setLeftWidth(clampWidth(startWidth + moveEvent.clientX - startX))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onDividerKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowLeft') {
      setLeftWidth((w) => clampWidth(w - LEFT_WIDTH_STEP))
    } else if (event.key === 'ArrowRight') {
      setLeftWidth((w) => clampWidth(w + LEFT_WIDTH_STEP))
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
      <TopBar
        projectTitle={title}
        onRenameProject={setTitle}
        dirty={dirty}
        onNewProject={requestNew}
        onOpenProject={() => fileInputRef.current?.click()}
        onSaveProject={() => {
          saveToFile()
        }}
        onExportGraph={() => setExportOpen(true)}
        exportDisabled={graphCurves.length === 0}
        view={view}
        onSwitchView={setStudioView}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen(!leftOpen)}
        onToggleRight={() => setRightOpen(!rightOpen)}
        onOpenDrawer={(panel) =>
          openDrawer(panel, document.activeElement instanceof HTMLElement ? document.activeElement : document.body)
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void onPickFile(file)
        }}
      />

      <div className="flex min-h-0 flex-1">
        {view === 'graph' && leftOpen && (
          <aside aria-label="Expressions" className="hidden w-auto shrink-0 border-r border-line bg-surface md:block" style={{ width: leftWidth }}>
            <Panel title="Expressions">
              {sidebarBody}
            </Panel>
          </aside>
        )}
        {view === 'graph' && leftOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize expression list"
            aria-valuenow={leftWidth}
            aria-valuemin={LEFT_WIDTH_MIN}
            aria-valuemax={LEFT_WIDTH_MAX}
            tabIndex={0}
            onPointerDown={onDividerPointerDown}
            onKeyDown={onDividerKeyDown}
            className="hidden w-1.5 shrink-0 cursor-col-resize hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:block"
          />
        )}

        <main aria-label={view === 'calculator' ? 'Calculator' : view === 'data' ? 'Data Lab' : view === 'learn' ? 'Learn' : view === 'viz3d' ? '3D surfaces' : 'Graph viewport'} className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3 md:p-4">
          <p aria-live="polite" className="sr-only">
            {view === 'calculator'
              ? 'Calculator workspace shown.'
              : view === 'data'
                ? 'Data Lab workspace shown.'
                : view === 'learn'
                  ? 'Learn library shown.'
                  : view === 'viz3d'
                    ? '3D surfaces workspace shown.'
                    : 'Graph Studio shown.'}
          </p>
          {view === 'calculator' ? (
            <WorkspaceBoundary key="calculator" workspace="Calculator">
              <Suspense fallback={<p className="text-sm text-muted">Loading calculator…</p>}>
                <Calculator onSendToGraph={sendToGraph} />
              </Suspense>
            </WorkspaceBoundary>
          ) : view === 'viz3d' ? (
            <WorkspaceBoundary key="viz3d" workspace="3D surfaces">
              <Suspense fallback={<p className="text-sm text-muted">Loading 3D surfaces…</p>}>
                <Viz3D
                  datasets={datasetStore.datasets}
                  initial={surfaces3d}
                  initialFields={fields2d}
                  initialScatters={scatters3d}
                  onChange={setSurfaces3d}
                  onFieldsChange={setFields2d}
                  onScattersChange={setScatters3d}
                />
              </Suspense>
            </WorkspaceBoundary>
          ) : view === 'learn' ? (
            <WorkspaceBoundary key="learn" workspace="Learn">
              <Suspense fallback={<p className="text-sm text-muted">Loading learn library…</p>}>
                <LearnLibrary onOpenTemplate={openLearnTemplate} onCompareTemplate={openCompareTemplate} onApplyView={(world) => setView(clampWorldRect(world))} activeAnnotationId={annotationTemplateId} onToggleAnnotations={toggleTemplateAnnotations} />
              </Suspense>
            </WorkspaceBoundary>
          ) : view === 'data' ? (
            <WorkspaceBoundary key="data" workspace="Data Lab">
              <Suspense fallback={<p className="text-sm text-muted">Loading data lab…</p>}>
                <DataLab
                  datasets={datasetStore.datasets}
                  onAddDataset={datasetStore.addDataset}
                  onRemoveDataset={datasetStore.removeDataset}
                  onMutate={datasetStore.mutate}
                  onUndo={(id) => {
                    datasetStore.undo(id)
                  }}
                  onRestore={(id) => {
                    datasetStore.restoreSource(id)
                  }}
                  canUndo={datasetStore.canUndo}
                  hasHistory={datasetStore.hasHistory}
                  analyses={datasetStore.analyses}
                  onAnalysisChange={datasetStore.setAnalysis}
                />
              </Suspense>
            </WorkspaceBoundary>
          ) : (
            <>
          {importError !== null && (
            <div role="alert" className="mb-2 flex shrink-0 items-start justify-between gap-2 rounded-md border border-danger bg-surface px-3 py-2 text-sm text-ink">
              <span>Could not open project: {importError} Your current graph is unchanged.</span>
              <button type="button" aria-label="Dismiss import error" onClick={() => setImportError(null)} className="shrink-0 rounded px-1 text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Dismiss
              </button>
            </div>
          )}
          <GraphStudioBoundary onRestoreView={reset}>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
              <GraphView
                world={world}
                curves={graphCurves}
                markers={[...analysisMarkers, ...templateMarkers]}
                showGrid={showGrid}
                equalAspect={equalAspect}
                crosshair={crosshair}
                onPanByWorld={panByWorld}
                onZoomAtWorld={zoomAtWorld}
                onResetView={reset}
                onViewportSizeChange={onViewportSizeChange}
              />
            </div>
          </GraphStudioBoundary>
          <p className="mt-2 shrink-0 text-xs text-muted">
            Add an expression to plot it. Enter commits; drag to pan, scroll to zoom, +/−/0 keys work when focused.
          </p>
            </>
          )}
        </main>

        {view === 'graph' && rightOpen && (
          <aside aria-label="Inspector" className="hidden w-64 shrink-0 border-l border-line bg-surface md:block">
            <Panel title="Inspector">
              <InspectorPanel
                showGrid={showGrid}
                onToggleGrid={() => setShowGrid(!showGrid)}
                equalAspect={equalAspect}
                onToggleEqualAspect={() => setEqualAspect(!equalAspect)}
                crosshair={crosshair}
                onToggleCrosshair={() => setCrosshair(!crosshair)}
                selected={selectedDetail}
                analysis={analysis}
              />
            </Panel>
          </aside>
        )}
      </div>

      <StatusBar
        expressionCount={rows.length}
        theme={theme}
        viewLabel={formatViewLabel(world)}
        notice={notice}
        online={online}
        updateAvailable={updateAvailable}
        onApplyUpdate={() => {
          if (!applyOfflineUpdate()) {
            // The update already activated (for example in another tab):
            // a plain reload moves this tab onto the new version.
            window.location.reload()
          }
          setUpdateAvailable(false)
        }}
      />

      {pendingAction !== null && (
        <ConfirmDialog
          title={pendingAction.type === 'new' ? 'Start a new project?' : 'Open this project file?'}
          message="You have unsaved changes. Save them to a file first, discard them, or cancel and keep working."
          confirmLabel="Save to file"
          onConfirm={() => {
            saveToFile()
            runPending(pendingAction)
          }}
          onDiscard={() => runPending(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {exportOpen && (
        <ExportDialogBoundary onClose={() => setExportOpen(false)}>
          <Suspense fallback={<ExportDialogLoading onClose={() => setExportOpen(false)} />}>
            <ExportDialog
              title={title}
              world={world}
              viewportSize={pixelSize}
              curves={exportCurves}
              markers={analysisMarkers}
              templateMarkers={templateMarkers}
              showGrid={showGrid}
              equalAspect={equalAspect}
              warnings={exportWarnings}
              onClose={() => setExportOpen(false)}
            />
          </Suspense>
        </ExportDialogBoundary>
      )}

      {drawer !== 'none' && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <div
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={drawer === 'expressions' ? 'Expression list' : 'Inspector'}
            onKeyDown={(event) => containTabFocus(event, drawerPanelRef.current)} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-panel">
            <div className="flex items-center justify-end border-b border-line p-2">
              <IconButton ref={drawerCloseRef} label={drawer === 'expressions' ? 'Close expression list' : 'Close inspector'} onClick={closeDrawer}>
                <X size={18} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {drawer === 'expressions' ? (
                sidebarBody
              ) : (
                <InspectorPanel
                  showGrid={showGrid}
                  onToggleGrid={() => setShowGrid(!showGrid)}
                  equalAspect={equalAspect}
                  onToggleEqualAspect={() => setEqualAspect(!equalAspect)}
                  crosshair={crosshair}
                  onToggleCrosshair={() => setCrosshair(!crosshair)}
                  selected={selectedDetail}
                  analysis={analysis}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
