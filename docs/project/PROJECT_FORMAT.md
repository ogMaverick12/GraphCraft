# GraphCraft — Project format (persistence stage, extended in Stage 2)

Versioned file documents (`*.graphcraft.json`) holding everything needed
to recreate a graph. No backend, accounts, telemetry, or sync — the user
owns their files; browser storage holds only chrome and a crash backup.

## Document (v6; v0–v5 migrate forward)
```json
{
  "format": "graphcraft-project",
  "version": 6,
  "title": "Quadratic and sine",
  "expressions": [{ "kind": "cartesian", "id": "example-parabola", "source": "x^2", "visible": true, "colorIndex": 0, "label": "", "domain": null, "branches": null, "defaultSource": "" }],
  "viewport": { "xMin": -10, "xMax": 10, "yMin": -7, "yMax": 7, "equalAspect": false, "showGrid": true },
  "parameters": [],
  "dataLab": { "datasets": ["<see below>"], "analyses": { "<dataset-id>": "<see below>" } }
}
```
Rows carry a `kind` discriminator: `cartesian` (source/domain/
branches as before), `parametric` (`xSource`, `ySource`, finite
`tMin` below `tMax`), `polar` (`source` in `theta`, finite `thetaMin`
below `thetaMax`). Unknown kinds are rejected. Shared rules: title ≤
200 chars (empty → `Untitled project`); 0–100 rows;
ids unique non-empty ≤ 64 chars; source text 1–500 chars (math validity
NOT required — bad rows load and show inline errors, as if typed);
`visible` boolean; `colorIndex` integer 0–5; `label` text ≤ 60 chars,
unique-when-set (case-insensitive); `domain` null or finite min below
max; `branches` null or ≤ 20 `{op, finite value, source}` entries with a
string default (empty branches demand a non-empty default); viewport
finite with max > min on both axes, flags boolean (coordinates beyond
the ±1e12 render fence are accepted; the view is clamped into the fence
on open — normalised, never rejected for this alone); file ≤ 256 KB;
unknown extra fields ignored. Parameters: 0–32 entries with valid
names, finite bounds (min below max, within ±1e9), step ≥ 1e-9, at most
100000 steps, and value/default inside range; duplicates rejected.
Newer `version` values are rejected outright, never guessed.
Legacy documents migrate forward: `v0` sketches, `v1` rows, `v2`
parameter-less files (all gain `kind: 'cartesian'` at v4), `v4`/`v5`
files (gain an empty `dataLab` bundle at v6); the registry
in `src/project/validate.ts` owns future paths. The shipped v1 example
file exercises the full chain on every test run.

## Data Lab bundle (v6)

Exactly what a saved analysis stores — method and settings, never
rounded display text, never telemetry (local files only; builders
make no network requests):

- `datasets[]` (≤20): `id`, `name` (≤60), `columns[]` (1–32:
  `id`, `name` ≤60, `type`, optional `unit` ≤24), `rows[][]`
  (≤10000, each matching the column schema; cells finite numbers,
  strings ≤5000, or null), `provenance` (`kind`, optional
  `fileName`, `importedAt`, `skippedEmpty`), optional `importOptions`
  (`delimiter`, `decimal`, `hasHeader` incl. null for auto-detect,
  `typeOverrides`), `cleaningLog[]` (≤200 `{action ≤80, detail ≤500}` —
  every transformation, in order), `missingSummary`
  (`nullsPerColumn[]`, `rowsWithMissing` — recomputed fresh at save;
  raw rows stay verbatim, sort/filter views never touch the store).
- `analyses{}` keyed by dataset id (unknown ids ignored on load):
  `plot` (kind, X/Y/series columns, title ≤200, labels ≤120, sort,
  grid, hidden series ≤32, bounds or null, log/linear scales,
  tick targets, `yError`/`xError` uncertainty mapping incl.
  asymmetric + fixed ≥0), `fit` (model incl. `none`, degree,
  Fit X/Y ids, weight mode/column/fixed-σ text), `fitResult` or null
  (`model`, full-precision `coefficients[]` ≤7, `degree`, `n`, `dof`,
  `skipped`, `rSquared` or null, `residualStd`/`rmse`/`mae`/`min`/`max`,
  `warnings[]` ≤20, `methodNote` — recomputed live on load and
  consistency-tested), `export` (`format` svg/png/csv, `scale`,
  `background`, `caption` ≤560, `csvTable` selector, `figureSize`
  S/M/L — absent in early v6 bundles, tolerated as `M`).
- Caps: pre-v6 files ≤256 KB; v6 ≤2 MB (datasets are user data in
  user-owned files; beyond that, export CSV and split). Over-wide,
  over-long, duplicate-id, and schema-mismatched bundles are refused
  with messages — never truncated, never guessed. Unknown extra
  fields are ignored.

## Split of state
- **In the file:** title, expressions (id/source/visible/colour/
  label/domain/branches/default), world bounds, equal-aspect, grid,
  parameters, and (v6) the Data Lab bundle above. Zoom overrides and
  other transient view state are NOT stored — reloads auto-fit (explicit
  bounds persist). Theme-independent.
- **In browser storage:** theme (existing key), panel open/width,
  crosshair (`graphcraft-prefs`); last session backup
  (`graphcraft-last-project`, restored when valid on startup,
  Data Lab included).
- **Never stored:** compiled evaluators, contexts, code, personal data.

## Flows
New / Open / Save-to-file live in the top bar with an `Unsaved`
indicator (snapshot string compare, Data Lab included). Destructive switches with unsaved
work go through Save/Discard/Cancel (focus on Cancel, Escape cancels).
Failed imports show a message and leave the graph untouched. Storage
failures (quota, private mode, corruption) degrade to notices — files
always keep working.

## Privacy and local storage

- No cloud, accounts, telemetry, analytics beacons, or network calls
  anywhere in the document path: builders (`figure.ts`,
  `csvExport.ts`, scene renderers) import no network surface, and user
  rows never enter diagnostics, history titles beyond their own labels,
  or external requests (there are none to receive them).
- Browser keys (all guarded, all degradable): `graphcraft-prefs`
  (panels/width/crosshair), `graphcraft-last-project` (crash backup
  incl. Data Lab), theme key. Quota/full/private-mode failures show a
  notice; files always keep working.
- Limits: 5 MB import text, 10k×32 datasets, 20 datasets per v6 file,
  2 MB project files, 2400px/6MP figure raster caps — every refusal
  states its number.
- Data-clearing controls: per-dataset Delete (explicit, undoable via
  history until removed), New project (workspace + Data Lab reset
  behind the dirty guard), and browser site-data clearing for the
  prefs/backup keys. No remote copy exists to clear.

## Example
`examples/quadratic-and-sine.graphcraft.json` — original demo
expressions (`x^2`, `sin(x)`), validated and sampled in
`src/project/project.test.ts`.
