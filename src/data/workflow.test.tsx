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
  // DataLab is lazy; wait for the rendered ingestion view, not the shell or
  // Suspense fallback, before touching its controls.
  await within(workspace).findByRole(
    'heading',
    { name: 'Data Lab — ingestion' },
    { timeout: DATA_LAB_READY_TIMEOUT },
  )
  expect(within(workspace).getByRole('button', { name: 'Paste data' })).toBeInTheDocument()
}

async function importText(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Paste data' }))
  const area = await screen.findByRole('textbox', { name: 'Data text' })
  fireEvent.change(area, { target: { value: text } })
  await user.click(screen.getByRole('button', { name: /Import \d+ rows?/ }))
  await screen.findByText('Datasets (1)')
}

describe('workspace integration', () => {
  it('keeps Data Lab, Graph Studio, and Calculator state independent across switches', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'x,y\n0,0\n1,1')

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    await user.click(screen.getByRole('button', { name: 'Show calculator' }))
    await screen.findByRole('main', { name: 'Calculator' })

    await user.click(screen.getByRole('button', { name: 'Show data lab' }))
    await screen.findByText('Datasets (1)')
    expect(screen.getByTitle('Edit row 1 x')).toHaveTextContent('0')
  })

  it('marks data imports unsaved and guards New with Save/Discard/Cancel', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()

    await importText(user, 'a,b\n1,2')
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New project' }))
    expect(await screen.findByRole('button', { name: 'Discard' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    expect(screen.getByText('Datasets (0)')).toBeInTheDocument()
  })

  it('preserves modified data across view switches', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'a,b\n1,2\n3,\n5,6')

    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('3 rows')
    await user.click(screen.getByRole('button', { name: 'Drop missing rows' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('2 rows')

    await user.click(screen.getByRole('button', { name: 'Show calculator' }))
    await screen.findByRole('main', { name: 'Calculator' })
    await user.click(screen.getByRole('button', { name: 'Show data lab' }))
    expect(await screen.findByTestId('dataset-summary')).toHaveTextContent('2 rows')
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()
  })

  it('computes calculator statistics without touching Data Lab state', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'x,y\n0,0\n1,1')

    await user.click(screen.getByRole('button', { name: 'Show calculator' }))
    // The calculator loads on demand: await a real control, not just the
    // workspace shell (`main` exists while the Suspense fallback still shows).
    await user.click(await screen.findByRole('button', { name: 'stats mode' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Data — list [2, 4, 4, 5]' }), { target: { value: '[2, 4, 4, 4, 5, 5, 7, 9]' } })
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findAllByText(/SEM \(s\/√n\) =/)).toHaveLength(2)

    // Calculator history stays in the calculator; the dataset is untouched.
    await user.click(screen.getByRole('button', { name: 'Show data lab' }))
    await screen.findByText('Datasets (1)')
    expect(screen.getByTitle('Edit row 2 y')).toHaveTextContent('1')
  })
})

describe('export dialog keyboard access', () => {
  it('focuses on open and closes on Escape', async () => {
    const user = userEvent.setup()
    await openDataLab(user)
    await importText(user, 'x,y\n0,0\n1,1')

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')
    await user.click(screen.getByRole('button', { name: 'Export figure / tables' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export data figure' })
    expect(dialog).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Export data figure' })).not.toBeInTheDocument()
  })
})
