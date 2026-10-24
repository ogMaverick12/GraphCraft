import type { Evaluator } from '../math/index.ts'
import { findRoots, type FoundRoot } from './roots.ts'

export interface Intersection {
  readonly x: number
  readonly y: number
  readonly residual: number
}

/**
 * Intersections of f and g over a range: roots of (f − g) with the
 * shared y recovered from f. Non-finite either side invalidates the
 * sample; pole crossings fail the residual check like roots do.
 */
export function findIntersections(
  f: Evaluator,
  g: Evaluator,
  xMin: number,
  xMax: number,
  parameters: Record<string, number> | undefined,
): { points: Intersection[]; warnings: string[]; evaluations: number } {
  const difference: Evaluator = {
    evaluate: (x, values) => {
      const a = f.evaluate(x, values)
      const b = g.evaluate(x, values)
      if (a.kind !== 'value' || b.kind !== 'value') {
        return { kind: 'domain-error', reason: 'One side is not defined here.' }
      }
      return { kind: 'value', value: a.value - b.value }
    },
  }
  const found = findRoots(difference, xMin, xMax, parameters)
  const points: Intersection[] = []
  for (const root of found.roots) {
    const y = f.evaluate(root.x, parameters)
    if (y.kind === 'value') {
      points.push({ x: root.x, y: y.value, residual: root.residual })
    }
  }
  return { points, warnings: found.warnings, evaluations: found.evaluations }
}

export type { FoundRoot }
