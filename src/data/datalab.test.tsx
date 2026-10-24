import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

// The lazy DataLab chunk can take several seconds under suite contention.
// Keep this wait local to the lazy boundary and below the 30 s test budget.
const DATA_LAB_READY_TIMEOUT = 20_000

async function openDataLab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Show data lab' }))
  const workspace = await screen.findByRole('main', { name: 'Data Lab' })
  await within(workspace).findByRole(
    'heading',
    { name: 'Data Lab — ingestion' },
    { timeout: DATA_LAB_READY_TIMEOUT },
  )
  expect(within(workspace).getByRole('button', { name: 'Paste data' })).toBeInTheDocument()
}

describe('data lab ingestion', () => {
  it('imports pasted CSV through preview with a full accounting', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'x,y\n1,2\n3,four\n\n' } })
    expect(await screen.findByTestId('import-summary')).toHaveTextContent('2 rows, 2 columns')
    expect(await screen.findAllByText(/kept as text/)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Import 2 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()
    // Full preparation table: rename buttons per column, editable cells.
    expect(screen.getByRole('button', { name: 'Rename x' })).toBeInTheDocument()
    expect(screen.getByTitle('Edit row 1 x')).toHaveTextContent('1')
    expect(screen.getByTitle('Edit row 2 y')).toHaveTextContent('four')
  })

  it('cancels without committing anything', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'a,b\n1,2' } })
    expect(await screen.findByTestId('import-summary')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Datasets (0)')).toBeInTheDocument()
  })

  it('rejects Excel files explicitly instead of parsing them as CSV', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    const main = screen.getByRole('main', { name: 'Data Lab' })
    const picker = main.querySelector('input[type="file"]')
    expect(picker).not.toBe(null)
    await user.upload(picker as HTMLElement, new File(['a,b\n1,2'], 'sheet.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Excel.*not supported yet.*never parsed as CSV/)
    expect(screen.getByText('Datasets (0)')).toBeInTheDocument()
  })

  it('commits a manual grid through the same validation', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Manual entry' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'Row 1 column 1' }), { target: { value: 't' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Row 1 column 2' }), { target: { value: 'v' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Row 2 column 1' }), { target: { value: '0' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Row 2 column 2' }), { target: { value: '9.8' } })
    await user.click(screen.getByRole('button', { name: 'Validate and add' }))

    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()
    // Row 1 is correctly read as the header; both columns type numeric.
    expect(screen.getByRole('button', { name: 'Rename t' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename v' })).toBeInTheDocument()
    expect(screen.getByTitle('Edit row 1 t')).toHaveTextContent('0')
  })

  it('keeps existing datasets when a later import fails', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    let area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'a\n1' } })
    await user.click(screen.getByRole('button', { name: /Import 1 row/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'x'.repeat(6_000_000) } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Datasets (1)')).toBeInTheDocument()
  })

  it('deletes datasets explicitly', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'a\n1' } })
    await user.click(screen.getByRole('button', { name: /Import 1 row/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Datasets (0)')).toBeInTheDocument()
  })

  it('accepts a dropped CSV file through the same guarded path', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    // jsdom drops need an explicit dataTransfer; fireEvent.drop does not
    // carry one to React handlers, so dispatch directly (verified).
    const target = screen.getByRole('button', { name: 'Paste data' })
    const dropEvent = new Event('drop', { bubbles: true }) as Event & { dataTransfer?: unknown }
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [new File(['x,y\n1,2'], 'drop.csv', { type: 'text/csv' })] } })
    target.dispatchEvent(dropEvent)
    const dialog = await screen.findByRole('dialog', { name: 'Import data' })
    expect(dialog).toBeInTheDocument()
    expect(await screen.findByTestId('import-summary')).toHaveTextContent('1 row')
  })

  it('focuses the import dialog on open and cancels on Escape without importing', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    await screen.findByRole('dialog', { name: 'Import data' })
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Import data' })).not.toBeInTheDocument()
    expect(screen.getByText('Datasets (0)')).toBeInTheDocument()
  })

  it('forces a mixed column numeric with explicit clearing', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'x\n1\noops' } })
    expect(await screen.findByTestId('import-summary')).toHaveTextContent('2 rows')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Type for x' }), 'numeric')
    expect(await screen.findByTestId('import-summary')).toHaveTextContent('cleared by type override')

    await user.click(screen.getByRole('button', { name: /Import 2 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename x' })).toBeInTheDocument()
    expect(screen.getByTitle('Edit row 2 x')).toHaveTextContent('∅')
  })
})

