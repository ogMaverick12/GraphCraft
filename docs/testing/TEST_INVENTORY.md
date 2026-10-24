# GraphCraft — Test inventory and regression protection (S7.3)

Purpose: make future changes less likely to silently break working
features. This document records the **actual** test files and discovered
case counts, which checklist areas they cover, which known repairs are
pinned by tests, how nondeterminism is controlled, and — just as
important — which paths are **not** covered by automated tests.

Method: counts were compiled from a machine-readable Vitest run
(`npx vitest run --reporter=json`, 2026-10-17) plus the S7.3 and S7.1
additions, confirmed by full runs of the tree (latest full run:
67 files / 697 cases, 2026-10-17, all green). Counts are
discovered cases, not estimates. Labels used throughout:
**TEST-VERIFIED** = executed here and green; **DOCUMENTED** = recorded
from the audit document that produced it.

> **Count update (2026-10-23):** the gated tree is now 89 files / 900
> cases (S8.1 full run, 0 failed, 0 skipped). The per-subsystem and
> per-file tables below are the historical S7.3 snapshot and have not
> been re-baselined; the new `src/tests/notices.test.ts` contributes
> 9 cases to the cross-cutting suite.

## What S7.3 changed

- **+2 files / +5 cases**: `src/app/stale-reads.test.tsx` (3) and
  `src/data/stale-reads.test.tsx` (2) pin the newest-pick-wins rule for
  async file reads and prove the unsaved-work guard reads the live flag
  (both guards are mutation-verified: deleting a guard turns its test
  red).
- **Two small guards** in `src/app/App.tsx` (`pickSeqRef`, `dirtyRef`)
  and `src/data/DataLab.tsx` (`fileSeqRef`): an older file read that
  resolves late can no longer replace newer input. This was the one
  real staleness hole found by the audit below.
- **One order-dependent test stabilised** (found by the shuffle probe,
  see the flake audit below): `src/data/workflow.test.tsx` now awaits
  the real calculator control instead of the pre-Suspense `main` shell.
  Assertions are unchanged — the wait is strictly stronger.
- **Nothing deleted or weakened**: every previously passing case still
  runs. All 686 cases execute green (0 skipped).

## How to run

- Full suite: `npm test` (Vitest 4, jsdom; ~2 min on the dev machine).
- One area: `npx vitest run src/<area>` (e.g. `src/math`).
- Gates around it: `npm run typecheck`, `npm run lint`, `npm run build`.
- Benchmarks are separate by design: `src/perf/*.bench.ts` are not
  `*.test.*` files and never run in the suite.
- Configuration (`vite.config.ts`): `maxWorkers: 2` and a 30 s per-test
  timeout, documented for math-heavy suites contending on 4-core
  machines. **No retries are configured anywhere** — a flake is
  investigated, never re-run until green.

## Inventory — 67 files, 699 cases (all passing, 0 skipped)

Upkeep note: S7.1 (2026-10-17) added `src/project/prefs.test.ts`
(5 cases) and three graph-engine hostile cases; CI quality-gate
hardening (2026-10-17) added `src/tests/license-check.test.ts`
(3 fixture-driven cases for the CI licence guard); S7.4 (2026-10-18)
added two axis-vs-surface contrast gate cases
(`src/tests/contrast.test.ts`); the totals below reflect the 699-case
tree, verified by a full green run.

### By subsystem

| Subsystem | Files | Cases |
|---|---:|---:|
| Data Lab — `src/data` | 11 | 130 |
| Calculator — `src/calculator` | 8 | 102 |
| 3D & fields — `src/viz3d` | 4 | 63 |
| Learn — `src/learn` | 5 | 56 |
| Math engine — `src/math` | 2 | 57 |
| Expressions — `src/expressions` | 6 | 51 |
| Analysis — `src/analysis` | 2 | 41 |
| Sampling — `src/sampling` | 3 | 36 |
| Project/persistence — `src/project` | 4 | 39 |
| Graph & coordinates — `src/graph` | 4 | 29 |
| Offline/PWA — `src/offline` | 5 | 28 |
| Export — `src/export` | 2 | 21 |
| Cross-cutting — `src/tests` | 4 | 21 |
| Parameters — `src/parameters` | 2 | 14 |
| App shell — `src/app` | 3 | 6 |
| UI primitives — `src/components/ui` | 1 | 3 |
| Storage — `src/storage` | 1 | 2 |
| **Total** | **67** | **699** |

### All test files (cases per file)

