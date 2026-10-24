import { useEffect, useRef } from 'react'
import { Button } from './Button.tsx'
import { useDialogFocus } from './useDialogFocus.ts'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onDiscard: () => void
  onCancel: () => void
}

/**
 * Save/Discard/Cancel guard for destructive workspace switches.
 * Focus lands on Cancel (the safe choice); Escape cancels; Tab cycles
 * inside; closing restores focus to whatever opened the dialog.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onDiscard, onCancel }: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { dialogRef, onKeyDown } = useDialogFocus()

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div ref={dialogRef} onKeyDown={onKeyDown} role="alertdialog" aria-modal="true" aria-label={title} aria-describedby="confirm-dialog-message" className="relative w-full max-w-sm rounded-lg border border-line bg-elevated p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p id="confirm-dialog-message" className="mt-2 text-sm text-ink-soft">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onDiscard}>Discard</Button>
          <Button onClick={onCancel} ref={cancelRef}>
            Cancel
          </Button>
          <Button onClick={onConfirm} className="border-accent bg-accent font-semibold text-white hover:bg-accent-strong dark:text-white">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
