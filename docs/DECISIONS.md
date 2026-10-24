# GraphCraft — Decisions

## ADR-001: React + TypeScript + Vite foundation
- Status: proposed (no existing stack; repo empty).
- Reason: matches product brief preference; fast dev, strong typing for math correctness, broad maintenance.
- Consequence: FND-01 scaffolds with strict TS, Vite build, Vitest harness.

## ADR-002: Tailwind CSS + shadcn/ui for UI
- Status: proposed, to be added deliberately at FND-02.
- Reason: matches brief; utility styling + accessible component primitives for quiet premium UI.
- Consequence: audit versions/licences before adding; do not restyle wholesale later without migration note.

## ADR-003: Purpose-built graphing/coordinate layer
- Status: accepted as rule.
- Reason: equation plotter needs precise control of sampling, discontinuities, transforms; avoids heavy generic chart dependency.
- Consequence: Plotly.js only via explicit evaluation for Data Lab / advanced families.

## ADR-004: Wrapped math.js, never eval
- Status: accepted as rule.
- Reason: safe parsing with scoped capabilities, limits, worker isolation.
- Consequence: `eval` / `new Function` forbidden; wrapper owns timeouts, input caps, error taxonomy.

## ADR-005: Local-first, no mandatory backend/telemetry/AI
- Status: accepted as principle.
- Reason: free, offline-capable studio for students/researchers.
- Consequence: core path must pass with network disabled; no API keys.

## ADR-006: Docs maintained incrementally
- Status: accepted.
- Reason: constitution task establishes AGENTS.md + docs/ set; later tasks merge, never wholesale-replace useful material.

## ADR-007: Vite react-ts scaffold kept as-is (FND-01)
- Status: accepted 2026-10-14.
- Reason: empty repo, no stack to preserve. `create-vite@9.2.1` react-ts template gives React 19 + Vite 8 + strict-ready TS with zero migration cost.
- Consequence: scaffold files moved to repo root; `AGENTS.md` / `docs` preserved untouched.

## ADR-008: oxlint retained instead of adding ESLint
- Status: accepted 2026-10-14.
- Reason: scaffold default; MIT; maintained by the oxc project; an order of magnitude faster and sufficient for FND-01 rules (no `any` escapes, no unexplained disables).
- Consequence: `npm run lint` = `oxlint`, zero warnings.

## ADR-009: Tailwind CSS v4 + dependency-free Button primitive
- Status: accepted 2026-10-14.
- Reason: Tailwind v4 (MIT) via the official Vite plugin covers the light/dark neutral system with one dependency pair. Full shadcn/ui deferred: a single toggle button does not justify the component-registry overhead yet.
- Consequence: `src/components/ui/Button.tsx` documents shadcn-style intent; FND-02 re-audits shadcn adoption.

## ADR-010: Static SVG grid placeholder; canvas split undecided
- Status: accepted 2026-10-14.
- Reason: foundation must prove mount/build/test without starting GS-02/GS-03 early. A fixed-step SVG grid demonstrates the viewport region honestly; the SVG-vs-canvas split needs real path-count data from GS-02.
- Consequence: `src/graph/Viewport.tsx` plots no functions; `src/rendering/` stays reserved.

## ADR-011: MIT License for public open-source distribution
- Status: accepted 2026-10-21.
- Reason: public open-source distribution is confirmed; MIT is permissive, OSI-approved, compatible with all audited dependencies (MIT/ISC/Apache-2.0), and keeps reuse simple. Copyright is attributed to `ogMaverick12` from 2026.
- Consequence: `LICENSE` contains the standard MIT text with `Copyright (c) 2026 ogMaverick12`; `README.md` links to it, and package metadata declares SPDX `MIT`. This decision does not publish a release; the package remains `private` and no npm publication is implied.

## ADR-012: Token-driven design system, no shadcn yet (FND-02)
- Status: accepted 2026-10-14.
- Reason: `@theme inline` semantic tokens give one light/dark source of truth with two dependencies (Tailwind pair) instead of a component registry; three primitives cover the shell's real controls. Independent system, no product layout copied.
- Consequence: `docs/design/DESIGN_SYSTEM.md` records tokens; shadcn re-audit deferred until the control set outgrows primitives.

