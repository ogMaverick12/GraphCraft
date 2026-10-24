import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

// DataLab is a lazy workspace. Its outer `main` appears while the Suspense
// fallback is still showing, so wait for the rendered ingestion heading before
// touching controls. The default 1 s query window is too short under full-suite
// load; this is scoped to the one lazy boundary, not a global timeout change.
// A 5 s wait was still insufficient under six-file contention, so use 20 s
// (below the existing 30 s per-test budget) rather than a fixed sleep.
const DATA_LAB_READY_TIMEOUT = 20_000

async function openDataLab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Show data lab' }))
  const workspace = await screen.findByRole('main', { name: 'Data Lab' })
  await within(workspace).findByRole(
    'heading',
    { name: 'Data Lab — ingestion' },
    { timeout: DATA_LAB_READY_TIMEOUT },
  )
  expect(within(workspace).getByRole('button', { name: 'Paste data' })).toBeInTheDocument()
}

async function openPlottedDemo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<App />)
  await openDataLab(user)
  // The Demo button loads the synthetic dataset and opens its plot.
  await user.click(screen.getByRole('button', { name: 'Demo dataset' }))
  await screen.findByTestId('plot-summary')
}

async function splitByTray(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Series split' }), 'tray (categorical)')
}

describe('data plot workflow', () => {
  it('plots the demo dataset with series, skipped count, and legend', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await splitByTray(user)

    // One deliberately missing cell in the demo: counted, not hidden.
    expect(await screen.findByTestId('plot-summary')).toHaveTextContent('14 points, 1 rows skipped')
    // Summary is a live region so plot updates announce politely.
    expect(screen.getByTestId('plot-summary')).toHaveAttribute('role', 'status')
    const figure = await screen.findByRole('img', { name: /Demo: seedling growth/ })
    expect(figure.getAttribute('aria-label')).toContain('3 visible series')
    expect(screen.getByRole('button', { name: 'Toggle A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle C' })).toBeInTheDocument()
  })

  it('hides a series through its legend toggle', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await splitByTray(user)
    await screen.findByTestId('plot-summary')

    await user.click(screen.getByRole('button', { name: 'Toggle B' }))
    expect(await screen.findByRole('img', { name: /2 visible series/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle B' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches mapping to bars on categorical X without connecting lines', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plot type' }), 'bar')
    await user.selectOptions(screen.getByRole('combobox', { name: 'X column' }), 'tray (categorical)')
    const figure = await screen.findByRole('img', { name: /bar plot/ })
    // Bars are batched into one fill path; no line/curve path carries data.
    expect(figure.querySelectorAll('g[clip-path] > g > rect')).toHaveLength(0)
    expect(figure.querySelectorAll('path')).toHaveLength(1)
    expect(figure.querySelector('g[clip-path] > g > path[fill]')).not.toBeNull()
    expect(figure.querySelectorAll('polyline')).toHaveLength(0)
  })

  it('bins a histogram with documented Sturges behaviour', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plot type' }), 'histogram')
    expect(await screen.findByText(/Sturges bins/)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /histogram plot/ })).toBeInTheDocument()
  })

  it('applies explicit axis bounds and resets to auto-fit', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    const xMax = screen.getByRole('textbox', { name: 'X max' })
    fireEvent.change(xMax, { target: { value: '100' } })
    expect(await screen.findByRole('img', { name: /Demo: seedling growth/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset plot' }))
    expect(screen.getByRole('textbox', { name: 'X max' })).toHaveValue('')
  })

  it('shows the tabular alternative for plotted points', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    expect(screen.getByText(/Data table \(14 rows\)/)).toBeInTheDocument()
  })

  it('renders in the dark theme without losing the figure', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(await screen.findByRole('img', { name: /Demo: seedling growth/ })).toBeInTheDocument()
  })

  it('handles a large supported dataset with a stated count', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const rows = Array.from({ length: 2000 }, (_, i) => `${i},${(i * 0.5).toFixed(1)}`).join('\n')
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: `x,y\n${rows}` } })
    await user.click(screen.getByRole('button', { name: /Import 2000 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    expect(await screen.findByTestId('plot-summary')).toHaveTextContent('2000 points')
  }, 30000)

  it('fits a line with equation, R², and a graph overlay', async () => {    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    const result = await screen.findByTestId('fit-result')
    expect(result.textContent).toContain('y =')
    expect(result.textContent).toContain('R² =')
    expect(result.textContent).toContain('Householder QR')
    expect(result.textContent).toContain('Fit columns:')
    expect(await screen.findByText(/Residual table/)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Residuals vs X/ })).toBeInTheDocument()
    const figure = await screen.findByRole('img', { name: /Demo: seedling growth/ })
    const titles = Array.from(figure.querySelectorAll('title')).map((t) => t.textContent ?? '')
    expect(titles.some((t) => t.includes('Fitted model curve'))).toBe(true)
  })

  it('hides the fitted curve on bar plots with an honest note', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Plot type' }), 'bar')
    const result = await screen.findByTestId('fit-result')
    expect(result.textContent).toContain('hidden on bar/histogram')
    const figure = await screen.findByRole('img', { name: /bar plot/ })
    const titles = Array.from(figure.querySelectorAll('title')).map((t) => t.textContent ?? '')
    expect(titles.some((t) => t.includes('Fitted model curve'))).toBe(false)
  })

  it('keeps the fitted curve finite when Y is logarithmic', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Y axis scale' }), 'log')
    const figure = await screen.findByRole('img', { name: /Demo: seedling growth/ })
    const fitPath = Array.from(figure.querySelectorAll('path')).find((p) => p.querySelector('title')?.textContent?.includes('Fitted model curve'))
    expect(fitPath).toBeDefined()
    const d = (fitPath as SVGPathElement).getAttribute('d') ?? ''
    const numbers = d.split(/[^0-9eE+.-]+/).filter((t) => t !== '').map(Number).filter((v) => Number.isFinite(v))
    expect(numbers.length).toBeGreaterThan(0)
    expect(Math.max(...numbers.map(Math.abs))).toBeLessThan(100000)
  })

  it('fits a linearized exponential with an honest approximation note', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Fit model' }), 'exp')
    const result = await screen.findByTestId('fit-result')
    expect(result.textContent).toContain('e^(')
    expect(result.textContent).toContain('approximate')
    const figure = await screen.findByRole('img', { name: /Demo: seedling growth/ })
    const titles = Array.from(figure.querySelectorAll('title')).map((t) => t.textContent ?? '')
    expect(titles.some((t) => t.includes('Fitted model curve'))).toBe(true)
  })

  it('warns about overfitting on high-degree polynomials', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Fit model' }), 'poly')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Polynomial degree' }), '4')
    expect(await screen.findByText(/overfit/)).toBeInTheDocument()
  })

  it('reports singular fits honestly instead of drawing a line', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'a,b\n5,1\n5,2\n5,3' } })
    await user.click(screen.getByRole('button', { name: /Import 3 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')
    expect(await screen.findByTestId('fit-error')).toHaveTextContent(/Singular design/)
  })

  it('breaks line segments across missing measurements instead of bridging', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    // Demo tray B skips day 4: the line must split into two runs.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Plot type' }), 'line')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Series split' }), 'tray (categorical)')
    const figure = await screen.findByRole('img', { name: /line plot/ })
    const segments = Array.from(figure.querySelectorAll('title')).map((t) => t.textContent ?? '')
    expect(segments.some((t) => t.includes('B segment 1 of 2'))).toBe(true)
    expect(segments.some((t) => t.includes('B segment 2 of 2'))).toBe(true)
  })

  it('excludes non-positive values on log scales with a visible note', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'x,y\n1,1\n10,100\n100,10000\n1000,-5' } })
    await user.click(screen.getByRole('button', { name: /Import 4 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Y axis scale' }), 'log')
    expect(await screen.findByText(/non-positive values excluded/)).toBeInTheDocument()
    // Two scatter figures exist (main plot + Residuals vs X): scope to the main plot.
    const figure = await screen.findByRole('img', { name: /Untitled dataset: scatter plot/ })
    const texts = Array.from(figure.querySelectorAll('text')).map((t) => t.textContent ?? '')
    expect(texts).toContain('10000')
    // Residuals stay linear and labelled separately; the fit overlay must remain finite on log scales.
    expect(await screen.findByRole('img', { name: /Residuals vs X/ })).toBeInTheDocument()
  })

  it('distinguishes series beyond colour and labels the figure', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Series split' }), 'tray (categorical)')

    const toggles = await screen.findAllByRole('button', { name: /Toggle [ABC]/ })
    const glyphs = toggles.map((b) => b.textContent ?? '')
    expect(new Set(glyphs.map((g) => g.trim()[0])).size).toBe(3)

    fireEvent.change(screen.getByRole('textbox', { name: 'X axis label' }), { target: { value: 'days' } })
    const figure = await screen.findByRole('img', { name: /Demo: seedling growth/ })
    expect(figure.textContent).toContain('days')
  })
})

