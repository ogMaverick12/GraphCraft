# S7.2 — Mathematical correctness and numerical reliability audit

Record of the 14-item audit pass over every workspace. Evidence labels follow the
repo convention: SOURCE-VERIFIED (read and checked against the code), TEST-VERIFIED
(suite run, exact command recorded), MEASURED (numbers captured from a run),
DOCUMENTED ONLY, INFERRED, UNVERIFIED. Automated checks supplement, never replace,
manual inspection of the underlying mathematics.

Checklist items 1–2 (core expression reference tests, adaptive sampling edge cases)
were marked complete upstream of this record; items 3–14 are recorded below as they
are verified. Fixes made during the audit are marked **FIXED (audit)** and carry their
regression tests.

---

## Item 3 — Advanced equation graphing (piecewise boundaries, domain restrictions, parameter updates, transformations, curve types)

Status: **VERIFIED** — no defects found.

TEST-VERIFIED (2026-10-17):
`npx vitest run src/math/piecewise.test.ts src/expressions/compile.test.ts src/expressions/stage2.test.tsx src/parameters/parameters.test.ts src/parameters/sliders.test.tsx src/sampling/sampler.test.ts src/expressions/plotting.test.tsx` → 70/70 passed (7 files).
`npx vitest run src/expressions/parametric-ui.test.tsx src/expressions/implicit-ui.test.tsx src/sampling/parametric.test.ts src/sampling/implicit.test.ts` → 29/29 passed (4 files).

SOURCE-VERIFIED:
- Piecewise (`src/math/piecewise.ts`): first-match branch semantics; missing default leaves honest gaps (domain-error, drawn as disconnected runs); overlapping conditions resolve to the earliest branch; branch count capped at 20; non-finite condition values rejected; branch parse errors name their branch.
- Breakpoints (`src/sampling/sampler.ts` `splitEdges`/`sampleRange`): branch boundaries become sub-range edges; runs from adjacent sub-ranges are appended, never merged (segments stay disconnected); out-of-range and duplicate breakpoints are ignored; sub-ranges share the evaluation budget.
- Domain restriction (`src/expressions/compile.ts` `rangeForRow`): row domain intersects the visible x-range; empty intersections return null and render as "domain does not overlap this view" rather than an error; non-finite/reversed bounds rejected by `validateDomain`.
- Parameter updates (`src/app/App.tsx`, `src/graph/useCurves.ts`): compilation is keyed off row text + parameter *names*; resampling is keyed off the referentially-stable `paramValues` object; a value change therefore resamples without reparsing, and an edit recompiles. Missing parameter values yield empty segments (skipped), never a substituted value.
- Transformations (`src/expressions/templates.ts`): the seven starters were checked numerically — shift `(x-h)^2+k`, stretch `a·sin(x)`, reflection `sin(-x)`, squash `sin(b·x)`, unit circle/ellipse/Lissajous parametric rows over `[0, 2π]` with `FULL_TURN = 6.283185307179586` (= 2π, verified against the double). Applying a template never rewrites existing rows (tested).
- Curve kinds: cartesian (incl. structured piecewise), parametric, polar, implicit, inequality all have compile → sample → render paths, unit tests for sampling and UI wiring tests; polar negative radii plot through `(r·cos θ, r·sin θ)` (angle+π-equivalent, source-confirmed).

Residual notes:
- 200/512-point scans are estimates, not proofs of completeness (documented in the code itself).
- Piecewise boundary joins rely on the sampler's breakpoint split; a single measure-zero point exactly on a strict-inequality boundary evaluates as a domain-error by design (honest gap, documented).

---

## Item 4 — Numerical analysis results (roots, repeated roots, intersections, extrema, derivatives, tangents, normals, integrations)

Status: **VERIFIED with two defects FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/analysis/analysis.test.ts src/analysis/integration.test.tsx` → 41/41 passed (2 files; includes 8 new closed-form/reference tests and 6 new presentation tests added by this audit). Full suite: 58 files / 641 tests passed.

Reference values checked against closed forms (all confirmed correct in the existing suite):
- Roots of `x²−4` at exactly ±2; repeated root of `x²` at 0 via |f| minimization; off-grid even root `(x−0.3)²` → `method: 'minimum'`.
- `1/x` pole crossings rejected (residual gate), not reported as roots.
- Intersections of `x` and `x²` at (0,0) and (1,1).
- Extrema of `x³−3x`: minimum at x=1, maximum at x=−1; `−x²` max at 0.
- `d/dx x²` at 2 = 4 (central difference, error estimate attached); `abs(x)` at 0 flags a cusp.
- Tangent to `x²` at x=2: slope 4, point (2,4), `at(3)=8`.
- `∫₀² x dx = 2` exactly (adaptive Simpson); `∫₋₁² √x dx = (2/3)·2^{1.5}` with the invalid part skipped and honestly reported (converged=false, skipped fraction > 0); `∫₋₁¹ (1/x) dx` reports non-convergence.

New closed-form reference tests added this audit (`src/analysis/analysis.test.ts`):
- `d/dx sin(x)` at 0 ≈ 1 = cos(0); `d/dx eˣ` at 1 ≈ e.
- `sin` roots over [0, 2π] = 0, π, 2π; extrema at π/2 (max, y=1) and 3π/2 (min, y=−1).
- `∫₀^π sin x dx = 2`; `∫₀² x³ dx = 4` (Simpson-exact cubic guard).

**FIXED (audit): boundary roots were missed.** `findRoots` could not recover a root sitting on either range edge without an interior sign change: the endpoint sample can never serve as the middle of the interior three-point |f| probe, and e.g. `sin(2π) = −2.4e-16` inside [0, 2π] produces no sign change (both last samples negative). The same gap existed mirrored on the left edge (`cos(−π/2) = +6.1e-17`, no sign change). Fix: explicit strict-endpoint |f| probes at both sampled ends (`probeBoundary` in `src/analysis/roots.ts`), gated by the same minimum-threshold and residual checks as the interior probe, so small non-roots and poles are still dropped. Regression tests: the sin/2π and cos/−π/2 reference tests above.

**FIXED (audit): steep and cusp roots were silently dropped.** The candidate acceptance test (`residual ≤ max(1e-9, scale·1e-9)`) was inconsistent with bisection's x-tolerance: the minimal achievable residual for a root of slope `s` is about `s·xTolerance`, so steep-but-perfectly-resolvable roots were discarded while the function's amplitude kept the tolerance small. MEASURED before → after (range [−10,10], defaults): `sin(10x)` 9 of 63 roots (no warning) → 63 of 63; `sin(1/x)` over [0.2, 1] 0 of 1 ("No roots found") → 1 of 1 at 1/π; cusp roots `abs(sin(2x))` 1 of 13 → 13 of 13. Fixes in `src/analysis/roots.ts`:
1. Acceptance scales with a secant slope estimate over the bracketing window: `residual ≤ max(residualTolerance, slopeEstimate · xTolerance · 4)`. Pole crossings and jumps keep residuals far above this bound (their residual grows as the interval shrinks), so `1/x` is still rejected — existing pole test unchanged and passing.
2. The interior even-multiplicity/cusp probe no longer pre-filters by a fixed `|f| < 1e-3` — linear-contact zeros sampled at 0.1 spacing can never satisfy it. Every strict local minimum of |f| is now a candidate and the acceptance residual decides; worst-case evaluations stay bounded by the scan (at most one refinement per scan pair, each bounded by the golden-section x-tolerance break — ≈ 8.7k of the 20k budget by construction at 200 divisions: 201 scan + ≤ 84 boundary probes + ≤ 42 per pair × 200; measured max 6407 across a hostile roster).
3. Unresolved sign-change brackets are counted and reported: "N bracketed sign change(s) did not resolve to roots (possible pole, jump, or unresolved steep crossing); the root list may be incomplete." Aliased inputs (e.g. `sin(100x)`: 142 of ~637 crossings resolvable) now say so instead of presenting the short list as complete.

SOURCE-VERIFIED (methods, policies, limitations):
- Roots: bisection on sign changes + golden-section |f| minimization fallback; residual tolerance from the sample scale; duplicates merged; "a scan cannot prove absence" is stated in code and surfaced as a warning when empty.
- Derivatives: central differences with `h = √eps · max(1,|x|)`, step-doubling error estimate, one-sided-slope cusp detection; invalid steps and non-finite x return null with warnings.
- Integrals: adaptive Simpson (depth 12, 50 000 evaluations), classical |refined−whole|/15 error bound, tolerance scaled by `max(1,|value|)`; `converged` is conservative (requires ok && no skipped region && error bound within tolerance); invalid subintervals are skipped and their width fraction reported, never silently zeroed.
- Extrema: interior-only by design (endpoints never reported), golden-section refinement, deduplication.
- Normals: presence TEST-VERIFIED (integration test draws tangent + normal); the geometry is SOURCE-VERIFIED in `src/app/App.tsx` — normal slope `−1/m`, vertical normal drawn when `|m| < 1e-12` (product of slopes = −1 holds by construction). No independent numeric unit test of the normal's coordinates exists (noted, not claimed).

Residual notes:
- Derivative values are estimates with an attached error estimate; nothing is presented as analytic. `findRoots`/`findExtrema` are sample-scan based and documented as such.
- Aliased oscillation beyond scan resolution remains partial by nature (a 200-division scan cannot resolve a 0.006-period curve); the unresolved-bracket warning is the honesty mechanism, not a completeness claim.

---

## Item 5 — Convergence and stale-result handling

Status: **VERIFIED with four defects FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/analysis/integration.test.tsx src/analysis/analysis.test.ts` → 41/41 passed; full suite 58 files / 641 tests passed.