## ADR-013: mathjs number bundle behind an owned interface (GS-01)
- Status: accepted 2026-10-14.
- Reason: established parser (Apache-2.0, maintained) avoids hand-rolled precedence bugs; number-only bundle excludes Complex/Unit/Matrix types. Capability surface is decided by GraphCraft's AST gate, not library defaults (`log` overridden to base-10, `ln` added).
- Consequence: `src/math/engine.ts` owns compile/evaluate, limits, and the failure taxonomy; engine can be swapped without touching callers. Verified by 32 expression tests including hostile-input rejection.

## ADR-014: Adaptive midpoint sampler with probe-then-gap poles (sampler stage)
- Status: accepted 2026-10-14.
- Reason: fixed-step sampling wastes budget on lines and misses kinks/poles; error-driven refinement concentrates work where functions vary. Suspected poles are subdivided once and gapped only on persistent growth — roots resolve instead of cutting.
- Consequence: `src/sampling/sampler.ts` owns segments, caps, and diagnostics; renderer consumes segments opaquely and must never join them. Limits documented in `docs/sampling/ADAPTIVE_SAMPLING.md`.

## ADR-015: SVG viewport, no charting dependency (GS-02/GS-03)
- Status: accepted 2026-10-14.
- Reason: DOM text labels are accessible and DPI-sharp for free; Stage 1 point counts are trivial for SVG paths; declarative updates with memoized layers; no manual DPR code. Canvas-hybrid reserved behind profiling evidence.
- Consequence: `src/graph/` owns transforms, ticks, clipping, palette, and the SVG view; `useCurves` compiles once and resamples on view change. Trade-offs in `docs/rendering/RENDERER.md`.

## ADR-017: Guarded navigation with rAF-coalesced pan (navigation stage)
- Status: accepted 2026-10-14.
- Reason: unbounded zoom/pan could reach non-finite views and crash rendering; per-event resampling wastes budget. `clampWorldRect` (spans 1e-6…1e12, ±1e12 fence) makes every view renderable; rAF coalescing resamples once per frame; pinch reuses the same pointer pipeline with `touch-none` scoping so page scroll elsewhere is unaffected.
- Consequence: zoom controls, crosshair readout (text, not colour-only), and view label are real state; hover is transient and SR-silent by design (trace inspection is future work). Touch pinch is implemented but has no hardware/CI coverage — reported, not claimed.

## ADR-018: Files user owns, storage that degrades (persistence stage)
- Status: accepted 2026-10-14.
- Reason: local-first means no backend; documents must survive as files while chrome/preferences stay in guarded browser storage. Validation precedes any state replacement; newer versions are rejected, not guessed; bad-syntax rows load with inline errors (consistent with typing).
- Consequence: `src/project/` owns schema, validation+migrations, serialization, file helpers, and prefs; destructive switches go through Save/Discard/Cancel; quota/corruption surface as notices. Format documented in `docs/project/PROJECT_FORMAT.md`.

## ADR-019: Shared export scene, in-house PNG, no PDF (export stage)
- Status: accepted 2026-10-14.
- Reason: one renderer-neutral scene prevents live-viewport/duplicated drawing code and leaves data exports a clear path; SVG stays vector with no dependency; PNG needs no new dependency thanks to a minimal encoder; PDF has no reliable licensed implementation on hand and a renamed image would be dishonest.
- Consequence: `src/export/` owns scene, SVG/PNG renderers, filenames, and the dialog; figures use the fixed light theme; sampler warnings are disclosed; canvas-less environments get guidance. Documented in `docs/export/EXPORT.md`.

## ADR-016: Empty start with example chips (workspace integration)
- Status: accepted 2026-10-14.
- Reason: a blank graph with tappable `x^2` / `sin(x)` / `1/x` examples teaches the workflow without presenting any computed content as pre-existing; a preloaded demo would blur "empty" vs "loaded" and complicate the honest empty state.
- Consequence: `ExpressionList` owns the empty state + chips; adding selects the row; empty submits are no-ops.

