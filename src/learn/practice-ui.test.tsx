import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

async function openPractice(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Show learn library' }))
  await screen.findByRole('main', { name: 'Learn' })
  // The library loads on demand; wait past the Suspense fallback.
  await user.click(await screen.findByRole('button', { name: 'Learn practice' }))
  await screen.findByRole('combobox', { name: 'Practice topic' })
}

describe('practice mode', () => {
  it('grades a correct choice and persists the mark across visits', async () => {
    const user = userEvent.setup()
    await openPractice(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Practice topic' }), 'Quadratics')
    await user.click(screen.getByRole('radio', { name: '(x−2)²' }))
    const checks = screen.getAllByRole('button', { name: 'Check answer' })
    await user.click(checks[0] as HTMLElement)
    const verdict = await screen.findByRole('status', { name: 'Practice feedback' })
    expect(verdict.textContent).toContain('Correct.')

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByRole('main', { name: 'Learn' })
    await user.click(await screen.findByRole('button', { name: 'Learn practice' }))
    await screen.findByRole('combobox', { name: 'Practice topic' })
    // Last topic restored; the answered mark survived the round trip.
    expect(screen.getByRole('combobox', { name: 'Practice topic' })).toHaveValue('quadratics')
    expect(await screen.findByText('✓ Answered')).toBeInTheDocument()
  })

  it('works keyboard-only and rejects a wrong choice with the explanation', async () => {
    const user = userEvent.setup()
    await openPractice(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Practice topic' }), 'Quadratics')
    const option = screen.getByRole('radio', { name: '(x+2)²' })
    option.focus()
    await user.keyboard(' ')
    expect(option).toBeChecked()
    await user.tab()
    await user.keyboard('{Enter}')
    const verdict = await screen.findByRole('status', { name: 'Practice feedback' })
    expect(verdict.textContent).toContain('Not quite.')
    expect(verdict.textContent).toContain('shifts left')
  })

  it('checks numeric sets order-insensitively and hides answers until asked', async () => {
    const user = userEvent.setup()
    await openPractice(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Practice topic' }), 'Quadratics')
    expect(screen.queryByText('−2, 2')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /Numbers for identify-quadratic-roots/ }), { target: { value: '2, -2' } })
    const checks = screen.getAllByRole('button', { name: 'Check answer' })
    await user.click(checks[1] as HTMLElement)
    expect(await screen.findByText(/Matches the verified solution set/)).toBeInTheDocument()
  })

  it('never marks exploration and opens its graph additively', async () => {
    const user = userEvent.setup()
    await openPractice(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Practice topic' }), 'Polar and parametric curves')
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument()
    expect(screen.getByText(/no checked answer/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show graph for explore-rose-coefficient' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    expect(screen.getByText('1 expression')).toBeInTheDocument()
  })

  it('opens transform pairs as two editable rows for live comparison', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Show learn library' }))
    await screen.findByRole('main', { name: 'Learn' })
    await screen.findByTestId('learn-count')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: 'shift inside' } })
    await user.click(screen.getByRole('button', { name: 'Compare Shift inside the brackets goes right with original' }))
    await screen.findByRole('main', { name: 'Graph viewport' })
    // Base plus transformed: two rows, existing (empty) project untouched otherwise.
    expect(screen.getByText('2 expressions')).toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })
})