Already correct (SOURCE- and TEST-VERIFIED):
- Geometric results (roots, intersections, extrema, tangent) carry a `{world, paramsKey}` snapshot; view or slider changes label them "recompute for current results" and hide their graph markers (existing test).
- Non-converged integrals display "not fully converged", the skipped-width fraction, and the underlying warnings; `converged` is deliberately conservative.
- Sampler warning codes (`budget-exhausted`, `under-resolved`, `pole-suspected`, …) exist for under-resolved sampling and were already carried into the export dialog.

**FIXED (audit): stale results after function edits or selection changes.** The snapshot did not include the analysed function's identity, so editing the row's expression — or switching the target/second function — left old results displayed as current. The snapshot now includes a content key (`id | source | piecewise branches | default source`) for the target and (for intersections) the second function. Label: "Function, view or sliders changed — recompute for current results." Regression test: "flags results stale when the analysed function is edited"; the tangent overlay uses the same mechanism.

**FIXED (audit): the integral had no staleness tracking at all.** An old integral value stayed on screen unlabelled after the function changed. The integral now stores `{paramsKey, targetKey}` and is labelled "Function or sliders changed — recompute for current results." when outdated. A pure view change does *not* mark it stale (definite integrals are viewport-independent) — both directions tested.

**FIXED (audit): degenerate intersections.** `Find intersections` could run with the same row on both sides (move the target onto the "With" selection), producing a result at every sample since `f − g ≡ 0`. It now refuses: "Choose two different functions to intersect." Tested: previous two points stay, no marker flood.

**FIXED (audit): swallowed under-resolution warnings.**
- `runRoots`/`runIntersections`/`runExtrema` returned search warnings only when the result list was empty. Warnings are now returned whenever present. Measured reachable case: `abs(sin(200x))` extrema hits the 20 000-evaluation budget (20001 evals) with hundreds of partial results — previously silent, now surfaced (tested).
- Sampled-curve warnings (e.g. "The evaluation budget was exhausted; refined detail is incomplete." from `sin(200x)` at default settings) were only visible in the export dialog. The Inspector's selected-row status now discloses them (tested), alongside the point count.

MEASURED (temporary probes, deleted after use; default UI settings): `sin(200x)`, `abs(sin(200x))`, `x*sin(1000/x)` exhaust the sampler's 4000-evaluation budget (status partial); `sin(1000x)` resolves at 399 evals. Root-search evaluation ceiling across the hostile roster: 6407 of the 20 000 budget via the reachable sign-change paths; the extrema budget is reachable (20001 observed) and is now reported.

Residual notes:
- The roots budget remains unreachable through the default UI (measured), so no roots-with-budget-warning state is reachable today; the code path is nevertheless no longer conditionally swallowed.
- Stale labels are text-visible in the panel; graph marker visibility is gated on the same check (existing behavior extended, not replaced).

---

## Item 6 — Calculator semantics

