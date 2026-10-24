# GraphCraft — Roadmap

## Stage 0 — Constitution (this task) — status: in progress
- Repo audit, baseline proposal, docs: AGENTS.md, PRODUCT_SPEC, ARCHITECTURE, ROADMAP, DECISIONS, DEPENDENCIES, QUALITY_GATES.
- Gate: docs merged, no app code, audit reported, next module identified.

## Stage 1 — Foundation + dependable 2D Cartesian graphing
- FND-01: Vite + React + TypeScript scaffold, lint/type/test harness, README, licence. Gate: `build`, `typecheck`, `lint`, `test` green on clean clone.
- FND-02: Tailwind + theme (light/dark) + base components. Gate: theme toggle, keyboard reachable, no dead controls.
- GS-01: math-core expression wrapper (safe parser, limits) + deterministic fixtures. Gate: fixture suite with tolerances.
- GS-02: coordinate layer (world↔screen, ticks, viewport). Gate: transform round-trip tests.
- GS-03: single-function Cartesian renderer + viewport interaction. Gate: sampled-path snapshot tests, graceful error states.

## Stage 2 — Richer equation graphing + numerical analysis
- GS-04: multi-function, domain restrictions, discontinuities. Gate: discontinuity fixtures.
- GS-05: trace / intercept / extremum numerical tools with honest uncertainty labels. Gate: tolerance-bounded tests.
- S2.5 numerical analysis (complete 2026-10-15): roots (bracket + |f| fallback), intersections, extrema, central-difference derivatives, tangent/normal overlays, adaptive-Simpson integrals — all as labelled estimates with method notes, per-tool visibility, and stale-snapshot suppression on-graph. Gate: 15 numerical unit tests + 12 integration tests; `typecheck`, `lint`, `test`, `build` green.

## Stage 3 — Scientific calculator
- CALC-01 (complete 2026-10-15): calculator workspace reusing the math engine (extended additively with integer-strict `factorial`/`!` and `sinh/cosh/tanh`); percent-as-/100 and degree-mode rewrites shown as "computed as"; double-precision display policy; persisted history with configurable limit; explicit send-to-graph (constants) / plot-expression (variable input); 19 calculator tests. No matrices/statistics/symbolic work.
- CALC-02 structured modes (complete 2026-10-15): native dependency-free complex (rectangular, arg branch (−π, π], integer powers), vector (dot, 3D cross, norms), matrix (≤8×8, Gauss-Jordan det/inverse/solve with singularity diagnostics), and statistics (labelled σ vs s) lanes with strict grammars, shared history, and method notes; 20 structured tests. No symbolic CAS.
- CALC-03 units + exact rationals (complete 2026-10-15): thirteen-dimension unit registry with affine-temperature path, incompatible-dimension refusal, and exactness notes; native BigInt rational arithmetic beside decimal display; full symbolic engine evaluated and deferred with criteria (`docs/math/SYMBOLIC.md`). No new dependency, no tutor/AI service.
- S3.3 scientific functions (complete 2026-10-15): general-base `log(x, base)`, half-away `round`, floored `mod`, integer-strict `permutations`/`combinations`; fixed silent `log(x, base)` ignore and `7%3`-as-division; keypad + help + syntax docs.
- S3.4 formatting (complete 2026-10-15): scientific-notation parse/display, selectable 6–12 significant digits (display only), ≈ fraction toggle (continued fractions, denominator ≤ 1000, always labelled), exact-vs-approximate policy, near-zero honesty, round-trip fixtures.

