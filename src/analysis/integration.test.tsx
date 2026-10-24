import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { buildExportScene } from '../export/scene.ts'
import { renderExportSvg } from '../export/svg.ts'
import { createRow } from '../expressions/model.ts'
import { compileExpression } from '../math/index.ts'
import { AnalysisPanel } from './AnalysisPanel.tsx'
import { integrate, type IntegralResult } from './integral.ts'
import { useAnalysis } from './useAnalysis.ts'

async function addExpression(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const box = screen.getByRole('textbox', { name: 'New expression' })
  await user.clear(box)
  await user.type(box, text)
  await user.keyboard('{Enter}')
}

function viewportSvg(): HTMLElement {
  return screen.getByRole('img', { name: /graph viewport/i })
}

/** Accessible names of every plotted curve run (SVG <title> children). */
function svgTitles(): string[] {
  return Array.from(viewportSvg().querySelectorAll('title')).map((t) => t.textContent ?? '')
}

/** Minimal analysis state for direct panel rendering tests. */
function panelAnalysis(result: IntegralResult): ReturnType<typeof useAnalysis> {
  const row = createRow('sqrt(x)', 0)
  return {
    targetId: row.id,
    otherId: null,
    tangentX: '2',
    integralA: '-0.000001',
    integralB: '1',
    showNormal: false,
    visibility: {},
    roots: null,
    rootSnapshot: null,
    intersections: null,
    intersectionSnapshot: null,
    extrema: null,
    extremumSnapshot: null,
    tangent: null,
    tangentSnapshot: null,
    integral: { a: -0.000001, b: 1, result },
    integralIsCurrent: true,
    cartesianRows: [row],
    pendingTools: [],
    setTargetId: () => undefined,
    setOtherId: () => undefined,
    setTangentX: () => undefined,
    setIntegralA: () => undefined,
    setIntegralB: () => undefined,
    setShowNormal: () => undefined,
    setVisible: () => undefined,
    runRoots: async () => null,
    runIntersections: async () => null,
    runExtrema: async () => null,
    runTangent: async () => null,
    runIntegral: async () => null,
    clearTool: () => undefined,
    snapshotIsCurrent: () => true,
  }
}

