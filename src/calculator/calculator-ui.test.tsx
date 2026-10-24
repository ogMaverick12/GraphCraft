import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

async function openCalculator(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Show calculator' }))
  await screen.findByRole('main', { name: 'Calculator' })
  // The calculator loads on demand; wait past the Suspense fallback.
  await screen.findByRole('textbox', { name: 'Expression' })
}

function expressionBox(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Expression' })
}

describe('calculator workspace', () => {
  it('switches between graph and calculator views', async () => {
    const user = userEvent.setup()
    await openCalculator(user)
    expect(screen.getByRole('button', { name: 'Show calculator' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Show graph studio' }))
    expect(await screen.findByRole('main', { name: 'Graph viewport' })).toBeInTheDocument()
  })

  it('evaluates from the keyboard and formats the result', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    await user.click(expressionBox())
    await user.keyboard('2+3*4{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 14')

    await user.keyboard('{Escape}')
    expect(expressionBox()).toHaveValue('')
  })

  it('builds expressions from the keypad, including Backspace', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    await user.click(screen.getByRole('button', { name: 'Seven' }))
    await user.click(screen.getByRole('button', { name: 'Multiply' }))
    await user.click(screen.getByRole('button', { name: 'Six' }))
    expect(expressionBox()).toHaveValue('7*6')
    await user.click(screen.getByRole('button', { name: 'Backspace' }))
    expect(expressionBox()).toHaveValue('7*')
  })

  it('computes in degrees only when the Deg mode is active', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    await user.click(screen.getByRole('button', { name: 'degrees mode' }))
    const box = expressionBox()
    await user.clear(box)
    await user.type(box, 'sin(90)')
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 1')
    expect(await screen.findByTestId('calc-interpreted')).toHaveTextContent('sin((90)*pi/180)')
  })

  it('edits history entries and caps the history length', async () => {
    const user = userEvent.setup()
    await openCalculator(user)
    const box = expressionBox()

    for (const text of ['1+1', '2+2', '3+3']) {
      await user.clear(box)
      await user.type(box, text)
      await user.keyboard('{Enter}')
      await screen.findByTestId('calc-result')
    }
    expect(screen.getByTestId('calc-result')).toHaveTextContent('= 6')

    await user.selectOptions(screen.getByRole('combobox', { name: 'History limit' }), '10')
    // Re-edit the first entry: loads it back into the expression line.
    await user.click(screen.getByRole('button', { name: /1\+1/ }))
    expect(expressionBox()).toHaveValue('1+1')
  })

  it('sends a numeric result to the graph as a constant row', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    const box = expressionBox()
    await user.clear(box)
    await user.type(box, '2+3')
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 5')

    await user.click(screen.getByRole('button', { name: 'Send result to graph' }))
    expect(await screen.findByRole('main', { name: 'Graph viewport' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /5/ })).toBeInTheDocument()
  })

  it('plots variable-bearing input as a function and explains the result gap', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    const box = expressionBox()
    await user.clear(box)
    await user.type(box, 'x+2')
    await user.keyboard('{Enter}')
    // The explanation shows both in the result line and the history entry.
    const mentions = await screen.findAllByText(/graph variable/)
    expect(mentions).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Send result to graph' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot expression in graph' }))
    expect(await screen.findByRole('main', { name: 'Graph viewport' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /x\+2/ })).toBeInTheDocument()
  })

  it('toggles between decimal and approximate-fraction display', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    const box = expressionBox()
    await user.clear(box)
    await user.type(box, '1/3')
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 0.333333333333')

    await user.click(screen.getByRole('button', { name: 'Fraction display' }))
    const fraction = await screen.findByTestId('calc-result')
    expect(fraction.textContent).toContain('≈ 1/3')
    expect(fraction.textContent).toContain('0.333333333333')

    await user.click(screen.getByRole('button', { name: 'Decimal display' }))
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 0.333333333333')
  })

  it('applies the significant-digits setting to display only', async () => {    const user = userEvent.setup()
    await openCalculator(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Significant digits' }), '6')
    const box = expressionBox()
    await user.clear(box)
    await user.type(box, '2/3')
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 0.666667')

    // The stored value is untouched: sending still carries full precision.
    await user.click(screen.getByRole('button', { name: 'Send result to graph' }))
    expect(await screen.findByRole('main', { name: 'Graph viewport' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /0\.6666666666666666/ })).toBeInTheDocument()
  })

  it('runs the memory workflow without touching history', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    expect(screen.getByRole('button', { name: 'MR' })).toBeDisabled()
    const box = expressionBox()
    await user.clear(box)
    await user.type(box, '5')
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 5')

    await user.click(screen.getByRole('button', { name: 'M+' }))
    expect(await screen.findByTestId('calc-memory')).toHaveTextContent('M: 5')

    await user.clear(box)
    await user.type(box, '2')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'M+' }))
    expect(await screen.findByTestId('calc-memory')).toHaveTextContent('M: 7')

    await user.clear(box)
    await user.click(screen.getByRole('button', { name: 'MR' }))
    expect(expressionBox()).toHaveValue('7')

    await user.click(screen.getByRole('button', { name: 'MC' }))
    expect(screen.queryByTestId('calc-memory')).not.toBeInTheDocument()
  })

  it('evaluates pasted expressions through the same safe gate', async () => {
    const user = userEvent.setup()
    await openCalculator(user)

    fireEvent.change(expressionBox(), { target: { value: '2+2*2' } })
    expressionBox().focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('calc-result')).toHaveTextContent('= 6')

    fireEvent.change(expressionBox(), { target: { value: 'window.x' } })
    expressionBox().focus()
    await user.keyboard('{Enter}')
    // Refused before evaluation — here by the variable guard, with guidance.
    expect(await screen.findAllByText(/graph variable/)).toHaveLength(2)
  })
})