## Stage 4 — Data Lab
- DATA-01+: import, scientific plots, regression, uncertainty, export. Plotly.js evaluation gate (if proposed).- DATA-01 ingestion (complete 2026-10-15): native CSV parser (quoted fields, CRLF/BOM, `,`/`;`/tab), paste/file/manual-grid inputs, preview-before-commit with header auto-detect + user override, strict decimal rules, ragged/malformed/mixed accounting with counts, 5 MB / 10k×32 caps refused (never truncated), `.xlsx` explicitly refused with guidance, failed imports and cancel commit nothing; 21 ingestion tests. No regressions or plotting.
- DATA-02 plotting (complete 2026-10-15): scatter/line/bar/histogram on the shared coordinate layer, logically separate from equation plotting; column mapping with series split, explicit bounds, sort control, legend toggles, zoom/reset, hover titles, tabular alternative; Sturges bins documented; synthetic demo dataset labelled; Plotly.js evaluated (4.1.2, MIT, ~11.5 MB) and declined in ADR-029; 18 plotting tests. No fitting, no error bars.
- DATA-03 fitting (complete 2026-10-15): OLS lines + polynomials (degree ≤ 6) via Householder QR with rank/conditioning checks; equation, R² (null on constant Y), residual summaries, overfit warnings, causality disclaimer; overlays on scatter/line only; copy + persistent configuration; 12 fitting tests. No nonlinear models, no inference intervals.
- S4.2 preparation (complete 2026-10-15): editable dataset tables with sort/filter views, column rename/retag/units, missing strategies (drop/fill-constant/fill-mean), engine-validated derived columns over stable ids, 20-deep undo plus source restore, unit-aware axis labels; 14 preparation tests.
- S4.3 plot builder (complete 2026-10-15): gap-breaking line segments, log axes with power ticks, per-series shapes/dashes/legend glyphs, tick-count and axis-label controls, grouped-only bars, single-dataset scope; 8 plot-builder tests.
- S4.4 regression hardening (complete 2026-10-16): OLS line + poly 2–6 plus documented linearized nonlinear selection (exponential, logarithmic, power via log transforms + back-transform, domain-counted, always approximate-labelled); genuine 1/σ² weighting, residual plot + table, log-aware overlay with explicit-bounds intersection, bar/histogram suppression note, fit-vs-plot mapping disclosure; interrupted-edit repair + log overlay + test scoping; session-only persistence stated. No universal solver, no iterative MLE, no inference intervals.
- S4.5 export + reproducibility (complete 2026-10-16): one shared scene path for every chart kind (points/bars/whiskers/fit/title/caption/legend via scene primitives + log power ticks), SVG/PNG through existing renderers with explicit dims + caps, formula-safe CSV for four selectable tables, PDF refused with criteria; v6 project bundle (datasets + import options + cleaning log + missing census + plot/fit/uncertainty/export settings, full-precision fit metadata, 2 MB cap, migrations v0–v5); session restore + save/open round-trip; no new dependency, no telemetry.
- S4.6 measurement uncertainty (complete 2026-10-16): Y/X error bars (symmetric column, asymmetric +/− columns, fixed value) with row-matched series mapping, counted omissions, and display-only honesty vs fit weights; calculator uncertainty lane (uncorrelated first-order +/−/×/÷/power propagation, inverse-variance weighted means, strict grammars, stated assumptions/limits) + SEM in the stats lane (never an interval); reference + UI tests throughout.
- S4.7 diagnostics + interpretation (complete 2026-10-16): RMSE/MAE/dof alongside residual std, outlier flags (>2σ, largest stated, never removed), per-metric descriptive honesty, live recompute on every change; reference + UI tests for alignment, metrics, updates, and constant-Y honesty.
- S4.8 figure export polish (complete 2026-10-16): figure size presets S/M/L (persisted, early-v6-tolerant), transparency proof, in-frame clipping tests, download-wiring UI coverage, fixed-controlled margins documented; no new dependency.
- S4.9 projects, workflow + integration (complete 2026-10-16): v6 save/restore wired through dirty guard + session backup, workspace switching without state corruption, calculator independence with explicit bridges, keyboard/responsive checks (Escape, focus, 200-row table cap), 10k-row perf coverage, storage/privacy + bundle docs; no new dependency.

