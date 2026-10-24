# GraphCraft — Profiling report (Stage 6 baseline 2026-10-16; re-measured 2026-10-17 for S7.5)

Measured on the development machine via `npx vitest bench src/perf`
(tinybench means). Budgets are observations, not gates — they tell
the next optimisation where the time actually goes. No optimisation
was applied: nothing measured justifies its complexity (each
considered option is refused below with its reason).

S7.5 re-baseline (2026-10-17): the suite was re-run twice, plus new
project-serialization workloads. Full two-run tables, machine details
and provisional budgets: `S7.5-BASELINE.md`. No regression beyond
laptop variance was observed; the Stage 6 table below is kept as the
original record.

## Baseline (mean of measured runs)

| Workload | Mean | Notes |
|---|---|---|
| Compile 100 mixed expressions | 0.53 ms | ~5 µs/expression; parse-once, resample-forever holds |
| Sample smooth parabola (800px) | 0.38 ms | Adaptive sampler, budget 4000 |
| Sample tan near poles | 1.03 ms | Pole probing costs ~3× smooth |
| 30-view resample storm (zoom/slider) | 14.3 ms | ~0.48 ms per resample; rAF-coalesced in-app |
| Import 10k-row CSV (parse+analyze+commit) | 1.44 ms | Native parser; caps refuse beyond |
| OLS line fit over 10k points | 8.38 ms | Householder 10k×2; no normal equations |
| Resolve 10k-point scatter | 1.11 ms | Copies, never mutates |
| Sample + project 128² surface | 24.5 ms | 16,641 evals + 16k-quad painter sort |
| One contour level (200px) | 2.83 ms | Marching squares + saddle pass |
| Extract 10k fit pairs | 0.79 ms | Finite-pair filter |
| 10k map→fit→figure pipeline heap | < 150 MB ceiling | Generous node-harness bound against retention |

- Build (re-measured 2026-10-17): index 792.3 KiB / 229.1 gzip (mathjs); lazy chunks DataLab 91.6/24.0, Viz3D 57.0/14.8, Calculator 44.4/12.3, LearnLibrary 29.3/8.3, stats 20.5/6.7; CSS 20.4/5.0.
- Render paint time is unmeasurable headless (jsdom paints nothing);
  proxy evidence is node counts: 10k SVG circles render (tested),
  tables cap at 200 displayed rows, curve runs stay segmented.

## Bottlenecks, prioritised

1. 128² surface projection (~25 ms, mostly painter sort): acceptable —
   default 48² costs ~3 ms. No action; the 80²+ cost note stands.
2. OLS fit at 10k (8.4 ms): acceptable, one-shot per edit.
3. Everything interactive ≤ ~1.5 ms: no action.

## Considered and refused (with reasons)

- Web Workers for sampling/import: 16k evals complete in ms;
  workers would add IPC + fallback paths for no measured gain.
  Reopens on measurement (stated in SURFACES.md).
- Typed arrays: allocation is not the measured cost (evals are);
  would churn every pure function signature for nothing.
- Decimation for plots: refused — point counts are exact claims
  (tests pin them); caps + table windowing already bound the DOM.
- Canvas/WebGL: reserved behind profiling evidence per RENDERER.md;
  nothing measured crosses the SVG→canvas threshold (~100k points).
- Memoisation beyond existing keyed memos: resampling is already
  0.5 ms; more caching buys staleness risk, not speed.
- Spatial indexes: no hit-testing feature exists to index.

## Enforced limits (refused with numbers, never truncated)

Expressions 100/project, 500 chars, 300 AST nodes; sampler 4000
evals/depth 12 + cancellation; implicit 30k evals; datasets
10k×32 (5 MB text); project files 256 KB / v6 2 MB / 20 datasets;
figures 2400px/6MP; surfaces 128² grid × 6; fields ≤ 4, arrows
≤ 32/side; table display 200 rows. Downsampling appears only as
stated stride caps (arrows) and resolution selects — never silent.

## Determinism

Same inputs → same outputs (keyed memos, fixed field order,
seeded layouts); sampler warnings disclose budget/cancellation
instead of varying silently. Benchmarks live in `src/perf/` and
rerun with one command.