- `src/analysis/` — `analysis.test.ts` 23, `integration.test.tsx` 18
- `src/app/` — `offline-workspace.test.tsx` 1, `stale-reads.test.tsx` 3, `workspace-boundary.test.tsx` 2
- `src/calculator/` — `acceptance-probe.test.ts` 1, `calculator-ui.test.tsx` 11, `calculator.test.ts` 15, `domains.test.ts` 11, `format.test.ts` 6, `structured-ui.test.tsx` 14, `structured.test.ts` 33, `uncertainty.test.ts` 11
- `src/components/ui/` — `dialog-focus.test.tsx` 3
- `src/data/` — `csvExport.test.ts` 9, `datalab.test.tsx` 15, `figure.test.ts` 10, `fits.test.ts` 17, `import.test.ts` 19, `perf.test.ts` 3, `plot-ui.test.tsx` 23, `plots.test.ts` 19, `prepare.test.ts` 8, `stale-reads.test.tsx` 2, `workflow.test.tsx` 5
- `src/export/` — `export-dialog.test.tsx` 4, `export.test.ts` 17
- `src/expressions/` — `compile.test.ts` 12, `implicit-ui.test.tsx` 5, `model.test.ts` 9, `parametric-ui.test.tsx` 9, `plotting.test.tsx` 9, `stage2.test.tsx` 7
- `src/graph/` — `coordinate.test.ts` 12, `graphview.test.tsx` 6, `navigation.test.tsx` 9, `palette.test.ts` 2
- `src/learn/` — `curriculum.test.ts` 7, `learn-ui.test.tsx` 15, `library.test.ts` 23, `practice-ui.test.tsx` 5, `practice.test.ts` 6
- `src/math/` — `expression.test.ts` 50, `piecewise.test.ts` 7
- `src/offline/` — `inject-sw-assets.test.ts` 3, `offline-version.test.ts` 4, `offline.test.tsx` 3, `policy.test.ts` 3, `sw.test.ts` 15
- `src/parameters/` — `parameters.test.ts` 6, `sliders.test.tsx` 8
- `src/project/` — `datalab.test.ts` 5, `persistence.test.tsx` 8, `prefs.test.ts` 5, `project.test.ts` 21
- `src/sampling/` — `implicit.test.ts` 10, `parametric.test.ts` 5, `sampler.test.ts` 21
- `src/storage/` — `theme.test.ts` 2
- `src/tests/` — `contrast.test.ts` 10, `license-check.test.ts` 3, `smoke.test.tsx` 2, `workspace.test.tsx` 6
- `src/viz3d/` — `fields.test.ts` 16, `surface.test.ts` 22, `surfaceSvg.test.ts` 3, `viz3d.test.tsx` 22

## Coverage by checklist area

### Unit — numerical evaluation, sampling, statistics, algebra, formatting

- Expression engine: `math/expression.test.ts` (50; includes a hostile
  input table via `it.each` and a wall-clock ceiling), `compile.test.ts`
  (12), `piecewise.test.ts` (7), `model.test.ts` (9).
- Sampling: `sampling/sampler.test.ts` (21 — adaptive refinement, poles,
  cancellation), `parametric.test.ts` (5), `implicit.test.ts` (10).
- Calculator & structured lanes: `calculator.test.ts` (15), `domains`
  (11), `structured.test.ts` (33 — complex/vector/matrix/statistics),
  `uncertainty` (11), `format` (6), `acceptance-probe` (1).
- Data processing: `import` (19), `prepare` (8), `fits` (17), `plots`
  (19), `csvExport` (9), `figure` (10).
- Coordinates/palette surface math: `graph/coordinate` (12),
  `graph/palette` (2). 3D/field math: `surface` (22), `fields` (16).

### Integration — workspace state ↔ engines ↔ rendering

- `analysis/integration.test.tsx` (18): function → roots/intersections/
  extrema/tangent/integral → on-graph markers → export scene & SVG.
- `data/plot-ui.test.tsx` (23): plot → mapping/bounds → fit →
  diagnostics → export figure from the live view.
- `data/workflow.test.tsx` (5): cross-workspace independence, dirty
  guard through Data Lab, calculator stats without Data Lab side effects.
- Expressions ↔ UI: `plotting` (9), `stage2` (7), `parametric-ui` (9),
  `implicit-ui` (5). Graph interaction: `graphview` (6),
  `navigation` (9). Workspaces: `datalab` (15), `calculator-ui` (11),
  `structured-ui` (14), `viz3d` (22). App shell: `smoke` (2),
  `workspace` (6), `dialog-focus` (3).

### Persistence — round trips, migrations, invalid files, settings

- `project/project.test.ts` (21): serialize/validate round trips,
  malformed JSON, wrong tags, version v0→v6 migrations, size/count caps,
  reserved names, example file.
- `project/persistence.test.tsx` (8): save/open round trip through the
  UI, invalid file rejected without touching the graph, unsaved-work
  guard (Save/Discard/Cancel), backup restore, corrupted backup notice,
  storage-throw degradation.