Status: **VERIFIED with two defects FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/calculator src/math` → 147/147 passed (10 files; includes 2 new engine regression tests added by this audit).

MEASURED semantics (temporary probe, deleted after use; `calculate` + `formatDisplay` at defaults):
- Precedence/grouping: `2+3*4` = 14; `2^3^2` = 512 (right-associative); `-2^2` = −4; `--5` = 5.
- Factorial binding: `-3!` = −6, `2^3!` = 64, `2!^2` = 4 (factorial binds tighter than unary minus and `^`).
- Rounding: half away from zero — `round(2.5)` = 3, `round(-2.5)` = −3, `round(-1.5)` = −2; `round(1.125, 2)` = 1.13 (1.125 is exact in binary).
- Modulo: floored, takes the divisor's sign — `mod(-7,3)` = 2, `mod(7,-3)` = −2; `mod(x,0)` is a domain error.
- Percent convention: strictly per-operand — `50%` = 0.5, `50+10%` = 50.1, `50%+50%` = 1, `200%` = 2; `7%3` is rejected (a stray `%` never silently becomes `/100`).
- Angle modes: radians by default; degree mode wraps forward trig and converts inverse trig back, with the rewritten text disclosed (`sin((90)*pi/180)`); hyperbolics stay radian-only in both modes (tested).
- Integer-count functions: integer-strict (non-integer/negative → domain errors); `factorial(0)` = `combinations(0,0)` = `permutations(0,0)` = 1; `combinations(52,5)` = 2 598 960 (reference-verified).
- Constants and notation: implicit multiplication (`2pi`, `2(x+1)`), scientific notation (`1e3`, `1.5e-2`), `log` base-10 / `log(x,b)` general base, `exp(ln(2))` = 2.
- Documented conventions: `0^0` = 1 (IEEE `Math.pow`, not silently special-cased); `(-8)^(1/3)` → domain error (real-valued engine, no complex promotion) while `(-2)^3` = −8 works; `2^-2` = 0.25.
- Exact-angle residue: `cos(90°)` = 6.123e-17, `sin(180°)` = 1.2246e-16, `tan(90°)` = 1.633e16 — the computed IEEE values, deliberately not snapped to 0/undefined; the display layer never claims exactness (approximations carry ≈, fraction display is labelled).
- Range edges: `2^1023` = 8.988e307 finite, `2^1024` → overflow; `factorial(170)` = 7.26e306 finite, `factorial(171)` → overflow; `log(0)`/`ln(0)` → overflow (not finite).

**FIXED (audit): unbounded evaluation loops in `factorial`/`permutations`/`combinations`.** The loops ran to the input value with no early exit, so a short expression could freeze the tab: MEASURED `factorial(1e8)` = 126 ms and `combinations(1e8,5e7)` = 268 ms of synchronous main-thread time, scaling linearly — ≈ 21 min at 1e12 and ≈ 15 days at the largest accepted integer (1e15). The same defect is reachable in the grapher, which evaluates the expression once per sample. Fix in `src/math/engine.ts`: each loop stops at the first non-finite product (outcome unchanged: overflow), and `combinations` divides before multiplying in the narrow band where the running product transiently overflows. Regression tests: 'bounds huge-count evaluation instead of iterating to the input' (loose 1 s wall-clock bound across the three calls; ~25 s measured pre-fix) and 'keeps a representable binomial whose intermediate product overflows'.

**FIXED (audit): spurious overflow for representable binomials.** `combinations(1028,514)` = 7.156…e307 was reported as overflow because the running product C(1027,513)·1028 ≈ 3.7e310 is not representable while the divided result is. It now returns the value; relative error vs an independent BigInt reference ≈ 1.1e-15 (test bound 1e-12).

Residual notes:
- `0^0` = 1 follows IEEE `Math.pow`; recorded here as a decision rather than silently special-cased.
- Exact-angle trig keeps its IEEE residue (cos 90° ≈ 6e-17, tan 90° ≈ 1.6e16); snapping would imply exactness the engine does not claim, so it is deliberately absent ("documented, not clever").
- `factorial` is exact only while the result is an exactly-representable integer (< 2^53); beyond that it is the usual double conversion, and overflow reports honestly from 171!.
- History stores the full-precision number while display applies user-selectable 6–12 significant digits (existing tests: send-to-graph carries full precision).

---

## Item 7 — Vector and matrix semantics (with the complex lane)

Status: **VERIFIED with defects FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/calculator src/math` → 151/151 passed (10 files), then `src/calculator/structured.test.ts` → 32/32 after the final size-cap test; typecheck and lint clean. Five tests added by this audit.

MEASURED / reference checks (temporary probe, deleted; independent references noted):
- Determinants vs an independent BigInt Bareiss reference: [[0,1],[1,0]] = −1 (exercises the pivot-swap sign path), diag(2,3,4) = 24, 4×4 integer matrix = 97.99999999999997 vs exact 98 (≈ 3e-16 relative residue), rank-2 4×4 = 0 with the singular warning naming the empty column. Sign parity, partial pivoting, and singularity diagnosis all check out.
- Inverse [[1e10,1],[1,1e10]] vs closed form: relative error 1.5e-16, clean warning. The residual heuristic behaves at both ends: Hilbert 8×8 fires ("Large residual ≈ 3.278e-7: ill-conditioned"), solves at 1e12 scale stay quiet (residual ≈ 1e-12). An absolute-threshold false positive could not be constructed — A·A⁻¹ residuals stay O(ε) independent of scale. Recorded as a reliability heuristic, not a condition-number estimate.
- Existing fixtures re-verified: det −306, inverse [[4,7],[2,6]], solve [[3,2],[1,2]] → [0, 2.5], right-hand-rule cross product, 3-4-5 normalization; complex branch-cut log(−1) = iπ, principal fourth root of −1, polar round-trip, conjugate identities.

**FIXED (audit): complex division silently wrong at extreme magnitudes.** `divComplex` formed `b.re² + b.im²` first; for |b| ≈ 1e200 the square sum overflows and `i/(1e200+1e200i)` returned `{0, 0}` as a *value* — a silent wrong answer (true value ≈ 5e-201+5e-201i, representable). For |b| ≈ 1e-300 the sum underflows to 0 and a representable quotient (≈ 5e299−5e299i) was refused as "Division by zero". Replaced with Smith's scaled method (divide by the larger component) plus the existing finite check; two reference tests added (relative tolerance 1e-12), and a genuinely out-of-range quotient still reports overflow.

**FIXED (audit): complex powers returned non-finite numbers as values.** `(1e200)^2` and `2^-2000` returned `{Infinity, NaN}` with status 'value'. Powers now report 'overflow' when the scaled magnitude leaves the double range; `(1e-200)^-1 = 1e200` now computes (the old negative-power path squared the result, underflowing to 0/NaN); `0^-2` is a domain error instead of a silent `{0, 0}`. Noted divergence: the scalar lane inherits `Math.pow`'s silent underflow (`2^-2000` → 0); the complex lane reports unrepresentable results explicitly, per its documented "unsupported errors, not silent coercions" policy.

**FIXED (audit): vector/matrix arithmetic emitted non-finite entries as values.** Pre-fix: `addVectors([1e308,0],[1e308,0])` → `[Infinity, 0]`, `dot([1e300,0],[1e300,0])` → `Infinity`, `det([[1e308,0],[0,1e308]])` → `Infinity`, matrix products likewise — all rendered as '—' with no explanation. All of add/sub/dot/cross/mul/scale, determinant, inverse, and solve now return an explicit `overflow` error when a result entry is not finite (shared guards; the `LinalgOutcome` error-kind union gained `'overflow'`; no consumer switches on kind).

**FIXED (audit): `normalizeVector([1.7e308, 1.7e308])` silently returned `[0, 0]`.** `Math.hypot` overflows to ∞ for norms above the double range and dividing by ∞ yields zeros. It now scales by the largest magnitude first and returns `[√½, √½]` (the unit vector is representable even when the norm is not); the raw `|A|` display reports the overflow instead of '—'.

Coverage added: extreme-magnitude division and power references, non-finite guards across both lanes, and the previously untested documented size caps (vector ≤ 256, matrix ≤ 8×8 — now asserted deterministically).

Residual notes:
- Determinants carry ordinary double error at extreme scale (measured ≈ 3e-16 relative on an integer 4×4); the lane already documents "finite precision — exactness is never claimed".
- The residual heuristic uses an absolute 1e-8 threshold by construction; measured behaviour (Hilbert fires, well-conditioned large-scale systems stay quiet) is as designed. It is not a condition-number estimate.
- Norms genuinely above DBL_MAX remain unrepresentable; `normVector` returns Infinity by contract and the UI reports it; normalization still succeeds via magnitude scaling.

---

## Item 8 — Statistics semantics

