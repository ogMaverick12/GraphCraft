import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { defaultScatterState, defaultSurfaceState, type SurfaceViewState } from './surface.ts'
import { SurfaceView } from './SurfaceView.tsx'
import { FieldView } from './FieldView.tsx'
import { defaultFieldState, type FieldViewState } from './fields.ts'
import { Scatter3D, type Scatter3DState } from './Scatter3D.tsx'
import type { Dataset } from '../data/dataset.ts'

/**
 * 3D + field workspace (Stage 6): bounded surfaces and 2D field
 * displays, each with its own configuration. Neither touches 2D rows,
 * datasets, or calculator state — the workspaces share nothing
 * mutable. Parametric 3D curves and streamlines are deferred.
 */

export const MAX_SURFACES = 6
export const MAX_FIELDS = 4
export const MAX_SCATTERS = 4

export interface PersistedSurface extends SurfaceViewState {
  id: string
}

export interface PersistedField extends FieldViewState {
  id: string
}

export interface PersistedScatter extends Scatter3DState {
  id: string
}

let surfaceCounter = 0

function nextSurfaceId(): string {
  surfaceCounter += 1
  return `surface-${Date.now().toString(36)}-${surfaceCounter}`
}

let fieldCounter = 0

function nextFieldId(): string {
  fieldCounter += 1
  return `field-${Date.now().toString(36)}-${fieldCounter}`
}

let scatterCounter = 0

function nextScatterId(): string {
  scatterCounter += 1
  return `scatter-${Date.now().toString(36)}-${scatterCounter}`
}

export function Viz3D({
  datasets,
  initial,
  initialFields,
  initialScatters,
  onChange,
  onFieldsChange,
  onScattersChange,
}: {
  datasets: Dataset[]
  initial?: PersistedSurface[]
  initialFields?: PersistedField[]
  initialScatters?: PersistedScatter[]
  onChange?: (surfaces: PersistedSurface[]) => void
  onFieldsChange?: (fields: PersistedField[]) => void
  onScattersChange?: (scatters: PersistedScatter[]) => void
}): React.JSX.Element {
  const [surfaces, setSurfaces] = useState<PersistedSurface[]>(() =>
    initial === undefined || initial.length === 0 ? [{ ...defaultSurfaceState(), id: nextSurfaceId() }] : initial.map((s) => ({ ...s })),
  )
  const [fields, setFields] = useState<PersistedField[]>(() => (initialFields ?? []).map((f) => ({ ...f })))
  const [scatters, setScatters] = useState<PersistedScatter[]>(() => (initialScatters ?? []).map((f) => ({ ...f })))

  function update(id: string, patch: Partial<SurfaceViewState>): void {
    const next = surfaces.map((surface) => (surface.id === id ? { ...surface, ...patch } : surface))
    // Skip identical reports (per-render reporters must not churn the store).
    if (JSON.stringify(next) === JSON.stringify(surfaces)) {
      return
    }
    setSurfaces(next)
    onChange?.(next)
  }

  function add(): void {
    if (surfaces.length >= MAX_SURFACES) {
      return
    }
    const next = [...surfaces, { ...defaultSurfaceState(), id: nextSurfaceId(), title: `Surface ${surfaces.length + 1}` }]
    setSurfaces(next)
    onChange?.(next)
  }

  function remove(id: string): void {
    const next = surfaces.filter((surface) => surface.id !== id)
    setSurfaces(next)
    onChange?.(next)
  }

  function updateField(id: string, patch: Partial<FieldViewState>): void {
    const next = fields.map((field) => (field.id === id ? { ...field, ...patch } : field))
    if (JSON.stringify(next) === JSON.stringify(fields)) {
      return
    }
    setFields(next)
    onFieldsChange?.(next)
  }

  function addField(): void {
    if (fields.length >= MAX_FIELDS) {
      return
    }
    const next = [...fields, { ...defaultFieldState(), id: nextFieldId(), title: `Field ${fields.length + 1}` }]
    setFields(next)
    onFieldsChange?.(next)
  }

  function removeField(id: string): void {
    const next = fields.filter((field) => field.id !== id)
    setFields(next)
    onFieldsChange?.(next)
  }

  function updateScatter(id: string, patch: Partial<Scatter3DState>): void {
    const next = scatters.map((scatter) => (scatter.id === id ? { ...scatter, ...patch } : scatter))
    if (JSON.stringify(next) === JSON.stringify(scatters)) {
      return
    }
    setScatters(next)
    onScattersChange?.(next)
  }

  function addScatter(): void {
    if (scatters.length >= MAX_SCATTERS) {
      return
    }
    const next = [...scatters, { ...defaultScatterState(), id: nextScatterId(), title: `Scatter ${scatters.length + 1}` }]
    setScatters(next)
    onScattersChange?.(next)
  }

  function removeScatter(id: string): void {
    const next = scatters.filter((scatter) => scatter.id !== id)
    setScatters(next)
    onScattersChange?.(next)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">3D surfaces — software-rendered, no GPU needed</h2>
        <p className="mt-1 text-xs text-muted">
          Bounded <span className="font-mono">z = f(x, y)</span> grids with orbit cameras. Grids are capped at 128×128; invalid regions draw as gaps.
          2D Graph Studio is untouched — switch back any time with nothing lost.
        </p>
        <div className="mt-3">
          <Button onClick={add} title={surfaces.length >= MAX_SURFACES ? `At most ${MAX_SURFACES} surfaces (painter cost stays linear)` : 'Add a surface'} disabled={surfaces.length >= MAX_SURFACES}>
            Add surface
          </Button>
        </div>
      </div>
      {surfaces.map((surface) => (
        <SurfaceView
          key={surface.id}
          initial={surface}
          onRemove={surfaces.length > 1 ? () => remove(surface.id) : undefined}
          onChange={(state) => update(surface.id, state)}
        />
      ))}
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">2D fields — contours, heatmaps, vector arrows</h2>
        <p className="mt-1 text-xs text-muted">
          Marching-squares contours, viridis heatmaps, and strided arrows over bounded domains. Streamlines are deferred (documented in FIELDS.md).
        </p>
        <div className="mt-3">
          <Button onClick={addField} title={fields.length >= MAX_FIELDS ? `At most ${MAX_FIELDS} fields` : 'Add a field'} disabled={fields.length >= MAX_FIELDS}>
            Add field
          </Button>
        </div>
      </div>
      {fields.map((field) => (
        <FieldView key={field.id} initial={field} onRemove={() => removeField(field.id)} onChange={(state) => updateField(field.id, state)} />
      ))}
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">3D scatter — observations from Data Lab datasets</h2>
        <p className="mt-1 text-xs text-muted">
          Three numeric columns mapped to x/y/z, read-only from shared datasets (no import duplicated, nothing mutated). Fits stay 2D-only:
          their coordinates are incompatible with 3D space, so no overlays are offered.
        </p>
        <div className="mt-3">
          <Button onClick={addScatter} title={scatters.length >= MAX_SCATTERS ? `At most ${MAX_SCATTERS} scatters` : 'Add a scatter'} disabled={scatters.length >= MAX_SCATTERS}>
            Add scatter
          </Button>
        </div>
      </div>
      {scatters.map((scatter) => (
        <Scatter3D key={scatter.id} datasets={datasets} initial={scatter} onRemove={() => removeScatter(scatter.id)} onChange={(state) => updateScatter(scatter.id, state)} />
      ))}
    </div>
  )
}
