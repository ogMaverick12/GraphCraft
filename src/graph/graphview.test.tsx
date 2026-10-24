import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { compileExpression } from '../math/index.ts'
import { GraphView } from './GraphView.tsx'
import { CURVE_STYLE_COUNT, curveStyle } from './palette.ts'
import { useSampledCurves } from './useCurves.ts'

describe('curve styles', () => {
  it('gives six distinct colours and dash patterns', () => {
    const styles = Array.from({ length: CURVE_STYLE_COUNT }, (_, i) => curveStyle(i))
    expect(new Set(styles.map((s) => s.color)).size).toBe(CURVE_STYLE_COUNT)
    expect(new Set(styles.map((s) => s.dash)).size).toBe(CURVE_STYLE_COUNT)
    expect(curveStyle(6).color).toBe(curveStyle(0).color) // deterministic wrap
  })
})

describe('GraphView rendering', () => {
  const world = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 }
  const size = { width: 800, height: 600 }
  const noop = (): void => {}
  const noopSize = (): void => {}

  it('renders one path per sampler segment, never joined', () => {
    render(
      <GraphView
        world={world}
        curves={[
          {
            id: 'rational',
            label: '1/x',
            styleIndex: 0,
            regions: [],
            segments: [
              [
                { x: -5, y: -0.2 },
                { x: -1, y: -1 },
              ],
              [
                { x: 1, y: 1 },
                { x: 5, y: 0.2 },
              ],
            ],
          },
        ]}
        showGrid
        equalAspect={false}
        crosshair
        onPanByWorld={noop}
        onZoomAtWorld={noop}
        onResetView={noop}
        onViewportSizeChange={noopSize}
        measuredSize={size}
      />,
    )
    const svg = screen.getByRole('img', { name: /1\/x/ })
    // Two segments → two curve paths (plus labelled axes only, no path joins).
    const paths = svg.querySelectorAll('path')
    expect(paths.length).toBe(2)
  })

  it('announces the settled viewport politely', async () => {
    const view = render(
      <GraphView
        world={world}
        curves={[]}
        showGrid
        equalAspect={false}
        crosshair
        onPanByWorld={noop}
        onZoomAtWorld={noop}
        onResetView={noop}
        onViewportSizeChange={noopSize}
        measuredSize={size}
      />,
    )
    const region = await screen.findByText('Viewport: x -10 to 10, y -7 to 7.')
    expect(region).toHaveAttribute('aria-live', 'polite')

    view.rerender(
      <GraphView
        world={{ xMin: -5, xMax: 10, yMin: -7, yMax: 7 }}
        curves={[]}
        showGrid
        equalAspect={false}
        crosshair
        onPanByWorld={noop}
        onZoomAtWorld={noop}
        onResetView={noop}
        onViewportSizeChange={noopSize}
        measuredSize={size}
      />,
    )
    expect(await screen.findByText('Viewport: x -5 to 10, y -7 to 7.')).toBeInTheDocument()
  })

  it('renders an honest empty state with no mislabeled data', () => {
    render(
      <GraphView
        world={world}
        curves={[]}
        showGrid
        equalAspect={false}
        crosshair
        onPanByWorld={noop}
        onZoomAtWorld={noop}
        onResetView={noop}
        onViewportSizeChange={noopSize}
        measuredSize={size}
      />,
    )
    expect(screen.getByRole('img', { name: /empty graph viewport/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /empty graph viewport/i }).querySelectorAll('path').length).toBe(0)
  })

  it('does not flag an ordinary x^2 curve as under-resolved in the inspector', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'x^2' }))
    await screen.findByRole('img', { name: /x\^2/ })
    await user.click(screen.getByRole('listitem'))
    const status = await screen.findByText(/sampled points/)
    expect(status).not.toHaveTextContent('A region varies below half-pixel width')
  })

  it('shows under-resolution feedback for a visibly narrow feature', async () => {
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, '1/(1+10000*x^2)')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /10000/ })
    await user.click(screen.getByRole('listitem'))
    const status = await screen.findByText(/sampled points/)
    expect(status).toHaveTextContent('A region varies below half-pixel width; detail is approximate there.')
  })

  it('loads example expressions as explicit actions with distinguishable curves', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('img', { name: /empty graph viewport/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'x^2' }))
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'sin(x)')
    await user.keyboard('{Enter}')
    const svg = screen.getByRole('img', { name: /x\^2/ })
    expect(svg.getAttribute('aria-label')).toContain('sin(x)')
    const strokes = new Set(Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('stroke')))
    expect(strokes.size).toBeGreaterThanOrEqual(2)
  })

  it('resamples the same compiled curves when the view changes', () => {
    const compiled = compileExpression('x^2')
    if (!compiled.ok) {
      throw new Error('Fixture must compile')
    }
    const inputs = [{ id: 'parabola', kind: 'scalar' as const, expression: compiled.expression, range: { xMin: -10, xMax: 10 }, breaks: [] }]
    const { result, rerender } = renderHook(({ world }) => useSampledCurves(inputs, world, 400, {}), {
      initialProps: { world: { xMin: -10, xMax: 10, yMin: -7, yMax: 7 } },
    })
    const before = result.current[0]?.points[0]?.[0]
    rerender({ world: { xMin: -5, xMax: 5, yMin: -7, yMax: 7 } })
    const after = result.current[0]?.points[0]?.[0]
    expect(before?.x).toBeCloseTo(-10, 9)
    expect(after?.x).toBeCloseTo(-5, 9)
  })
})
