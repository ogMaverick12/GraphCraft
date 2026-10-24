# GraphCraft — Data plots (Stage 4 DATA-02)

Scatter, line, bar, and histogram over imported datasets, drawn on the
shared coordinate layer (`src/graph/coordinate.ts`). Logically separate
from equation plotting: series come from resolved dataset rows, never
samplers — but transforms, ticks, grid, palette, and zoom controls
follow the same contracts.

## Plot types and their data rules

| Type | X | Y | Notes |
|---|---|---|---|
| Scatter | numeric (or row index when unmapped) | numeric | Points only, never connected |
| Line | numeric (or row index) | numeric | One polyline per series; points in row order unless X-ascending is chosen (stated) |
| Bar | categorical (numeric coerces to text labels, stated) | numeric | One bar per row, grouped side-by-side per series; never connected as a line |
| Histogram | ignored | numeric values | Sturges bins (clamped 1–50); equal-width edges from min to max |

A line or scatter with a non-numeric X maps nothing and says so (row
index is offered by leaving X unmapped). Bars always include the zero
baseline. Grouped bars (series dodged side-by-side) are the one bar
mode; stacking is not offered. One plot draws one dataset — comparing
across datasets is deferred, not faked; compare groups with the series
split instead.

## Line breaks, log scales, and ticks

- Line segments break across skipped measurements: finite skipped X
  values are recorded as gaps, and runs split where a gap falls
  strictly between consecutive points. Missing data never bridges.
- Log scales on scatter/line numeric axes map through log10 with
  power-of-ten ticks (1, 10, 100, …, 1eK beyond); non-positive values
  are excluded with a count. Bars and histograms stay linear (stated
  when a log scale is set on them). Non-positive explicit bounds fall
  back to auto-fit.
- Numeric-axis target tick counts (2–12 per axis, blank for automatic)
  shape density; labels themselves stay automatic and documented.
- Categorical bar axes are width-driven instead: a deterministic readable
  subset of labels and one matching major gridline each are shown, while
  every bar remains. Omitted labels stay available through tooltips and the
  data table; no new keyboard category navigation is claimed.

## Mapping controls

X/Y column, categorical series split, title, sort (row order default;
X-ascending is an explicit, stated choice), axis bounds (blank = auto),
grid toggle, per-series legend toggles with point counts, reset button
restoring defaults. Raw rows are never mutated — sorting copies.

## Missing data

Rows with missing or non-finite mapped values skip with a visible
count (`N points, M rows skipped`). An all-empty result shows an empty
state, never a fabricated zero-line. The skip policy is fixed (skip +
count) in this stage; alternatives arrive with cleaning workflows.

## Interaction

Zoom in/out/reset buttons, hover details on every point/bar (scatter
and line use one nearest-point tooltip over their batched marker paths;
bar/histogram use an area-aware tooltip over their batched rectangle
paths with the former per-mark title text), series distinguished by
colour, dash (lines), and point shape (circle/square/triangle/diamond,
mirrored as legend glyphs), keyboard-native settings (selects, inputs,
toggles), and a tabular alternative listing plotted points (first 100 +
count). Exact shared bar/bin edges resolve to the later series/bin,
matching paint order; bar/bin hits use an x-interval index built from the
same rectangle snapshot, so an ordinary pointer examines local candidates
rather than every rectangle, and the index is reused across hover moves.
Scatter/line nearest-point hits keep the same 7px radius and later-point
tie rule, but query a 7px screen-space grid built from the same
full-precision marker snapshot. Every cell touched by the inclusive radius
box is inspected before the exact squared-distance test, and the grid is
reused across pointer moves.
No wheel-zoom or crosshair here - bounds editing plus buttons cover
navigation; anything fancier must earn its own tests.

## Limits

Series render all resolved points. Scatter and line point markers are
batched into one SVG path per series, error-bar whiskers into one path per
series and enabled axis, and bar/histogram rectangles into one path per
series, each with 10,000-point coverage. Line runs remain separate paths
per contiguous segment. Marker and bar batches carry no per-point
`<title>`; the nearest-point or area-aware tooltip supplies the former
point/bar text. Line and bar marker paths serialize full screen
coordinates, while scatter keeps its established 0.01px path convention.
Bar and histogram hover uses a sorted x-start interval index with a prefix
maximum: ordinary disjoint charts examine one or a few rectangles, while
fully overlapping or degenerate intervals can still scan the whole relevant
batch. The index is built once per changed rectangle snapshot (data, viewport,
or visibility) and reused across pointer moves; it is not rebuilt for hover.
Scatter/line hover uses 7px screen-space cells: ordinary charts examine one
or a few points, while coincident points or a dense cluster within the hit
radius can still inspect the whole local population (worst case all points).
That grid is also built once per changed marker snapshot and reused across
hover; it is not rebuilt for pointer movement.
The 10,000-row import cap is the supported ceiling - caps and decimation
are a later performance task, not silent behaviour now. Categorical bar
labels and their major gridlines are thinned to a readable subset based on
plot width and a conservative 11px-label estimate; 1,000 categories at
320/640/960px show 7/14/21 labels, and 100/1,000/10,000 categories at 640px
show 15/14/13. Every bar, category mapping, and bar path stays present;
omitted labels remain in the tooltip and first-100 data table. Thinning is
display-only, not data decimation.

## Error bars

- Sources per axis: none, symmetric column (±), asymmetric upper/lower
  columns (+/−), or a fixed value. Columns live in the same dataset
  and match rows by position — no cross-table joins exist to misalign;
  series splits keep each row's bars with its series (tested).
- Appearance: 1.25px whiskers with 4px caps in the series colour.
  Whiskers are non-interactive `aria-hidden` paths batched per series
  and axis at full screen coordinate precision; hidden series hide
  their bars; X bars draw on scatter/line only. Invalid per-point
  values (negative, missing, non-finite) draw no bar and are counted in
  the plot notes, never fabricated; invalid fixed values are ignored
  with a note. Log scales omit unplaceable ends.
- Bars are display-only: fits use uncertainties ONLY through the Fit
  panel's σ selector (w = 1/σ²); setting error bars never weights a
  fit — the panel says so, and a UI test pins it.