## Stage 5 — Learn library
- LEARN-01 curated templates (complete 2026-10-16): 32 original graph templates across all ten categories (lines through calculus), each with stable id, topic/level tags, engine-checked anchors, recommended viewport, objective, and stated simplifications; search/filter by text, topic, level, and graph type; card preview through the real sampler; open-as-editable-copies (atomic batch add) with recommended-view button; local bookmarks with guarded storage; contributor guide with no-copying, no-alignment-claim rules. No tutor, no remote content, no new dependency.
- S5.1 topic taxonomy (complete 2026-10-16): 12 prerequisite-ordered topics over the template catalog (every template covered, cycle-checked DAG, foundations-first paths); topic browsing with prerequisite trails in the Learn view; lesson = resolved topic (no duplicated infrastructure); content/model docs; no new dependency.
- S5.2 annotations + learning aids (complete 2026-10-16): curated annotations (all ten kinds, basis-labelled, engine-verified) with preview markers + text equivalents, transform compare with sign-honest notes, graph markers (roots/extrema only) behind toggles, export-time inclusion choice, v6 persistence of the selection; no tutor, no new dependency.
- S5.3 catalog coverage (complete 2026-10-16): 42 templates (point-slope/intercept forms, vertex form, modulus variants, cosine, shifted exponential) across all ten categories; reflection notes on inverses; duplication audit with byte-identical detection; holes documented as unsupported; every new entry anchored, topicked, and verified; no new dependency.
- S5.4 learning workflows (complete 2026-10-16): practice mode (8 authored prompts, decidable checking only, show-answer flow, local progress with last-topic resume), transform compare-both opens with live-parameter guidance; original content, level labels, no accounts/scores/analytics/AI; no new dependency.

## Stage 6 — Advanced visualisation + performance
- ADV-01+: polar, parametric, implicit, contour, vector-field, 3D (gated per capability) + perf budgets.
- ADV-01 3D surfaces (complete 2026-10-16) bounded z = f(x, y) grids (24–120, cap 128) through the gated two-variable engine, software orbit/perspective projection with painter sorting, height colormap, NaN holes, resolution/domain/camera controls, SVG + fixed-2× PNG export, v6-tolerant project persistence; three.js evaluated and declined in ADR-036; parametric curves + workers deferred on measurement; 2D untouched in its own mode.
- ADV-02 2D fields (complete 2026-10-16): marching-squares contours (explicit/auto levels), viridis heatmaps with policy-selected scales + numeric legends, strided vector arrows (magnitude/unit) via the tested vector model; shared sampler family, one export path per format; streamlines deferred with rationale; function sources only (data grids deferred).
- S6.6 scientific visualisation (complete 2026-10-16): diverging zero-centred scale with labelled reference, 3D scatter of Data Lab observations (column mapping, skips, stated stride cap, SVG/PNG export, persisted configs); histograms cover distributions, pairwise r covers correlation, fits stay 2D-only by coordinate incompatibility; parametric 3D/matrix heatmaps/box plots/second-scalar deferred with rationale.
- Profiling baseline (complete 2026-10-16): `src/perf/` bench fixtures + `docs/perf/PROFILING.md` with measured means (heaviest single op: 128² surface at ~25 ms); workers/typed-arrays/decimation/canvas all considered and refused with reasons; no optimisation applied, none justified; limits table recorded.
- S6.4 analysis subset (complete 2026-10-16): paired covariance/correlation + moving averages in the stats lane (defined denominators, position-matched rows, full-windows-only, even-centered/non-finite/short refusals, causation disclaimed); histograms/descriptives/residuals/transforms already covered elsewhere, rest deferred; calculator state untouched (pure inputs, no persistence change).

## Stage 7 — Hardening + release
- Accessibility audit, offline polish, docs, packaging, licence finalisation (MIT confirmed 2026-10-21; see ADR-011).

