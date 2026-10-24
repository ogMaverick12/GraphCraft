import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { MAX_EXPRESSION_LENGTH } from '../math/index.ts'

describe('implicit and inequality rows', () => {
  it('adds a unit circle implicit curve and plots it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Implicit curve' }))

    const svg = await screen.findByRole('img', { name: /x\^2 \+ y\^2/ })
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('edits both sides and reports bad sides locally', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Implicit curve' }))
    await screen.findByRole('img', { name: /x\^2 \+ y\^2/ })

    const left = screen.getByRole('textbox', { name: 'Left-hand side' })
    await user.clear(left)
    await user.type(left, 'x+')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.clear(left)
    await user.type(left, 'x^2+y^2')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('img', { name: /x\^2\+y\^2/ })).toBeInTheDocument()
  })

  it('reports an over-limit implicit side before sampling', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Implicit curve' }))
    await screen.findByRole('img', { name: /x\^2 \+ y\^2/ })

    const left = screen.getByRole('textbox', { name: 'Left-hand side' })
    await user.clear(left)
    await user.type(left, '1'.repeat(MAX_EXPRESSION_LENGTH + 1))
    await user.keyboard('{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(`Left-hand side: Expression is too long (${MAX_EXPRESSION_LENGTH + 1} characters; maximum is ${MAX_EXPRESSION_LENGTH}).`)
    expect(screen.queryByRole('img', { name: /x\^2 \+ y\^2/ })).not.toBeInTheDocument()
  })

  it('fills inequality regions under the axes and curves', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Inequality' }))

    const svg = await screen.findByRole('img', { name: /y ≤ x\^2/ })
    const fills = svg.querySelectorAll('rect')
    // Region rects exist (plus the clip rect): filtered by fill opacity marker.
    const filled = Array.from(svg.querySelectorAll('rect')).filter((r) => r.getAttribute('fill-opacity') === '0.15')
    expect(filled.length).toBeGreaterThan(0)
    expect(fills.length).toBeGreaterThan(1)
  })

  it('dashes strict inequality boundaries and keeps solid ones', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Inequality' }))
    const svg = await screen.findByRole('img', { name: /y ≤ x\^2/ })
    const solid = Array.from(svg.querySelectorAll('path')).filter((p) => p.getAttribute('stroke-dasharray') === null)
    expect(solid.length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Inequality operator' }), '<')
    const strict = await screen.findByRole('img', { name: /y </ })
    const dashed = Array.from(strict.querySelectorAll('path')).filter((p) => (p.getAttribute('stroke-dasharray') ?? '') !== '')
    expect(dashed.length).toBeGreaterThan(0)
  })

  it('hides and deletes implicit rows like any other row', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Implicit curve' }))
    await screen.findByRole('img', { name: /x\^2 \+ y\^2/ })

    await user.click(screen.getByRole('button', { name: /Hide x\^2 \+ y\^2/ }))
    expect(screen.queryByRole('img', { name: /x\^2 \+ y\^2/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Delete x\^2 \+ y\^2/ }))
    expect(screen.queryByRole('textbox', { name: 'Left-hand side' })).not.toBeInTheDocument()
  })
})