- `project/prefs.test.ts` (5, added by S7.1): guarded preferences —
  corrupted JSON resets to defaults with a notice, blocked reads and a
  missing `localStorage` degrade honestly, failed writes return false.
- `project/datalab.test.ts` (5): v6 analysis round trip, fit-config
  consistency after restore, v4→empty migration, oversize refusal.
- Settings preservation: theme (`storage/theme.test.ts`), Data Lab
  export settings (`datalab` v6 tests), Learn annotations/bookmarks
  (`learn` + `project` tests), surfaces/fields/scatters (`viz3d` 22).

### Export — contents, validity, dimensions, markers, labels, download

- `export/export.test.ts` (17): scene → SVG structure and validity,
  chrome-free markup, XML escaping of hostile text, `viewBox` scaling,
  filename sanitisation + traversal guard, scale/dimension caps, PNG
  encoder bytes and dimensions, bad-dimension refusal, canvas painting
  (background/grid/curves/labels/legend), transparent clear, region
  fill and tick/title parity between SVG and canvas, zlib stored-block
  fallback, canvas-unavailable → null.
- `export/export-dialog.test.tsx` (4): download anchor path (byte flow),
  sampler-warning disclosure, PNG-unavailable message, disabled state.
- `data/figure.test.ts` (10): pixel dimensions, capped scales, labels
  and captions inside the frame. `viz3d/surfaceSvg.test.ts` (3):
  surface SVG structure. `analysis/integration`: markers into scene +
  SVG.
- Honest scope note: jsdom has no real canvas — the PNG *encoder's*
  bytes are decoded and asserted (TEST-VERIFIED), while true
  screen-level pixel rendering remains browser-manual.

### End-to-end journeys

- `expressions/plotting.test.tsx` (9): the numbered acceptance journey
  (add x² → two curves/colours → hide/show → edit with stable identity →
  parse-error honesty → 1/x asymptote gap → delete → no empty/duplicate
  rows → typing settle/debounce).
- `data/datalab.test.tsx` (15): open → paste/file/manual entry →
  preview with full accounting → commit; Excel refusal.
- `data/plot-ui.test.tsx` (23) and `export` suites: plot → analyse →
  export loops. `project/persistence.test.tsx` (8): save → open →
  export journeys. `analysis/integration.test.tsx` (18): analysis →
  markers → export.

### Stale computations and cancellation

- Samplers: `sampler` and `implicit` each have an
  cancellation/staleness test ("honours cancellation…").
- Analysis: stale snapshots flagged/hidden after function edits,
  selection changes, and integral invalidation
  (`analysis/integration.test.tsx` ~129/205/251 and tangent tests).
- Data: "recomputes CSV residuals at export time instead of serving
  stale results" (`plot-ui` 272).
- Project/CSV **file reads** (added this task): newest pick wins, a
  late older read is dropped, a late stale error is dropped, and the
  unsaved-work guard consults the **live** dirty flag
  (`app/stale-reads.test.tsx`, `data/stale-reads.test.tsx`). Both
  guards were mutation-checked: removing one turns its test red.

### Boundaries and failure paths (representative, not exhaustive)

- Caps: vector/matrix, grid, piecewise branches, undo history, import
  rows/cols, upload 8 MB, project 2 MB, figure scale and dimensions,
  surface resolution, zoom limits.
- Storage: corrupted prefs/backup notices, blocked reads, missing
  `localStorage`, failed writes (`project/prefs` 5, `persistence`).
- Empty/malformed: empty datasets refused, headerless/malformed CSV,
  bad JSON, wrong project tag/version, invalid ranges/colours/branch
  syntax, empty plots.
- Unsupported: `.xlsx` import refusal with guidance, non-scalar
  graph-send refusal, variable-bearing calculator input refusal.
- Hostile input: expression hostile table, calculator hostile probes,
  hostile SVG text escaping, CSV formula-injection guards.

### Regression pins for earlier repairs (selected)

