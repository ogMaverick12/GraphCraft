import { useMemo } from 'react'
import type { Evaluator, FieldEvaluator, PointEvaluator } from '../math/index.ts'
import { sampleParametric } from '../sampling/index.ts'
import { sampleFunction } from '../sampling/index.ts'
import { sampleImplicit, sampleInequality, type InequalityOp } from '../sampling/implicit.ts'
import type { WorldRect } from './coordinate.ts'

export type CompiledCurveInput =
  | { readonly id: string; readonly kind: 'scalar'; readonly expression: Evaluator; readonly range: { xMin: number; xMax: number } | null; readonly breaks: number[] }
  | { readonly id: string; readonly kind: 'point'; readonly expression: PointEvaluator; readonly range: { xMin: number; xMax: number } | null; readonly breaks: number[] }
  | { readonly id: string; readonly kind: 'field'; readonly expression: FieldEvaluator; readonly op: InequalityOp | null }

export interface SampledCurve {
  readonly id: string
  readonly points: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  readonly warnings: string[]
  /** Filled world rectangles (inequalities only). */
  readonly regions: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>
}

/**
 * Sample pre-compiled curves over the current world. Compilation lives
 * with the caller (keyed off row text); this hook only resamples when
 * the view, size, values, or compiled set changes — never recompiling.
 * Callers must pass a referentially stable `parameterValues` object.
 * `pixelHeight` defaults to `pixelWidth` and only tunes Cartesian
 * under-resolution visibility diagnostics.
 */
export function useSampledCurves(
  compiled: CompiledCurveInput[],
  world: WorldRect,
  pixelWidth: number,
  parameterValues: Record<string, number>,
  pixelHeight: number = pixelWidth,
): SampledCurve[] {
  return useMemo(
    () =>
      compiled.map((curve) => {
        if (curve.kind === 'field') {
          // Implicit/inequality rows grid the whole visible world.
          const options = {
            xMin: world.xMin,
            xMax: world.xMax,
            yMin: world.yMin,
            yMax: world.yMax,
            pixelWidth,
            parameters: parameterValues,
          }
          if (curve.op === null) {
            const result = sampleImplicit(curve.expression, options)
            return {
              id: curve.id,
              points: result.segments.map((s) => s.points),
              warnings: result.warnings.map((w) => w.message),
              regions: [],
            }
          }
          const result = sampleInequality(curve.expression, curve.op, options)
          return {
            id: curve.id,
            points: result.segments.map((s) => s.points),
            warnings: result.warnings.map((w) => w.message),
            regions: result.regions,
          }
        }
        if (curve.kind === 'point') {
          // Parametric/polar rows own their parameter range outright.
          if (curve.range === null || !(curve.range.xMax > curve.range.xMin)) {
            return { id: curve.id, points: [], warnings: ['The parameter range is empty.'], regions: [] }
          }
          const result = sampleParametric(curve.expression, { xMin: curve.range.xMin, xMax: curve.range.xMax, pixelWidth, breaks: curve.breaks, parameters: parameterValues })
          return {
            id: curve.id,
            points: result.segments.map((s) => s.points),
            warnings: result.warnings.map((w) => w.message),
            regions: [],
          }
        }
        // Cartesian rows arrive pre-intersected with the view x-range.
        if (curve.range === null) {
          return { id: curve.id, points: [], warnings: ['The domain does not overlap this view.'], regions: [] }
        }
        const lo = Math.max(world.xMin, curve.range.xMin)
        const hi = Math.min(world.xMax, curve.range.xMax)
        if (!(hi > lo)) {
          return { id: curve.id, points: [], warnings: ['The domain does not overlap this view.'], regions: [] }
        }
        const result = sampleFunction(curve.expression, { xMin: lo, xMax: hi, yMin: world.yMin, yMax: world.yMax, pixelWidth, pixelHeight, breaks: curve.breaks, parameters: parameterValues })
        return {
          id: curve.id,
          points: result.segments.map((s) => s.points),
          warnings: result.warnings.map((w) => w.message),
          regions: [],
        }
      }),
    [compiled, world, pixelWidth, pixelHeight, parameterValues],
  )
}
