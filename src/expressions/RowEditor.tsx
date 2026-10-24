import { useEffect, useRef, useState } from 'react'

const COMMIT_DEBOUNCE_MS = 250

interface RowEditorProps {
  rowId: string
  committed: string
  onCommit: (id: string, source: string) => void
  label?: string
}

/**
 * Responsive text field with debounced commit. The draft updates every
 * keystroke locally; the workspace (and sampling) sees only committed
 * text — on pause, on blur, or immediately on Enter. Escape reverts.
 */
export function RowEditor({ rowId, committed, onCommit, label = 'Expression' }: RowEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState(committed)
  const [syncedSource, setSyncedSource] = useState(committed)
  const timer = useRef<number | null>(null)

  // Adopt external source changes (e.g. duplicate) without an effect.
  if (committed !== syncedSource) {
    setSyncedSource(committed)
    setDraft(committed)
  }

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    },
    [],
  )

  function scheduleCommit(next: string): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
    }
    if (next === committed) {
      return
    }
    timer.current = window.setTimeout(() => {
      onCommit(rowId, next)
    }, COMMIT_DEBOUNCE_MS)
  }

  function commitNow(next: string): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (next !== committed) {
      onCommit(rowId, next)
    }
  }

  const pending = draft !== committed

  return (
    <div className="min-w-0 flex-1">
      <input
        type="text"
        value={draft}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value)
          scheduleCommit(event.target.value)
        }}
        onBlur={() => commitNow(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitNow(draft)
          } else if (event.key === 'Escape') {
            event.stopPropagation()
            if (timer.current !== null) {
              window.clearTimeout(timer.current)
              timer.current = null
            }
            setDraft(committed)
          }
        }}
        className="w-full rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {pending && (
        <p className="mt-0.5 text-[11px] text-muted" aria-hidden="true">
          Editing…
        </p>
      )}
    </div>
  )
}