## Status ledger
- FND-01: complete 2026-10-14. Scaffold moved to root; `typecheck`, `lint`, `test` (2 passed), `build`, `dev` (HTTP 200 + title) all verified. README + MIT LICENCE present (confirmed 2026-10-21; copyright `ogMaverick12`; see ADR-011).
- FND-02 (design shell): complete 2026-10-14. Token-driven light/dark system with no-flash init, collapsible/resizable panels, mobile drawers, status bar, 7 component tests green. No math evaluation (per scope).
- GS-01: complete 2026-10-14. `src/math/` engine (compile once, reuse per x), 32 expression tests green, `docs/math/EXPRESSION_SYNTAX.md`, mathjs 15.2.0 recorded. No renderer (per scope).
- SMP-01 (sampler): complete 2026-10-14. `src/sampling/` adaptive segments with pole probing, boundary snapping, budget/depth caps, cancellation; 18 sampler tests green; `docs/sampling/ADAPTIVE_SAMPLING.md`. No drawing (per scope).
- GS-02/GS-03 (viewport + renderer): complete 2026-10-14. `src/graph/` transforms, 1/2/5 ticks, clipping, theme-aware palette, SVG view with pan/zoom, compile-once curve hook, demo-fixture integration; 16 renderer tests green; `docs/rendering/RENDERER.md`. No expression-list editing (per scope).
- Workspace integration: complete 2026-10-14. `src/expressions/` rows (add/edit/duplicate/hide/delete/select, stable ids, colour cursor), debounced editors, inline errors, example-chip onboarding; 9-acceptance workflow green; 89 tests total.
- Navigation + inspection: complete 2026-10-14. Clamped viewport (spans/fence), zoom controls + reset, cursor-anchored wheel/pinch, crosshair readout, view label, rAF-coalesced pan; 9 navigation tests green; 98 tests total.
- Persistence: complete 2026-10-14. Versioned `*.graphcraft.json` (New/Open/Save, dirty indicator, Save/Discard/Cancel guard), validated imports, v0 migration, prefs + session backup with graceful degradation, shipped example; 21 persistence tests green (incl. save→open round-trip added at audit).
- Export: complete 2026-10-14. Shared scene → SVG vectors + scaled PNG (in-house encoder, capped output), warnings disclosed, no PDF (documented); 16 export tests green.
- Stage 1 audit: complete 2026-10-14 with 135 tests total (see quality gates).
- Stage 2 domains + piecewise: complete 2026-10-14. Structured branches (first-match), row domains, labels, sampler breakpoints, format v2 with migrations; named functions deferred (ADR-020).
- Stage 2 parameters + sliders: complete 2026-10-14. Named values with bounded sliders, usage tracking, transform templates, format v3 with migrations; no implicit/3D/symbolic.
- Stage 2 polar + parametric: complete 2026-10-14. Discriminated row union, t/theta engine variables, parametric sampler, negative-radius policy, verified templates, format v4 with chained migrations; no 3D/implicit.
- Stage 2 implicit + inequalities: complete 2026-10-14. Marching-squares contours with saddle handling, region fills under axes/curves, strict-vs-solid boundaries, format v5 with chained migrations; no 3D surfaces.
- Stage 1 audit: complete 2026-10-14. All 15 mandatory cases verified (live browser + 135 tests); audit fixes applied; residual risks recorded below. **Stage 1 complete.**

## Stage 1 residual risks (audit 2026-10-14)
- Touch pinch: implemented, shares the tested zoom path, but no touchscreen hardware/CI coverage.
- Browser file download: blob pipeline unit-verified; headless harness cancels real file writes (environment quirk, not app behaviour).
- Screenshot tests omitted (no reliable harness); structure + pixel invariants asserted instead.
- mathjs bundle keeps the build over 500 KB (informational warning); code-splitting deferred to Stage 6.
- Clean-checkout README verification blocked until the first commit/push (needs user approval per rule 5).
- Minor accepted duplication: filename sanitizers in `project/files.ts` vs `export/filenames.ts` (different suffixes).
- Stage 2 numerical analysis (S2.5): complete 2026-10-15. `src/analysis/` numerics (roots, intersections, extrema, derivatives, tangents, integrals) with 15 unit tests; inspector panel + mobile drawer mounting; tangent/normal overlays via the sampler; ring/diamond/triangle graph markers; stale-snapshot suppression with recompute warnings; marker + overlay SVG/PNG export; 12 integration tests. 250 tests total, all gates green.
- Next: Stage 2 (richer equation graphing + numerical analysis), starting with multi-function polish per the stage plan — awaiting user prompt. Do not begin without explicit instruction.
