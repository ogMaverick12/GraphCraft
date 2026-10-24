import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'

/**
 * S7.3 stale-input protection: project-file reads are async, so their
 * continuations must never replace newer input — a newer pick, or edits
 * made while a read is pending. The real reader is parked here so each
 * read resolves exactly when the test decides.
 */
const reads: Array<{ resolve: (text: string) => void; reject: (error: unknown) => void }> = []

vi.mock('../project/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../project/index.ts')>()
  return {
    ...actual,
    readFileText: (): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        reads.push({ resolve, reject })
      }),
  }
})

function projectJson(title: string): string {
  return JSON.stringify({
    format: 'graphcraft-project',
    version: 1,
    title,
    expressions: [{ id: 'row-1', source: 'x^3', visible: true, colorIndex: 0 }],
    viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, equalAspect: false, showGrid: true },
  })
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected the hidden project-file input')
  }
  await user.upload(input, new File(['(content served by the parked reader)'], name, { type: 'application/json' }))
}

describe('stale project-file reads', () => {
  // The parked-reader queue is per-test state.
  beforeEach(() => {
    reads.length = 0
  })

  it('drops an older read that resolves after a newer pick', async () => {
    const user = userEvent.setup()
    render(<App />)

    await pick(user, 'first.graphcraft.json')
    await pick(user, 'second.graphcraft.json')
    expect(reads).toHaveLength(2)

    await act(async () => {
      reads[1].resolve(projectJson('Second project'))
    })
    expect(await screen.findByDisplayValue('Second project')).toBeInTheDocument()

    await act(async () => {
      reads[0].resolve(projectJson('First project'))
    })
    // The superseded read must be dropped, not applied over the newer one.
    expect(screen.getByDisplayValue('Second project')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('First project')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('ignores a stale read error once a newer pick has resolved', async () => {
    const user = userEvent.setup()
    render(<App />)

    await pick(user, 'first.graphcraft.json')
    await pick(user, 'second.graphcraft.json')
    await act(async () => {
      reads[1].resolve(projectJson('Second project'))
    })
    expect(await screen.findByDisplayValue('Second project')).toBeInTheDocument()

    await act(async () => {
      reads[0].reject(new Error('Could not read file.'))
    })
    // The stale failure must not surface an error for a superseded pick.
    expect(screen.queryByText('Could not read file.')).not.toBeInTheDocument()
  })

  it('asks before replacing edits made while a read was pending', async () => {
    const user = userEvent.setup()
    render(<App />)

    await pick(user, 'late.graphcraft.json')
    expect(reads).toHaveLength(1)

    // Newer input: the user keeps working while the read is pending.
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()

    await act(async () => {
      reads[0].resolve(projectJson('Late project'))
    })
    // The unsaved-work guard must engage now — not a silent replacement.
    expect(await screen.findByRole('alertdialog', { name: 'Open this project file?' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Untitled project')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // The user's edit is still plotted after cancelling the replace.
    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Untitled project')).toBeInTheDocument()
  })
})
