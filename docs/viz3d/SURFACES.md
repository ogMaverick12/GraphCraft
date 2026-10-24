# GraphCraft — 3D surfaces (Stage 6)

Bounded `z = f(x, y)` grids drawn as depth-sorted height-coloured quads
by a purpose-built software renderer (ADR-036: no WebGL dependency).
The 2D Graph Studio is untouched in a separate mode.

## Coordinate and unit conventions

- World: right-handed `(x, y, z)` with `z` up. Camera yaw orbits
  around the z-axis (0 looks along +y, positive turns toward +x);
  pitch is elevation above the xy-plane in radians, clamped off the
  poles (±π/2 ∓ 0.05) so the up direction never flips. Distance is in
  world units (perspective divisor); pan translates the domain centre
  in world units.
- Units are world units (dimensionless): axis labels read `x`, `y`,
  `z`. Calculator unit symbols never auto-convert a surface — a unit
  is display text only, exactly like Data Lab axis labels.
- Colour: fixed light-figure ramp (blue → red by height, legend shows
  the sampled min/max); invalid vertices have no colour because they
  have no quad. Contrast follows the export-figure convention (fixed
  light plate in-app and in files).

## Pipeline

`compileSurface` (`x`, `y` through the gated engine, parameters
allowed) → `sampleSurface` (bounded grid, holes counted) →
`projectSurface` (orbit/perspective, painter sort) → SVG polygons
(live view and export share the layout math) or canvas 2D (PNG).

## Numerical and performance rules

- Grid N×N quads, N ∈ {24, 48, 80, 120}, hard cap 128 (16,641
  vertices, one engine evaluation each — milliseconds on test
  hardware; a 10k-vertex perf probe is in the suite).
- Coarse warning below 48²; cost note at 80²+ (14,400 SVG polygons).
- Invalid vertices are holes; quads touching one are dropped, never
  bridged. Constant surfaces land mid-ramp (no 0/0 mapping).
- Camera: yaw/pitch orbit (±clamped off the poles), distance 4–60,
  pan; drag orbits, shift-drag pans, buttons + arrows zoom/reset.
  No wheel handler by design (no scroll trap; DataPlot agrees).
- Workers: not used — 16k synchronous evaluations complete in
  milliseconds; a worker would add IPC + fallback paths for no
  measured gain. Reopens on measurement.
- Parametric 3D curves: deferred (second sampler over the same
  projection would be clean; not half-built here). Vector fields:
  model, validation, and sampling live in `surface.ts` (tested);
  the arrow renderer is the explicit next step. No GPU compute,
  no arbitrary meshes — refused scope, not missing polish.

## Rendering and export

No GPU is required; there is no fallback branch because there is no
hardware gate. SVG exports vectors (polygons + axes + labels);
PNG renders 1280×880 fixed through the shared encoder (canvas
required; otherwise guidance, never a crash).

## Appearance, ticks, and legend
- Modes: solid (height colours), wireframe (mesh only), shaded
  (fixed key light from (−0.35, 0.5, 0.79), factor 0.45 + 0.55·max(0,
  n·L) — deterministic, stated here). Persisted per surface.
- Base edges carry projected tick labels from the shared 1/2/5
  generator; x/y/z axis letters sit at the projected ends.
- A labelled z colour bar (min/max numeric) draws live and in both
  exports. A second scalar quantity (colour by curvature, etc.) is
  deferred: one honest mapping (height) beats two half-labelled ones.

## Navigation and inspection

- Orbit (drag, buttons, arrows), pan (shift-drag, shift-arrows),
  zoom (buttons, +/−), reset (button, `0`): all clamped through
  `clampCamera` (pole exclusion, 4–60 distance fence, ±1e6 pan,
  non-finite repair). Aspect holds via `viewBox` scaling on resize.
- Click inspects the nearest sampled vertex (marker ring + readout
  with exact sampled values); holes and empty space report as such;
  Escape clears. Projection evaluates nothing, so orbiting never
  resamples (tested with a counting field).
- Touch: single-drag orbits through unified pointer events; pinch
  and multi-touch are untested (no harness — stated here, as with
  2D touch pinch). Keyboard covers every pointer action.

## Persistence

`surfaces3d[]` (≤6): id, source, domain, resolution, camera, flags.
Validated structurally; unknown shapes refused, absent section
defaults to empty. No version bump (optional section, tolerant read).

## Resource cleanup and offline operation

No GPU, textures, buffers, workers, or subscriptions exist anywhere
in the pipeline, so there is nothing to release: React unmount drops
the (small, bounded) state and all listeners are declarative props.
Offline by construction (no fetch anywhere in `viz3d/`); the view
ships in a 56.6 KB lazy chunk after graph-first startup.