describe('analysis integration', () => {
  it('renders without an initialization error and mounts the analysis panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find roots' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find extrema' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compute' })).toBeInTheDocument()
  })

  it('finds roots of x^2 - 4 and marks them on y = 0', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')

    await user.click(await screen.findByRole('button', { name: 'Find roots' }))

    expect(await screen.findByRole('button', { name: /x ≈ -2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /x ≈ 2/ })).toBeInTheDocument()
    // Result list is a polite live region (values announce; failures alert).
    expect(screen.getByRole('region', { name: 'Roots' }).querySelector('ul')).toHaveAttribute('aria-live', 'polite')
    const markers = await screen.findAllByLabelText(/root marker/i)
    expect(markers).toHaveLength(2)
    expect(viewportSvg().textContent).toContain('x ≈ -2')
  })

  it('finds intersections of x and x^2 at the expected coordinates', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')
    await addExpression(user, 'x^2')
    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()

    const second = screen.getByRole('combobox', { name: 'Second function for intersections' })
    const target = Array.from(second.querySelectorAll('option')).find((o) => o.textContent === 'x^2')?.getAttribute('value') ?? ''
    await user.selectOptions(second, target)
    await user.click(screen.getByRole('button', { name: /^Find$/ }))

    const markers = await screen.findAllByLabelText(/intersection marker/i)
    expect(markers).toHaveLength(2)
    expect(viewportSvg().textContent).toContain('(0, 0)')
  })

  it('finds the maximum of -x^2 and marks it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, '-x^2')

    await user.click(await screen.findByRole('button', { name: 'Find extrema' }))

    // Wiring assertion with numerical tolerance: the refined coordinates
    // land within 1e-6 of (0, 0); exact decimals are covered by unit tests.
    const marker = await screen.findByLabelText(/extremum marker/i)
    const label = marker.getAttribute('aria-label') ?? ''
    expect(label).toContain('max')
    const coords = label.match(/\(([^,]+), ([^)]+)\)/)
    expect(coords).not.toBe(null)
    expect(Math.abs(Number(coords?.[1]))).toBeLessThan(1e-6)
    expect(Math.abs(Number(coords?.[2]))).toBeLessThan(1e-6)
  })

  it('draws the tangent to x^2 at x = 2 at the expected location', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    await user.click(await screen.findByRole('button', { name: 'Draw' }))

    expect(await screen.findByText(/y ≈ 4\(x/)).toBeInTheDocument()
    expect(svgTitles()).toContain('Tangent at x ≈ 2 (part 1)')
    // The underlying curve is untouched.
    expect(viewportSvg().getAttribute('aria-label')).toContain('x^2')
  })

  it('draws the normal alongside the tangent when requested', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    await user.click(screen.getByRole('checkbox', { name: 'Normal' }))
    await user.click(screen.getByRole('button', { name: 'Draw' }))

    expect(svgTitles()).toContain('Tangent at x ≈ 2 (part 1)')
    expect(svgTitles()).toContain('Normal at x ≈ 2 (part 1)')
  })

  it('keeps tangent and normal overlays after collapsing and reopening the inspector', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    await user.click(screen.getByRole('checkbox', { name: 'Normal' }))
    await user.click(await screen.findByRole('button', { name: 'Draw' }))
    expect(await screen.findByText(/y ≈ 4\(x/)).toBeInTheDocument()
    expect(svgTitles()).toContain('Tangent at x ≈ 2 (part 1)')
    expect(svgTitles()).toContain('Normal at x ≈ 2 (part 1)')

    await user.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument()
    expect(svgTitles()).toContain('Tangent at x ≈ 2 (part 1)')
    expect(svgTitles()).toContain('Normal at x ≈ 2 (part 1)')

    await user.click(screen.getByRole('button', { name: 'Expand inspector' }))
    expect(await screen.findByText(/y ≈ 4\(x/)).toBeInTheDocument()
    expect(svgTitles()).toContain('Tangent at x ≈ 2 (part 1)')
    expect(svgTitles()).toContain('Normal at x ≈ 2 (part 1)')
  })

  it('hides each marker group through its visibility control', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')

    await user.click(await screen.findByRole('button', { name: 'Find roots' }))
    expect(await screen.findAllByLabelText(/root marker/i)).toHaveLength(2)

    const rootsSection = screen.getByRole('region', { name: 'Roots' })
    await user.click(within(rootsSection).getByRole('checkbox', { name: 'Show' }))

    expect(screen.queryByLabelText(/root marker/i)).not.toBeInTheDocument()
    // The result list stays; only the graph markers hide.
    expect(screen.getByRole('button', { name: /x ≈ 2/ })).toBeInTheDocument()
  })

  it('discloses stale results instead of drawing them as current', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')

    await user.click(await screen.findByRole('button', { name: 'Find roots' }))
    expect(await screen.findAllByLabelText(/root marker/i)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))

    expect(await screen.findByText(/recompute for current results/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/root marker/i)).not.toBeInTheDocument()
  })

  it('rejects a non-finite tangent position without fabricating a line', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')

    const atX = await screen.findByRole('textbox', { name: 'Tangent point x' })
    await user.clear(atX)
    await user.type(atX, 'abc')
    await user.click(screen.getByRole('button', { name: 'Draw' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/finite x/)
    expect(screen.queryByTitle(/Tangent at/)).not.toBeInTheDocument()
  })

  it('refuses a tangent at the undefined point of 1/x without fabricating a slope', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, '1/x')
    await screen.findByRole('img', { name: /1\/x/ })

    const atX = screen.getByRole('textbox', { name: 'Tangent point x' })
    await user.clear(atX)
    await user.type(atX, '0')
    await user.click(screen.getByRole('button', { name: 'Draw' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not established/)
    expect(screen.queryByTitle(/Tangent at/)).not.toBeInTheDocument()
  })

  it('computes the integral of x over [0, 2] as 2 and rejects reversed bounds', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')

    const lower = await screen.findByRole('textbox', { name: 'Integral lower bound' })
    const upper = screen.getByRole('textbox', { name: 'Integral upper bound' })
    await user.clear(lower)
    await user.type(lower, '0')
    await user.clear(upper)
    await user.type(upper, '2')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByText(/≈ 2/)).toBeInTheDocument()
    const integralSection = screen.getByRole('region', { name: 'Integral' })
    expect(within(integralSection).queryByText(/skipped/)).not.toBeInTheDocument()

    await user.clear(lower)
    await user.type(lower, '2')
    await user.clear(upper)
    await user.type(upper, '1')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/finite a below b/)
  })

  it('labels a tiny positive skipped fraction as <0.1% instead of 0.0%', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'sqrt(x)')

    const lower = await screen.findByRole('textbox', { name: 'Integral lower bound' })
    const upper = screen.getByRole('textbox', { name: 'Integral upper bound' })
    await user.clear(lower)
    await user.type(lower, '-0.000001')
    await user.clear(upper)
    await user.type(upper, '1')
    await user.click(screen.getByRole('button', { name: 'Compute' }))

    const section = await screen.findByRole('region', { name: 'Integral' })
    expect(await within(section).findByText(/not fully converged/)).toBeInTheDocument()
    expect(within(section).getByText(/<0\.1% skipped/)).toBeInTheDocument()
    expect(within(section).queryByText(/0\.0% skipped/)).not.toBeInTheDocument()
    expect(within(section).getByText(/refinement depth/)).toBeInTheDocument()
    expect(within(section).getByText(/<0\.1% of the interval was invalid and skipped/)).toBeInTheDocument()
  })

  it('renders budget and skip diagnostics separately in the panel', () => {
    const compiled = compileExpression('sqrt(x)')
    if (!compiled.ok) {
      throw new Error('Cannot compile test expression')
    }
    const result = integrate(compiled.expression, -1, 2, undefined, 1e-9, { maxEvaluations: 25 })
    render(<AnalysisPanel analysis={panelAnalysis(result)} />)

    expect(screen.getByText(/evaluation budget/)).toBeInTheDocument()
    expect(screen.getByText(/50\.0% skipped/)).toBeInTheDocument()
    expect(screen.getByText(/50\.0% of the interval was invalid and skipped/)).toBeInTheDocument()
    expect(screen.queryByText(/refinement depth/)).not.toBeInTheDocument()
  })

  it('rejects a blank tangent point instead of drawing at zero', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')
    await screen.findByRole('img', { name: /x\^2/ })

    const atX = screen.getByRole('textbox', { name: 'Tangent point x' })
    await user.clear(atX)
    await user.click(screen.getByRole('button', { name: 'Draw' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/finite x/)
    expect(svgTitles().some((title) => title.includes('Tangent at'))).toBe(false)

    // Zero typed on purpose still draws a tangent.
    await user.type(atX, '0')
    await user.click(screen.getByRole('button', { name: 'Draw' }))
    await waitFor(() => expect(svgTitles().some((title) => title.includes('Tangent at x ≈ 0'))).toBe(true))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects a blank integral bound instead of computing from zero', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')

    const lower = await screen.findByRole('textbox', { name: 'Integral lower bound' })
    await user.clear(lower)
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/finite bounds/)
    expect(screen.queryByText(/adaptive Simpson/)).not.toBeInTheDocument()

    // Whitespace-only input is rejected too.
    fireEvent.change(lower, { target: { value: '   ' } })
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/finite bounds/)
    expect(screen.queryByText(/adaptive Simpson/)).not.toBeInTheDocument()

    // Zero typed on purpose still computes (integral of x over [0, 1] = 0.5).
    await user.clear(lower)
    await user.type(lower, '0')
    await user.click(screen.getByRole('button', { name: 'Compute' }))
    expect(await screen.findByText(/≈ 0.5/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps markers rendering in the dark theme', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')

    await user.click(await screen.findByRole('button', { name: 'Find roots' }))
    expect(await screen.findAllByLabelText(/root marker/i)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getAllByLabelText(/root marker/i)).toHaveLength(2)
  })

  it('exports current markers into the figure scene and SVG', () => {
    const scene = buildExportScene(
      { xMin: 1, xMax: 3, yMin: 1, yMax: 3 },
      { width: 400, height: 300 },
      [],
      { background: 'white', showGrid: true, equalAspect: false, includeLegend: false },
      [{ x: 2, y: 2, kind: 'root', label: 'x ≈ 2' }],
    )
    expect(scene.markers).toHaveLength(1)
    const svg = renderExportSvg(scene, 1)
    expect(svg).toContain('root: x ≈ 2')
  })

  it('flags results stale when the analysed function is edited', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2-4')
    await user.click(await screen.findByRole('button', { name: 'Find roots' }))
    expect(await screen.findAllByLabelText(/root marker/i)).toHaveLength(2)

    const editor = screen.getAllByRole('textbox', { name: 'Expression' })[0]
    if (editor === undefined) {
      throw new Error('Expected a row editor')
    }
    await user.clear(editor)
    await user.type(editor, 'x^2-1')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('img', { name: /x\^2-1/ })).toBeInTheDocument()
    expect(await screen.findByText(/recompute for current results/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/root marker/i)).not.toBeInTheDocument()
  })

  it('refuses to intersect a function with itself when the target moves', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x^2')
    await addExpression(user, 'x')
    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()

    const targetSelect = screen.getByRole('combobox', { name: 'Function to analyse' })
    const withSelect = screen.getByRole('combobox', { name: 'Second function for intersections' })
    const xRowId = Array.from(targetSelect.querySelectorAll('option')).find((o) => o.textContent === 'x')?.getAttribute('value') ?? ''

    // Intersect x² with x, then move the target onto x itself.
    await user.selectOptions(withSelect, xRowId)
    await user.click(screen.getByRole('button', { name: /^Find$/ }))
    expect(await screen.findAllByLabelText(/intersection marker/i)).toHaveLength(2)

    await user.selectOptions(targetSelect, xRowId)
    await user.click(screen.getByRole('button', { name: /^Find$/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/different functions/i)
    // The previous two points stay (now flagged stale); no fabricated flood.
    const section = screen.getByRole('region', { name: 'Intersections' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByLabelText(/intersection marker/i)).not.toBeInTheDocument()
  })

  it('flags the integral stale after a function change but not after zoom', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'x')

    await user.click(await screen.findByRole('button', { name: 'Compute' }))
    expect(await screen.findByText(/≈ 0\.5/)).toBeInTheDocument()

    // A pure view change does not affect a definite integral.
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.queryByText(/recompute for current results/i)).not.toBeInTheDocument()

    // Editing the analysed function does: the stored value is outdated.
    const editor = screen.getAllByRole('textbox', { name: 'Expression' })[0]
    if (editor === undefined) {
      throw new Error('Expected a row editor')
    }
    await user.clear(editor)
    await user.type(editor, 'x^2')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('img', { name: /x\^2/ })).toBeInTheDocument()
    expect(await screen.findByText(/recompute for current results/i)).toBeInTheDocument()
  })

  it('surfaces the extrema budget warning when refinement runs out of evaluations', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'abs(sin(200*x))')
    await screen.findByRole('img', { name: /abs\(sin\(200\*x\)\)/ })
    await user.click(screen.getByRole('button', { name: 'Find extrema' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/budget/i)
  })

  it('flags unresolved sign changes alongside partial roots results', async () => {
    const user = userEvent.setup()
    render(<App />)
    await addExpression(user, 'sin(100*x)')
    await screen.findByRole('img', { name: /sin\(100\*x\)/ })
    await user.click(screen.getByRole('button', { name: 'Find roots' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not resolve/i)
    const section = screen.getByRole('region', { name: 'Roots' })
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('discloses under-resolved sampling in the inspector status', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Dense oscillation across the whole view exhausts the default
    // refinement budget; the selected row must say so.
    await addExpression(user, 'sin(200*x)')
    await screen.findByRole('img', { name: /sin\(200\*x\)/ })
    expect(await screen.findByText(/refined detail is incomplete/i)).toBeInTheDocument()
  })
})
