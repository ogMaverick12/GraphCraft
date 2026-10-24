# GraphCraft — Figure export (export stage, extended Data Lab)

SVG vectors and scaled PNGs from one shared scene. No PDF: no reliable,
appropriately licensed implementation is on hand, and renaming an image
would be dishonest — PDF stays out until a real evaluation justifies a
dependency. The dialogs offer only formats that genuinely work.

## Pipeline
`buildExportScene` (world + measured size + sampled segments) →
`renderExportSvg` | `drawSceneToCanvas` + `encodePng` → file download.
The scene carries grid, axes, ticks, clipped-scale curve runs, legend,
and background — never navigation, sidebars, buttons, cursor, or
tooltips. Later data exports reuse the scene without touching the live
viewport.

## Fidelity decisions
- Curves stay vector paths in SVG (one per sampler segment) and are
  stroked with preserved colour/width/dash on canvas.
- Figures use the fixed light theme (`#ffffff` grid `#e7e5e4` etc.;
  curve hex table mirrors `--gc-curve-*`) so SVG and PNG agree in
  either app theme. White background by default; transparent renders
  nothing behind the figure in both formats.
- System font stack (`Inter, system-ui, …`); labels clamped inside the
  frame so axes text is never clipped. Legend lists every plotted
  expression with its swatch below the plot.
- PNG: 1×/2×/3× selector, output capped at 2400px / 6MP (scale snaps
  down deterministically; capping is disclosed in the dialog). PNG
  bytes come from an in-house encoder (signature/IHDR/IDAT/IEND +
  CRC32; `CompressionStream` when present, zlib-wrapped stored blocks
  otherwise — both paths emit valid RFC-1950 IDAT streams) —
  no new dependency. Tests inflate IDAT and compare every pixel on
  both paths.
- Sampler warnings (budget/depth/under-resolved) are listed in the
  dialog; shaky figures are disclosed, never silently exported.

## Limits
Canvas-unavailable environments get guidance instead of a crash
(PNG path returns null). Screenshot tests omitted (no reliable
harness); structure and pixel invariants are asserted instead.

## Data Lab figures and tables

Every Data Lab chart kind (scatter, line, bar, histogram) exports
through the SAME scene and renderers — `buildDataFigureScene`
(`src/data/figure.ts`) maps the current resolved plot into scene
primitives, never per-type export code:

- Scatter/line points → scene points (circle/square/triangle/diamond,
  per-series colour + shape, data-unit tooltips); line runs split
  across recorded gaps exactly like the live view.
- Bars/histograms → scene bars (grouped slots, zero baseline).
- Error bars → scene rules (1.25px whiskers + caps, invalid sides
  omitted and counted upstream).
- Fitted overlay → one dashed accent run (`#4f46e5`, `7 4`) mapped
  through the same log10 transform as series; suppressed on
  bar/histogram where a line would imply a false relationship.
- Title, axis labels (with units), legend (series + counts, shape
  glyphs for scatter, dash swatches for lines, fit entry), grid,
  log power ticks, and optional caption (≤4 rows) all survive export;
  hidden series stay hidden; explicit bounds and log exclusions apply
  exactly as on screen. No navigation, sidebars, buttons, cursor, or
  hover UI can enter.
- Controlled constants: base sizes S/M/L (`480×320`, `720×440`,
  `960×520` units, user-selectable and persisted), legend rows 18px,
  caption rows 14px (≤4), fixed light theme, system font stack
  (`Inter, system-ui, …` — Inter is OFL with system fallbacks, never a
  proprietary-only default). Margins are fixed by the scene layout
  (8px pads, clamped labels) rather than user options, so report
  figures are deterministic; vertical whitespace is user-controlled
  via legend counts and caption rows.

PNG reuses `resolveExportScale` caps (2400px / 6MP, deterministic
snap-down, disclosed) and the in-house encoder; SVG stays vector with
`viewBox` crispness. Exports build from current props at click time —
a dedicated test proves CSV residuals recompute instead of serving
stale results.

## CSV tables

Explicitly selected tables only: dataset (all rows), plotted points
(visible series), residuals (current fit, recomputed), fit summary
(current fit metadata). RFC-4180 quoting with `""` escapes; fields
starting with `=`, `+`, `-`, `@` are `'`-prefixed against formula
injection; numbers serialize at full precision (never display text);
missing serializes as empty — the missing policy lives in the project
bundle, not in a magic value. Our own CSV re-imports cleanly
(round-trip tested).

## PDF refusal

PDF is refused with guidance until ALL hold: a verified licence,
measured bundle delta, a tested renderer, and a reopen task. Same bar
as the `.xlsx` refusal — criteria, not a roadmap promise.
