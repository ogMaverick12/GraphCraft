import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button.tsx'
import { IconButton } from '../components/ui/IconButton.tsx'
import type { Parameter } from './model.ts'

interface ParametersPanelProps {
  parameters: Parameter[]
  /** Row labels (or sources) referencing each parameter. */
  usage: Record<string, string[]>
  onAdd: (name: string) => string | null
  onSetValue: (name: string, value: number) => void
  onReset: (name: string) => void
  onUpdateBounds: (name: string, patch: { min?: number; max?: number; step?: number }) => string | null
  onRemove: (name: string) => void
}

function ParameterValueEditor({ parameter, onSetValue }: { parameter: Parameter; onSetValue: (value: number) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(String(parameter.value))
  const [synced, setSynced] = useState(parameter.value)
  // Adopt external changes (slider drags, resets) without an effect.
  if (parameter.value !== synced) {
    setSynced(parameter.value)
    setDraft(String(parameter.value))
  }

  function commit(): void {
    if (draft.trim() === '') {
      setDraft(String(parameter.value))
      return
    }
    const value = Number(draft)
    if (!Number.isFinite(value)) {
      setDraft(String(parameter.value))
      return
    }
    onSetValue(value)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${parameter.name} value`}
      value={draft}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(String(parameter.value))
        }
      }}
      className="w-20 min-w-0 rounded-md border border-line bg-surface px-1.5 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

function BoundsEditor({
  parameter,
  onUpdateBounds,
}: {
  parameter: Parameter
  onUpdateBounds: (patch: { min?: number; max?: number; step?: number }) => string | null
}): React.JSX.Element {
  const [minText, setMinText] = useState(String(parameter.min))
  const [maxText, setMaxText] = useState(String(parameter.max))
  const [stepText, setStepText] = useState(String(parameter.step))
  const [message, setMessage] = useState<string | null>(null)

  function commit(): void {
    const min = Number(minText)
    const max = Number(maxText)
    const step = Number(stepText)
    const error = onUpdateBounds({
      ...(minText.trim() === '' ? {} : { min }),
      ...(maxText.trim() === '' ? {} : { max }),
      ...(stepText.trim() === '' ? {} : { step }),
    })
    setMessage(error)
  }

  const inputClass =
    'w-20 min-w-0 rounded-md border border-line bg-surface px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="mt-1.5 rounded-md border border-line bg-bg p-2" onBlur={commit}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <label className="flex items-center gap-1">
          Min
          <input type="text" inputMode="decimal" aria-label={`${parameter.name} minimum`} value={minText} onChange={(event) => setMinText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { commit() } }} className={inputClass} />
        </label>
        <label className="flex items-center gap-1">
          Max
          <input type="text" inputMode="decimal" aria-label={`${parameter.name} maximum`} value={maxText} onChange={(event) => setMaxText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { commit() } }} className={inputClass} />
        </label>
        <label className="flex items-center gap-1">
          Step
          <input type="text" inputMode="decimal" aria-label={`${parameter.name} step`} value={stepText} onChange={(event) => setStepText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { commit() } }} className={inputClass} />
        </label>
      </div>
      {message !== null && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * Free-parameter editors: slider + numeric field (both keyboard
 * operable), reset-to-default, bounds editing with hard limits, and
 * per-parameter usage so dependents stay visible.
 */
export function ParametersPanel({ parameters, usage, onAdd, onSetValue, onReset, onUpdateBounds, onRemove }: ParametersPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [boundsFor, setBoundsFor] = useState<string | null>(null)

  function submit(): void {
    if (draft.trim() === '') {
      return
    }
    const error = onAdd(draft)
    setAddError(error)
    if (error === null) {
      setDraft('')
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="text-sm font-semibold tracking-tight text-ink">Parameters</h3>
      <form
        aria-label="Add parameter"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="mt-2 flex gap-2"
      >
        <input
          type="text"
          value={draft}
          aria-label="New parameter name"
          placeholder="e.g. a"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" aria-label="Add parameter" title="Add parameter">
          Add
        </Button>
      </form>
      {addError !== null && (
        <p role="alert" className="mt-1.5 text-xs leading-snug text-danger">
          {addError}
        </p>
      )}

      {parameters.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No parameters yet. Define one, then use it in any expression.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {parameters.map((parameter) => {
            const usedBy = usage[parameter.name] ?? []
            return (
              <li key={parameter.name} className="rounded-lg border border-line bg-bg p-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-6 shrink-0 truncate font-mono text-sm font-semibold text-ink" title={parameter.name}>
                    {parameter.name}
                  </span>
                  <input
                    type="range"
                    aria-label={`${parameter.name} slider`}
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={parameter.value}
                    onChange={(event) => onSetValue(parameter.name, Number(event.target.value))}
                    className="min-w-0 flex-1 accent-accent"
                  />
                  <ParameterValueEditor parameter={parameter} onSetValue={(value) => onSetValue(parameter.name, value)} />
                  <IconButton label={`Reset ${parameter.name} to ${parameter.defaultValue}`} title={`Reset ${parameter.name} to ${parameter.defaultValue}`} onClick={() => onReset(parameter.name)}>
                    <RotateCcw size={15} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Delete parameter ${parameter.name}`} title={`Delete parameter ${parameter.name}`} onClick={() => onRemove(parameter.name)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </IconButton>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-muted" title={usedBy.length > 0 ? `Used by ${usedBy.join(', ')}` : 'Not used by any expression'}>
                    {usedBy.length > 0 ? `Used by ${usedBy.join(', ')}` : 'Unused'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setBoundsFor(boundsFor === parameter.name ? null : parameter.name)}
                    aria-expanded={boundsFor === parameter.name}
                    className="gc-transition shrink-0 rounded px-1 text-[11px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Bounds
                  </button>
                </div>
                {boundsFor === parameter.name && <BoundsEditor parameter={parameter} onUpdateBounds={(patch) => onUpdateBounds(parameter.name, patch)} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
