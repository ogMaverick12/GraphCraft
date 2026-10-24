import { describe, expect, it } from 'vitest'
import { createTransform } from '../graph/coordinate.ts'
import { buildLineRunGeometry, pathFrom } from './line-runs.ts'
import type { PlotSeries } from './plots.ts'

function series(points: PlotSeries['points'], gapXs: number[] = [], label = 'y'): PlotSeries {
  return { key: label, label, colorIndex: 0, points, skipped: 0, gapXs }
}

function point(x: number, y: number): PlotSeries['points'][number] {
  return { x, y, label: String(x) }
}

describe('Data Lab line-run geometry', () => {
  it('uses the exact established 0.01px path serialization', () => {
    expect(pathFrom([{ px: 213.33333333333334, py: 285.7142857142857 }])).toBe('M 213.33 285.71')
    expect(buildLineRunGeometry(series([point(1, 2)]), createTransform({ xMin: 0, xMax: 3, yMin: 0, yMax: 7 }, { width: 640, height: 400 }, false), false, false)).toEqual([
      { d: 'M 213.33 285.71', title: 'y (1 points)' },
    ])
  })

  it('splits at recorded gaps and preserves point order and titles', () => {
    const points = [point(1, 1), point(2, 2), point(4, 4), point(5, 5)]
    const runs = buildLineRunGeometry(series(points, [3]), createTransform({ xMin: 0, xMax: 6, yMin: 0, yMax: 6 }, { width: 640, height: 400 }, false), false, false)
    expect(runs.map((run) => run.d)).toEqual([
      'M 106.67 333.33 L 213.33 266.67',
      'M 426.67 133.33 L 533.33 66.67',
    ])
    expect(runs.map((run) => run.title)).toEqual(['y segment 1 of 2', 'y segment 2 of 2'])
  })

  it('applies log transforms without changing the path convention', () => {
    const transform = createTransform({ xMin: 0, xMax: 2, yMin: 0, yMax: 2 }, { width: 640, height: 400 }, false)
    expect(buildLineRunGeometry(series([point(10, 100)]), transform, true, true)).toEqual([{ d: 'M 320.00 0.00', title: 'y (1 points)' }])
  })

  it('keeps every point and the exact run count for 10,000 points with 270 recorded gaps', () => {
    const points = Array.from({ length: 10000 }, (_, index) => point(index, index))
    const gapXs = Array.from({ length: 270 }, (_, index) => (index + 1) * 37 + 0.5)
    const transform = createTransform({ xMin: 0, xMax: 9999, yMin: 0, yMax: 9999 }, { width: 640, height: 400 }, false)
    const runs = buildLineRunGeometry(series(points, gapXs), transform, false, false)

    expect(runs).toHaveLength(271)
    expect(runs.map((run) => (run.d.match(/\bL\b/g) ?? []).length + 1).reduce((sum, count) => sum + count, 0)).toBe(10000)
    expect(runs[0]?.title).toBe('y segment 1 of 271')
    expect(runs[270]?.title).toBe('y segment 271 of 271')
    expect(runs[0]?.d.startsWith('M 0.00 400.00 L ')).toBe(true)
    expect(runs[270]?.d.endsWith(' 0.00')).toBe(true)
  })
})
