# GraphCraft — Calculator (Stage 3 CALC-01)

Independent workspace sharing the graph engine's parser, gate, and
arithmetic (`src/math/engine.ts`). No expression semantics are
duplicated: the calculator only rewrites two of its own conventions
into engine syntax before compiling, and always shows what ran.

## Syntax help

| Element | Examples | Notes |
|---|---|---|
| Arithmetic | `+  -  *  /  ^  !` `( )` | `^` right-associative; `!` is integer factorial |
| Percent | `50%`, `(3+2)%` | Strictly per-operand `/100`: `50+10%` = 50.1, not 55 |
| Roots | `sqrt(16)`, `9^(1/2)` | Same engine function as the graph |
| Reciprocal | `1/(8)` via the `1/x` key | Wraps the current expression |
| Sign | `±` key or leading `-` | Unary minus binds loosest (`-2^2` = −4) |
| Trig | `sin cos tan asin acos atan` | Radians in Rad mode; see angle modes |
| Hyperbolic | `sinh cosh tanh` | Always radians, both modes |
| Logs/exp | `log ln exp` | `log` is base-10, `log(x, base)` general; `ln` natural |
| Rounding | `abs floor ceil round mod` | `round` half away from zero; `mod` floored with the divisor's sign |
| Combinatorics | `n! factorial(n) permutations(n,k) combinations(n,k)` | Integers, 0 ≤ k ≤ n; overflow reported |
| Constants | `pi`, `e`, `1e3` | Lowercase; scientific notation accepted |
| Ans | `Ans` key | Inserts the last numeric result (full precision) |

Unsupported input (`foo(2)`, `x=2`, over-length text) fails with the
engine's `syntax` / `unsupported` / `limit` messages, unchanged.

## Angle modes

- **Rad** (default): input compiles verbatim. Identical to the graph
  engine — the two can never disagree.
- **Deg**: each `sin/cos/tan(arg)` compiles as
  `fn((arg)*pi/180)`; each `asin/acos/atan(arg)` compiles as
  `((fn(arg))*180/pi)`. Hyperbolics are never rewritten. The panel
  shows the rewritten text as "computed as", and degree results sent
  to the graph arrive already converted (engine syntax is radians).
- The mode is shown next to every result (`rad`/`deg` tag in history)
  and persisted in guarded browser storage.

## Numeric policy

Standard IEEE-754 doubles — no arbitrary precision is claimed.

- History stores the **internal number** untouched.
- Display: integers with |v| < 1e15 exactly; non-zero |v| ≥ 1e12 or
  < 1e-6 in exponential form (6 fractional digits); otherwise the
  selected significant digits (6/8/10/12, default 12, persisted),
  trailing zeros stripped (`0.1+0.2` shows `0.3` at any setting).
  Near-zero residues (e.g. `4.440892e-16`) print as-is, never as 0.
- Fraction display shows the nearest simple fraction (continued
  fractions, denominator ≤ 1000) labelled ≈ beside its decimal —
  an approximation, unlike Exact-mode `p/q`, which prints bare.
  Integers and extreme magnitudes fall back to decimal.
- Copy uses the decimal display so it pastes back; Send-to-graph uses
  the full value (`0.30000000000000004`, not `0.3`). Toggling display
  never changes the calculation.
- Divide-by-zero and `10^1000` report **overflow**; `sqrt(-1)` and
  `log(-5)` report **domain errors** — never zero, never silent.

## Graph hand-off (explicit only)

- A numeric result offers **Send result to graph**: the full-precision
  value becomes a constant row, and the app switches to Graph Studio.
- Input mentioning `x`, `y`, `t`, or `theta` has no numeric value here
  (never evaluated with a hidden binding) and offers **Plot expression
  in graph** instead, with the reason shown.
- Error outcomes offer no send action.

## History

Newest first, configurable keep-limit (10/20/50, default 20).
Selecting an entry reloads its text for editing. Structured results
record with their method notes and copy as text.

### Persistence policy

History, angle mode, display settings, and the memory register persist
in guarded browser storage (`graphcraft-calculator` key) — local-only,
never in the project file, never on a server. A full or blocked store
degrades to session-only without blocking calculation. Users clear
stored data with History → Clear (rows), MC (memory), or the browser's
site-data controls. Corrupt payloads fall back to defaults.

### Memory

One register: M+ adds the current result, M− subtracts it, MR inserts
the stored value at full precision, MC forgets it. M+/M− stay disabled
without a current result; MR/MC stay disabled while empty — no stale
or accidental writes. Memory never touches history rows.

## Structured modes (CALC-02)

Scalar, Complex, Vector, Matrix, and Stats tabs share one history.
Each lane is a typed, dependency-free module; the engine evaluates
scalar parts, combination happens in the lane.

