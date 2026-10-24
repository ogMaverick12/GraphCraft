import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'
import { GraphView } from './GraphView.tsx'
import {
  clampWorldRect,
  createTransform,
  MAX_WORLD_COORD,
  MAX_WORLD_SPAN,
  MIN_WORLD_SPAN,
  worldToScreen,
} from './coordinate.ts'
import { DEFAULT_WORLD, useViewport } from './useViewport.ts'

const SIZE = { width: 800, height: 600 }

describe('viewport limits', () => {
  it('clamps spans and fences runaway coordinates', () => {
    expect(clampWorldRect({ xMin: 0, xMax: 1e-9, yMin: 0, yMax: 1 }).xMax - clampWorldRect({ xMin: 0, xMax: 1e-9, yMin: 0, yMax: 1 }).xMin).toBeGreaterThanOrEqual(
      MIN_WORLD_SPAN,
    )
    const wide = clampWorldRect({ xMin: -1e300, xMax: 1e300, yMin: 0, yMax: 1 })
    expect(wide.xMax - wide.xMin).toBeLessThanOrEqual(MAX_WORLD_SPAN)
    const far = clampWorldRect({ xMin: 1e300, xMax: 1e300 + 10, yMin: 0, yMax: 1 })
    expect(Number.isFinite(far.xMin)).toBe(true)
    expect(Math.abs(far.xMin)).toBeLessThanOrEqual(MAX_WORLD_COORD)
  })

  it('holds zoom within limits across hundreds of steps', () => {
    const { result } = renderHook(() => useViewport())
    act(() => {
      for (let i = 0; i < 300; i += 1) {
        result.current.zoomAtWorld(0, 0, 0.5)
      }
    })
    const zoomed = result.current.world
    expect(zoomed.xMax - zoomed.xMin).toBeGreaterThanOrEqual(MIN_WORLD_SPAN)
    act(() => {
      for (let i = 0; i < 300; i += 1) {
        result.current.zoomAtWorld(0, 0, 2)
      }
    })
    const wide = result.current.world
    expect(wide.xMax - wide.xMin).toBeLessThanOrEqual(MAX_WORLD_SPAN)
    expect(Number.isFinite(wide.xMin)).toBe(true)
  })

  it('absorbs non-finite pan deltas without corrupting the view', () => {
    const { result } = renderHook(() => useViewport())
    act(() => {
      result.current.panByWorld(Number.POSITIVE_INFINITY, Number.NaN)
      result.current.panByWorld(1e300, 1e300)
    })
    const world = result.current.world
    for (const v of [world.xMin, world.xMax, world.yMin, world.yMax]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('keeps the zoom centre fixed on screen', () => {
    const { result } = renderHook(() => useViewport())
    const before = result.current.world
    act(() => {
      result.current.zoomAtWorld(2, 1, 0.5)
    })
    const after = result.current.world
    const pixelBefore = worldToScreen(createTransform(before, SIZE, false), 2, 1)
    const pixelAfter = worldToScreen(createTransform(after, SIZE, false), 2, 1)
    expect(pixelAfter.px).toBeCloseTo(pixelBefore.px, 9)
    expect(pixelAfter.py).toBeCloseTo(pixelBefore.py, 9)
  })

  it('resets to the default view', () => {
    const { result } = renderHook(() => useViewport())
    act(() => {
      result.current.panByWorld(3, -2)
      result.current.zoomAtWorld(0, 0, 0.5)
      result.current.reset()
    })
    expect(result.current.world).toEqual(DEFAULT_WORLD)
  })

  it('normalises a poisoned initial viewport before the renderer sees it', () => {
    const { result } = renderHook(() => useViewport({ xMin: 1e12, xMax: 2e12, yMin: 2e12, yMax: 3e12 }))
    const world = result.current.world
    expect(world.xMax).toBeGreaterThan(world.xMin)
    expect(world.yMax).toBeGreaterThan(world.yMin)
    expect(Math.abs(world.xMin)).toBeLessThanOrEqual(MAX_WORLD_COORD)
    expect(Math.abs(world.yMax)).toBeLessThanOrEqual(MAX_WORLD_COORD)
    expect(() => createTransform(world, SIZE, false)).not.toThrow()
  })

  it('normalises again when reset restores a poisoned initial viewport', () => {
    const { result } = renderHook(() => useViewport({ xMin: -2e12, xMax: -3e12, yMin: -3e12, yMax: -2e12 }))
    act(() => {
      result.current.zoomAtWorld(0, 0, 0.5)
      result.current.reset()
    })
    const world = result.current.world
    expect(world.xMin).toBeGreaterThanOrEqual(-MAX_WORLD_COORD)
    expect(world.yMin).toBeGreaterThanOrEqual(-MAX_WORLD_COORD)
    expect(world.xMax).toBeGreaterThan(world.xMin)
    expect(world.yMax).toBeGreaterThan(world.yMin)
    expect(() => createTransform(world, SIZE, false)).not.toThrow()
  })
})

describe('viewport interactions', () => {
  const noop = (): void => {}

  function statusView(): string {
    return screen.getByLabelText('Status').textContent ?? ''
  }

  it('pans content with the drag direction', async () => {
    render(<App />)
    const svg = screen.getByRole('img', { name: /graph viewport|empty graph viewport/i })
    const before = statusView()
    expect(before).toContain('-10')

    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 180, clientY: 100 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 180, clientY: 100 })

    // Dragged right by 80px at 40px/unit: the world shifts left by 2 units.
    expect(await screen.findByText(/-12/)).toBeInTheDocument()
  })

  it('runs zoom buttons and keyboard through the same operation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    const viaButton = statusView()

    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    const viewport = screen.getByRole('application', { name: /graph viewport/i })
    viewport.focus()
    await user.keyboard('+')
    const viaKeyboard = statusView()

    expect(viaButton).toBe(viaKeyboard)
    await user.keyboard('0')
    expect(statusView()).toContain('-10')
  })

  it('shows and hides the crosshair readout on hover', async () => {
    render(
      <GraphView
        world={DEFAULT_WORLD}
        curves={[]}
        showGrid
        equalAspect={false}
        crosshair
        onPanByWorld={noop}
        onZoomAtWorld={noop}
        onResetView={noop}
        onViewportSizeChange={noop}
        measuredSize={SIZE}
      />,
    )
    const svg = screen.getByRole('img', { name: /empty graph viewport/i })
    fireEvent.pointerMove(svg, { clientX: 100, clientY: 100, buttons: 0 })
    const readout = await screen.findByTestId('crosshair-readout')
    expect(readout.textContent ?? '').toMatch(/x .*?, y /)

    fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId('crosshair-readout')).not.toBeInTheDocument()
  })

  it('keeps expression data unchanged through viewport operations', async () => {
    const user = userEvent.setup()
    render(<App />)
    const box = screen.getByRole('textbox', { name: 'New expression' })
    await user.type(box, 'x^2')
    await user.keyboard('{Enter}')
    await screen.findByRole('img', { name: /x\^2/ })

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    const viewport = screen.getByRole('application', { name: /graph viewport/i })
    viewport.focus()
    await user.keyboard('0')

    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2')
    expect(screen.getByRole('img', { name: /x\^2/ })).toBeInTheDocument()
  })
})
