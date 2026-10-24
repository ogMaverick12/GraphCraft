import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ImportDialog } from '../../data/ImportDialog.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'

function ConfirmHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open confirm</button>
      {open && (
        <ConfirmDialog
          title="Switch workspace?"
          message="Unsaved changes will be lost."
          confirmLabel="Save"
          onConfirm={() => setOpen(false)}
          onDiscard={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

describe('dialog focus management', () => {
  it('returns focus to the opener when the dialog closes', async () => {
    const user = userEvent.setup()
    render(<ConfirmHarness />)

    const opener = screen.getByRole('button', { name: 'Open confirm' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab cycling inside the dialog', async () => {
    const user = userEvent.setup()
    render(<ConfirmHarness />)
    await user.click(screen.getByRole('button', { name: 'Open confirm' }))

    const discard = screen.getByRole('button', { name: 'Discard' })
    const save = screen.getByRole('button', { name: 'Save' })

    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(discard).toHaveFocus()

    fireEvent.keyDown(discard, { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()

    // A Tab from a middle control is left to the browser (no wrap).
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(cancel).toHaveFocus()
  })

  it('wraps Tab inside the import dialog as well', () => {
    render(<ImportDialog initialText="" fileName={null} onCommit={() => {}} onClose={() => {}} />)

    // Empty text: the Import button is disabled, so Cancel is the last tab stop.
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(screen.getByRole('textbox', { name: 'Data text' })).toHaveFocus()
  })
})
