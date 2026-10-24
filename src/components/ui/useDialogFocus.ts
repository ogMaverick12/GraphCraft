import { useEffect, useRef } from 'react'

/** Candidates inside a dialog, in DOM order — that order is the tab order. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DialogFocus {
  /** Attach to the dialog panel element (the box with `role="dialog"`). */
  dialogRef: React.RefObject<HTMLDivElement | null>
  /** Attach as `onKeyDown` to the same panel: keeps Tab/Shift+Tab inside. */
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

/**
 * Keeps Tab/Shift+Tab cycling inside `container` when focus would
 * otherwise leave it. Shared by the modal dialogs (via `useDialogFocus`)
 * and the mobile drawer, which owns its own Escape/initial-focus flow.
 */
export function containTabFocus(event: React.KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || container === null) {
    return
  }
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault()
      last.focus()
    }
  } else if (active === last || !container.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * Shared modal behaviour for the four dialogs (Import, Confirm, Export
 * graph, Export data figure): remember the element that opened the
 * dialog and keep Tab/Shift+Tab cycling inside it, then restore focus to
 * the opener when the dialog unmounts. Escape handling and the initial
 * focus target stay with each dialog, which owns its close semantics.
 *
 * Call this before the dialog's own initial-focus effect so the opener
 * is captured while it still has focus. Background content is not made
 * `inert`; `aria-modal="true"` plus the tab cycle is the scope boundary.
 */
export function useDialogFocus(): DialogFocus {
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      openerRef.current = active
    }
    return () => {
      const opener = openerRef.current
      if (opener !== null && opener.isConnected) {
        opener.focus()
      }
    }
  }, [])

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    containTabFocus(event, dialogRef.current)
  }

  return { dialogRef, onKeyDown }
}