## ADR-020: Structured piecewise over syntax; named functions deferred (Stage 2)
- Status: accepted 2026-10-14.
- Reason: branch conditions as data (op + finite value) cannot be ambiguous the way `|`-style expression syntax could, and every branch reuses the gated engine. Domains intersect the view before sampling; breakpoints split runs by construction. Named functions need an engine dependency graph, cycle diagnostics, and their own UI surface — a dedicated task, not a sidecar; the brief explicitly permits deferral.
- Reason: branch conditions as data (op + finite value) cannot be ambiguous the way `|`-style expression syntax could, and every branch reuses the gated engine. Domains intersect the view before sampling; breakpoints split runs by construction. Named functions need an engine dependency graph, cycle diagnostics, and their own UI surface — a dedicated task, not a sidecar; the brief explicitly permits deferral.
- Consequence: `src/math/piecewise.ts` + `PiecewiseEditor` implement first-match semantics; project format v2 carries label/domain/branches with v0/v1 migrations; functions return as a follow-up.

## ADR-021: Parameters as named values, templates generate rows (Stage 2)
- Status: accepted 2026-10-14.
- Reason: user parameters are declaration-vs-value separated (names compile, values sample), so slider ticks resample without reparsing; usage counts make dependents visible; templates only ever add rows, never rewrite them.
- Consequence: `src/parameters/` owns validation/store/sliders; format v3 carries parameters with migrations; no implicit equations, 3D, or symbolic algebra.

## ADR-022: Polar and parametric as discriminated rows (Stage 2)
- Status: accepted 2026-10-14.
- Reason: a `kind` union keeps cartesian fields off parametric rows (and vice versa) instead of an ambiguous optional-field soup; one `Evaluator | PointEvaluator` contract feeds both samplers into the same segment/renderer pipeline. Polar maps through x = r·cos θ (negative radii flip, documented); piecewise/domains stay cartesian-only, stated as a limitation.
- Consequence: format v4 carries per-kind rows with chained migrations; templates ship verified circle/ellipse/Lissajous geometry; no 3D surfaces or implicit curves.

## ADR-023: Marching-squares contours with honest approximation (Stage 2)
- Status: accepted 2026-10-14.
- Reason: implicit curves need zero-contour extraction without a symbolic solver; saddle disambiguation by sampled centres plus one refinement pass gives smooth, correct-looking contours within documented limits. Fills reuse run-length cell runs so figures stay light; fills render under axes and curves at fixed low opacity.
- Consequence: `src/sampling/implicit.ts` owns grid, contouring, and regions; `FieldEvaluator` composes two-variable compiles; format v5 carries per-kind rows; PDF-style exactness is never claimed.
- Reason: a `kind` union keeps cartesian fields off parametric rows (and vice versa) instead of an ambiguous optional-field soup; one `Evaluator | PointEvaluator` contract feeds both samplers into the same segment/renderer pipeline. Polar maps through x = r·cos θ (negative radii flip, documented); piecewise/domains stay cartesian-only, stated as a limitation.
- Consequence: format v4 carries per-kind rows with chained migrations; templates ship verified circle/ellipse/Lissajous geometry; no 3D surfaces or implicit curves.
- Reason: user parameters are declaration-vs-value separated (names compile, values sample), so slider ticks resample without reparsing; usage counts make dependents visible; templates only ever add rows, never rewrite them.
- Consequence: `src/parameters/` owns validation/store/sliders; format v3 carries parameters with migrations; no implicit equations, 3D, or symbolic algebra.

## ADR-024: Analysis overlays reuse the curve pipeline; markers are data (S2.5)
- Status: accepted 2026-10-15.
- Reason: tangent/normal lines are straight-line `Evaluator`/`PointEvaluator` objects sampled through the existing `useSampledCurves` path, so clipping, transforms, and export apply unchanged; point results (roots, intersections, extrema) travel as `AnalysisMarker` world-coordinate data rendered by shape (ring/diamond/triangle + label), never computed inside the renderer. Colour is never the only distinguisher (dashes for lines, shapes for markers).
- Consequence: `src/analysis/` owns numerics + panel + `useAnalysis` snapshots; `src/graph/markers.ts` owns the marker contract; `GraphView` draws only current, visible results — stale snapshots are suppressed on-graph while the panel discloses them with a recompute warning. Export scenes carry the same markers; no mandatory new dependency.

