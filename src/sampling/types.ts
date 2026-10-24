import type { CompiledExpression, EvalResult, Evaluator } from '../math/types.ts'

/**
 * Typed inputs/outputs for the Stage 1 numerical sampler.
 * Pure data: no React, CSS, or screen pixels here. Pixel density arrives
 * only as the `pixelWidth`/`pixelHeight` hints inside `SampleOptions`.
 */

export interface SampleOptions {
  /** Inclusive left edge of the mathematical range. Must be finite. */
  xMin: number
  /** Inclusive right edge. Must be finite and greater than `xMin`. */
  xMax: number
  /** Horizontal viewport-density hint in device pixels. Default 800. */
  pixelWidth?: number
  /**
   * Vertical viewport-density hint, used to judge whether an unresolved
   * midpoint would be visible. Defaults to `pixelWidth`.
   */
  pixelHeight?: number
  /** Hard cap on evaluator calls. Default 4000. */
  maxEvaluations?: number
  /** Y-range for visibility diagnostics and field samplers. Defaults to the x-range. */
  yMin?: number
  yMax?: number
  /** Maximum subdivision depth per baseline interval. Default 12. */
  maxDepth?: number
  /** Relative midpoint tolerance against local scale. Default 0.0025. */
  relativeTolerance?: number
  /** Absolute tolerance floor. Default 1e-12. */
  absoluteTolerance?: number
  /**
   * Sorted-or-not x-positions where runs must never connect (e.g.
   * piecewise branch boundaries). Each sub-range samples independently
   * on the shared budget. Default none.
   */
  breaks?: number[]
  /** Parameter values for this pass. Compilation never sees values. */
  parameters?: Record<string, number>
  /** Cooperative cancellation. Checked between intervals. */
  signal?: AbortSignal
}

export interface SamplePoint {
  readonly x: number
  readonly y: number
}

/** One contiguous run of valid points. The renderer must never join segments. */
export interface CurveSegment {
  readonly points: SamplePoint[]
}

export type SampleStatus = 'ok' | 'partial' | 'cancelled' | 'error'

export type SampleWarningCode =
  | 'invalid-endpoint'
  | 'budget-exhausted'
  | 'max-depth-reached'
  | 'under-resolved'
  | 'pole-suspected'
  | 'degenerate-field'
  | 'empty-domain'
  | 'no-valid-samples'

export interface SampleWarning {
  code: SampleWarningCode
  message: string
}

export interface SampleStats {
  evaluations: number
  maxDepthReached: number
  segmentCount: number
  splitCount: number
}

export interface SampleResult {
  status: SampleStatus
  segments: CurveSegment[]
  stats: SampleStats
  warnings: SampleWarning[]
}

/** Validated sampler configuration with all defaults applied. */
export interface ResolvedSampleOptions {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  pixelWidth: number
  pixelHeight: number
  maxEvaluations: number
  maxDepth: number
  relativeTolerance: number
  absoluteTolerance: number
  breaks: number[]
  parameters?: Record<string, number>
  signal?: AbortSignal
}

export type { CompiledExpression, EvalResult, Evaluator }
