# GraphCraft — Symbolic mathematics evaluation (Stage 3)

Status: **deferred — no symbolic engine shipped.** This note records the
research, the criteria, and what would reopen the decision, so a CAS is
never faked with numerical output.

## What was evaluated

- **mathjs full bundle** (same audited package, Apache-2.0, maintained):
  ships `simplify`, `derivative`, `rationalize`, and `Fraction` —
  confirmed present in the installed `mathjs@15.2.0` tree
  (`lib/esm/function/algebra`, `lib/esm/type/fraction`). The algebra
  sources alone are ~253 kB unminified, before the typed-dispatch and
  type-system closure they require; our whole production bundle is
  ~770 kB. Pulling them in would materially grow the download for
  features no current task requires.
- **Security posture**: our engine trusts only the AST allowlist.
  `simplify`/`derivative` execute rewrite rules over parsed nodes — a
  second, wider trusted surface with its own edge cases, needing its
  own audit before it touches user input.
- **Exact arithmetic**: full `Fraction` support exists upstream, but we
  do not need its generality: exact rational `+ − × ÷` is implemented
  natively with BigInt (`src/calculator/rational.ts`) at zero bundle
  cost and zero surface growth.
- Third-party CAS libraries (nerdamer-style): no network search returned
  verifiable licence/maintenance evidence in-session, so none was
  adopted — per policy, an unverified dependency is not a dependency.

## Decision

Ship native exact rationals now; defer simplify/expand/factor and any
general CAS until a task needs them. Reopen when ALL hold:

1. A task requires named symbolic transformations (not just rationals).
2. The chosen engine's licence is verified compatible (Apache-2.0/MIT-class).
3. Bundle delta is measured against the current ~770 kB and accepted.
4. The adapter exposes only the chosen operations on gated input, with
   per-operation fixture tests, and symbolic results are labelled
   separately from numerical estimates.

## If reopened: adapter shape

`src/calculator/symbolic.ts` — one function per exposed operation,
input restricted to the gated grammar, output labelled
`symbolic: simplify` (etc.), never mixed into numerical result types.
