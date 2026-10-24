import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'
import { ExportDialog } from './ExportDialog.tsx'
import type { WorldRect } from '../graph/coordinate.ts'

const WORLD: WorldRect = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }

describe('export dialog workflows', () => {
  it('is disabled with no curves and enabled once plotted', async () => {
    const user = userEvent.setup()
    render(<App />)
    const exportButton = screen.getByRole('button', { name: 'Export graph as image' })
    expect(exportButton).toBeDisabled()

    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })
    expect(screen.getByRole('button', { name: 'Export graph as image' })).toBeEnabled()
  })

  it('dismisses and reopens the dialog', async () => {
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    const exportButton = screen.getByRole('button', { name: 'Export graph as image' })
    await user.click(exportButton)
    const firstDialog = await screen.findByRole('dialog', { name: 'Export graph' })
    await user.click(within(firstDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Export graph' })).not.toBeInTheDocument()

    await user.click(exportButton)
    expect(await screen.findByRole('dialog', { name: 'Export graph' })).toBeInTheDocument()
  })

  it('downloads an SVG figure containing the plotted curve', async () => {
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const seen: Blob[] = []
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'Export graph as image' }))
    expect(await screen.findByRole('dialog', { name: 'Export graph' })).toBeInTheDocument()

    createURL.mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        seen.push(blob)
      }
      return 'blob:mock'
    })
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(seen.length).toBeGreaterThan(0)
    const first = seen[0]
    if (first === undefined) {
      throw new Error('Expected a downloaded blob')
    }
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (): void => resolve(String(reader.result ?? ''))
      reader.onerror = (): void => reject(new Error('Could not read blob'))
      reader.readAsText(first)
    })
    expect(text).toContain('<svg')
    expect(text).toContain('x^2')
    expect(screen.queryByRole('dialog', { name: 'Export graph' })).not.toBeInTheDocument()
    createURL.mockRestore()
  })

  it('discloses sampler warnings instead of silently exporting', () => {
    render(
      <ExportDialog
        title="Shaky"
        world={WORLD}
        viewportSize={{ width: 800, height: 600 }}
        curves={[]}
        showGrid
        equalAspect={false}
        warnings={['The evaluation budget was exhausted; refined detail is incomplete.']}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/may be incomplete/)).toBeInTheDocument()
  })

  it('reports gracefully when PNG rendering is unavailable', async () => {
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'Export graph as image' }))
    await screen.findByRole('dialog', { name: 'Export graph' })
    await user.click(screen.getByRole('radio', { name: /png/i }))
    await user.click(screen.getByRole('button', { name: 'Download' }))
    // jsdom has no canvas: guidance, not a crash, dialog stays open.
    expect(await screen.findByRole('alert')).toHaveTextContent(/canvas/)
    expect(screen.getByRole('dialog', { name: 'Export graph' })).toBeInTheDocument()
  })
})
