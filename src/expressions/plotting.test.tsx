import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

function viewport(): HTMLElement {
  return screen.getByRole('img', { name: /graph viewport|empty graph viewport/i })
}

function rowEditors(): HTMLElement[] {
  return screen.getAllByRole('textbox', { name: 'Expression' })
}

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

describe('acceptance: end-to-end equation plotting', () => {
  it('1. adds x^2 and sees a parabola', async () => {
    const user = userEvent.setup()
    render(<App />)

    await addExpression(user, 'x^2')

    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()
    expect(viewport().querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('2. shows two curves with distinct colours', async () => {
    const user = userEvent.setup()
    render(<App />)

    await addExpression(user, 'x^2')
    await addExpression(user, 'sin(x)')

    const svg = await screen.findByRole('img', { name: /x\^2/ })
    expect(svg.getAttribute('aria-label')).toContain('sin(x)')
    const strokes = new Set(Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('stroke')))
    expect(strokes.size).toBeGreaterThanOrEqual(2)
  })

  it('3. hides and shows the parabola', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')
    await addExpression(user, 'sin(x)')

    await user.click(await screen.findByRole('button', { name: 'Hide x^2' }))
    expect(screen.queryByRole('img', { name: /x\^2/ })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sin\(x\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show x^2' }))
    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()
  })

  it('4. edits x^2 to x^3 with stable identity and colour', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    const swatchBefore = screen.getByRole('button', { name: 'Change colour for x^2' }).querySelector('line')?.getAttribute('stroke')
    const editor = rowEditors()[0]
    if (editor === undefined) {
      throw new Error('Expected a row editor')
    }
    await user.clear(editor)
    await user.type(editor, 'x^3')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('img', { name: /x\^3/ })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /x\^2/ })).not.toBeInTheDocument()
    const swatchAfter = screen.getByRole('button', { name: 'Change colour for x^3' }).querySelector('line')?.getAttribute('stroke')
    expect(swatchAfter).toBe(swatchBefore)
    // Order stable: the edited row is still the only row.
    expect(rowEditors()).toHaveLength(1)
  })

  it('5. shows a local parse message while the sine graph keeps working', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'sin(x)')
    await addExpression(user, 'x+')

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not parse|check brackets/i)
    expect(screen.getByRole('img', { name: /sin\(x\)/ })).toBeInTheDocument()
  })

  it('6. does not connect across the 1/x asymptote', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, '1/x')

    const svg = await screen.findByRole('img', { name: /1\/x/ })
    const parts = Array.from(svg.querySelectorAll('title')).filter((t) => (t.textContent ?? '').startsWith('1/x'))
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('7. deletes one expression while the rest stay correct', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')
    await addExpression(user, 'sin(x)')

    await user.click(await screen.findByRole('button', { name: 'Delete x^2' }))
    expect(screen.queryByRole('img', { name: /x\^2/ })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sin\(x\)/ })).toBeInTheDocument()
    expect(rowEditors()).toHaveLength(1)
  })

  it('does not create rows from empty or duplicate Enter presses', async () => {
    const user = userEvent.setup()
    render(<App />)

    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.click(box)
    await user.keyboard('{Enter}')
    expect(screen.queryAllByRole('textbox', { name: 'Expression' })).toHaveLength(0)

    await user.type(box, 'x^2')
    await user.keyboard('{Enter}{Enter}')
    expect(rowEditors()).toHaveLength(1)
  })

  it('debounces typing so only the settled text is sampled', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    const editor = rowEditors()[0]
    if (editor === undefined) {
      throw new Error('Expected a row editor')
    }
    await user.clear(editor)
    await user.type(editor, 'x^3')
    // Still settling: the old curve shows, no crash, no intermediate error.
    expect(screen.getByRole('img', { name: /x\^2/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Pause past the debounce: the settled text commits without Enter.
    expect(await screen.findByRole('img', { name: /x\^3/ }, { timeout: 10000 })).toBeInTheDocument()
  })
})