Status: **VERIFIED with one defect FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `src/calculator/structured.test.ts` → 33/33 passed (one new regression test added by this audit; the statistics, paired, and moving-average suites are pre-existing and re-run here). Typecheck + lint clean.

SOURCE-VERIFIED / reference values (read + fixtures):
- Quartiles: linear interpolation R-7 (h = (n−1)·p over sorted values) is documented in the code and the notes; classic dataset [2,4,4,4,5,5,7,9] → Q1 = 4, Q3 = 5.5 (h = 5.25 → 5 + 0.25·2); two-point [1,3] → Q1 = 1.5, Q3 = 2.5; single value → itself.
- Spread conventions are named, never ambiguous: σ²/σ ÷n, s²/s ÷(n−1) (null + "needs n ≥ 2" note), SEM = s/√n explicitly documented as "precision of the mean, never a confidence interval". Classic dataset: σ = 2, s ≈ 2.138089935 both verified; variance is computed two-pass (Σ(x−x̄)²), not the cancellation-prone E[x²]−x̄².
- Modes: all values tied at the top frequency, empty with a "No mode" note when all are unique, ties sorted. Median: sorted copy (input never mutated), even counts averaged.
- Paired lane: two-pass co-deviation; Pearson r = coDev/√(ssX·ssY) (stable form), null with a note when a column is constant; sample covariance null for n < 2. Hand-computed fixture [1,2,3,4]/[2,4,6,8]: cov 2.5, 10/3, r = 1; anticorrelated r = −1.
- Moving averages: trailing keeps full windows only (n−k+1 outputs, no look-ahead, no padding); centered requires an odd window (even refused — "an even window has no centre"); k < 2, k > n, and non-finite values are refused with reasons, never skipped silently.
- Grammar: bracketed lists only; entries are engine expressions; variables and non-finite entries are refused with reasons ("variables need values first").

**FIXED (audit): naive summation could zero the mean.** MEASURED: for [1e16, 1, −1e16] the `1` is absorbed by rounding (ulp at 1e16 is 2) and the naive running sum ends at 0 — the lane reported sum = 0, mean = 0 for data whose true sum is 1 (verified in isolation: naive 0, Neumaier 1). All accumulations (`sum`/`mean` and the variance terms in `describe`; `meanX`/`meanY`, `coDev`, `ssX`, `ssY` in `describePaired`) now use Neumaier compensated summation. Ordinary datasets are bit-identical (regression test asserts the classic dataset sum = 40); the hostile fixture now reports sum = 1 and mean = 1/3.

Residual notes:
- Two-pass accumulation plus explicit population/sample naming remains the reliability backbone; every spread figure states its convention in the output notes.
- Figures render through the calculator display policy (6–12 significant digits); stored summary values keep full precision.

---

## Item 9 — Unit conversions

Status: **VERIFIED with one defect FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `src/calculator/domains.test.ts` → 11/11 passed (two tests added by this audit). Existing coverage: the affine temperature triple (0 °C → 32 °F, 100 °C → 373.15 K, 32 °F → 0 °C, the −40 crossing, 273.15 K → 0 °C), round-trip drift bounds, the defined horsepower, angle consistency with the radian engine, and loud rejection of unknown units and cross-dimension conversions.

SOURCE-VERIFIED (full registry read against SI/NIST definitions):
- Every unit maps to an SI base by a factor, except temperature, which is affine — `(value + offset) × scale` through kelvin, inverse offset applied after division — so multiplicative code structurally cannot touch °C/°F.
- Defined-exact relationships confirmed: in = 0.0254 m, lb = 0.45359237 kg, oz = lb/16, mi = 1609.344 m, acre = 4046.8564224 m² (4840 yd²), gal = 231 in³, qt = gal/4, lbf = lb·g₀, psi = lbf/in², atm = 101325 Pa, torr = atm/760, hp = 745.6998715822702 W (550 ft·lbf/s), eV = 1.602176634e-19 J, g₀ = 9.80665 m/s², knot = 1852 m/h.
- Conventional choices are named in the unit notes and flagged `exact` consistently: thermochemical calorie 4.184 J (“not IT”), IT BTU 1055.05585262 J (“not thermochemical”).
- Honest inexactness: degree and revolution are the only `exact: false` units, each noting “π is irrational: the factor is a double approximation”.

MEASURED: derived factors against exact reference decimals — acre and gallon ≈ 1.1e-16 relative; psi, hp, torr, knot, lbf, oz, mi bit-identical to their defining expressions. Affine path residues ≈ 6e-14 (32 °F → °C and 100 °C → °F; half an ulp of the 273-scale subtraction), invisible at the 6–12 significant-digit display policy — consistent with “exact up to double rounding”.

**FIXED (audit): the `g` symbol collision made standard-gravity conversions unreachable.** Two registry entries claimed the symbol `g`: the mass gram and the acceleration standard gravity. `findUnit` returns the first match (mass iterates before acceleration), and the units lane passes dropdown symbols straight to `convert` (SOURCE-VERIFIED from the reads; runUnits at `StructuredModes.tsx` lines 313–326, dropdowns at 592+). Selecting “g — standard gravity” under Acceleration therefore resolved to the gram: every acceleration conversion through it failed a cross-dimension check, and g → g “worked” only because both sides resolved to gram. The acceleration symbol is now `g₀`, with the note naming the reason. Two tests added: a full-registry sweep asserting symbols are globally unique and every symbol resolves to its own dimension (any future collision fails the suite), and an explicit g (mass) vs g₀ (acceleration) resolution test.

Residual notes:
- Symbol matching is exact and case-sensitive; names match case-insensitively. 'l' is not accepted for litre (the symbol is 'L') — deliberate exactness, no guessed aliases.
- No physical-plausibility clamping: converting through values below absolute zero yields negative kelvin mathematically (e.g. −500 °C → −226.85 K) rather than an error. The lane is a mathematical converter; every factor is defined or explicitly flagged approximate.
- `exact` means “defined relationship, exact up to double rounding”; display still renders 6–12 significant digits.
- Cross-dimension conversions are always errors (“No silent conversion.”), never coerced.

---

## Item 10 — Data Lab fitting and uncertainty

Scope note: this item covers `src/data/fits.ts` (Data Lab least squares) and `src/calculator/uncertainty.ts` (the uncertainty-propagation lane — the only uncertainty implementation in the codebase; the Data Lab deliberately implements no inference beyond the fit diagnostics).

