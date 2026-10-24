import type { ExpressionRow } from '../expressions/model.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { buildProjectDataLab, type DatasetAnalysisSnapshot } from '../data/persistence.ts'
import type { Dataset } from '../data/dataset.ts'
import type { PersistedField, PersistedScatter, PersistedSurface } from '../viz3d/Viz3D.tsx'
import { PROJECT_FORMAT_TAG, PROJECT_FORMAT_VERSION, type GraphCraftProject, type ProjectExpression, type ProjectField, type ProjectParameter, type ProjectScatter, type ProjectSurface3D } from './schema.ts'

export interface WorkspaceSnapshot {
  title: string
  rows: ExpressionRow[]
  world: WorldRect
  equalAspect: boolean
  showGrid: boolean
  parameters: ProjectParameter[]
  datasets?: Dataset[]
  analyses?: Record<string, DatasetAnalysisSnapshot>
  learnAnnotations?: { templateId: string } | null
  surfaces3d?: PersistedSurface[]
  fields2d?: PersistedField[]
  scatters3d?: PersistedScatter[]
}

/**
 * Build the serializable project document from workspace state.
 * Field order is fixed so snapshots compare deterministically.
 * Compiled evaluators and other runtime objects never enter the document.
 */
export function buildProjectDocument(snapshot: WorkspaceSnapshot): GraphCraftProject {
  const project: GraphCraftProject = {
    format: PROJECT_FORMAT_TAG,
    version: PROJECT_FORMAT_VERSION,
    title: snapshot.title,
    expressions: snapshot.rows.map((row): ProjectExpression => {
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
        domain: row.domain === null ? null : { min: row.domain.min, max: row.domain.max },
        branches:
          row.branches === null
            ? null
            : row.branches.map((branch) => ({ op: branch.op, value: branch.value, source: branch.source })),
        defaultSource: row.defaultSource,
      }
    }),
    viewport: {
      xMin: snapshot.world.xMin,
      xMax: snapshot.world.xMax,
      yMin: snapshot.world.yMin,
      yMax: snapshot.world.yMax,
      equalAspect: snapshot.equalAspect,
      showGrid: snapshot.showGrid,
    },
    parameters: snapshot.parameters.map((p) => ({
      name: p.name,
      value: p.value,
      min: p.min,
      max: p.max,
      step: p.step,
      defaultValue: p.defaultValue,
    })),
    dataLab: buildProjectDataLab(snapshot.datasets ?? [], snapshot.analyses ?? {}),
    ...(snapshot.learnAnnotations == null ? {} : { learnAnnotations: { templateId: snapshot.learnAnnotations.templateId } }),
    surfaces3d: (snapshot.surfaces3d ?? []).map(
      (surface): ProjectSurface3D => ({
        id: surface.id,
        source: surface.source,
        domain: { ...surface.domain },
        resolution: surface.resolution,
        camera: { ...surface.camera },
        showGrid: surface.showGrid,
        title: surface.title,
        appearance: surface.appearance,
      }),
    ),
    fields2d: (snapshot.fields2d ?? []).map(
      (field): ProjectField => ({
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
      }),
    ),
    scatters3d: (snapshot.scatters3d ?? []).map(
      (scatter): ProjectScatter => ({
        id: scatter.id,
        datasetId: scatter.datasetId,
        xId: scatter.xId,
        yId: scatter.yId,
        zId: scatter.zId,
        camera: { ...scatter.camera },
        title: scatter.title,
      }),
    ),
  }
  return project
}

/** Stable pretty-printed project text used for files and session comparison. */
export function serializeDocument(project: GraphCraftProject): string {
  return JSON.stringify(project, null, 2)
}

/** Build and serialize a project document in one step. */
export function serializeProject(snapshot: WorkspaceSnapshot): string {
  return serializeDocument(buildProjectDocument(snapshot))
}
