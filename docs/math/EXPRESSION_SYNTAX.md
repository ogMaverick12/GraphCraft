# GraphCraft — Expression syntax (GS-01 math engine)

Student-friendly input for one real variable `x`, compiled once per
expression row and reused while only `x` changes. Angles in **radians**.

## Syntax

| Element | Examples | Notes |
|---|---|---|
| Numbers | `2`, `0.5`, `1e3`, `1.5e-2` | Decimal and scientific notation |
| Variable | `x` | Lowercase only; `X` is rejected |
| Constants | `pi`, `e` | Lowercase only; `PI` is rejected |
| Arithmetic | `+  -  *  /  ^  !` `( )` | `^` is exponentiation; `!` is factorial |
| Implicit mult. | `2x`, `2(x+1)`, `2pi` | Deliberate and tested |
| Functions | `sin cos tan asin acos atan sinh cosh tanh sqrt abs exp log ln floor ceil round mod factorial permutations combinations` | Lowercase only |

Numbers are decimal or scientific notation only. Quoted text (including
quoted digits such as `"5"`) and hexadecimal, binary, or octal integer
literals (`0xff`, `0b1010`, `0o17`) are outside the student syntax: each
is rejected as `unsupported` at compile time and never reaches the
number-only evaluator.

`log(x)` is base-10; `ln(x)` is the natural logarithm. (This differs from
the wrapped library's default and is implemented explicitly.)
`log(x, base)` uses a general base with domain checks (x > 0, base > 0,
base ≠ 1). `round` goes half away from zero (`round(1.125, 2)` = 1.13;
note `2.445` is fractionally below its decimal name in doubles, so it
rounds to 2.44 — documented, not a bug). `mod` is floored and takes the
divisor's sign (`mod(-7, 3)` = 2). `permutations(n, k)` / `combinations(n, k)`
need integers with 0 ≤ k ≤ n.
`sinh/cosh/tanh` are radian-only. `n!` and `factorial(n)` accept
non-negative integers only (`0!` = 1); anything else is a domain error,
and values past 170! overflow honestly. (The wrapped library would apply
gamma here; GraphCraft refuses instead.)

## Named parameters

Expressions may reference user-defined numeric parameters (e.g. `a`,
`b`, `h`, `k`) alongside the row's variable. Names are case-sensitive:
letters first, then letters, digits, or underscores (max 16 chars); the
lowercase variables `x`, `y`, `t`, `theta`, the constants `pi`, `e`,
and supported function names are reserved and rejected as parameter
names.
Undeclared names fail compilation with an unknown-symbol message naming
the slider-defined set implicitly ("use x, pi, e, or a defined
parameter").

Values arrive per evaluation, never baked into compilation: moving a
slider resamples dependents without reparsing anything. A missing or
non-finite value is an evaluation error, never a silent default (sliders
clamp to [min, max], so this surfaces only for hand-built calls).
Parameter bounds: finite, min below max, step ≥ 1e-9, at most 100000
steps per range, bounds within ±1e9.

## Parametric and polar rows

- **Parametric:** `x(t)` and `y(t)` share one parameter range
  (`tMin` below `tMax`, finite; reversals rejected). Both components use
  the same gated syntax with `t` as the variable (`x` is rejected there
  to avoid ambiguity).
- **Polar:** `r(θ)` with an angle range in **radians** (same convention
  as trig functions). Rendered through `x = r·cos θ`, `y = r·sin θ`.
  **Negative-radius policy:** negative `r` plots through the conversion
  directly — equivalent to angle + π, e.g. `r=-2` at `θ=0` lands on
  `(-2, 0)`.
- Piecewise branches and x-domains are cartesian-row features; the
  parameter range plays that role for parametric/polar rows.

## Labels

Each expression row may carry an optional label (up to 60 characters),
shown in the row, the inspector, legends, and exports. Labels are for
humans; the source text remains the authority. Non-empty labels must be
unique (case-insensitive) within a project file; the editor warns
in-line when two rows share one.

## Domain restrictions

A row may restrict `x` to one interval, e.g. `sqrt(x)` on `[0, 4]`.
Bounds must be finite with min below max — reversed or empty ranges are
rejected with an actionable message. The sampler intersects the domain
with the view; a domain outside the view plots nothing (with an
"empty domain" note), never an error elsewhere.

## Piecewise definitions

Structured branches, not syntax: each branch pairs one condition over
`x` (`x <`, `x ≤`, `x >`, `x ≥` a finite value) with an expression in
the same syntax above, plus an optional default expression.
**First match wins**; overlapping conditions are permitted under that
rule. A blank default leaves unmatched regions blank (honest gaps).
Branch boundaries are handed to the sampler, which never connects runs
across them. Limits: 20 branches per row.

## Implicit curves and inequalities

- **Implicit:** two expressions `left` and `right` define
  `F(x, y) = left − right`; the graph draws the zero contour `F = 0`
  (e.g. `x^2 + y^2` = `1`). Both sides use the same gated syntax with
  `x` and `y` as variables.
- **Inequalities:** `left` compared to `right` with `≤`, `≥`, `<`, or
  `>`. The kept side fills at low opacity under axes and curves, with
  the boundary drawn solid (non-strict) or dashed (strict).
- Contouring is numerical (marching squares on a bounded grid):
  components smaller than a cell can be missed, region edges resolve at
  grid resolution, and constant fields are reported rather than drawn.
  See the sampler docs for the full guarantee list.

## Precedence (tested, do not change without updating fixtures)
1. `^` — highest, **right-associative**: `2^3^2` = 512
2. Unary `-`/`+` — looser than `^`: `-x^2` = `-(x²)`, so `-2^2` = -4
3. `*` `/`, then `+` `-`, then parentheses override everything.

## Angle convention
Radians everywhere in the graph engine. UI help must say so next to every trig
context. The calculator offers an explicit degree mode that rewrites trig
calls before compilation (shown as "computed as"); the graph engine itself
never changes convention. Degrees support is a later, explicit feature — never guess.

## Limits
- Source: 500 characters max per user-entered expression component
  (`MAX_EXPRESSION_LENGTH`), including each side of an implicit or
  inequality equation. The internal subtracted form is not user source and
  is not charged against that cap.
- Tree: 300 AST nodes max (`MAX_EXPRESSION_NODES`).
- Evaluation is synchronous and bounded by those caps; the compiled form
  carries its `source` so later work can recompile inside a Web Worker.
  No loops, recursion, or allocation primitives are reachable, so unbounded
  evaluation is not expressible.

## Failure taxonomy (never coerced to zero)
| Kind | Meaning | Examples |
|---|---|---|
| `parse-error` (+ position) | Malformed syntax | `((x)`, `sin(x`, `2+`, empty input |
| `unsupported` | Well-formed but outside student syntax | `y`, `X`, `2%3`, `x=2`, `f(x)=x`, `[1,2]`, `window.x`, `"5"`, `0xff`, `0b1010` |
| `limit` | Over length/complexity caps | 300-term sum, 120-deep nesting |
| `domain-error` | Valid, undefined at this `x` (NaN) | `sqrt(-4)`, `0/0`, `ln(-1)` |
| `overflow` | Non-finite result (±Infinity) | `1/0` at `x=0`, `10^1000` |
| `evaluation-error` | Evaluator fault, not user fault | Non-number input or unexpected throw |

## Security model
- No `eval`, `new Function`, or dynamic import of user text — verified by
  test suite (`expression.test.ts`, "hostile input stays inert").
- Parsed AST allowlist: numeric `Constant` values (quoted strings
  rejected), `x/pi/e` symbols, `+ - * / ^ !`, listed functions,
  parentheses. Property access, assignment, arrays, objects, ranges,
  comparisons, and unknown names are rejected pre-compile.
- Evaluation scope contains exactly `{ x }`. `window`, `document`,
  `globalThis`, `fetch`, `process`, `require`, and application internals
  are unreachable — covered by failing-compile tests.