- **Complex** (`complex.ts`): free text `a+bi` (parts may be engine
  expressions: `pi/2+1i`), pure `i`/`-i`/reals, and polar `r∠θ` entry
  (θ in radians). Add/sub/mul/div, conjugate, magnitude, real/imaginary
  parts, integer powers (De Moivre), rectangular/polar conversion on
  the (−π, π] argument convention, principal nth roots, and the
  principal-branch transcendental set (exp, log with its negative-real
  cut, sin, cos, tan). Anything else is an explicit unsupported error.
- **Vector** (`linalg.ts`): strict `[1, 2, 3]` grammar (entries are
  engine expressions). Add/sub, dot, 3D-only cross (right-hand rule),
  norm, scalar multiple, normalization (the zero vector is refused).
  Dimension mismatches are errors; no units are inferred. At most 256
  entries.
- **Matrix** (`linalg.ts`): strict `[[1, 2], [3, 4]]` grammar,
  rectangular-checked, at most 8×8. Add/sub/mul with inner-dimension
  checks, transpose, determinant and inverse/solve by Gauss-Jordan
  elimination with partial pivoting. Pivots below 1e-12 of matrix
  scale diagnose singularity (determinant reports 0 with the reason;
  inverse/solve refuse). Inverses and solutions carry a residual
  check — residual above 1e-8 warns ill-conditioned (Hilbert-8
  fixture) instead of blessing the result. Finite precision is
  stated, not hidden.
- **Stats** (`stats.ts`): strict `[2, 4, ...]` grammar. Reports n,
  sum, mean, median, mode(s), min/max, range, quartiles Q1/Q3 with the
  linear-interpolation (R-7) convention documented, IQR, population
  variance/σ (÷n) and sample variance/s (÷(n−1), needs n ≥ 2) with both
  conventions labelled on every figure, plus SEM = s/√n (needs n ≥ 2;
  precision of the mean under iid sampling — never a confidence
  interval). The lane adds two analyses over the same grammar:
  paired covariance (÷n/÷(n−1)) + Pearson r (null on constant
  columns; rows match by position; equal lengths enforced; causation
  disclaimed on every figure) and moving averages (trailing causal
  or centered odd-k; full windows only — output shortens, never
  pads; even-centered, short, and non-finite inputs refused). Mode rule: values tied at the
  top frequency, or "none" when all values are unique. Paired-data
  covariance/correlation/regression are Data Lab scope, not this lane.
- **Uncertainty** (`uncertainty.ts`): strict `value ± sigma` grammar
  (`±`, `+/-`, `+-`; both sides are engine expressions) and
  `[(value, sigma), …]` lists. Uncorrelated first-order propagation
  for +/− (σ = √(σA²+σB²)), × (absolute form, exact at zero
  crossings), ÷ (zero divisor refused), and v^k (fractional powers
  need v ≥ 0; 0^k with k < 1 refused), plus inverse-variance weighted
  means (w = 1/σ², σ = 1/√Σw — the same convention as Data Lab fit
  weights; every σ must be finite and > 0). Negative sigmas refused;
  σ = 0 means exact. Every figure states its formula and the
  independence/linearisation assumptions; asymmetric bounds never
  enter (they are a Data Lab display concept).
- Every structured result records into history with its method note
  and copies as text. Only real scalar values can be sent to the
  graph; structured rows say so instead of offering a misleading send.
- **Workspace integration**: the calculator shares the graph engine's
  expression semantics (same parser gate, same degree conventions) but
  keeps independent state — measurements typed here are never silently
  consumed as Data Lab observations, and derived values only reach the
  graph through the explicit send-to-graph action (constants) or
  plot-expression handoff (variable input). The weighted-mean lane
  and Data Lab fit weights use the identical w = 1/σ² convention,
  cross-referenced in both panels, without sharing inputs.
- **Units** (`units.ts`): thirteen dimensions (length, mass, time,
  temperature, area, volume, speed, acceleration, force, energy,
  power, pressure, angle) as a registry of SI-base factors. Temperature is
  affine through kelvin on a separate path; incompatible dimensions
  refuse loudly; each unit states exact-vs-approximate. Conversions are
  pure arithmetic over the registry: no account, server, or paid API —
  offline by construction.
- **Exact rationals** (`rational.ts`): BigInt `p/q` arithmetic
  (integers, fractions, decimals, scientific), always reduced;
  display shows the fraction beside its decimal, never instead of it.

## Deferred (not in the calculator stages)

Expression simplification or any general symbolic transformation
(recorded in `SYMBOLIC.md`), paired-data regression (Data Lab scope),
degree-mode graphing.
