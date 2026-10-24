# GraphCraft — Renderer note (GS-02/GS-03)

## SVG, not Canvas, not a charting dependency
Stage 1 renders into SVG. Reasons: axes/tick labels are DOM text
(accessible, selectable, sharp at any DPI with zero pixel-ratio code);
sampler output is small (≤4000 evaluations → a few thousand points over a
handful of segments — trivial for SVG paths); updates are declarative
React with memoized static layers; clipping is a `clipPath`. Canvas only
pays off past ~100k points at 60fps — not Stage 1. Hybrid reserved:
keep SVG axes/labels, move curves to canvas if profiling ever demands it.
No Plotly dependency: the DATA-02 evaluation gate stands, and nothing in
Stage 1 needs it.

## Structure
- `src/graph/coordinate.ts` — the only world↔screen conversion.
  `createTransform` (optional equal-aspect widening), `worldToScreen`,
  `screenToWorld`, `visibleWorldBounds`, edge-clamped `axisScreenPosition`,
  1/2/5×10ⁿ ticks + labels, Cohen–Sutherland `clipPolyline` (world values
  pre-clamped to a finite box so pole-adjacent magnitudes stay finite).
- `src/graph/palette.ts` — 6 theme-aware curve colours (all ≥4.9:1 on
  their theme surface; verified 2026-10-14) + distinct dash patterns, so
  colour is never the sole distinguisher. Legend swatches mirror both.
- `src/graph/GraphView.tsx` — grid, axes, ticks, labels, origin marker,
  one `<path>` per sampler segment inside a clip rect. Drag-pan,
  cursor-anchored wheel zoom, keyboard (+/−/arrows/0). Size via
  `useSyncExternalStore` + ResizeObserver (no render-loop measurement);
  tests inject `measuredSize`.
- `src/graph/useViewport.ts` — world-rect state; resize changes pixels
  only, never the mathematical view.
- `src/graph/useCurves.ts` — sources compile once (keyed memo);
  pan/zoom/resize resample through the same evaluators. No re-parse
  on view changes by construction.

## Aspect policy
Default: independent ranges fill the viewport. `Equal axis scales`
checkbox (inspector, real setting): the coarser axis widens symmetrically
about its centre so 1 x-unit = 1 y-unit on screen; effective bounds are
exposed via `visibleWorldBounds`.

## Deliberate omissions
Log scales (future extension), screenshot tests (no reliable harness —
stated, not added).

## Navigation (added 2026-10-14; representability hardened 2026-10-18)
- `clampWorldRect`: spans clamped to 1e-6…1e12 with a magnitude-aware
  floor — at least 2 ulps of the local coordinate magnitude (≈2.44e-4 at
  ±1e12, where one ulp is ≈1.22e-4) — so both edges always stay strictly
  ordered doubles; coordinates are fenced at ±1e12 and fence-crossing
  intervals shift inward deterministically. Restored and imported
  viewports run through the same policy (`useViewport` clamps its initial
  value and `reset`), so pan/zoom, session restore, and file open can
  never produce an unrenderable view.
- `ticksForRange`: 1/2/5×10ⁿ steps floored at one ulp of the largest
  magnitude in range, capped at 256 iterations, invalid input → `[]`,
  unrepresentable ranges → fewer ticks (documented fallback). The old
  `v += step` loop could stall forever near ±1e12; ordinary ranges keep
  the previous ticks and labels byte-for-byte.
- Graph Studio render recovery (2026-10-18): the viewport sits inside
  `GraphStudioBoundary`; a render failure shows an inline alert with
  “Restore view” (viewport-only) instead of unmounting the app. Project
  rows, files, and the session backup are untouched.
- Controls: overlay zoom in/out/reset buttons, keyboard +/−/arrows/0,
  cursor-anchored wheel zoom, two-pointer pinch (same pipeline;
  `touch-none` scoped to the viewport so page scroll elsewhere works).
- Crosshair readout (toggleable, default on): dashed lines + numeric
  `x/y` text positioned near the cursor; pointer-leave clears it.
  The readout is `aria-hidden` — screen-reader point inspection is
  future trace work, not silent behaviour.
- Pan deltas coalesce in one animation frame; hover never resamples
  (sampler inputs exclude hover by construction).
- Status bar carries the live view label (`x […] · y […]`).
- Limitation: pinch has no hardware/CI coverage (jsdom has no touch);
  pinch math shares the tested `zoomAtWorld` path. Trackpad gestures
  arrive as wheel events and follow the documented cursor-anchored
  default.