Status: **VERIFIED with one defect FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/calculator src/data` → 228/228 passed (18 files), including one test added by this audit. Pre-existing coverage re-run: fits.test.ts (exact line/quad/cubic recovery; hand-computed OLS within tolerance; singular and too-few-observation refusals; counted skips; constant-Y null R²; weighted hand reference; weight exclusions; linearized exp/log/power exact recovery; domain refusals; singular transformed designs) and uncertainty.test.ts (hand references throughout).

SOURCE-VERIFIED / reference checks (fit engine):
- Householder QR read line-by-line: reflector sign chosen to avoid cancellation; beta = 1/(‖a‖·(‖a‖+|aₖ|)); explicit saved reflector so updates never consume what they overwrite; R diagonal read after full deflation; back substitution with zero/non-finite pivot → null → loud singular error. No normal equations anywhere; no silent rank patching.
- Finiteness gates on design powers, targets, residuals, and the exp back-transform (overflow errors with rescale advice). dof ≥ 1 enforced (line/poly need degree+2 points; linearized ≥ 3); residualStd = √(SSres/dof); RMSE ÷n; MAE; min/max residuals; R² = 1 − SSres/SStot null on constant Y with a note; every linearized fit carries the approximation warning and `converged: false`; weights w = 1/σ², R² always unweighted on raw residuals — every claim matches docs/data/FITS.md (read in full; no discrepancies). FitPanel's large-residual flag is exactly the documented |residual| > 2·residualStd, inspection-only.

MEASURED (temporary probe plus an exact BigInt-rational gold reference, both deleted after use):
- Consistent-data accuracy at hostile offsets: degree-5/6 fits to exact monomial data at x ≈ 1000, and degree 3 at x ≈ 1e6, reproduce function values bit-identically at the tested midpoints (relative error 0; degrees ≥ 3 additionally carry the documented overfit note).
- Conditioning heuristic reach: replicating the R-diagonal computation exactly — ratio 3.18e-19 (x = 1e6..6e6, deg 3) and 6.63e-28 (x = 0..1e6, deg 5) → the warning fires for wide-range high-degree designs (the “rescale X” scenario, where the message's advice is the remedy). Offset designs (x ≈ 1000..1011 deg 5 → ratio 4.12e-3) and near-duplicate X (deg 6 → 0.11) stay silent, and measured fits there still returned display-accurate function values (noisy variant ≈ 3.6e-16 relative).
- Exact rational LS gold reference for a hostile noisy case (degree 5, x ∈ [1000, 1011], y = x⁵·(1 ± alternating 1e-14), the doubles taken exactly): JS QR c5 = 0.9878491243639682 vs exact-LS c5 = 0.9876048736802413 (2.5e-4 relative — consistent with double forward error on the raw offset basis, where the exact LS coefficient itself already sits ≈ 1.2% from the generating coefficient: the design owns that sensitivity, not the solver). Function values: exact LS midpoint 1027804168330345.2 vs x⁵ = 1027804168330345.4 (1.2e-16); JS QR 3.6e-16. The coefficient vectors differ mainly in a direction that is flat over the fitted range, so displayed curves are unaffected; coefficient readouts are conditioning-limited, which the panel states (“coefficients may be unreliable; check residuals”, plus “rescale X” on the overflow paths).
- 10k-row (import cap) line fit: intercept 0.999999999999639 (3.6e-13 absolute), slope 3.0000000000000067 (2.2e-15 relative) — no spread-operator limits at the cap.

**FIXED (audit): `weightedMean` refused representable results at extreme sigmas.** The raw convention w = 1/σ² leaves the double range: MEASURED w(1e-160) = Infinity (σ² = 1e-320, subnormal, nonzero → reciprocal overflows) and w(1e200) = 0 (σ² overflows → reciprocal underflows), so Σw became Infinity (NaN mean → spurious overflow refusal) or 0 (0/0 refusal) although the inverse-variance mean and σ = σ_min/√Σt are representable. The function now scales the weights by the smallest σ — (σ_min/σ_i)² ∈ (0, 1], Σ ≥ 1 — which is exactly w_i/w_min, so the inverse-variance mean and its σ are invariant. Regression test asserts 10±1e-160 and 12±1e-160 → 11 ± (1e-160/√2), and the 1e200 mirror.

Residual notes:
- No standard errors, confidence intervals, or p-values exist in the fit engine — stated throughout, never claimed.
- exp/log/power are log-linearized approximations by construction (warning + `converged: false` on every result), never presented as true nonlinear MLE.
- The conditioning warning is a scalar R-diagonal-ratio heuristic (documented threshold 1e-9): measured to fire on wide-range/high-degree designs and stay silent on offset and near-duplicate-X designs, where fits measured accurate in function space. Coefficient readouts on strongly offset designs remain conditioning-limited (measured 2.5e-4 c5 discrepancy vs exact arithmetic in an engineered ±1e-14 case); the documented remedy is rescaling X. No automatic recentering — it would change the promised raw c0..cd basis.
- Uncertainties propagate uncorrelated first-order; the independence/linearization assumptions ride on every figure; asymmetric bounds never enter these formulas (documented Data Lab display concept).

---

## Item 11 — Learn library claims

Status: **VERIFIED with one content typo FIXED (audit)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/learn` → 56/56 passed (5 files). The suite machine-verifies the content rather than trusting it: every template anchor is compiled through the real pipeline and probed at the stated coordinates (tolerance 1e-6); every stated property is probed against the engine (turning points evaluated; monotonicity densely sampled with strict 1e-9 separation; period reproduced at three anchors plus a half-period degeneracy probe; amplitude sampled within 0.01); every curated annotation is evaluated against the engine (points re-evaluated, asymptote blow-up probes, even/odd symmetry probes); transform claims are re-derived (f(x−h) right, f(bx) compression, f(−x) mirror) with a negative test refusing a wrong mapping; one check per row is enforced, so a row cannot open without a verified anchor; the checker itself is negative-tested (wrong anchors fail loudly). Curriculum: no orphans, every template covered by a topic, cycles/unknown prereqs/duplicate ids rejected, no byte-identical duplicate rows.

SOURCE-VERIFIED (manual hand-audit of all 42 templates, 12 topics, and 8 practice items):
- Every template's descriptive claims, roots/vertices/turning-point kinds, monotonicity intervals, ranges, asymptote values, and transform notes check out against mathematics. Examples: x⁴−5x²+4 has roots ±1, ±2 and critical points x = 0 (max 4), x = ±√(5/2) (min −2.25); x²−y²=1 hugs y = ±x; y = x²/4 → focus (0,1), directrix y = −1; the tangent probe tan(π/2−0.001) ≈ 1000 ≥ minAbs 500; sin(2x) has period π; the split-power join is continuous with both one-sided slopes vanishing; the Heaviside value at 0 follows the stated default-branch convention (disclosed in simplifications).
- Topic DAG prerequisites are sensible and acyclic; summaries are accurate ("principal branches", "continuity without smoothness", "integrals as area under humps").
- Practice items: all 8 hand-verified — stored answers match the mathematically correct options ((x−2)², (−x)³, sin(2x), unit circle, |x| corner); numeric sets correct (roots ±2; eˣ intercept 1) at 1e-9 tolerance; explore items carry no correctness indicator, and validation rejects explore items that do.
- Content carries no external curriculum-alignment claims (test-enforced), consistent with the licence rules.

FIXED (audit): grammar typo in the `rational-bounded-bell` objective — “Contrast a everywhere-defined” → “Contrast an everywhere-defined”.