## ADR-025: Calculator reuses the engine; conventions rewrite to syntax (CALC-01)
- Status: accepted 2026-10-15.
- Reason: a second parser would drift from graphing semantics. The engine gains only additive, tested surface (`sinh/cosh/tanh`, integer-strict `factorial`/`!`); calculator-only conventions (`%` as strict per-operand `/100`, degree wrapping of trig calls) rewrite to engine syntax in `src/calculator/evaluate.ts` and are displayed as "computed as", so Rad mode and the graph can never disagree. Doubles throughout: history keeps internal values, display formats separately.
- Consequence: `src/calculator/` owns preprocessing, display policy, panel, and guarded persistence; calculator state is independent from Graph Studio; the sole bridge is the explicit send-to-graph action (values as constants, variable input as plotted expressions). No matrices/statistics/symbolic work in this stage.

## ADR-026: Structured calculator lanes are native; no new dependency (CALC-02)
- Status: accepted 2026-10-15.
- Reason: inspected library support first — the wrapped mathjs number bundle is real-only by design, and the full mathjs bundle would add hundreds of kilobytes plus a second, wider parse surface conflicting with the AST gate. Complex arithmetic, typed vectors/matrices with Gauss-Jordan elimination, and descriptive statistics are each small, exactly scoped, and fully testable natively, so no dependency was added.
- Consequence: `src/calculator/complex.ts`, `linalg.ts`, and `stats.ts` own their models with strict grammars and explicit caps (256-vector, 8×8 matrix); methods and conventions (arg branch, σ vs s, residual checks) travel with every result; structured results record into the shared history but never send to the graph. No symbolic CAS in this prompt.

## ADR-027: Units registry plus native rationals; symbolic engine deferred (CALC-03)
- Status: accepted 2026-10-15.
- Reason: thirteen common dimensions fit a data registry with an affine-temperature path — no library needed. For symbolic work, the installed mathjs full bundle was inspected (Apache-2.0, `simplify`/`derivative`/`rationalize`/`Fraction` present) but its algebra sources alone are ~253 kB unminified before their dependency closure, against our ~770 kB total bundle, for features no task requires; a third-party CAS had no verifiable licence evidence in-session. Exact rationals (the one verifiable symbolic-ish need) are native BigInt at zero cost.
- Consequence: `src/calculator/units.ts` and `rational.ts` ship with round-trip and fixture tests; `docs/math/SYMBOLIC.md` records the deferral with four reopen criteria (task need, verified licence, measured bundle delta, gated adapter with labelled output). No new dependency; `DEPENDENCIES.md` unchanged by design.

## ADR-028: Native CSV ingestion; Excel refused explicitly (DATA-01)
- Status: accepted 2026-10-15.
- Reason: CSV covers paste, files, and Excel re-saves with a ~200-line dependency-free parser under explicit delimiter/decimal/header choices. An `.xlsx` library was evaluated without installing: it would add app-scale bundle weight plus a macro/formula/link attack surface needing its own audit, for a format the task does not require. Treating `.xlsx` bytes as CSV would be silent corruption, so those files are refused with guidance instead.
- Consequence: `src/data/` owns the parser, dataset model, validation, store, and Data Lab view; datasets are session-only (file persistence is a `v6` format decision at a later gate); `.xlsx` support reopens on verified licence + maintenance + bundle evidence and a formula-injection test plan. No new dependency.

