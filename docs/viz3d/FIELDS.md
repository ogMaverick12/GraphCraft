# GraphCraft — 2D field displays (Stage 6)

Contours, heatmaps, and vector arrows over bounded domains, drawn
through one shared sampler family with one export path per format.
No topology guarantees, no exact field-line claims — ever.

## Algorithms and limits

- Contours reuse marching squares (`sampleImplicit`, saddle-aware
  per ADR-023) on offset fields `f − c`. Levels are explicit lists
  or evenly span the probed range. Pole-adjacent cells interpolate
  coarsely (linear segments across strongly nonlinear cells) — the
  suite pins tightness only away from singularities and says so.
- Heatmaps shade the fixed sampler grid (16–48 cells/side, eval
  counts labelled). Colour is approximate viridis
  (hand-transcribed LUT, perceptually uniform, colour-blind safe;
  never claimed exact) with a labelled numeric legend (min/mid/max);
  blue–red legacy ramp offered with its CVD limitation stated.
  Scale policy is selectable: auto (finite data), symmetric about
  zero, or fixed bounds — invalid selections fall back loudly.
- Arrows subsample the tested vector model with a visible stride cap
  (at most 33 per side including the boundary column; step and drawn
  count stated). Magnitude mode scales by |v|/max with
  a 15% floor; unit mode draws equal arrows and says direction-only.
  Singular arrows are holes.
- Logarithmic colour scales are NOT supported: log mapping needs
  strictly positive inputs, and silent domain-shrinking would lie
  about the data. Stays out until a validated-positivity path with
  explicit log labelling is built and tested.
- Streamlines deferred: RK integration needs step-limit,
  stuck-loop, and non-convergence machinery plus its own tests.
  Deferred with rationale, not omitted by accident.
- Critical points: not detected and never claimed. Vector panels
  show direction and magnitude only; any stagnation point is visible
  as short arrows, never labelled as a classified critical point.
- Not built here: data-grid field input (needs dataset→grid
  resampling), matrix heatmaps (pairwise r exists in the calculator;
  an N×N view duplicates unbuilt UI), box plots (histograms +
  stats lane cover distributions), 3D parametric curves (clean
  extension, still deferred), second-scalar surface colouring.

## Rendering and export

Fixed-white SVG plates with grid, ticks, axis corners, and legends
(same figure conventions as surfaces); PNG at fixed 2× through the
shared encoder; invalid cells are gaps in every format. High-DPI is
exact output dimensions, not responsive scaling — dimensions are
stated on the buttons.

## Persistence

`fields2d[]` (≤4): mode, sources, domain, density, levels, colour
and scale policies, arrow mode, flags. Validated structurally;
absent sections default to empty.
