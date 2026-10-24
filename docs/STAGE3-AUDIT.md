# GraphCraft — Stage 3 Audit Log (Scientific Calculator)

Date: 2026-10-15. Scope: everything from Stage 3 preflight through final
acceptance (CALC-01 → CALC-02 → CALC-03 → S3.1–S3.9). No Stage 4 work.
All commands below were actually run; all numbers observed, not estimated.

## 0. Preflight (before any calculator code)

- **Stage 2 acceptance verified**: full suite 250/250 across 24 files; S2.1–S2.5 per ROADMAP ledger; no graphing regressions.
- **Backup**: `GraphCraft-backup-20261015-precalc/` — source (83 files incl. all 10 `analysis/` files), docs, configs, lockfile; `node_modules`/`dist` excluded.
- **Baseline gates**: `typecheck` 0, `lint` 0 warnings, `test` 250/250, `build` success (known mathjs >500 kB info only).
- **Engine inspected** (`src/math/engine.ts`): mathjs 15.2.0 number-only bundle behind an AST gate — 5 operators, 14 functions, `pi`/`e`; caps 500 chars / 300 nodes; `log` = base-10, `ln` = natural; taxonomy `parse-error/unsupported/limit` → `value/domain-error/overflow/evaluation-error`; no `eval`/`new Function`.
- **Dependencies**: lockfile confirms mathjs 15.2.0 Apache-2.0; bundle 733 kB JS / 216 kB gzip, mathjs-dominated. Rule set: no new dependency without ADR + bundle review.
- **Conventions gap found**: associativity, `%` rejection, radians-only trig, double precision, and complex-impossibility were undocumented — recorded for `EXPRESSION_SYNTAX.md` + calculator docs.

## 1. CALC-01 — Calculator workspace

**Engine (additive, shared with graphing):** allowlisted `sinh/cosh/tanh` (already in the number bundle) and integer-strict `factorial` + postfix `!` (non-integers/negatives → domain error, 171! → overflow). Graphing gains the same functions consistently — no forked semantics.

**Pure layer** (`src/calculator/evaluate.ts`, `format.ts`): `%` strictly as per-operand `/100` (`50+10%` = 50.1); degree mode rewrites trig calls to radian engine syntax (inverse results back), always shown as "computed as"; hyperbolics never rewritten. Variable-bearing input (`x+2`) is reported, never evaluated with a hidden binding. Display policy: integers < 1e15 exact; extremes exponential; otherwise ≤12 significant digits; internal values untouched.

**UI** (`src/calculator/Calculator.tsx`): Rad/Deg toggle, editable expression line, full keypad (arithmetic, powers, roots, reciprocal, sign, trig, hyperbolics, logs, constants, Ans), Enter/Escape/Backspace keyboard support, history (newest-first, 10/20/50 limit, persisted best-effort), copy with fallback, per-entry edit + send, in-app syntax help.

**Shell wiring** (`App.tsx`, `TopBar.tsx`): `StudioView` (`graph`|`calculator`) + segmented switcher; calculator state independent; sole bridge is explicit send-to-graph (numeric values as full-precision constants, variable input plotted as expressions with the reason shown).

**Tests**: 19 (12 unit + 7 UI). **Bugs found by tests, fixed**: nested-degree expectation, interpreted-text parens.

## 2. CALC-02 — Structured modes (all native, zero new dependencies)

- **Complex** (`complex.ts`): `a+bi` (engine-evaluated parts), `i`, reals; add/sub/mul/div, conjugate, magnitude, arg on atan2 (−π, π], integer De Moivre powers. Later extended (S3.5): polar `r∠θ` entry/display, principal nth roots, principal-branch exp/log/sin/cos/tan with the negative-real cut documented (`log(−1) = iπ`).
- **Vectors/matrices** (`linalg.ts`): strict bracket grammars; add/sub/dot, 3D-only cross, norms, normalization (zero vector refused), scalar multiples; matmul/transpose/determinant/inverse/solve by Gauss-Jordan with partial pivoting. Residual honesty added (S3.6): inverses/solutions compute max |A·X−B| and warn *ill-conditioned* above 1e-8 (Hilbert-8 fixture trips it; well-conditioned stays clean). Caps: 256-vector, 8×8 matrix.
- **Statistics** (`stats.ts`): n, sum, mean, median, mode(s) by stated rule, min/max, range, R-7 quartiles + IQR, population σ (÷n) vs sample s (÷n−1) labelled on every figure. Paired-data regression explicitly deferred to Data Lab.
- **UI** (`StructuredModes.tsx` + history union in `Calculator.tsx`): mode tabs, structured entry fields + operation selects, every result with its method note, shared history with copy; structured rows state that only real scalars send to the graph.