## ADR-029: Purpose-built data plots; Plotly.js evaluated and declined (DATA-02)- Status: accepted 2026-10-15.
- Reason: the DATA-02 brief requires a Plotly.js evaluation with version, licence, and trade-offs. Verified from registry metadata: plotly.js-dist 4.1.2, MIT, ~11.5 MB unpacked. Our whole app ships ~737 kB with the calculator lazy-split; adopting Plotly would multiply the download several-fold for scatter/line/bar/histogram families the existing coordinate layer (transforms, ticks, grid, palette, zoom pattern) already renders natively — plus a second theming and interaction model to restyle, audit, and maintain. No clear advantage was found for these families.
- Consequence: `src/data/DataPlot.tsx` renders series from resolved datasets on shared primitives; the decision reopens per chart family (contour, 3D, statistical plots) with the same measured comparison. No new dependency.

## ADR-030: Householder QR fitting; linearized nonlinear selection (DATA-03 + S4.4)
- Status: accepted 2026-10-15, extended 2026-10-16.
- Reason: least squares via normal equations squares the condition number — exactly how textbook code goes wrong on scaled data — so lines and bounded polynomials (degree ≤ 6) solve through Householder QR with rank detection and an R-diagonal conditioning check. S4.4 adds only the linearizable curves (exponential, logarithmic, power) through the same QR on log-transformed data with back-transforms — no iterative solver, no initial guesses to mis-set, no fake universal fit-anything control.
- Consequence: `src/data/fits.ts` owns the solver with hand-computed fixtures (exact exp/log/power recoveries + domain/singular tests); `FitPanel` shows equations, R² (null on constant Y), residual plot/table, overfit/domain/approximation warnings, and a causality disclaimer; overlays draw on scatter/line only (log-aware, bounds-clipped). Every nonlinear fit is labelled approximate with `converged: false`; failures are errors. No confidence intervals or p-values are claimed.

## ADR-031: S4.4 overlay honours the plot it draws on (2026-10-16)
- Status: accepted.
- Reason: a fit computed in data space but drawn in log space without the same log10 mapping produces off-screen garbage (observed −278k path on log-Y); a curve spanning the full data range ignores explicit bounds; a second scatter figure (residuals) breaks ambiguous test queries. Each is a real correctness/readability bug, not polish.
- Consequence: `DataPlot` maps `fitLine` through the same `toDisplay` log transform as series and drops non-positive/non-finite samples; `FitPanel` samples the curve over data∩explicit-bounds and drops non-positive X on log-X; bar/histogram suppression and fit-vs-plot mapping are stated in-panel; residual `plot` is memoized. No new dependency; session-only persistence kept and stated.

## ADR-032: One scene for every figure; v6 carries the analysis (S4.5)- Status: accepted 2026-10-16.
- Reason: per-chart-type export paths would quadruple renderer code and drift from the live view. The scene already owns grid/axes/ticks/curves/legend/background/caps/encoders — points, bars, whisker rules, title/caption/labels, and log power ticks extend it additively, so scatter/line/bar/histogram plus fit overlays export through one tested path. CSV needs quoting + formula guards, not a library. Project files must reproduce analyses, so v6 stores datasets (verbatim rows + import options + cleaning log + fresh missing census) with plot/fit/uncertainty/export settings and full-precision fit metadata; 2 MB cap keeps files ownable while refusing silently-truncated giants.
- Consequence: `src/data/figure.ts` maps current plot state to the scene (hidden series stay hidden, bounds/log apply); `src/data/csvExport.ts` serializes four selectable tables; `src/data/DataExport.tsx` builds from current props at click time (PDF refused with criteria); `dataLab` section persists with migrations v0–v5 and structural validation (recompute-on-load consistency tested). No new dependency; no telemetry; zoom overrides stay transient by design.

## ADR-033: Uncertainties displayed everywhere, weighted in one place (S4.6)- Status: accepted 2026-10-16.
- Reason: error bars and fit weights answer different questions — display (what was measured) vs inference (what counts). Auto-feeding display bars into fits would silently change results when users toggle appearance; a universal propagator would need covariance support we do not have. So bars stay display-only and row-matched, fits weight only through an explicit σ selector under the same w = 1/σ² convention as the calculator's weighted mean, and propagation stays first-order uncorrelated with every formula and refusal stated.
- Consequence: `plots.ts`/`DataPlot`/`figure.ts` render symmetric/asymmetric/fixed bars with counted omissions; `uncertainty.ts` owns the calculator lane (strict grammars, domain refusals, method notes); `stats.ts` gains SEM labelled as mean precision, never an interval; FitPanel states the display-only rule with a pinning UI test. No new dependency.

