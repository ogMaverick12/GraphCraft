import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { formatViewLabel } from '../graph/coordinate.ts'
import { LEARN_TEMPLATES } from './templates.ts'

async function openLearn(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Show learn library' }))
  await screen.findByRole('main', { name: 'Learn' })
  await screen.findByTestId('learn-count')
}

describe('learn library', () => {
  it('lists every template and narrows by search and filters', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    expect(await screen.findByTestId('learn-count')).toHaveTextContent(`${LEARN_TEMPLATES.length} templates in the library.`)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: 'cardioid' } })
    expect(await screen.findByTestId('learn-count')).toHaveTextContent('1 template match the current filters.')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: '' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by topic' }), 'Circles and conics')
    const conics = LEARN_TEMPLATES.filter((t) => t.category === 'conics').length
    expect(await screen.findByTestId('learn-count')).toHaveTextContent(`${conics} templates match the current filters.`)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by topic' }), 'All topics')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by graph type' }), 'Polar')
    const polar = LEARN_TEMPLATES.filter((t) => t.rows.some((row) => row.kind === 'polar')).length
    expect(await screen.findByTestId('learn-count')).toHaveTextContent(`${polar} templates match the current filters.`)
    expect(await screen.findByText('Cardioid polar curve')).toBeInTheDocument()
  })

  it('expands a card with preview, formula, and objective', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Expand Reciprocal curve with a vertical pole' }))
    const preview = await screen.findByRole('img', { name: 'Preview of Reciprocal curve with a vertical pole' })
    expect(preview).toBeInTheDocument()
    // Fixed light plate: the fixed palette stays legible in both themes.
    expect(preview.getAttribute('class')).toContain('bg-white')
    expect(screen.getByText('y = 1/x')).toBeInTheDocument()
    expect(screen.getByText(/Identify a pole/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use recommended view' })).toBeInTheDocument()
  })

  it('reads formulas in mathematical notation and lists verified properties', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Expand Upward parabola and its lowest point' }))
    expect(await screen.findByText('y = x²−4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand Square and cube joined at zero' }))
    expect(await screen.findByText(/Domain: All real numbers/)).toBeInTheDocument()
    expect(screen.getByText(/Decreasing on/)).toBeInTheDocument()
    expect(screen.getByText(/Minimum at \(0, 0\)/)).toBeInTheDocument()
  })

  it('opens templates as additive editable copies without mutating the library', async () => {
    const user = userEvent.setup()
    await openLearn(user)
    const before = JSON.stringify(LEARN_TEMPLATES)
    expect(screen.getByText('No expressions')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Sine curve over one full cycle' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    expect(screen.getByText('1 expression')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByTestId('learn-count')
    await user.click(screen.getByRole('button', { name: 'Open Line tangent to a parabola' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    // Two template rows added on top of the first — nothing rewritten.
    expect(screen.getByText('3 expressions')).toBeInTheDocument()
    expect(JSON.stringify(LEARN_TEMPLATES)).toBe(before)
    // Added rows mark the project dirty, so the guard protects them.
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  it('bookmarks locally and restores them across visits', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: '☆ Save Cardioid polar curve' }))
    expect(await screen.findByRole('button', { name: '★ Saved Cardioid polar curve' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByTestId('learn-count')
    expect(await screen.findByRole('button', { name: '★ Saved Cardioid polar curve' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Show bookmarked only' }))
    expect(await screen.findByTestId('learn-count')).toHaveTextContent('1 template match the current filters.')
  })

  it('browses topic collections with prerequisite trails', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Browse by topic' }), 'Conic sections')
    expect(await screen.findByTestId('topic-banner')).toHaveTextContent('Conic sections')
    expect(await screen.findByTestId('learn-count')).toHaveTextContent('4 templates match the current filters.')
    expect(screen.queryByText('Cardioid polar curve')).not.toBeInTheDocument()

    // Prerequisite trails navigate: Quadratics is required before conics.
    await user.click(screen.getByRole('button', { name: 'Quadratics' }))
    expect(await screen.findByTestId('topic-banner')).toHaveTextContent('Quadratics')
    expect(await screen.findByTestId('learn-count')).toHaveTextContent('4 templates match the current filters.')
  })
})

describe('learn annotations', () => {
  it('lists annotations with basis labels and toggles preview markers', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Expand Upward parabola and its lowest point' }))
    const list = await screen.findByRole('list', { name: 'Annotations for Upward parabola and its lowest point' })
    expect(list.textContent).toContain('Vertex (0, −4)')
    expect(list.textContent).toContain('exact')
    const preview = await screen.findByRole('img', { name: 'Preview of Upward parabola and its lowest point' })
    expect(preview.querySelectorAll('circle').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('checkbox', { name: 'Show annotation markers on preview' }))
    expect(preview.querySelectorAll('circle')).toHaveLength(0)
  })

  it('compares transforms against the original with honest notes', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: 'shift inside' } })
    await user.click(screen.getByRole('button', { name: 'Expand Horizontal shift inside a squared term' }))
    expect(await screen.findByText(/What changed:/)).toBeInTheDocument()
    expect(screen.getByText(/moves two units to the right/)).toBeInTheDocument()

    const preview = await screen.findByRole('img', { name: 'Preview of Horizontal shift inside a squared term' })
    const before = preview.querySelectorAll('path').length
    await user.click(screen.getByRole('checkbox', { name: 'Compare with original function' }))
    expect(preview.querySelectorAll('path').length).toBeGreaterThan(before)
  })

  it('shows annotation markers on the graph and offers them in exports', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Expand Upward parabola and its lowest point' }))
    // Rows first (export needs a curve), then markers.
    await user.click(screen.getByRole('button', { name: 'Open Upward parabola and its lowest point' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByTestId('learn-count')
    await user.click(screen.getByRole('button', { name: 'Expand Upward parabola and its lowest point' }))
    await user.click(screen.getByRole('button', { name: 'Show on graph' }))
    expect(await screen.findByRole('button', { name: 'Hide graph markers' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    expect(await screen.findByLabelText('root marker: Root x = 2')).toBeInTheDocument()
    expect(await screen.findByLabelText('extremum marker: Vertex (0, −4)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Export graph as image' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export graph' })
    const include = within(dialog).getByRole('checkbox', { name: /Include template annotations/ })
    expect(include).toBeChecked()
    await user.click(include)
    expect(include).not.toBeChecked()
  })

  it('hides graph markers again on toggle and on new projects', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Expand Upward parabola and its lowest point' }))
    await user.click(screen.getByRole('button', { name: 'Show on graph' }))
    expect(await screen.findByRole('button', { name: 'Hide graph markers' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide graph markers' }))
    expect(await screen.findByRole('button', { name: 'Show on graph' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    expect(screen.queryByLabelText(/root marker: Root x/)).not.toBeInTheDocument()
  })
})

describe('learn exploration', () => {
  it('operates cards keyboard-only from expand to open', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    const expand = screen.getByRole('button', { name: 'Expand Sine curve over one full cycle' })
    expand.focus()
    expect(expand).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('img', { name: 'Preview of Sine curve over one full cycle' })).toBeInTheDocument()

    const open = screen.getByRole('button', { name: 'Open Sine curve over one full cycle' })
    open.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('main', { name: 'Graph viewport' })
    expect(screen.getByText('1 expression')).toBeInTheDocument()
  })
  it('restores the verified viewport through the recommended-view button', async () => {
    const user = userEvent.setup()
    await openLearn(user)
    const sine = LEARN_TEMPLATES.find((template) => template.id === 'sine-wave')
    if (sine === undefined) {
      throw new Error('expected the sine template')
    }
    const recommended = formatViewLabel(sine.viewport)

    await user.click(screen.getByRole('button', { name: 'Open Sine curve over one full cycle' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    // Disturb the view first so the reset is observable.
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByTitle('Current mathematical view')).not.toHaveTextContent(recommended)

    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByTestId('learn-count')
    await user.click(screen.getByRole('button', { name: 'Expand Sine curve over one full cycle' }))
    await user.click(screen.getByRole('button', { name: 'Use recommended view' }))
    expect(screen.getByTitle('Current mathematical view')).toHaveTextContent(recommended)
  })

  it('edits an opened copy live while the library entry stays verified', async () => {
    const user = userEvent.setup()
    await openLearn(user)
    const before = JSON.stringify(LEARN_TEMPLATES)

    await user.click(screen.getByRole('button', { name: 'Open Sine curve over one full cycle' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    const editor = screen.getByRole('textbox', { name: 'Expression' })
    await user.clear(editor)
    await user.type(editor, 'sin(2*x)')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('img', { name: /sin\(2\*x\)/ })).toBeInTheDocument()
    expect(JSON.stringify(LEARN_TEMPLATES)).toBe(before)
  })

  it('refuses an invalid edit with feedback instead of a stale curve', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Open Sine curve over one full cycle' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    const editor = screen.getByRole('textbox', { name: 'Expression' })
    await user.clear(editor)
    await user.type(editor, 'sin(')
    await user.keyboard('{Enter}')

    // Clear feedback, and the broken row draws nothing — never the old curve as if valid.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /sin\(x\)/ })).not.toBeInTheDocument()
  })

  it('accepts parameters on opened rows and responds to slider input', async () => {
    const user = userEvent.setup()
    await openLearn(user)

    await user.click(screen.getByRole('button', { name: 'Open Sine curve over one full cycle' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    fireEvent.change(screen.getByRole('textbox', { name: 'New parameter name' }), { target: { value: 'h' } })
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await screen.findByRole('slider', { name: 'h slider' })

    const editor = screen.getByRole('textbox', { name: 'Expression' })
    await user.clear(editor)
    await user.type(editor, 'sin(x+h)')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('img', { name: /sin\(x\+h\)/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'h slider' }), { target: { value: '2' } })
    expect(screen.getByRole('textbox', { name: 'h value' })).toHaveValue('2')
    expect(screen.getByRole('img', { name: /sin\(x\+h\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