| Repair (stage) | Pinned by |
|---|---|
| Learn batch-add dropped all but the last template row (LEARN-01) | `learn-ui`: "opens templates as additive editable copies…" |
| Fit overlay off-screen/log-space and suppression (S4.4, ADR-031) | `plot-ui`: "keeps the fitted curve finite when Y is logarithmic", "excludes non-positive values on log scales…", "hides the fitted curve on bar plots…" |
| Stale analysis results after edits/selection (S7.2 item 5) | `analysis/integration`: stale-flag tests; register in `docs/math/AUDIT.md` |
| 22 S7.2 math fixes (incl. Neumaier summation, complex division, PNG fallback, tick anchoring, 3D painter order) | per-item in `docs/math/AUDIT.md` close-out; suites `calculator/structured`, `export`, `viz3d`, `math` |
| Focus trap/restore in dialogs (S7.2 a11y) | `dialog-focus` (3) |
| Theme-switch transition suppression (S7.2 a11y) | `storage/theme`: "suppresses transitions while the palette actually changes" |
| Failed workspace chunk blanked the app (S7 offline) | `app/workspace-boundary` (2) + `app/offline-workspace` (1) |
| Vite `Vary: Origin` missed cached chunks offline | `offline/sw.test.ts` `ignoreVary` assertion (line 149) |
| 5xx outage treated as offline for navigations | `sw.test.ts`: "serves the last-known shell when the server answers 5xx…", "passes a 5xx through for non-navigation requests…" |
| Corrupt cache / refused Cache API degradation | `sw.test.ts` corrupt-cache + "degrades to plain networking…" |
| Stale project/CSV file reads (S7.3, this task) | `app/stale-reads` (3) + `data/stale-reads` (2), mutation-verified |

## Flake audit — nondeterminism, timing, environment

Facts (all TEST-VERIFIED on 2026-10-17):

- **No retries** configured anywhere (config, CLI, per-test).
- **No `Math.random`** in any test. `Date.now`/`performance.now` appear
  only in four wall-clock **ceilings** with generous slack: engine eval
  < 1 s, slider drag < 5 s, surface SVG < 15 s, perf fixture < 20 s —
  each ceilings a ms-scale operation (heaviest measured op tens of ms,
  `docs/perf/PROFILING.md`).
- **No fixed sleeps**: all async waits are condition-based
  (`findBy*`/`waitFor`/`vi.waitFor`), used in only three files.
- **Isolation**: `afterEach` cleanup + dark/theme-switch class removal +
  `localStorage.clear()` (`src/tests/setup.ts`); per-file module
  isolation; jsdom per file.
- **Contention**: `maxWorkers: 2` + 30 s timeout are deliberate and
  documented — parallel math suites on small machines, not weak
  assertions.
- **Order-dependent failure found and fixed (shuffle probe)**: the
  first `--sequence.shuffle` run failed one test — `data/workflow.test.tsx`
  › "computes calculator statistics…". Root cause: the test awaited
  `findByRole('main', { name: 'Calculator' })`, which matches the
  workspace shell while the "Loading calculator…" Suspense fallback is
  still showing; the next synchronous `getByRole('stats mode')` could
  then lose the race to the lazy chunk. Fixed file order hid it because
  an earlier test in the same file had already loaded the chunk. Fix:
  await the real control
  (`user.click(await screen.findByRole('button', { name: 'stats mode' }))`);
  no assertion removed. Seed-locked evidence: seed `1792232694899`
  failed before the fix and passed after; two fresh seeds
  (`1792232905310`, `1792232916375`) passed; the full shuffled suite
  (seed `1792233060924`) passed 65 files / 686 tests.
- **Evidence of stability (final tree)**: full suite in fixed order
  65 files / 686 tests green; full suite shuffled (seed `1792233060924`)
  green; targeted runs and a JSON-reporter inventory run also green.
  Post-S7.1 full run (2026-10-17): 66 files / 694 cases green in fixed
  order; the eight added cases are deterministic (no clock, no
  randomness). Post-CI-hardening full run (2026-10-17): 67 files /
  697 cases green in fixed order; the three added cases spawn a local
  Node subprocess against temp-dir fixtures (no clock, no network).
  This is evidence on this machine, not proof that rarer flakes cannot
  exist.

Known environment behaviours that are **asserted, not ignored**: jsdom
"Not implemented" console lines for canvas/navigation are expected
noise; canvas-dependent behaviour is asserted as explicit fallbacks
(`canvas unavailable → honest message`, `returns null`).

## Known coverage gaps (honest, non-exhaustive)

1. **Real service worker + Cache API**: exercised manually in the
   browser only (`docs/offline/OFFLINE.md`); the automated worker tests
   run the real file in a `node:vm` sandbox with stub caches.
2. **True screen rendering**: SVG structure and PNG encoder bytes are
   pinned; what a GPU/canvas actually paints is browser-manual.
3. **OS input, screen readers, mobile/touch gestures**: manual only
   (`docs/a11y/`).
4. **Multi-tab SW update refresh offer**: source-verified only.
5. **Timing ceilings** are not benchmark guarantees across all hardware.
6. **No coverage-percentage tooling**: deliberate (no new dependency);
   coverage means the case-to-feature mapping above, not a number, and
   this document avoids claiming "comprehensive coverage".
7. **Async surfaces beyond file reads** (worker registration, download
   anchor timing) mutate no shared state in a race-prone way; they stay
   browser-manual.