## ADR-034: Diagnostics describe, never certify (S4.7)- Status: accepted 2026-10-16.
- Reason: a single score (R², RMSE, or any other) invites model-validity claims no statistic can support, while hidden influence points invite silent data massaging. So every fit reports the full spread family (residual std ÷dof, RMSE ÷n, MAE, range) with dof shown, flags large residuals without touching them, and restates the descriptive-only policy beside the numbers — all recomputed live from current state and persisted at full precision.
- Consequence: `FitResult` carries `dof`/`rmse`/`mae` through fits, CSV, and v6 metadata (validators extended); the residual table flags |r| > 2σ rows and names the largest; misleading edges (constant Y) keep null-R² honesty with still-valid spread figures. No new dependency.

## ADR-035: Workspaces share nothing mutable (S4.9)- Status: accepted 2026-10-16.
- Reason: silent cross-talk (a calculator result leaking into a dataset, a view switch dropping edits) would corrupt analyses without a trace. Each workspace owns its store — graph rows, calculator history, datasets + analyses — and crosses only through explicit, labelled actions (send-to-graph, file save/open). View switches unmount views but never their stores; the dirty snapshot covers all three, so the guard cannot be bypassed from Data Lab.
- Consequence: `App.tsx` owns the three stores; `useDatasets` carries the analysis registry with loop-guarded reporting; tables cap at 200 displayed rows with counts; storage stays two guarded keys plus user files. No new dependency.

## ADR-036: Software-rendered 3D surfaces; no WebGL dependency (Stage 6)
- Status: accepted 2026-10-16 (no high-impact dependency introduced; nothing to approve).
- Evaluation: three.js 0.186.1 (MIT, actively maintained, ~20 MB unpacked / ~600 KB–1 MB treeshaken core) is the credible WebGL option, but it still needs bespoke surface sampling, orbit, colormap, and export code on top, plus a second interaction/theming model and a WebGL-required hardware gate. Plotly.js surface (MIT, ~11.5 MB, declined in ADR-029 for the same reasons) repeats the bundle and export-duplication cost. Neither removes the hard parts; both add them.
- Reason: a bounded software renderer (grid ≤ 128², painter-sorted quads, height colormap, NaN holes) draws through the same SVG/canvas conventions as every other figure, exports through the same path, works on any hardware with no fallback branch to maintain, and keeps the 2D renderer untouched in a separate mode.
- Consequence: `src/viz3d/` owns sampling, projection, and the 3D view; `z = f(x, y)` compiles through the existing two-variable engine gate (`variables: ['x', 'y']`); parametric 3D curves deferred with rationale; workers deferred pending measurement (16k evals complete in ms — documented, not assumed). Reopens only on measured need with the same bundle/licence/export comparison.

## ADR-036: Learn teaches through the same engine or not at all (LEARN-01)
- Status: accepted 2026-10-16.
- Reason: a template that shows something the math engine would not produce teaches falsehoods; copied textbook content risks licences and describes other tools' behavior. So every template is GraphCraft-original prose over engine-checked anchors (compiled and probed in tests), previews render through the real sampler, opening adds editable copies atomically (a batch-add fix this stage: sequential ref-mirror appends dropped all but the last row), and curriculum alignment is never claimed.
- Consequence: `src/learn/` owns types, validation, search, 42 templates, guarded bookmarks, and the quiet library UI; `App` gains a lazy Learn view plus additive open; contributor rules live in `docs/learn/ADDING_TEMPLATES.md`. No tutor, no remote fetching, no new dependency.

