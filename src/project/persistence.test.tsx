import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'

// The lazy DataLab chunk can take several seconds under suite contention.
// Keep this wait local to the lazy boundary and below the 30 s test budget.
const DATA_LAB_READY_TIMEOUT = 20_000

const EXAMPLE = {
  format: 'graphcraft-project',
  version: 1,
  title: 'Imported',
  expressions: [{ id: 'imp-1', source: 'x^3', visible: true, colorIndex: 2 }],
  viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, equalAspect: false, showGrid: true },
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected a hidden file input')
  }
  return input
}

function uploadJson(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const file = new File([text], 'project.graphcraft.json', { type: 'application/json' })
  return user.upload(fileInput(), file)
}

describe('persistence workflows', () => {
  it('shows an unsaved indicator after edits and clears it on save', async () => {
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    // jsdom anchor clicks are observable here; the download itself is a browser act.
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()

    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save project to file' }))
    expect(createURL).toHaveBeenCalled()
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    createURL.mockRestore()
    revokeURL.mockRestore()
  })

  it('opens a valid project file and plots it', async () => {
    const user = userEvent.setup()
    render(<App />)

    await uploadJson(user, JSON.stringify(EXAMPLE))
    expect(await screen.findByRole('img', { name: /x\^3/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Imported')
  })

  it('rejects a bad file with a message and keeps the current graph', async () => {
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await uploadJson(user, '{not json')
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON.*unchanged/)
    // Current work intact: row and curve survive the failed import.
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2')
    expect(screen.getByRole('img', { name: /x\^2/ })).toBeInTheDocument()

    await uploadJson(user, JSON.stringify({ ...EXAMPLE, version: 99 }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/newer.*unchanged/)
    expect(screen.getByRole('img', { name: /x\^2/ })).toBeInTheDocument()
  })

  it('guards unsaved work with Save/Discard/Cancel on New', async () => {
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2')

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('textbox', { name: 'Expression' })).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    createURL.mockRestore()
  })

  it('round-trips a project through save and open in a fresh workspace', async () => {
    const saved: Blob[] = []
    const createURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        saved.push(blob)
      }
      return 'blob:mock'
    })
    const user = userEvent.setup()
    const first = render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, '1/x')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /1\/x/ })
    await user.click(screen.getByRole('button', { name: 'Hide 1/x' }))
    await user.type(screen.getByRole('textbox', { name: 'Project title' }), ' Trip')
    await user.click(screen.getByRole('button', { name: 'Save project to file' }))
    expect(saved.length).toBeGreaterThan(0)
    first.unmount()
    window.localStorage.clear()

    render(<App />)
    const firstBlob = saved[0]
    if (firstBlob === undefined) {
      throw new Error('Expected a saved file')
    }
    const file = new File([firstBlob], 'trip.graphcraft.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected a hidden file input')
    }
    await user.upload(input, file)
    // Expressions, visibility, title, and clean state all restored.
    expect(await screen.findByRole('textbox', { name: 'Project title' })).toHaveValue('Untitled project Trip')
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('1/x')
    expect(screen.getByRole('button', { name: 'Show 1/x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change colour for 1/x' }).querySelector('line')?.getAttribute('stroke')).toBe(
      'var(--gc-curve-1)',
    )
    expect(screen.getByLabelText('Status').textContent ?? '').toContain('-10')
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    createURL.mockRestore()
  })

  it('restores the last session backup on startup', async () => {
    window.localStorage.setItem(
      'graphcraft-last-project',
      JSON.stringify({ ...EXAMPLE, title: 'Restored session' }),
    )
    render(<App />)
    expect(await screen.findByRole('img', { name: /x\^3/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Restored session')
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('restores a Data Lab dataset synchronously and opens it with default plotting', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'graphcraft-last-project',
      JSON.stringify({
        ...EXAMPLE,
        version: 6,
        title: 'Restored lab session',
        expressions: [],
        dataLab: {
          datasets: [
            {
              id: 'restored-dataset',
              name: 'Restored growth',
              columns: [
                { id: 'c1', name: 'time', type: 'numeric', unit: 's' },
                { id: 'c2', name: 'height', type: 'numeric', unit: 'cm' },
                { id: 'c3', name: 'tray', type: 'categorical' },
              ],
              rows: [
                [0, 2.1, 'A'],
                [1, 3.2, 'B'],
              ],
              provenance: { kind: 'paste', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
              cleaningLog: [],
              missingSummary: { nullsPerColumn: [0, 0, 0], rowsWithMissing: 0 },
            },
          ],
          analyses: {},
        },
      }),
    )
    render(<App />)
    // initialRestore runs in App's synchronous state initializer.
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Restored lab session')

    await user.click(screen.getByRole('button', { name: 'Show data lab' }))
    const workspace = await screen.findByRole('main', { name: 'Data Lab' })
    await within(workspace).findByRole(
      'heading',
      { name: 'Data Lab — ingestion' },
      { timeout: DATA_LAB_READY_TIMEOUT },
    )
    expect(within(workspace).getByRole('button', { name: 'Paste data' })).toBeInTheDocument()
    expect(screen.getByText('Datasets (1)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')

    // No saved analysis: the lazy Data Lab uses the extracted startup defaults.
    expect(screen.getByRole('combobox', { name: 'Plot type' })).toHaveValue('scatter')
    expect(screen.getByRole('combobox', { name: 'X column' })).toHaveValue('c1')
    expect(screen.getByRole('combobox', { name: 'Y column' })).toHaveValue('c2')
    expect(screen.getByRole('textbox', { name: 'Plot title' })).toHaveValue('Restored growth')
    expect(screen.getByRole('textbox', { name: 'X axis label' })).toHaveValue('time (s)')
    expect(screen.getByRole('textbox', { name: 'Y axis label' })).toHaveValue('height (cm)')
  })

  it('clamps a restored session viewport that sits beyond the coordinate fence', async () => {
    window.localStorage.setItem(
      'graphcraft-last-project',
      JSON.stringify({
        ...EXAMPLE,
        title: 'Fenced session',
        viewport: { xMin: 1e12, xMax: 2e12, yMin: -5, yMax: 5, equalAspect: false, showGrid: true },
      }),
    )
    render(<App />)
    expect(await screen.findByRole('img', { name: /x\^3/ })).toBeInTheDocument()
    expect(screen.queryByText(/could not render/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status').textContent ?? '').toContain('e12')
  })

  it('opens a project whose viewport lies beyond the fence without degenerate bounds', async () => {
    const user = userEvent.setup()
    render(<App />)
    await uploadJson(
      user,
      JSON.stringify({ ...EXAMPLE, viewport: { xMin: 1e12, xMax: 2e12, yMin: -5, yMax: 5, equalAspect: false, showGrid: true } }),
    )
    expect(await screen.findByRole('img', { name: /x\^3/ })).toBeInTheDocument()
    expect(screen.queryByText(/Could not open project/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status').textContent ?? '').toContain('e12')
  })

  it('starts empty with a notice when the backup is corrupted', () => {
    window.localStorage.setItem('graphcraft-last-project', '{corrupted')
    render(<App />)
    expect(screen.getByText(/corrupted/)).toBeInTheDocument()
    expect(screen.getByText(/No expressions yet/)).toBeInTheDocument()
  })

  it('degrades gracefully when browser storage throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<App />)
    expect(screen.getByText(/storage is unavailable/)).toBeInTheDocument()
    // The app still works: expressions can be added and plotted.
    expect(screen.getByRole('textbox', { name: 'New expression' })).toBeInTheDocument()
    setItem.mockRestore()
  })
})