describe('data export workflow', () => {
  it('opens figure export from the current view with live dimensions', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.click(screen.getByRole('button', { name: 'Export figure / tables' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export data figure' })
    expect(dialog).toBeInTheDocument()
    // Base figure width; legend + caption add rows below the 440-unit plot area.
    expect(await screen.findByTestId('export-summary')).toHaveTextContent(/Vector figure, 720×\d+ units/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Figure caption' }), { target: { value: 'Trial one.' } })
    expect(await screen.findByTestId('export-summary')).toHaveTextContent('720×')
  })

  it('recomputes CSV residuals at export time instead of serving stale results', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'a,b\n5,1\n5,2\n5,3' } })
    await user.click(screen.getByRole('button', { name: /Import 3 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')
    await user.click(screen.getByRole('button', { name: 'Export figure / tables' }))
    const exportDialog = await screen.findByRole('dialog', { name: 'Export data figure' })

    await user.click(screen.getByRole('radio', { name: 'CSV (table)' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'CSV table' }), 'residuals')
    await user.click(screen.getByRole('button', { name: 'Download' }))
    // Singular design fails NOW (constant X) — honestly, not from a stale snapshot.
    expect(await within(exportDialog).findByText(/Fit failed.*Singular/)).toBeInTheDocument()
  })

  it('completes the download wiring without a crash', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    await user.click(screen.getByRole('button', { name: 'Export figure / tables' }))
    await screen.findByRole('dialog', { name: 'Export data figure' })
    await user.click(screen.getByRole('radio', { name: 'CSV (table)' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'CSV table' }), 'Dataset (all rows)')
    await user.click(screen.getByRole('button', { name: 'Download' }))
    // This environment completes blob downloads (real click path through
    // downloadBlob): the dialog closes instead of erroring. Environments
    // without object URLs get guidance instead — both paths are handled.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Export data figure' })).not.toBeInTheDocument())
  })

  it('keeps plot error bars display-only: unweighted fits claim no weighting', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    // Error bars on, fit weights off: the fit must not pretend otherwise.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Y error bars' }), 'column')
    const result = await screen.findByTestId('fit-result')
    expect(result.textContent).not.toContain('Weighted least squares')
    expect(result.textContent).toContain('display-only')
  })

  it('flags large residuals for inspection without removing them', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDataLab(user)

    await user.click(screen.getByRole('button', { name: 'Paste data' }))
    const area = await screen.findByRole('textbox', { name: 'Data text' })
    fireEvent.change(area, { target: { value: 'x,y\n0,0\n1,1\n2,2\n3,3\n4,4\n5,5\n6,6\n7,7\n8,8\n9,9\n10,10\n11,11\n12,50' } })
    await user.click(screen.getByRole('button', { name: /Import 13 rows/ }))
    expect(await screen.findByText('Datasets (1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Plot' }))
    await screen.findByTestId('plot-summary')
    expect(await screen.findByText(/Largest \|residual\|/)).toBeInTheDocument()
    expect(await screen.findByText(/never auto-delete/)).toBeInTheDocument()
    expect(await screen.findByText('large')).toBeInTheDocument()
    // Flagged, not dropped: all 13 observations still fitted.
    expect(await screen.findByTestId('fit-result')).toHaveTextContent('n = 13')
  })

  it('updates every diagnostic when the model changes', async () => {
    const user = userEvent.setup()
    await openPlottedDemo(user)
    await screen.findByTestId('plot-summary')

    const before = (await screen.findByTestId('fit-result')).textContent ?? ''
    expect(before).toContain('RMSE (÷n) =')
    expect(before).toContain('dof')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fit model' }), 'poly')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Polynomial degree' }), '2')
    const after = (await screen.findByTestId('fit-result')).textContent ?? ''
    expect(after).not.toBe(before)
    expect(after).toContain('RMSE (÷n) =')
    expect(await screen.findByText(/Largest \|residual\|/)).toBeInTheDocument()
  })
})
