import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

async function openSettings(user: ReturnType<typeof userEvent.setup>, rowName: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Open settings for ${rowName}` }))
}

describe('stage 2: domains', () => {
  it('clips sqrt(x) to a valid domain', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'sqrt(x)')
    await screen.findByRole('img', { name: /sqrt\(x\)/ })
    await openSettings(user, 'sqrt(x)')

    await user.clear(screen.getByRole('textbox', { name: 'Domain minimum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain minimum' }), '0')
    await user.clear(screen.getByRole('textbox', { name: 'Domain maximum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain maximum' }), '4')
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sqrt\(x\)/ })).toBeInTheDocument()
  })

  it('rejects reversed bounds with an actionable row error', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')

    await user.clear(screen.getByRole('textbox', { name: 'Domain minimum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain minimum' }), '5')
    await user.clear(screen.getByRole('textbox', { name: 'Domain maximum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain maximum' }), '2')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(/min below max/)
  })

  it('leaves an out-of-view domain blank without crashing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')

    await user.clear(screen.getByRole('textbox', { name: 'Domain minimum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain minimum' }), '20')
    await user.clear(screen.getByRole('textbox', { name: 'Domain maximum' }))
    await user.type(screen.getByRole('textbox', { name: 'Domain maximum' }), '30')
    await user.keyboard('{Enter}')

    const svg = screen.getByRole('img', { name: /graph viewport|empty graph viewport/i })
    expect(svg.querySelectorAll('path').length).toBe(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a one-sided blank domain instead of committing zero', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')

    const min = screen.getByRole('textbox', { name: 'Domain minimum' })
    const max = screen.getByRole('textbox', { name: 'Domain maximum' })
    await user.clear(min)
    await user.type(min, '1')
    await user.clear(max)
    await user.type(max, '5')
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Clearing one side must reject the commit, never turn the blank into 0.
    await user.clear(max)
    await user.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter both bounds as numbers, or clear both.')
    expect(screen.queryByText(/min below max/)).not.toBeInTheDocument()

    // Escape restores the committed bounds: nothing was overwritten with 0.
    await user.type(max, '{Escape}')
    expect(min).toHaveValue('1')
    expect(max).toHaveValue('5')

    // Whitespace-only text is rejected the same way.
    fireEvent.change(max, { target: { value: '   ' } })
    fireEvent.blur(max)
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter both bounds as numbers, or clear both.')

    // A valid replacement value is still accepted normally.
    await user.clear(max)
    await user.type(max, '5')
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('stage 2: piecewise', () => {
  it('renders separate pieces with a shared boundary', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))

    // Default carries the original formula; add an x<0 branch of -x.
    await user.click(screen.getByRole('button', { name: 'Add branch' }))
    const branchSource = screen.getByRole('textbox', { name: 'Branch 1 expression' })
    await user.clear(branchSource)
    await user.type(branchSource, '-x')
    await user.keyboard('{Enter}')

    const svg = await screen.findByRole('img', { name: /x/ })
    const parts = Array.from(svg.querySelectorAll('title')).filter((t) => (t.textContent ?? '').startsWith('x (part'))
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('draws a step function with a deliberate jump', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, '0')
    await openSettings(user, '0')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    await user.click(screen.getByRole('button', { name: 'Add branch' }))
    const branchSource = screen.getByRole('textbox', { name: 'Branch 1 expression' })
    await user.clear(branchSource)
    await user.type(branchSource, '0')
    await user.keyboard('{Enter}')
    const defaultInput = screen.getByRole('textbox', { name: 'Default branch expression' })
    await user.clear(defaultInput)
    await user.type(defaultInput, '1')
    await user.keyboard('{Enter}')

    const svg = await screen.findByRole('img', { name: /0/ })
    const parts = Array.from(svg.querySelectorAll('title')).filter((t) => (t.textContent ?? '').startsWith('0 (part'))
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('names the failing branch', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    await user.click(screen.getByRole('button', { name: 'Add branch' }))

    const branchSource = screen.getByRole('textbox', { name: 'Branch 1 expression' })
    await user.clear(branchSource)
    await user.type(branchSource, 'x+')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(/Branch 1/)
  })

  it('exits piecewise mode with "Use single formula" and keeps the default formula', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))

    // Branch state: one x<0 piece plus an edited default expression.
    await user.click(screen.getByRole('button', { name: 'Add branch' }))
    const branchSource = screen.getByRole('textbox', { name: 'Branch 1 expression' })
    await user.clear(branchSource)
    await user.type(branchSource, '-x')
    await user.keyboard('{Enter}')
    const defaultInput = screen.getByRole('textbox', { name: 'Default branch expression' })
    await user.clear(defaultInput)
    await user.type(defaultInput, 'x+1')
    await user.keyboard('{Enter}')

    await user.click(screen.getByRole('button', { name: 'Use single formula' }))

    // The exit must not be lost to the two updates racing on stale rows:
    // the branch editors are gone, the toggle flips back, and the default
    // branch survives as the single formula.
    expect(screen.queryByRole('textbox', { name: 'Default branch expression' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Branch 1 expression' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make piecewise' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x+1')
    await screen.findByRole('img', { name: /x\+1/ })
  })

  it('still exits piecewise mode after the default branch is cleared', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    await user.click(screen.getByRole('button', { name: 'Add branch' }))
    const branchSource = screen.getByRole('textbox', { name: 'Branch 1 expression' })
    await user.clear(branchSource)
    await user.type(branchSource, '-x')
    await user.keyboard('{Enter}')
    await user.clear(screen.getByRole('textbox', { name: 'Default branch expression' }))

    await user.click(screen.getByRole('button', { name: 'Use single formula' }))

    // The blank-default case used to be the only way out; it must keep
    // working and retain the previous single formula.
    expect(screen.queryByRole('textbox', { name: 'Default branch expression' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make piecewise' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x')
  })

  it('round-trips: re-entering piecewise seeds the edited single formula', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    await user.click(screen.getByRole('button', { name: 'Use single formula' }))

    // Edit the single formula, then enter piecewise mode again.
    const editor = screen.getByRole('textbox', { name: 'Expression' })
    await user.clear(editor)
    await user.type(editor, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    expect(screen.getByRole('textbox', { name: 'Default branch expression' })).toHaveValue('x^2')
    expect(screen.queryByRole('textbox', { name: 'Branch 1 expression' })).not.toBeInTheDocument()
    await screen.findByRole('img', { name: /x\^2/ })
  })

  it('never commits a blank branch boundary as zero and keeps decimal input working', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await openSettings(user, 'x')
    await user.click(screen.getByRole('button', { name: 'Make piecewise' }))
    await user.click(screen.getByRole('button', { name: 'Add branch' }))

    const boundary = screen.getByLabelText('Branch 1 boundary value')
    await user.clear(boundary)
    await user.type(boundary, '2')
    expect(screen.getByTitle('Branch 1: x < 2')).toBeInTheDocument()

    // Deleting the value must keep the previous boundary, not commit 0.
    await user.clear(boundary)
    await user.tab()
    expect(screen.getByTitle('Branch 1: x < 2')).toBeInTheDocument()
    expect((boundary as HTMLInputElement).value).toBe('2')

    // Whitespace-only text must not commit 0 either.
    boundary.focus()
    fireEvent.change(boundary, { target: { value: '   ' } })
    fireEvent.blur(boundary)
    expect(screen.getByTitle('Branch 1: x < 2')).toBeInTheDocument()
    expect((boundary as HTMLInputElement).value).toBe('2')

    // Decimal input commits normally.
    await user.clear(boundary)
    await user.type(boundary, '2.5')
    expect(screen.getByTitle('Branch 1: x < 2.5')).toBeInTheDocument()

    // Zero typed on purpose still commits zero.
    await user.clear(boundary)
    await user.type(boundary, '0')
    expect(screen.getByTitle('Branch 1: x < 0')).toBeInTheDocument()
  })
})

describe('stage 2: labels', () => {
  it('shows labels and warns on duplicates', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')
    await addExpression(user, 'sin(x)')

    await openSettings(user, 'x^2')
    const labels = screen.getAllByRole('textbox', { name: 'Expression label' })
    const first = labels[0]
    if (first === undefined) {
      throw new Error('Expected a label field')
    }
    await user.type(first, 'Wave')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Wave')).toBeInTheDocument()

    await openSettings(user, 'sin(x)')
    const second = screen.getAllByRole('textbox', { name: 'Expression label' })[1]
    if (second === undefined) {
      throw new Error('Expected a second label field')
    }
    await user.type(second, 'wave')
    await user.keyboard('{Enter}')
    // Case-insensitive both ways: each row warns about the other.
    const warnings = await screen.findAllByText(/already used/)
    expect(warnings).toHaveLength(2)
  })
})
