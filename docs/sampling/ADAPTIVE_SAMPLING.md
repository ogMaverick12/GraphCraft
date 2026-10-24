# GraphCraft — Adaptive sampling note (sampler stage, extended Stage 2)

`src/sampling/` turns one compiled evaluator + one range into ordered
curve segments. No DOM or drawing: `pixelWidth` sets the baseline count
and the half-pixel minimum interval width, while optional `pixelHeight`
plus the viewport y-range make Cartesian under-resolution diagnostics
visibility-aware. Three samplers share budget, cancellation,
determinism, and result semantics: Cartesian (`sampler.ts`),
parametric (`parametric.ts`, xy-deviation refinement), and implicit
(`implicit.ts`, marching squares + region runs).

## What adaptive refinement guarantees
- **Bounded work.** Evaluations ≤ `maxEvaluations` (default 4000; the
  implicit sampler defaults to its 30000-evaluation cap and honours any
  lower caller limit), subdivision depth ≤ `maxDepth` (default 12),
  boundary bisection ≤ 24 steps per transition. `sin(1/x)`, poles, and
  huge exponentials cannot cause runaway refinement; exhaustion is
  reported as `partial` with a `budget-exhausted` warning, never hidden.
- **No false connections across detected gaps.** Invalid midpoints,
  unresolved pole probes, and invalid baseline runs become segment
  boundaries. Segments are ordered, x-ascending, finite-valued; the
  renderer must draw each segment independently.
- **Determinism.** Identical expression, range, and options produce
  identical output (FIFO interval order, no randomness, no wall-clock).
- **Cancellation.** `AbortSignal` is honoured between intervals; callers
  supersede stale runs with their own request ids (documented pattern:
  discard any result whose id is not current).

## What it cannot guarantee (honest limits)
- **Finite sampling cannot prove a region pole-free.** A pole narrower
  than half a pixel, or two samples landing symmetrically around one
  with a coincidentally finite midpoint, can be missed. Mitigations
  (sign-flip growth probing, spike probing, invalid splitting) are
  heuristics, and `pole-suspected` gaps say "suspected", not "proven".
- **Sub-pixel detail is approximate.** Cartesian intervals varying below
  half-pixel width are accepted as-is. An `under-resolved` warning is
  reported only when the midpoint's vertical deviation is at least half
  a screen pixel at the supplied y-range/`pixelHeight`; ordinary smooth
  curvature that is already visually resolved does not trigger it. When
  those viewport hints are omitted, they default to the x-range and
  `pixelWidth`. Parametric intervals at their parameter-width limit keep
  the existing warning.
- **Boundary snapping stops at pole explosions.** Domain edges like
  `sqrt` at 0 snap exactly; pole-adjacent edges stop at |y| = 1e12 and
  may overshoot the visual asymptote slightly.
- **Steep straight lines need no refinement.** Midpoint error is ~0 for
  any straight run, however steep — subdivision targets curvature and
  jumps, not slope alone, which is correct and intended.
- **Implicit contours are grid approximations.** Saddle cells resolve by
  sampled centres (a documented choice, not a proof); components
  smaller than a cell are missed; constant fields report degenerate
  rather than drawing; region fills stair-step at grid resolution behind
  a smooth boundary. One refinement pass; the base grid is sized to fit
  the effective evaluation budget before traversal — the caller's
  `maxEvaluations` when supplied, otherwise the 30000-evaluation cap, and
  never above that cap — so a larger density request is scaled down
  uniformly (reported with an `under-resolved` warning) instead of
  aborting the pass, and refinement cut short by the budget is reported
  with `budget-exhausted`.

## Why not fixed-step
A single fixed step either wastes budget on lines or misses curvature,
kinks (`abs`), and poles. Baseline (pixelWidth/4, clamped 33–257) plus
error-driven refinement concentrates evaluations where the function
actually varies; constants/linears cost ~2× baseline evaluations total.