## ADR-038: Annotations are curated claims with a basis, not decorations (S5.2)
- Status: accepted 2026-10-16.
- Reason: auto-detected "features" (all roots, full domain, every asymptote) would assert what sampling cannot prove, and marker shapes borrow meaning — a ring says root, a triangle says extremum. So annotations are hand-authored per template with exact/numerical/heuristic bases verified in tests, graph markers are limited to root/extremum semantics with everything else text-only, transforms carry sign-honest notes pinned by numeric relation tests, and export inclusion stays an explicit choice.
- Consequence: `library.ts` verifies annotations and transform relations; cards show basis badges, preview markers, compare toggle, and graph-marker toggle; `App` carries template markers into the viewport and optionally into exports; selection persists in v6 (unknown ids tolerated). Analysis-basis taxonomy in `docs/learn/ANALYSES.md`. No tutor, no new dependency.

## ADR-039: Variants are distinct, duplicates are reviewed (S5.3)- Status: accepted 2026-10-16.
- Reason: a growing catalog drifts toward near-duplicate entries (same equation, new title) that dilute search, while legitimate variants (same formula, different domain or objective) must survive any audit. Byte-identical row signatures flag only true duplicates for human review; holes stay unauthored because single-point gaps fall below sampler resolution — documented instead of faked.
- Consequence: `auditDuplicates` runs in the curriculum suite (currently clean); contributor guide bans hole templates and alignment claims. No new dependency.

## ADR-040: Practice checks decide; exploration doesn't score (S5.4)
- Status: accepted 2026-10-16.
- Reason: a green "correct" from fuzzy matching teaches students to trust the tool over the math, while scores and accounts turn practice into surveillance. So correctness comes only from stored indices and tolerance-bounded numeric sets (with stated out-of-scope limits like equivalent algebraic forms), exploration items physically cannot produce a verdict, answers hide behind an explicit control, and progress is local-only with stateless degradation.
- Consequence: `practice.ts` owns items, validation, and checking; `PracticeMode` wires topic picking, keyboard-native inputs, aria-live feedback, and additive graph opens; transform cards gain compare-both opens (base labeled original) with live-slider guidance in prose. No accounts, scores, analytics, or AI. No new dependency.

## ADR-037: Topics reference, lessons resolve (S5.1)
- Status: accepted 2026-10-16.
- Reason: copying template content into per-topic lessons would fork the catalog (edits drifting apart), while a rigid tree would force each example into exactly one pedagogical slot. References plus a resolver give multi-topic examples, machine-checked coverage (orphan detection), and cycle-proof prerequisite trails from one static source each.
- Consequence: `topics.ts` holds twelve topics with levels and DAG prerequisites; `curriculum.ts` validates refs/cycles and resolves lessons plus foundations-first paths; the Learn view browses topics with clickable prerequisite trails. Content architecture in `docs/learn/CONTENT_MODEL.md`. No new dependency.

## ADR-042: Hand-authored offline worker; no PWA dependency (offline pass)

- Status: accepted 2026-10-16.
- Evaluation: `vite-plugin-pwa`/Workbox would add a maintained but
  non-trivial dependency (bundle + config surface + its own update
  semantics to audit) for a cache policy small enough to own: two fetch
  lanes, a versioned shell list, and wait-then-user-refresh updates.
- Reason: the project already owns its export encoder, CSV parser, and
  QR solver dependency-free; a ~120-line worker plus manifest keeps the
  offline boundary reviewable in one sitting, with the version pinned
  by test and user data explicitly outside the Cache API.
- Consequence: `public/sw.js` + `public/manifest.webmanifest` ship in
  `dist/`; `src/offline/` owns version, lane policy, registration, and
  the online hook with unit tests; real worker behaviour follows the
  manual protocol in `docs/offline/OFFLINE.md`. Reopens if the policy
  outgrows hand maintenance (background sync, push, or per-route
  strategies) with the same licence/bundle/update comparison.

## ADR-041: A few tested tools, never a statistics menu (S6.4)
- Status: accepted 2026-10-16.
- Reason: every new statistic is a new way to be wrong (mismatched rows, padded windows, implied causation). The subset rule admits only what ships with definitions, denominators, refusals, and reference tests: paired covariance/correlation and moving averages qualified; z-scores and general transforms deferred for lack of a UI home and testable acceptance criteria — not ability.
- Consequence: `stats.ts` owns the definitions (position-matched pairs, full-windows-only, causation disclaimed on every figure); raw inputs stay immutable (pure functions, calculator never mutates); no persistence change (history stores display + method strings); histograms/descriptives/residuals/derived-columns already covered their candidates. No new dependency.

