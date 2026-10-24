import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurfaceView } from './SurfaceView.tsx'
import { clampCamera, defaultSurfaceState, type Camera } from './surface.ts'

interface FrameController {
  pending: () => number
  runAll: () => void
}

function installFrameController(): FrameController {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    const id = nextId
    nextId += 1
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
    callbacks.delete(id)
  })
  return {
    pending: () => callbacks.size,
    runAll: () => {
      const due = [...callbacks.values()]
      callbacks.clear()
      act(() => {
        for (const callback of due) {
          callback(0)
        }
      })
    },
  }
}

const INITIAL = { ...defaultSurfaceState(), source: 'x+y', resolution: 24 }

function renderSurface(): { viewer: HTMLElement; cameras: Camera[]; unmount: () => void } {
  const cameras: Camera[] = []
  const result = render(<SurfaceView initial={INITIAL} onChange={(state) => cameras.push(state.camera)} />)
  const viewer = screen.getByRole('application', { name: /3D surface viewer/ })
  return { viewer, cameras, unmount: result.unmount }
}

function expectedOrbit(camera: Camera, dx: number, dy: number): Camera {
  return clampCamera({ ...camera, yaw: camera.yaw - dx / 200, pitch: camera.pitch - dy / 200 })
}

function firstPolygons(): string[] {
  return Array.from(document.querySelectorAll('svg polygon'))
    .slice(0, 8)
    .map((polygon) => polygon.getAttribute('points') ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('3D orbit frame scheduling', () => {
  it('coalesces a pointer-move burst into one update and uses the latest position', () => {
    const frames = installFrameController()
    const { viewer, cameras } = renderSurface()
    const before = firstPolygons()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 110, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 125, clientY: 130, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 140, clientY: 160, pointerId: 1 })

    expect(frames.pending()).toBe(1)
    expect(cameras).toHaveLength(1)
    expect(firstPolygons()).toEqual(before)

    frames.runAll()

    expect(frames.pending()).toBe(0)
    expect(cameras).toHaveLength(2)
    expect(cameras[1]).toEqual(expectedOrbit(INITIAL.camera, 40, 60))
    expect(firstPolygons()).not.toEqual(before)

    fireEvent.pointerUp(viewer, { clientX: 140, clientY: 160, pointerId: 1 })
    expect(cameras).toHaveLength(2)
  })

  it('flushes the final pending position when pointer-up arrives before the frame', () => {
    const frames = installFrameController()
    const { viewer, cameras } = renderSurface()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 145, clientY: 130, pointerId: 1 })
    expect(frames.pending()).toBe(1)
    expect(cameras).toHaveLength(1)

    fireEvent.pointerUp(viewer, { clientX: 145, clientY: 130, pointerId: 1 })

    expect(frames.pending()).toBe(0)
    expect(cameras).toHaveLength(2)
    expect(cameras[1]).toEqual(expectedOrbit(INITIAL.camera, 45, 30))

    frames.runAll()
    expect(cameras).toHaveLength(2)
  })

  it('cancels pending work on pointer cancel and leaves the next drag usable', () => {
    const frames = installFrameController()
    const { viewer, cameras } = renderSurface()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 140, clientY: 140, pointerId: 1 })
    expect(frames.pending()).toBe(1)

    fireEvent.pointerCancel(viewer, { clientX: 140, clientY: 140, pointerId: 1 })
    expect(frames.pending()).toBe(0)

    frames.runAll()
    fireEvent.pointerMove(viewer, { clientX: 180, clientY: 180, pointerId: 1 })
    expect(frames.pending()).toBe(0)
    expect(cameras).toHaveLength(1)

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 2 })
    fireEvent.pointerMove(viewer, { clientX: 120, clientY: 100, pointerId: 2 })
    frames.runAll()
    expect(cameras).toHaveLength(2)
    expect(cameras[1]).toEqual(expectedOrbit(INITIAL.camera, 20, 0))
  })

  it('cancels pending work when the view unmounts', () => {
    const frames = installFrameController()
    const { viewer, cameras, unmount } = renderSurface()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(viewer, { clientX: 140, clientY: 140, pointerId: 1 })
    expect(frames.pending()).toBe(1)

    unmount()

    expect(frames.pending()).toBe(0)
    frames.runAll()
    expect(cameras).toHaveLength(1)
  })

  it('does not accumulate frame callbacks or drag deltas across repeated drags', () => {
    const frames = installFrameController()
    const { viewer, cameras } = renderSurface()

    for (let drag = 0; drag < 3; drag += 1) {
      const pointerId = drag + 1
      fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId })
      fireEvent.pointerMove(viewer, { clientX: 110, clientY: 110, pointerId })
      fireEvent.pointerMove(viewer, { clientX: 120, clientY: 120, pointerId })
      expect(frames.pending()).toBe(1)
      frames.runAll()
      expect(frames.pending()).toBe(0)
      fireEvent.pointerUp(viewer, { clientX: 120, clientY: 120, pointerId })
      expect(frames.pending()).toBe(0)
    }

    expect(cameras).toHaveLength(4)
    let expected = INITIAL.camera
    for (let drag = 0; drag < 3; drag += 1) {
      expected = expectedOrbit(expected, 20, 20)
    }
    expect(cameras[3]).toEqual(expected)
  })

  it('coalesces shift-drag pans and keeps camera limits', () => {
    const frames = installFrameController()
    const { viewer, cameras } = renderSurface()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 1, shiftKey: true })
    fireEvent.pointerMove(viewer, { clientX: 130, clientY: 160, pointerId: 1, shiftKey: true })
    fireEvent.pointerMove(viewer, { clientX: 140, clientY: 200, pointerId: 1, shiftKey: true })
    frames.runAll()

    expect(cameras[1]).toEqual(clampCamera({ ...INITIAL.camera, panX: INITIAL.camera.panX - 0.4, panY: INITIAL.camera.panY + 1 }))

    fireEvent.pointerDown(viewer, { clientX: 0, clientY: 0, pointerId: 2 })
    fireEvent.pointerMove(viewer, { clientX: 0, clientY: 100000, pointerId: 2 })
    frames.runAll()

    expect(cameras[2]).toEqual(clampCamera({ ...cameras[1]!, pitch: cameras[1]!.pitch - 500 }))
  })

  it('applies touch-pointer drags and falls back when animation frames are unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { viewer, cameras } = renderSurface()

    fireEvent.pointerDown(viewer, { clientX: 100, clientY: 100, pointerId: 7, pointerType: 'touch' })
    fireEvent.pointerMove(viewer, { clientX: 120, clientY: 140, pointerId: 7, pointerType: 'touch' })

    expect(cameras).toHaveLength(2)
    expect(cameras[1]).toEqual(expectedOrbit(INITIAL.camera, 20, 40))

    fireEvent.pointerUp(viewer, { clientX: 120, clientY: 140, pointerId: 7, pointerType: 'touch' })
    expect(cameras).toHaveLength(2)
  })
})
