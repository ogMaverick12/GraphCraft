import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'

// The lazy DataLab chunk can take several seconds under suite contention.
// Keep this wait local to the lazy boundary and below the 30 s test budget.
const DATA_LAB_READY_TIMEOUT = 20_000

/**
 * S7.3 stale-input protection for Data Lab file imports: the newest
 * picked/dropped file wins; an older read resolving late must not swap
 * the preview or surface a stale error. The real reader is parked here
 * so each read resolves exactly when the test decides.
 */
const reads: Array<{ resolve: (text: string) => void; reject: (error: unknown) => void }> = []

vi.mock('./csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./csv.ts')>()
  return {
    ...actual,
    readDataFileText: (): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        reads.push({ resolve, reject })
      }),
  }
})

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

async function pickCsv(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const main = screen.getByRole('main', { name: 'Data Lab' })
  const picker = main.querySelector('input[type="file"]')
  if (!(picker instanceof HTMLInputElement)) {
    throw new Error('Expected the CSV file input')
  }
  await user.upload(picker, new File(['(content served by the parked reader)'], name, { type: 'text/csv' }))
}

describe('stale Data Lab file reads', () => {
  // The parked-reader queue is per-test state.
  beforeEach(() => {
    reads.length = 0
  })

  it('previews the newest file when an older pick resolves later', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await pickCsv(user, 'first.csv')
    await pickCsv(user, 'second.csv')
    expect(reads).toHaveLength(2)

    await act(async () => {
      reads[1].resolve('x,y\n2,3')
    })
    expect(await screen.findByRole('dialog', { name: 'Import data' })).toBeInTheDocument()
    expect(screen.getByText('Import data — second.csv')).toBeInTheDocument()

    await act(async () => {
      reads[0].resolve('a,b\n9,9')
    })
    // The superseded read must not swap the preview.
    expect(screen.getByText('Import data — second.csv')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Data text' })).toHaveValue('x,y\n2,3')
    expect(screen.getByRole('textbox', { name: 'Dataset name' })).toHaveValue('second')
  })

  it('ignores a stale read error after a newer pick opened its preview', async () => {
    const user = userEvent.setup()
    await openDataLab(user)

    await pickCsv(user, 'first.csv')
    await pickCsv(user, 'second.csv')
    await act(async () => {
      reads[1].resolve('x,y\n2,3')
    })
    expect(await screen.findByRole('dialog', { name: 'Import data' })).toBeInTheDocument()

    await act(async () => {
      reads[0].reject(new Error('Could not read that file as text.'))
    })
    // The stale failure must not surface an error for a superseded file.
    expect(screen.queryByText('Could not read that file as text.')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Data text' })).toHaveValue('x,y\n2,3')
  })
})
