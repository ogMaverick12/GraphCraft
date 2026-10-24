import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

async function openMode(user: ReturnType<typeof userEvent.setup>, mode: string): Promise<void> {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Show calculator' }))
  await screen.findByRole('main', { name: 'Calculator' })
  // The calculator loads on demand; wait past the Suspense fallback.
  await screen.findByRole('button', { name: `${mode} mode` })
  await user.click(screen.getByRole('button', { name: `${mode} mode` }))
}

/** Bracket-heavy literals cannot go through user.type (it parses [ ] as key syntax). */
function fill(name: string | RegExp, text: string): void {
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value: text } })
}

describe('structured calculator modes', () => {
  it('computes complex magnitude with its method attached', async () => {
    const user = userEvent.setup()
    await openMode(user, 'complex')

    await user.type(screen.getByRole('textbox', { name: 'Z — complex number a+bi' }), '3+4i')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), '|Z| magnitude')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    // Shown once in the result pane and once in the recorded history row.
    expect(await screen.findAllByText('5')).toHaveLength(2)
    expect(await screen.findAllByText(/Magnitude/)).toHaveLength(2)
  })

  it('shows polar form and principal logarithm with branch notes', async () => {
    const user = userEvent.setup()
    await openMode(user, 'complex')

    await user.type(screen.getByRole('textbox', { name: 'Z — complex number a+bi' }), '1+i')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'Polar form r∠θ')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    const polar = await screen.findAllByText((_, el) => (el?.textContent ?? '').includes('∠'))
    expect(polar.length).toBeGreaterThanOrEqual(1)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'log(Z), principal')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findAllByText(/negative real axis/)).toHaveLength(2)
  })

  it('refuses complex division by zero without a result', async () => {    const user = userEvent.setup()
    await openMode(user, 'complex')

    await user.type(screen.getByRole('textbox', { name: 'Z — complex number a+bi' }), '1+i')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'Z ÷ W')
    await user.type(screen.getByRole('textbox', { name: 'W — second operand (binary ops only)' }), '0')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findByText(/Division by zero/)).toBeInTheDocument()
  })

  it('computes a vector dot product across dimensions honestly', async () => {
    const user = userEvent.setup()
    await openMode(user, 'vector')

    fill('A — vector [1, 2, 3]', '[1, 2, 3]')
    fill('B — second vector (binary ops only)', '[4, 5]')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'A · B (dot)')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findByText(/equal lengths/)).toBeInTheDocument()
  })

  it('solves a 2×2 system and shows the method', async () => {
    const user = userEvent.setup()
    await openMode(user, 'matrix')

    fill('A — matrix [[1, 2], [3, 4]]', '[[3, 2], [1, 2]]')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'Solve A·x = b')
    fill('b — right-hand side for solve (vector)', '[5, 5]')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    // Floating-point elimination leaves a 4.4e-16 residue on x (the unit
    // test pins it with toBeCloseTo); the UI shows it honestly.
    const solutions = await screen.findAllByText((_, el) => (el?.textContent ?? '').includes('2.5'))
    expect(solutions.length).toBeGreaterThanOrEqual(1)
    expect(await screen.findAllByText(/Gauss-Jordan/)).toHaveLength(2)
  })

  it('diagnoses a singular matrix instead of inverting it', async () => {
    const user = userEvent.setup()
    await openMode(user, 'matrix')

    fill('A — matrix [[1, 2], [3, 4]]', '[[1, 2], [2, 4]]')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'A⁻¹ inverse')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findByText(/Numerically singular/)).toBeInTheDocument()
  })

  it('summarises a dataset with labelled σ and s', async () => {
    const user = userEvent.setup()
    await openMode(user, 'stats')

    fill('Data — list [2, 4, 4, 5]', '[2, 4, 4, 4, 5, 5, 7, 9]')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    const summaries = await screen.findAllByText(/mean = 5/)
    expect(summaries.length).toBeGreaterThanOrEqual(1)
    const combined = summaries.map((el) => el.textContent ?? '').join('\n')
    expect(combined).toContain('σ = 2')
    expect(combined).toContain('s = 2.1380899353')
  })

  it('converts Celsius to Fahrenheit on the affine path', async () => {    const user = userEvent.setup()
    await openMode(user, 'units')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Dimension' }), 'temperature')
    await user.selectOptions(screen.getByRole('combobox', { name: 'From unit' }), '°C')
    await user.selectOptions(screen.getByRole('combobox', { name: 'To unit' }), '°F')
    fill('Value to convert', '100')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    const hits = await screen.findAllByText((_, el) => (el?.textContent ?? '').includes('212'))
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(await screen.findAllByText(/Affine conversion through kelvin/)).toHaveLength(2)
  })

  it('computes one third plus one sixth exactly as one half', async () => {
    const user = userEvent.setup()
    await openMode(user, 'exact')

    fill('P — rational like 1/3, -5, 0.25, 1e-3', '1/3')
    fill('Q — second rational (binary ops only)', '1/6')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    const hits = await screen.findAllByText((_, el) => (el?.textContent ?? '').includes('1/2'))
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('propagates addition in quadrature with its formula attached', async () => {
    const user = userEvent.setup()
    await openMode(user, 'uncertainty')

    fill('A — measurement value ± sigma', '10 ± 0.2')
    fill('B — second measurement (binary ops only)', '5 ± 0.1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'A + B')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findAllByText(/15 ±/)).toHaveLength(2)
    expect(await screen.findAllByText(/√\(σA² \+ σB²\)/)).toHaveLength(2)
  })

  it('refuses a negative sigma instead of computing', async () => {
    const user = userEvent.setup()
    await openMode(user, 'uncertainty')

    fill('A — measurement value ± sigma', '10 ± -0.2')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findByText(/Sigma must be ≥ 0/)).toBeInTheDocument()
  })

  it('reports the standard error of the mean without claiming an interval', async () => {
    const user = userEvent.setup()
    await openMode(user, 'stats')

    fill('Data — list [2, 4, 4, 5]', '[2, 4, 4, 4, 5, 5, 7, 9]')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findAllByText(/SEM \(s\/√n\) =/)).toHaveLength(2)
    expect(await screen.findAllByText(/not a confidence interval/)).toHaveLength(2)
  })

  it('correlates paired lists and refuses to imply causation', async () => {
    const user = userEvent.setup()
    await openMode(user, 'stats')

    fill('Data — list [2, 4, 4, 5]', '[1, 2, 3, 4]')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Analysis' }), 'Paired covariance + correlation')
    fill('Y — second list (paired by position)', '[2, 4, 6, 8]')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    expect(await screen.findAllByText(/Pearson r = 1/)).toHaveLength(2)
    expect(await screen.findAllByText(/never implies causation/)).toHaveLength(2)

    fill('Y — second list (paired by position)', '[1, 2]')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByText(/equal lengths/)).toBeInTheDocument()
  })

  it('averages trailing windows and refuses padded or off-centre output', async () => {
    const user = userEvent.setup()
    await openMode(user, 'stats')

    fill('Data — list [2, 4, 4, 5]', '[1, 2, 3, 4]')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Analysis' }), 'Moving average')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findAllByText(/→ 2 points/)).toHaveLength(2)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Alignment' }), 'Centered (odd k only)')
    fill('Window k (≥ 2, full windows only)', '4')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByText(/odd window/)).toBeInTheDocument()
  })
})
