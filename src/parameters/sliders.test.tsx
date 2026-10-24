import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App.tsx'
import { compileExpression } from '../math/index.ts'
import { sampleFunction } from '../sampling/index.ts'

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

async function addParameter(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New parameter name' })
  await user.clear(box)
  await user.type(box, name)
  await user.keyboard('{Enter}')
}

describe('sliders', () => {
  it('adds a parameter, plots dependents, and updates on slider input', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addParameter(user, 'a')
    await addExpression(user, 'a*x')

    const slider = screen.getByRole('slider', { name: 'a slider' })
    expect(slider).toHaveAttribute('min', '-10')
    expect(slider).toHaveAttribute('max', '10')
    expect(slider).toHaveAttribute('step', '0.1')
    expect(screen.getByRole('img', { name: /a\*x/ })).toBeInTheDocument()
    expect(screen.getByText(/Used by a\*x/)).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '2' } })
    expect(screen.getByRole('textbox', { name: 'a value' })).toHaveValue('2')
    // Same curve, new values — still plotted, no reparse error.
    expect(screen.getByRole('img', { name: /a\*x/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains reserved parameter names without adding a slider', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addParameter(user, 'y')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid parameter name "y".')
    expect(alert).toHaveTextContent('Use 1-16 characters')
    expect(alert).toHaveTextContent('lowercase x, y, t, theta, pi, e')
    expect(alert).toHaveTextContent('all supported function names are reserved')
    expect(screen.queryByRole('slider', { name: 'y slider' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New parameter name' })).toHaveValue('y')
  })

  it('rejects invalid bound edits without applying them', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addParameter(user, 'b')
    await user.click(screen.getByRole('button', { name: 'Bounds' }))

    await user.clear(screen.getByRole('textbox', { name: 'b minimum' }))
    await user.type(screen.getByRole('textbox', { name: 'b minimum' }), '5')
    await user.clear(screen.getByRole('textbox', { name: 'b maximum' }))
    await user.type(screen.getByRole('textbox', { name: 'b maximum' }), '-5')
    await user.keyboard('{Enter}')

    // The valid intermediate (min 5) applied on blur; the reversed pair was rejected.
    expect(await screen.findByRole('alert')).toHaveTextContent(/min below max/)
    expect(screen.getByRole('slider', { name: 'b slider' })).toHaveAttribute('max', '10')
  })

  it('updates multiple dependents and resets to default', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addParameter(user, 'a')
    await addExpression(user, 'a*x')
    await addExpression(user, 'a+x')

    fireEvent.change(screen.getByRole('slider', { name: 'a slider' }), { target: { value: '3' } })
    const svg = screen.getByRole('img', { name: /a\*x/ })
    expect(svg.getAttribute('aria-label')).toContain('a+x')

    await user.click(screen.getByRole('button', { name: 'Reset a to 1' }))
    expect(screen.getByRole('textbox', { name: 'a value' })).toHaveValue('1')
  })

  it('operates sliders from the keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addParameter(user, 'k')

    // Native range inputs handle arrow keys in browsers (jsdom does not
    // emulate that); here we verify focusability, step wiring, and
    // keyboard-only value entry through the numeric field.
    const slider = screen.getByRole('slider', { name: 'k slider' })
    slider.focus()
    expect(slider).toHaveFocus()
    expect(slider).toHaveAttribute('step', '0.1')

    await user.click(screen.getByRole('textbox', { name: 'k value' }))
    await user.clear(screen.getByRole('textbox', { name: 'k value' }))
    await user.type(screen.getByRole('textbox', { name: 'k value' }), '2.5')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'k value' })).toHaveValue('2.5')
  })

  it('applies transform templates without rewriting rows', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    await user.click(screen.getByRole('button', { name: /Shift/ }))
    expect(await screen.findByRole('img', { name: /\(x-h\)/ })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'h slider' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'k slider' })).toBeInTheDocument()
    // Original row untouched, template appended after it.
    const editors = screen.getAllByRole('textbox', { name: 'Expression' })
    expect(editors.map((editor) => (editor as HTMLInputElement).value)).toEqual(['x^2', '(x-h)^2+k'])
  })

  it('round-trips parameters through save and open', async () => {
    const saved: Blob[] = []
    const createURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        saved.push(blob)
      }
      return 'blob:mock'
    })
    const user = userEvent.setup()
    const first = render(<App />)
    await addParameter(user, 'a')
    await addExpression(user, 'a*x')
    fireEvent.change(screen.getByRole('slider', { name: 'a slider' }), { target: { value: '4' } })
    await user.click(screen.getByRole('button', { name: 'Save project to file' }))
    expect(saved.length).toBeGreaterThan(0)
    first.unmount()
    window.localStorage.clear()

    render(<App />)
    const blob = saved[0]
    if (blob === undefined) {
      throw new Error('Expected a saved file')
    }
    const file = new File([blob], 'params.graphcraft.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected a hidden file input')
    }
    await user.upload(input, file)
    expect(await screen.findByRole('slider', { name: 'a slider' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'a value' })).toHaveValue('4')
    expect(screen.getByRole('img', { name: /a\*x/ })).toBeInTheDocument()
    createURL.mockRestore()
  })

  it('stays responsive across rapid slider changes', async () => {
    render(<App />)
    const user = userEvent.setup()
    await addParameter(user, 'a')
    await addExpression(user, 'a*sin(x)')
    const slider = await screen.findByRole('slider', { name: 'a slider' })

    // UI smoke: a burst of ticks lands on the final value with no errors.
    for (const value of ['2', '4', '6', '8', '10']) {
      fireEvent.change(slider, { target: { value } })
    }
    expect(screen.getByRole('textbox', { name: 'a value' })).toHaveValue('10')
    expect(screen.getByRole('img', { name: /a\*sin\(x\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('resamples a full drag sweep within budget', () => {
    const compiled = compileExpression('a*sin(x)', { parameters: ['a'] })
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    const started = performance.now()
    for (let step = 0; step <= 40; step += 1) {
      const result = sampleFunction(compiled.expression, { xMin: -10, xMax: 10, pixelWidth: 800, parameters: { a: -10 + step * 0.5 } })
      expect(result.segments.length).toBeGreaterThan(0)
    }
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