Residual notes:
- Domain/range/parameter annotations and continuity prose are declared human-reviewed wording (structural presence only — documented in ANALYSES.md); hand-audited correct here, but a future prose reword would not fail the machine suite. The machine checks cover anchors, properties, and points — not sentence truth.
- Annotation kind *semantics* are enforced as “point lies on the curve/equation” probes only: a root annotation's y = 0, a vertex's extremum status, and a tangent's slope are not re-derived by the checker; the curated values were hand-verified (e.g. the tangent label's shared slope 2 at (1,1) for y = x² and y = 2x − 1).
- Turning-point kinds (min/max) are membership-verified; the kinds were hand-audited correct. A future kind mislabel with an unmoved point would pass the suite.
- The rose exploration note gives the even-frequency example (2θ → 4 petals); the suggested 3θ edit yields 3 petals (odd frequencies count as themselves). Reviewed as accurate but deliberately non-exhaustive — it is an explore item with no checked answer.

---

## Item 12 — Advanced visualisations (3D surfaces, 2D fields)

Scope: `src/viz3d/` — surface sampling, projection and painting (`surface.ts`, `surfaceSvg.ts`), and field displays (`fields.ts`: contours, heatmaps, arrows, colour scales).

Status: **VERIFIED with one painting-order defect FIXED (audit) and one claim tightened (docs only)**.

TEST-VERIFIED (2026-10-17): `npx vitest run src/viz3d` → 63/63 passed (4 files), including one strengthened test. Pre-existing coverage re-run: exact plane/paraboloid/saddle sampling, holes-not-bridged, resolution refusals, the 128² grid completing within budget with exact eval counts (129² vertices), ramp endpoints/midpoints and constant-surface mid-ramp, camera clamps, inspection round-trips, evaluation-free orbiting, shading bounds and lit-vs-turned faces, contour circles/ellipses at known levels, singular-field contour honesty, level parsing and interior auto-levels, scale-policy fallbacks, arrow unit/magnitude semantics and hole dropping, SVG structure (exact polygon counts, no chrome text).

SOURCE-VERIFIED:
- Sampling: (N+1)² vertices, one engine evaluation each, non-finite → holes counted, quads touching a hole dropped (never bridged); finite min/max come only from finite values; the z-axis top falls back to 0 when nothing is finite.
- Projection: world rotation (yaw about z, pitch about x) then the perspective divide `factor = distance / (distance + depth)` — equivalent to a camera at `−distance` on the view axis (near points magnified); mapping `x → right`, `z → up`; pitch clamped to ±(π/2 − 0.05), distance 4–60, pan ±1e6, non-finite repair — all read and matched to SURFACES.md.
- Shading: face normal from the cross product of the x- and y-edge world vectors (right-handed, +z on level ground), factor `0.45 + 0.55·max(0, n·L)` with n and L both normalized against the documented light `(−0.35, 0.5, 0.79)`; degenerate faces get 0.45.
- Colour: fixed five-stop blue→red ramp; constant or degenerate ranges land mid-ramp (no 0/0 mapping); the colourbar reuses the same stops as the field legend.
- Fields: contours are the shared `sampleImplicit` marching squares on offset fields `f − c` (one algorithm, never reimplemented); auto levels divide the interior of the probed finite range; heatmap scales fall back loudly (auto/symmetric/fixed); viridis and diverging LUTs are hand-transcribed approximations with correct end anchors and stated approximation status; arrows stride-cap density with magnitude mode `15% + 85%·|v|/max` and constant-length unit mode — all matched to FIELDS.md.

MEASURED (temporary probe, deleted after use): on a self-occluding mesh (`2.5·sin(3x)·cos(3y)`, 64², default camera, 800×600), `corr(depth, screen area) = −0.3965`, with mean areas 88.78 (nearest third of quads) vs 52.87 (farthest third): larger view depth = farther, exactly as the perspective divide implies. Among 43,991 screen-overlapping quad pairs (bounding boxes of quads shrunk 10 % toward their centroids, so shared edges do not count — bounding boxes overcount true area overlap), the pre-fix ascending sort placed the farther quad later in paint order in all 43,991 pairs.

**FIXED (audit): the painter order was inverted.** `projectSurface` sorted quads by ascending view depth, while all three paint paths (live SVG, canvas PNG, exported SVG) draw in array order — later polygons sit on top. Since larger depth means farther, every occlusion overlap rendered the farther surface in front of the nearer one. The sort is now far-first (descending depth); post-fix, all 43,991 overlapping pairs have the nearer quad on top. `Scatter3D` had the same inversion for points through the same projection and is fixed the same way. The strengthened test pins the physics as well as the order: the nearest quad must project a larger screen area than the farthest, and must come later in the array (a mis-sorted array fails).

DOCUMENTED (claim tightened, no behaviour change): the arrow stride bound is at most 33 per side including the boundary column — the code and its test always pinned `MAX_ARROWS_PER_SIDE + 1`; the two statements claiming “≤32” (`fields.ts` docstring, FIELDS.md) now state the real bound.

Residual notes:
- The painter’s algorithm is approximate by construction (per-quad mean depth): an extreme perspective case can still order a specific pair imperfectly. The fix restores the intended far-first convention; it is not per-pixel z-buffering.
- Geometry behind the camera (depth < −distance, reachable with tall surfaces at short distances) clamps the divisor at 1e-9 and projects far off-screen rather than culling — stated behaviour, no fabricated geometry.
- The arrow bound is a display-density cap; the drawn count and step are always displayed, so the tightened claim needs no code change.
- 3D scatter stride-subsamples to 2,000 points, stated live; point painting is now far-first as well.
- PNG exports render through the browser canvas (jsdom cannot exercise pixels); the fixed-2× path and its guidance-not-crash fallback were read in source, with pixel output verified only in real browsers.
- Vector-field *rendering* remains deferred (model, validation, and sampling are built and tested) — matching the FIELDS.md limitation list.

---

## Item 13 — Export consistency

Scope: figure exports (`src/export`: scene → SVG/PNG, dialogs, filenames) and the Data Lab CSV tables (`src/data/csvExport.ts`), including the safeguards that keep exported output identical to what the screen shows.

Status: **VERIFIED with five defects FIXED (audit) and one missing parity test added (claim made true).**

TEST-VERIFIED (2026-10-17): `npx vitest run src/export src/graph src/data src/analysis` → 219/219 passed (18 files), including three new/strengthened export tests and one new palette test. Pre-existing coverage re-run: scene structure (grid/axes/ticks/runs/legend), standalone SVG parses and escapes hostile text, viewBox scaling, filename sanitization (traversal, reserved stems), scale caps, PNG chunk structure plus inflate-and-compare-every-pixel, canvas drawing via recording stub, transparent/white backgrounds, region fills in both renderers, dialog workflows (disabled until plotted, download path, sampler warnings, canvas-unavailable guidance), CSV quoting/injection/round-trip/table selection, and the residuals-recompute-at-export-time test (a singular fit fails honestly instead of serving a stale snapshot).