## ADR-043: Precache the whole build from the real build output (S7 offline hardening)

- Status: accepted 2026-10-17.
- Reason: the v1 worker precached only the shell, so a lazily loaded workspace failed offline until first visited (a blank app on a failed chunk import). Three findings from live verification shaped the fix: (1) the asset list must come from the real build, so `scripts/inject-sw-assets.mjs` replaces a `BUILD_ASSETS` marker in `public/sw.js` during `npm run build` and fails loudly if the marker, `dist/`, or the asset list is missing — no hand-maintained list to rot, no new dependency; (2) Vite preview sends `Vary: Origin` on assets, so install-time entries (stored without `Origin`) were missed by module-script fetches (sent with `Origin`) — every worker cache read now uses `ignoreVary: true`, pinned by a regression test against the real worker source; (3) a gateway reporting a dead origin as an HTTP 5xx response (not a fetch rejection) made navigations go online-first — navigations now treat `status >= 500` as an outage and fall back to the cached shell, while non-navigation requests pass 5xx through unchanged.
- Consequence: one online load precaches the shell plus every build bundle (11 entries observed live, all lazy chunks included); a failed workspace chunk shows an in-app boundary (“…could not load its code… reload the page once”) instead of a blank app; an empty cache offline gets honest 503 text, never a hang; `controllerchange` surfaces Refresh only when the page already had a controller; update-apply falls back to a plain reload if the worker vanished; version bumped `v1`→`v2` (cache purge observed live). The worker keeps `typeof caches` guards and best-effort install; user data still never enters the Cache API. Evidence: browser protocol + measurements in `docs/offline/OFFLINE.md` and the same-date `docs/QUALITY_GATES.md` entry.

## ADR-044: Readable chart greys, marker count on the viewport label, real Tab containment (S7.4)

- Status: accepted 2026-10-18.
- Reason: the graph and plot axes (`--gc-axis`) measured 2.52:1 (light) / 2.29:1 (dark) against their chart surfaces — below the 3:1 bar for meaningful non-text graphics — and the fixed-light visualisation canvases (3D surface, field, Learn previews) plus the SVG/PNG export chain mirrored the old light value, leaving ticks at 4.7976:1 and axis strokes at 2.52:1 on white. The narrow-screen drawer was the one overlay without Tab containment (the dialog hook had it; the drawer did not). Re-measurement also corrected the earlier note that root-marker `<g aria-label>` elements are exposed: they sit inside the `role="img"` viewport svg and are pruned from the accessibility tree — the roots' values already reach AT through the analysis live region, but the viewport summary itself never mentioned the markers.
- Consequence: light `--gc-axis` `#a8a29e`→`#8e8985` (3.46:1 on surface, 3.31:1 on `bg`), dark `#57534e`→`#78716c` (3.65:1 surface, 4.12:1 `bg`); Viz3D/Field/Learn canvases and the export literals carry the mirrored light value (`#8e8985` axes, `#736c67` ticks at 5.15:1 on white — the white 3D canvas itself stays, export parity). `src/tests/contrast.test.ts` gains an axis≥3:1 gate (both surfaces, both themes) so the bar cannot silently regress; the faint grid strokes stay decorative and unasserted (stated in the test header). The drawer panel reuses `containTabFocus` from `useDialogFocus.ts` (jsdom covers both directions; a 380 px real-page check covers Tab/Shift+Tab and the Escape focus-return). The viewport summary appends “, N markers on the plot” when markers are placed; marker `<g>` labels + `<title>` stay as hover tooltips (inert for AT by design). Deliberate non-changes recorded in the audit: decorative 1.08–1.20:1 grids, `role="application"` viewers, non-`inert` dialog backgrounds, unannounced Data Lab dataset commits.