describe('data preparation', () => {
  async function importText(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: text } })
    const summary = await screen.findByTestId('import-summary')
    expect(summary).toBeInTheDocument()
    const commit = screen.getByRole('button', { name: /Import \d+ rows?/ })
    await user.click(commit)
    await screen.findByText('Datasets (1)')
  }

  it('edits a cell and reports type violations honestly', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n1,2\n3,4')

    await user.click(screen.getByTitle('Edit row 1 a'))
    const editor = await screen.findByRole('textbox', { name: 'Edit row 1 a' })
    fireEvent.change(editor, { target: { value: '5' } })
    await user.keyboard('{Enter}')
    expect(await screen.findByTitle('Edit row 1 a')).toHaveTextContent('5')

    await user.click(screen.getByTitle('Edit row 1 a'))
    const bad = await screen.findByRole('textbox', { name: 'Edit row 1 a' })
    fireEvent.change(bad, { target: { value: 'oops' } })
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/retag/)
  })

  it('commits cell edits on blur instead of discarding them', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n1,2\n3,4')

    await user.click(screen.getByTitle('Edit row 1 a'))
    const editor = await screen.findByRole('textbox', { name: 'Edit row 1 a' })
    fireEvent.change(editor, { target: { value: '9' } })
    fireEvent.blur(editor)
    expect(await screen.findByTitle('Edit row 1 a')).toHaveTextContent('9')
  })

  it('sorts and filters as views without mutating raw order', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n3,30\n1,10\n2,20')

    await user.click(screen.getByRole('button', { name: 'Sort by a' }))
    // Ascending: source row 2 (values 1, 10) displays first.
    expect(screen.getByTitle('Edit row 2 a')).toHaveTextContent('1')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter column' }), 'a')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter condition' }), '>')
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter value' }), { target: { value: '1' } })
    expect(screen.getByText(/2 of 3 rows shown/)).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter column' }), 'No filter')
    expect(screen.queryByText(/of 3 rows shown/)).not.toBeInTheDocument()
  })

  it('drops missing rows, undoes, and restores source', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n1,2\n3,\n5,6')

    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('3 rows')
    await user.click(screen.getByRole('button', { name: 'Drop missing rows' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('2 rows')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('3 rows')

    await user.click(screen.getByRole('button', { name: 'Drop missing rows' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('2 rows')
    await user.click(screen.getByRole('button', { name: 'Restore source' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('3 rows')
  })

  it('adds a derived column through stable ids', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'x,y\n1,2\n3,4')

    fireEvent.change(screen.getByRole('textbox', { name: 'Derived column name' }), { target: { value: 'total' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Derived column expression' }), { target: { value: 'c1+c2' } })
    await user.click(screen.getByRole('button', { name: 'Add column' }))
    expect(await screen.findByRole('button', { name: 'Rename total' })).toBeInTheDocument()
  })

  it('renames columns and attaches registry units', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n1,2')

    await user.click(screen.getByRole('button', { name: 'Rename a' }))
    const rename = await screen.findByRole('textbox', { name: 'Rename a' })
    fireEvent.change(rename, { target: { value: 'alpha' } })
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: 'Rename alpha' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Unit symbol' }), { target: { value: 'parsec' } })
    await user.click(screen.getByRole('button', { name: 'Set' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unknown unit/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Unit symbol' }), { target: { value: 'm' } })
    await user.click(screen.getByRole('button', { name: 'Set' }))
    expect(await screen.findByText(/unit m/)).toBeInTheDocument()
  })
})