**Tests**: 20 unit + 7 UI (incl. conjugate identities, singular refusal, σ/s labelling, solve honesty showing `[4.440892e-16, 2.5]` rather than a rounded `[0, 2.5]`).

## 3. CALC-03 — Units + exact rationals; symbolic deferred

- **Units** (`units.ts`): thirteen dimensions as one SI-base registry; temperature affine through kelvin on a separate path; incompatible dimensions (m→kg) and unknown units refused loudly; exact-vs-approximate stated per unit (defined relations, named conventions, doubles-rounding acknowledged). Power (W/kW/defined hp) added on audit. Round-trip fixtures; pure arithmetic — offline by construction.
- **Exact rationals** (`rational.ts`): BigInt `p/q`, always reduced; integers, fractions, decimals, scientific all exact; display shows fraction beside its decimal.
- **Symbolic decision** (`docs/math/SYMBOLIC.md`, ADR-027): inspected the installed mathjs full bundle (`simplify`/`derivative`/`rationalize`/`Fraction` present) but its algebra sources alone are ~253 kB unminified before their closure, against a ~770 kB total bundle, for unrequested features plus a second trusted surface. Third-party CAS had no verifiable licence evidence in-session. Verdict: native rationals now; full CAS deferred with four reopen criteria (task need, verified licence, measured bundle delta, gated adapter with labelled output). No CAS faked.

## 4. S3.3–S3.9 closures (gaps found by audit, all fixed)

- **S3.3**: general-base `log(x, base)` with domain checks; half-away `round`; floored `mod`; integer-strict `permutations`/`combinations`. Two silent-wrong bugs fixed: the old `log` override ignored a second argument; `7%3` could parse as `7/1003` (now left for the engine to reject honestly). Keypad + help + syntax docs updated.
- **S3.4**: selectable 6–12 significant digits (display only; send still full-precision, proven by test); ≈ fraction toggle (continued fractions, denominator ≤ 1000, always labelled — exact lane stays bare); near-zero honesty; round-trip fixtures.
- **S3.5–S3.8**: covered in §2–§3 above.
- **S3.9**: MC/MR/M+/M− register (disabled-state guards, persisted, history untouched); paste-through-gate test; persistence policy documented (local-only, not in project files, degrades gracefully, user clearing controls); calculator lazy-loads off the initial bundle — **initial JS 789.5→736.6 kB, calculator in a 56 kB on-demand chunk** (measured). Real a11y bug found and fixed: the memory readout inside the `<label>` corrupted the textbox's accessible name.

## 5. Final quality gates (observed 2026-10-15)

- `npm run typecheck` → exit 0, zero errors.
- `npm run lint` (`oxlint`) → exit 0, zero warnings.
- `npm test` → **31 files, 329/329 passed** (250 pre-existing intact + 79 new, incl. a 20-input hostile suite: `constructor`, `__proto__`, `process.exit`, `fetch`, property access, assignment — all refused).
- `npm run build` → success (only the known chunk-size info). Dev server → HTTP 200.

## 6. Decisions recorded

ADR-025 (engine reuse + rewrite-to-syntax), ADR-026 (native structured lanes, no new dependency), ADR-027 (units registry + native rationals; symbolic deferred). `DEPENDENCIES.md` unchanged by design — zero new dependencies.

## 7. Deferred / known limits

No symbolic CAS (criteria recorded); no paired-data regression (Data Lab scope); no matrices/statistics beyond stated caps; no degree-mode graphing; touch pinch untested (pre-existing); no live-Chrome harness in-session (workflows covered by 30 integration tests + HTTP smoke instead — declared, not claimed).

## Verdict

**Stage 3 accepted 2026-10-15.** No unresolved bugs known. Bundle grew 733 → 789.5 kB total (+56 kB on-demand calculator chunk, −53 kB off the initial load).
