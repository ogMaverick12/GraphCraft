import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransform, ticksForRange, worldToScreen, type WorldRect } from '../graph/coordinate.ts'
import type { Dataset } from './dataset.ts'
import { DataPlot } from './DataPlot.tsx'
import { estimateCategoryLabelWidth, selectCategoricalTicks, type CategoricalTickCandidate } from './category-ticks.ts'
import { plotWorld, resolvePlot, type PlotConfig } from './plots.ts'

function config(overrides: Partial<PlotConfig> = {}): PlotConfig {
  return {
    kind: 'bar',
    xColumn: 'c1',
    yColumn: 'c2',
    seriesColumn: null,
    title: 'S7.5.13',
    xLabel: 'category',
    yLabel: 'value',
    sort: 'row-order',
    showGrid: true,
    hiddenSeries: [],
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    xScale: 'linear',
    yScale: 'linear',
    tickX: null,
    tickY: null,
    yError: { mode: 'none' },
    xError: { mode: 'none' },
    ...overrides,
  }
}

function barDataset(n: number): Dataset {
  return {
    id: 'ds-s7513',
    name: 'S7.5.13 categorical axis',
    columns: [
      { id: 'c1', name: 'category', type: 'categorical' },
      { id: 'c2', name: 'value', type: 'numeric' },
    ],
    rows: Array.from({ length: n }, (_, i) => [`C${i}`, 5 + (i % 5)]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function histogramDataset(n: number): Dataset {
  return {
    id: 'ds-s7513-hist',
    name: 'S7.5.13 numeric histogram axis',
    columns: [
      { id: 'c1', name: 'row', type: 'numeric' },
      { id: 'c2', name: 'value', type: 'numeric' },
    ],
    rows: Array.from({ length: n }, (_, i) => [i, 50 + Math.sin(i / 11) * 20 + (i % 5)]),
    provenance: { kind: 'manual', importedAt: '2026-10-21T00:00:00.000Z', skippedEmpty: 0 },
    cleaningLog: [],
  }
}

function show(
  ds: Dataset,
  cfg: PlotConfig,
  world?: WorldRect,
): {
  view: ReturnType<typeof render>
  svg: SVGSVGElement
  plot: ReturnType<typeof resolvePlot>
  world: WorldRect
  width: number
  height: number
  transform: ReturnType<typeof createTransform>
} {
  const plot = resolvePlot(ds, cfg)
  const bounds = world ?? plotWorld(plot, cfg)
  if (bounds === null) {
    throw new Error('Expected plot bounds')
  }
  const view = render(
    <DataPlot plot={plot} config={cfg} world={bounds} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
  )
  const svg = view.container.querySelector('svg')
  if (svg === null) {
    throw new Error('Expected a rendered plot SVG')
  }
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  return { view, svg, plot, world: bounds, width, height, transform: createTransform(bounds, { width, height }, false) }
}

function xGridXs(svg: SVGSVGElement): number[] {
  return Array.from(svg.querySelectorAll<SVGLineElement>('line.stroke-grid'))
    .filter((line) => line.getAttribute('x1') === line.getAttribute('x2'))
    .map((line) => Number(line.getAttribute('x1')))
}

function xLabels(svg: SVGSVGElement): SVGTextElement[] {
  const y = String(Number(svg.getAttribute('height')) - 22)
  return Array.from(svg.querySelectorAll<SVGTextElement>('text[text-anchor="middle"]')).filter((text) => text.getAttribute('y') === y)
}

function barPath(svg: SVGSVGElement): SVGPathElement {
  const path = svg.querySelector<SVGPathElement>('g[clip-path] > g > path[fill]:not([fill="none"])')
  if (path === null) {
    throw new Error('Expected a batched bar path')
  }
  return path
}

function barMarks(path: SVGPathElement): number[] {
  return [...(path.getAttribute('d') ?? '').matchAll(/\bM\s+([-\d.]+)/g)].map((match) => Number(match[1]))
}

function labelCenter(px: number, width: number): number {
  return Math.min(Math.max(px, 20), width - 4)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('categorical tick selection (S7.5.13)', () => {
  it('preserves every tick when the labels fit', () => {
    const candidates: CategoricalTickCandidate[] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((label, i) => ({
      value: i,
      label,
      px: 80 + i * 150,
    }))
    expect(selectCategoricalTicks(candidates, 640).map((tick) => tick.label)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
  })

  it('selects a deterministic ordered subset and keeps both endpoints at a dense width', () => {
    const candidates: CategoricalTickCandidate[] = Array.from({ length: 21 }, (_, i) => ({ value: i, label: 'AAAA', px: i * 20 }))
    const selected = selectCategoricalTicks(candidates, 500)
    expect(selected.map((tick) => tick.value)).toEqual([0, 4, 7, 10, 13, 16, 20])
    expect(selectCategoricalTicks(candidates, 500)).toEqual(selected)
    expect(selected.map((tick) => tick.value)).toEqual([...selected.map((tick) => tick.value)].sort((a, b) => a - b))

    for (let i = 1; i < selected.length; i += 1) {
      const left = candidates[selected[i - 1]?.value ?? 0]
      const right = candidates[selected[i]?.value ?? 0]
      if (left === undefined || right === undefined) {
        throw new Error('Expected selected candidates')
      }
      const gap = labelCenter(right.px, 500) - labelCenter(left.px, 500)
      expect(gap).toBeGreaterThanOrEqual((estimateCategoryLabelWidth(left.label) + estimateCategoryLabelWidth(right.label)) / 2)
    }
  })

  it('increases tick count with plot width and handles empty, single, and impossible endpoint cases', () => {
    const dense = (width: number): CategoricalTickCandidate[] =>
      Array.from({ length: 40 }, (_, i) => ({ value: i, label: `C${i}`, px: 20 + (i * (width - 40)) / 39 }))
    const narrow = selectCategoricalTicks(dense(320), 320)
    const medium = selectCategoricalTicks(dense(640), 640)
    const wide = selectCategoricalTicks(dense(1280), 1280)
    expect(narrow.length).toBeLessThan(medium.length)
    expect(medium.length).toBeLessThan(wide.length)
    expect(narrow[0]?.value).toBe(0)
    expect(wide[wide.length - 1]?.value).toBe(39)

    expect(selectCategoricalTicks([], 640)).toEqual([])
    expect(selectCategoricalTicks([{ value: 7, label: 'Only', px: 320 }], 640).map((tick) => tick.value)).toEqual([7])

    const impossible = selectCategoricalTicks(
      [
        { value: 0, label: 'A very long category label', px: 0 },
        { value: 1, label: 'Another very long category label', px: 100 },
      ],
      30,
    )
    expect(impossible.map((tick) => tick.value)).toEqual([0])
  })
})

describe('live categorical axis density (S7.5.13)', () => {
  it('keeps the established labels and gridlines when categories fit', () => {
    const cfg = config()
    const { svg, width } = show(barDataset(3), cfg, { xMin: -0.5, xMax: 2.5, yMin: 0, yMax: 5 })
    const labels = xLabels(svg)
    expect(labels.map((text) => text.textContent)).toEqual(['C0', 'C1', 'C2'])
    expect(labels.map((text) => Number(text.getAttribute('x')))).toEqual([106.66666666666667, 320, 533.3333333333334])
    expect(xGridXs(svg)).toEqual([106.66666666666667, 320, 533.3333333333334])
    expect(barMarks(barPath(svg))).toHaveLength(3)
    expect(svg.querySelectorAll('g[clip-path] > g > rect')).toHaveLength(0)
    expect(screen.getByRole('img', { name: /S7\.5\.13: bar plot with 1 visible series and 3 points/ })).toBe(svg)
    expect(labelCenter(320, width)).toBe(320)
  })

  it('bounds labels and major gridlines at 100, 1,000, and 10,000 categories without dropping bars', () => {
    for (const [n, tickCount] of [[100, 15], [1000, 14], [10000, 13]] as const) {
      const { svg, plot, width, transform } = show(barDataset(n), config({ title: `Bar ${n}` }))
      const labels = xLabels(svg)
      expect(plot.totalPoints).toBe(n)
      expect(labels).toHaveLength(tickCount)
      expect(xGridXs(svg)).toHaveLength(tickCount)
      expect(labels[0]?.textContent).toBe('C0')
      expect(labels[labels.length - 1]?.textContent).toBe(`C${n - 1}`)
      expect(svg.querySelectorAll('*').length).toBe(n === 100 ? 54 : n === 1000 ? 52 : 50)

      const selected = labels.map((text) => Number((text.textContent ?? '').slice(1)))
      expect([...selected].sort((a, b) => a - b)).toEqual(selected)
      const gridXs = xGridXs(svg)
      for (const [i, index] of selected.entries()) {
        const raw = worldToScreen(transform, index, 0).px
        expect(Number(labels[i]?.getAttribute('x'))).toBeCloseTo(labelCenter(raw, width), 8)
        expect(gridXs[i]).toBeCloseTo(raw, 8)
      }

      const marks = barMarks(barPath(svg))
      expect(marks).toHaveLength(n)
      expect(new Set(marks).size).toBe(n)
      expect([...marks].sort((a, b) => a - b)).toEqual(marks)
      expect(screen.getByRole('img', { name: new RegExp(`Bar ${n}: bar plot with 1 visible series and ${n} points`) })).toBe(svg)
    }
  })

  it('keeps tooltips for labelled and unlabelled categories at the same bar coordinates', () => {
    const { svg, transform } = show(barDataset(100), config({ title: 'Dense tooltip' }))
    expect(xLabels(svg).map((text) => text.textContent)).not.toContain('C1')

    const point = (index: number) => worldToScreen(transform, index, 2.5)
    const a = point(0)
    const b = point(1)
    const middle = point(50)
    fireEvent.pointerMove(svg, { clientX: a.px, clientY: a.py })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: C0 = 5')
    fireEvent.pointerMove(svg, { clientX: b.px, clientY: b.py })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: C1 = 6')
    fireEvent.pointerMove(svg, { clientX: middle.px, clientY: middle.py })
    expect(screen.getByTestId('bar-tooltip')).toHaveTextContent('value: C50 = 5')
  })

  it('recomputes the subset on resize and category changes without stale labels', () => {
    let callback: ResizeObserverCallback | null = null
    class ControlledResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callback = cb
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ControlledResizeObserver)

    const { view } = show(barDataset(1000), config({ title: 'Responsive' }))
    const svg = view.container.querySelector('svg')
    const box = view.container.querySelector<HTMLElement>('div.h-full.w-full')
    if (svg === null || box === null) {
      throw new Error('Expected plot elements')
    }
    const rectSpy = vi.spyOn(box, 'getBoundingClientRect')
    const resize = (width: number): void => {
      rectSpy.mockReturnValue(new DOMRect(0, 0, width, 400))
      act(() => {
        callback?.([], { observe: () => undefined, unobserve: () => undefined, disconnect: () => undefined } as ResizeObserver)
      })
    }

    resize(320)
    const narrow = xLabels(svg).length
    expect(barMarks(barPath(svg))).toHaveLength(1000)
    resize(960)
    const wide = xLabels(svg).length
    expect(narrow).toBe(7)
    expect(wide).toBe(21)
    expect(narrow).toBeLessThan(wide)
    expect(xGridXs(svg)).toHaveLength(wide)
    expect(barMarks(barPath(svg))).toHaveLength(1000)
    const wideLabels = xLabels(svg)
    expect(wideLabels[0]?.textContent).toBe('C0')
    expect(wideLabels[wideLabels.length - 1]?.textContent).toBe('C999')

    const changed = resolvePlot(barDataset(200), config({ title: 'Responsive' }))
    const changedWorld = plotWorld(changed, config({ title: 'Responsive' }))
    if (changedWorld === null) {
      throw new Error('Expected changed plot bounds')
    }
    view.rerender(
      <DataPlot
        plot={changed}
        config={config({ title: 'Responsive' })}
        world={changedWorld}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onResetView={() => undefined}
      />,
    )
    const changedLabels = xLabels(svg)
    expect(changedLabels[0]?.textContent).toBe('C0')
    expect(changedLabels[changedLabels.length - 1]?.textContent).toBe('C199')
    expect(changedLabels.every((label) => Number((label.textContent ?? '').slice(1)) < 200)).toBe(true)
    expect(barMarks(barPath(svg))).toHaveLength(200)
  })

  it('keeps labels while removing every gridline when the grid is disabled', () => {
    const { svg } = show(barDataset(100), config({ title: 'No grid', showGrid: false }))
    expect(xLabels(svg)).toHaveLength(15)
    expect(svg.querySelectorAll('line.stroke-grid')).toHaveLength(0)
    expect(barMarks(barPath(svg))).toHaveLength(100)
    expect(svg.querySelectorAll('line.stroke-axis')).toHaveLength(2)
  })

  it('handles one-category and empty bar plots', () => {
    const one = show(barDataset(1), config({ title: 'One category' }))
    expect(xLabels(one.svg).map((text) => text.textContent)).toEqual(['C0'])
    expect(xGridXs(one.svg)).toHaveLength(1)
    expect(barMarks(barPath(one.svg))).toHaveLength(1)

    const emptyDs: Dataset = {
      ...barDataset(2),
      rows: [['A', null], ['B', null]],
    }
    const emptyCfg = config({ title: 'Empty category' })
    const emptyPlot = resolvePlot(emptyDs, emptyCfg)
    const emptyView = render(
      <DataPlot plot={emptyPlot} config={emptyCfg} world={null} onZoomIn={() => undefined} onZoomOut={() => undefined} onResetView={() => undefined} />,
    )
    expect(emptyView.getByText(/No plottable points/)).toBeInTheDocument()
    expect(emptyView.container.querySelector('svg')).toBeNull()
  })

  it('leaves numeric histogram ticks on their existing helper', () => {
    const cfg = config({ kind: 'histogram', title: 'Histogram numeric axis' })
    const { svg, transform } = show(histogramDataset(10000), cfg)
    const labels = xLabels(svg)
    const expected = ticksForRange(transform.visible.xMin, transform.visible.xMax, Math.min(12, Math.max(2, Math.round(640 / 90))))
    expect(labels.map((text) => text.textContent)).toEqual(expected.map((tick) => tick.label))
    expect(labels.every((text) => !(text.textContent ?? '').includes('–'))).toBe(true)
    expect(xGridXs(svg)).toHaveLength(expected.length)
    expect(barMarks(barPath(svg))).toHaveLength(15)
  })
})