SOURCE-VERIFIED:
- One shared scene drives SVG and PNG: `buildExportScene` maps world → screen once; both renderers draw grid, fills, axes, origin, ticks, bars, rules, curve runs, points, markers, legend, captions, and title from the same fields; no per-format mapping and no app chrome can enter (the scene is built from world state and sampled segments only).
- Fidelity decisions read and matched to EXPORT.md: curve hex table identical to the light `--gc-curve-*` tokens (now test-guarded), legend rows 18px and caption rows 14px (≤4 rows, ≤140 chars), labels clamped inside the frame, `resolveExportScale` snaps down to quarter steps inside 2400px / 6MP, capping disclosed in both dialogs, PNG encoder (CRC32, IHDR/IDAT/IEND, RGBA-8) validated by structure and pixel checks.
- Log-axis export ticks: `scene.ts` `powerTicks` is a line-for-line mirror of `plots.ts` `logTicks` (same loop bounds and label rules) — verified by reading both.
- Data figures: bars/histograms zero-baseline grouped slots, error-bar whiskers and caps (1.25px; an invalid side omits the bar and is counted in the live notes), gap-split line runs, log10 mapping for series and fit overlay, fit overlay suppressed on bar/histogram — all read and matched to code.
- CSV: numbers at full precision (`String(value)`, never display text), missing serializes empty, CRLF records, `""` quoting, round-trip through the project parser; exports build from current props at click time.

