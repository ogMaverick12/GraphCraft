import { act, fireEvent, render, screen, type RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORLD } from '../graph/useViewport.ts'
import type { GraphCraftProject } from './schema.ts'

const probe = vi.hoisted(() => ({ builds: 0, serializations: 0, backups: 0 }))

vi.mock('../project/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../project/index.ts')>()
  return {
    ...actual,
    buildProjectDocument: (snapshot: Parameters<typeof actual.buildProjectDocument>[0]) => {
      probe.builds += 1
      return actual.buildProjectDocument(snapshot)
    },
    serializeDocument: (project: Parameters<typeof actual.serializeDocument>[0]) => {
      probe.serializations += 1
      return actual.serializeDocument(project)
    },
    saveBackup: (text: string) => {
      probe.backups += 1
      return actual.saveBackup(text)
    },
  }
})

import { App } from '../app/App.tsx'

const BACKUP_KEY = 'graphcraft-last-project'
const COALESCE_MS = 200
const ZOOM_STEP = 1.2

function resetProbe(): void {
  probe.builds = 0
  probe.serializations = 0
  probe.backups = 0
}

function graphSvg(): SVGSVGElement {
  const svg = screen.getByRole('application', { name: /Graph viewport/ }).querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error('Expected the graph SVG')
  }
  return svg
}

function statusText(): string {
  return screen.getByLabelText('Status').textContent ?? ''
}

function persistedProject(): GraphCraftProject {
  const text = window.localStorage.getItem(BACKUP_KEY)
  if (text === null) {
    throw new Error('Expected a session backup')
  }
  return JSON.parse(text) as GraphCraftProject
}

function backupWrites(setItem: ReturnType<typeof vi.spyOn>): number {
  return setItem.mock.calls.filter(([key]: unknown[]) => key === BACKUP_KEY).length
}

function wheelBurst(count: number): void {
  const svg = graphSvg()
  for (let index = 0; index < count; index += 1) {
    fireEvent.wheel(svg, { deltaY: -100, clientX: 400, clientY: 300 })
  }
}

function expectedZoomedWorld(count: number): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const scale = (1 / ZOOM_STEP) ** count
  return {
    xMin: DEFAULT_WORLD.xMin * scale,
    xMax: DEFAULT_WORLD.xMax * scale,
    yMin: DEFAULT_WORLD.yMin * scale,
    yMax: DEFAULT_WORLD.yMax * scale,
  }
}

function expectViewport(
  actual: GraphCraftProject['viewport'],
  expected: { xMin: number; xMax: number; yMin: number; yMax: number },
): void {
  expect(actual.xMin).toBeCloseTo(expected.xMin, 10)
  expect(actual.xMax).toBeCloseTo(expected.xMax, 10)
  expect(actual.yMin).toBeCloseTo(expected.yMin, 10)
  expect(actual.yMax).toBeCloseTo(expected.yMax, 10)
}

function renderSettled(): RenderResult {
  const view = render(<App />)
  act(() => {
    vi.advanceTimersByTime(COALESCE_MS)
  })
  return view
}

beforeEach(() => {
  vi.useFakeTimers()
  resetProbe()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('viewport persistence coalescing', () => {
  it('coalesces a wheel burst without rebuilding or writing the project per event', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderSettled()
    resetProbe()
    setItem.mockClear()

    wheelBurst(20)

    // The first change opens the window; the remaining events share it.
    expect(probe.builds).toBe(0)
    expect(probe.serializations).toBe(1)
    expect(probe.backups).toBe(1)
    expect(backupWrites(setItem)).toBe(1)

    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    expect(probe.builds).toBe(0)
    expect(probe.serializations).toBe(2)
    expect(probe.backups).toBe(2)
    expect(backupWrites(setItem)).toBe(2)
    expectViewport(persistedProject().viewport, expectedZoomedWorld(20))
  })

  it('updates the rendered viewport and dirty state before the backup window closes', () => {
    renderSettled()
    const before = statusText()
    resetProbe()

    fireEvent.wheel(graphSvg(), { deltaY: -100, clientX: 400, clientY: 300 })

    expect(statusText()).not.toBe(before)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    // The first write is the leading edge of the coalescing window; rendering
    // and the unsaved indicator never wait for the trailing flush.
    expect(probe.backups).toBe(1)
  })

  it('persists the normalized default viewport after reset-view', () => {
    renderSettled()
    wheelBurst(4)
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    expect(persistedProject().viewport).toEqual({
      ...DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
    })
  })

  it('does not let a pending old viewport overwrite a new project', () => {
    renderSettled()
    wheelBurst(10)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    const restored = persistedProject()
    expect(restored.title).toBe('Untitled project')
    expect(restored.viewport).toEqual({
      ...DEFAULT_WORLD,
      equalAspect: false,
      showGrid: true,
    })
  })

  it('restores the latest successfully persisted viewport and edits', () => {
    const first = renderSettled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Project title' }), {
      target: { value: 'Recovered session' },
    })
    wheelBurst(12)
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    const beforeStatus = statusText()
    const beforeViewport = persistedProject().viewport
    first.unmount()

    render(<App />)

    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Recovered session')
    expect(statusText()).toBe(beforeStatus)
    expect(persistedProject().viewport).toEqual(beforeViewport)
  })

  it('flushes the latest viewport on pagehide and cancels the pending timer', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderSettled()
    resetProbe()
    setItem.mockClear()

    wheelBurst(10)
    const writesBeforeHide = backupWrites(setItem)
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(backupWrites(setItem)).toBe(writesBeforeHide + 1)
    expectViewport(persistedProject().viewport, expectedZoomedWorld(10))

    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })
    expect(backupWrites(setItem)).toBe(writesBeforeHide + 1)
  })

  it('flushes the latest viewport when the tab becomes hidden', () => {
    renderSettled()
    wheelBurst(7)
    const before = persistedProject().viewport

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(persistedProject().viewport).not.toEqual(before)
    expectViewport(persistedProject().viewport, expectedZoomedWorld(7))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('flushes pending work on unmount and does not write again afterward', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const view = renderSettled()
    setItem.mockClear()

    wheelBurst(8)
    const writesBeforeUnmount = backupWrites(setItem)
    view.unmount()

    expect(backupWrites(setItem)).toBe(writesBeforeUnmount + 1)
    expectViewport(persistedProject().viewport, expectedZoomedWorld(8))

    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })
    expect(backupWrites(setItem)).toBe(writesBeforeUnmount + 1)
  })

  it('skips an identical durable snapshot', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderSettled()
    resetProbe()
    setItem.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    expect(probe.backups).toBe(0)
    expect(backupWrites(setItem)).toBe(0)
  })

  it('keeps the storage-failure notice and remains usable during a viewport burst', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    render(<App />)
    expect(screen.getByText(/storage is unavailable|Local backup unavailable/i)).toBeInTheDocument()

    wheelBurst(5)
    act(() => {
      vi.advanceTimersByTime(COALESCE_MS)
    })

    expect(screen.getByRole('textbox', { name: 'New expression' })).toBeInTheDocument()
    setItem.mockRestore()
  })
})