FIXED (audit):
1. **The PNG stored-block fallback wrote invalid zlib.** Where `CompressionStream` is unavailable (older browsers), `deflateData` fell back to raw DEFLATE stored blocks with no RFC-1950 header or Adler-32 trailer — IDAT must be a zlib stream, so those PNGs were corrupt. MEASURED with a temporary probe: the reconstructed pre-fix payload is rejected by `zlib.inflateSync`, while the shipped payload decodes (3×2 fixture, every byte checked). The fallback now wraps stored blocks (`0x78 0x01` + Adler-32); a regression test forces the fallback by unsetting the global and inflates the IDAT through Node zlib.
2. **PNG ignored `SceneTickLabel.anchor`** — every canvas tick label was centre-aligned, so y-axis numbers (start-anchored at the 6px inset in the scene, matching SVG and the live view) could render half outside the frame. The canvas path now maps `middle → center`, `start → left`; a test pins both anchor classes on the recording stub.
3. **PNG title size disagreed with SVG** (600 13px vs 12px). Aligned to 12px; the test asserts the recorded canvas font and the SVG `font-size="12"` / `font-weight="600"` agree.
4. **PNG painted region fills under the grid while SVG and the live view paint them above the grid, below the axes.** Reordered the canvas path to match; the order is asserted in both formats (string positions in the SVG, call indices in the stub).
5. **CSV formula guard swallowed negative numbers**: numeric cells beginning with `-` were quote-prefixed (`'-0.5`), turning exported numbers into text for spreadsheets and breaking the documented “our own CSV re-imports cleanly” for every negative value (residuals, fitted values, dataset columns). The guard now applies to text fields only — a number's `String()` cannot carry a payload — with regression tests (bare `-3` / `-0.5`, the bar text `'-3` still guarded, and a parser round-trip recovering `-2.5` / `-0.5` as numbers).

ADDED (claim made true): `palette.ts` said “the palette test asserts parity”, but no such test existed. New `src/graph/palette.test.ts` reads `src/index.css` and asserts the light `--gc-curve-1..6` tokens equal `LIGHT_CURVE_HEX` slot-for-slot, plus slot-cycling and never-a-variable-for-exports checks.

Residual notes:
- Cross-format equality is asserted per invariant (paint order, anchors, sizes, colours, structure), not by full-raster diffing — no reliable headless rasterizer is on hand; PNG pixels are compared through inflated IDAT against the source buffer, and SVG against parsed structure.
- The PNG path needs a browser canvas; jsdom returns null → guidance (tested). Real-browser pixel rendering remains a manual check.
- `sanitizeExportFilename('   ')` produces the amusing but safe `graphcraft-graph-graph.png` (the suffix keeps stems off Windows reserved device names — test-pinned).
- Exports bake the fixed light theme; dark-theme in-app appearance intentionally differs (documented). 3D/field figure exports were covered under item 12; this item covers the graph, data-figure, and table export paths.

---

## Item 14 — Numerical tolerances (consolidated register)

Status: **VERIFIED — register compiled from source; no acceptance criterion unmet.**

Method: every `1e-N` literal and tolerance identifier across `src/**` was extracted (317 matches) and triaged into: kernel tolerances (below; SOURCE-VERIFIED at the listed location, values re-read in place), limits/budgets that are exact rules rather than tolerances, display-rounding thresholds, unit factors, and test assertion bounds. Product docs already restate the user-observable values (`CALCULATOR.md`, `data/FITS.md`, `learn/CONTENT_MODEL.md`, `learn/ADDING_TEMPLATES.md`, `DECISIONS.md`); this register is the consolidation, with measured evidence cross-referenced to the item that produced it.

**Sampling and rendering** (`src/sampling`, `src/graph`)
- Adaptive splitting: relative 0.0025, absolute floor 1e-12 (`sampler.ts DEFAULT_RELATIVE_TOLERANCE` / `DEFAULT_ABSOLUTE_TOLERANCE`; acceptance `error ≤ max(abs, rel·scale)` via `toleranceAt`). Domain-edge snapping bisects invalid↔valid brackets under the same policy; parametric runs call `toleranceAt` (`parametric.ts`); implicit contours and inequalities inherit the resolved options through the shared sampler (`implicit.ts` has no private tolerance — `resolveOptions` fills the same defaults) — every curve family splits and snaps under one policy.
- Viewport: world spans clamp to 1e-6…1e12 with a ±1e12 fence (`coordinate.ts MIN_WORLD_SPAN`, `clampWorldRect`; restated in DECISIONS.md and RENDERER.md).
- Tick lattice: 1e-9 slacks in the step/ceil/comparison arithmetic and the zero snap (`coordinate.ts`); 1e-9 pixel dedupe when merging polylines; log ticks iterate powers over `[lo−1e-9, hi+1e-9]` (`logTicks`, mirrored by `powerTicks` in the export scene — parity verified in item 13).
- Display-only thresholds (not correctness): tick labels switch to exponential at |v| ≥ 1e6 or < 1e-4 (`coordinate.ts`); the GraphView readout uses ≥ 1e5 / < 1e-3 (`GraphView.tsx`).

**Inspector** (`src/analysis`)
- Roots (`roots.ts`): x-tolerance 1e-9 (`DEFAULT_X_TOLERANCE`); residual floor `max(1e-9, scale·1e-9)`; candidate minimum threshold `max(1e-6, scale·1e-3)`; acceptance `residual ≤ max(residualTol, slopeEstimate·xTol·4)` (slope-scaled, item 4 — measured recovery 9/63 → 63/63 on `sin(10x)`); duplicate merge `max(span·1e-7, xTol·10)`.
- Extrema (`extrema.ts`): duplicate merge `max(span·1e-7, 1e-9)`.
- Derivatives (`derivative.ts`): central-difference step `√ε·max(1,|x|)` (≈ 1.49e-8·max(1,|x|)); cusp/curvature classification `> max(1e-6, scale·1e-3)`.
- Integrals (`integral.ts`): default tolerance 1e-9; acceptance `error ≤ tol·max(1,|value|)`; minimum subinterval 1e-12; budgets depth 12 / 50 000 evaluations; `converged` requires the bound and zero skipped fraction (item 4).
- Intersections (`intersections.ts`): no private tolerance — roots of f−g through `findRoots`, so the root policy above governs (pole crossings fail the residual check like roots do).
- Tangent/normal: vertical handling at `|slope| < 1e-12` (`App.tsx`); normals by −1/m (item 4).

**Learn** (`src/learn`)
- Content verification: `CHECK_TOLERANCE = 1e-6` — anchors, turning-point kinds, annotated points, symmetry/transform probes (`library.ts`; CONTENT_MODEL.md and ADDING_TEMPLATES.md state it).
- Property probes: monotonicity requires strict 1e-9 separation (flat or noisy intervals fail loudly); period reproduced at anchors within 1e-6 with a half-period degeneracy gate (`≤ 1e-3` distinguishes); amplitude sampled within 0.01.
- Practice numeric sets: per-item tolerance, default 1e-9 (`practice.ts`).
- Item 11 re-ran the whole content machine under these gates: 56/56 (42 templates, 12 topics, 8 practice items hand-audited).

**Calculator** (`src/calculator`)
- Linear algebra (`linalg.ts`): singular-pivot ratio 1e-12 relative to matrix scale; residual reliability warning above 1e-8 absolute — MEASURED behaviour: Hilbert-8 fires (3.278e-7), 1e12-scale well-conditioned systems stay quiet; explicitly a heuristic, not a condition estimate (item 7; CALCULATOR.md restates).
- Formatting (`format.ts`): exponential display at |v| ≥ 1e12 or < 1e-6; fraction suggestions only for 1e-12 ≤ |v| < 1e9, accepted only when the remainder < 1e-12 (1e-15 refuses — tested).
- Complex (`complex.ts`): no comparison tolerances — scaled Smith division plus an explicit overflow report when the scaled magnitude leaves the double range (`2^-2000` complex → 'overflow' vs scalar `Math.pow` silent 0: documented lane divergence, item 7).
- Uncertainty (`uncertainty.ts`): weights scaled by `(σ_min/σ_i)²` so the inverse-variance mean and σ stay representable at any finite σ (item 10) — no tolerance involved.
- Statistics: Neumaier compensated summation — no tolerance (item 8).
- Units (`units.ts`): exact in-base factors; affine conversions MEASURED ≈ 6e-14 residues, invisible at the 6–12 significant-digit display policy.
- Parameters: step floor 1e-9 (`parameters/model.ts MIN_PARAM_STEP`; `project/validate.ts` rejects < 1e-9).

**Data Lab** (`src/data`)
- Fits (`fits.ts`): conditioning warning when the scalar R-diagonal ratio `minDiag/maxDiag < 1e-9` — MEASURED to fire only on genuine wide-range/high-degree designs and stay silent on offset/near-duplicate-X designs (item 10; FITS.md states 1e-9); not a condition estimate, coefficient readouts stay conditioning-limited by design.
- Residual plot flag: `|residual| > 2·residualStd` (`FitPanel.tsx`) — a display heuristic, stated in the UI.
- Log axes: non-positive values are excluded exactly (no tolerance); powers-of-ten ticks share the 1e-9 lattice epsilon.
- Counting and overflow: exact integer arithmetic plus explicit warnings (item 6) — no tolerances.

**Export** (`src/export`)
- PNG sizing (`png.ts`): caps 2400 px / 6 MP with deterministic quarter-step snap-down (`Math.max(0.25, Math.floor(min(requested, fitting)·4)/4)`) — quantisation, not acceptance tolerance; capping disclosed in the dialogs (item 13).
- PNG encoding: CRC32; the no-`CompressionStream` path emits zlib-wrapped stored blocks (fixed in item 13).
- CSV (`csvExport.ts`): `String(number)` full precision — no rounding anywhere; missing = empty; the formula guard applies to text fields only (item 13 fix).
- Figure geometry: labels clamp into the frame; curve runs clamp to a 2×-span box — finite guards, not tolerances.

**3D and fields** (`src/viz3d`)
- Hit testing: 24 px screen-space tolerance (`surface.ts tolerancePx`) for point/quad selection.
- Sampling: surfaces and fields run the shared sampler policy; span floors 1e-9; the behind-camera depth divisor clamps at 1e-9 (stated behaviour, item 12).
- Contours: explicit or evenly spanned levels (`fields.ts`); singular cells are the sampler's documented business; arrow caps are exact (≤ 33 per side incl. the boundary column, item 12).

**Project format** (`src/project`)
- Parameter step ≥ 1e-9 and finite ±1e9 bounds (`validate.ts`; PROJECT_FORMAT.md). Schema-version tolerance for pre-v6 fields is structural, not numerical (DATA_MODEL.md).

**Fixture assertion bounds** (test-only, for completeness): analysis roots and closed forms 1e-6; complex/format/domains relative 1e-12 (round-trip ≈ 1e-11); coordinate geometry 1e-9; export bounds 1e-6; Learn 1e-6 and 1e-9 as above. These bound tests, not product behaviour.

**Limits that are not tolerances** (kept exact): integer counts and factorial/binomial overflow refusals (item 6); evaluation budgets (sampler, engine, integral); image caps; arrow and stride caps; painter order (item 12). No threshold churn in this audit: every fix changed behaviour only where correctness required it (slope-scaled root acceptance, weighted-mean scaling, CSV guard scope, the PNG zlib wrapper), and every deliberately unchanged threshold carries its measurement in the item that examined it (`0^0 = 1`, IEEE exact-angle residues, complex-lane overflow divergence, linalg 1e-8, fits 1e-9).

---

## Audit close-out

Status: **COMPLETE — items 1–14 addressed; 22 defects or content errors fixed during items 4–13 (each with regression tests, deepening or claim-tightening); items 3 and 14 verified clean.**

Gates (2026-10-17): `npm run typecheck` exit 0; `npm run lint` exit 0, zero warnings; `npx vitest run` 59 files / 658 tests passed; `npm run build` success (only the pre-existing mathjs chunk-size warning); no dependency changes, no commits (the repository has no commits).

Fix inventory by item: **4** (2) boundary roots, slope-scaled acceptance; **5** (4) stale results across roots/intersections/extrema/tangent/integral, degenerate intersections, swallowed under-resolution warnings; **6** (2) bounded combinatorics loops, divide-first representable binomials; **7** (4) complex division, complex powers, non-finite vector/matrix entries, scaled normalization; **8** (1) Neumaier summation; **9** (1) `g`/`g₀` symbol collision; **10** (1) weighted mean at extreme σ; **11** (1) content typo; **12** (1) 3D painter order plus 1 docs claim tightened; **13** (5) PNG zlib fallback, canvas tick anchoring, title size, fill paint order, CSV numeric guard, plus the missing palette-parity test added.

Where a fix required judgement (root acceptance, painter order, weighted mean, CSV guard, painter-order physics), the item records measured before→after evidence; where a threshold was deliberately kept, the item records the measurement behind that decision (`0^0 = 1`, IEEE exact-angle residues, complex-lane overflow divergence, linalg 1e-8 residual heuristic, fits 1e-9 conditioning heuristic). Remaining known limitations live in each item's residual-notes block; nothing beyond what those notes state is UNVERIFIED.
