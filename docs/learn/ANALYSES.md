# GraphCraft — What each analysis actually is (Stage 5 S5.2)

Every computed or curated claim carries one basis. The basis travels
with the figure (badges, method notes, marker wording) — never as
fine print.

## The four bases

| Basis | Meaning | Examples |
|---|---|---|
| `exact` | Closed-form fact, checkable by substitution | Intercepts (`f(0)`), factored roots, vertices via completing the square, `ln(1) = 0`, domains from definitions, stated transform parameters |
| `symbolic` | Algebra performed by the engine on expression structure | None yet — GraphCraft has no symbolic engine (see `docs/math/SYMBOLIC.md` for the deferral). This row exists so the gap is explicit, not hidden. |
| `numerical` | Number produced by an iterative or sampled procedure, with tolerance | Inspector roots (bracketing), extrema (golden-section), derivatives (central differences), integrals (adaptive Simpson), tangent overlays, fitted coefficients (Householder QR), residual spreads |
| `heuristic` | Pattern inferred from sampling with a stated probe | Pole blow-up checks (`|f| > N` near a point), even/odd mirror probes, overfit warnings, conditioning warnings |

## Rules

- Numerical results are labelled estimates with their method attached
  (`methodNote`), never bare numbers. Approximations carry ≈ markers
  or wording in labels.
- Heuristics name their probe (offset, threshold, sample points) and
  what would change the verdict. A failed probe is an error or an
  omitted claim — never a silent pass.
- Exact claims must evaluate in tests (`verifyAnnotations`,
  `checkTemplate`); a curated fact that stops evaluating fails the
  suite instead of shipping stale.
- Unsupported expressions get "could not be determined", never a
  guessed property. In particular: no claim of *all* roots, *full*
  domain/range, or *all* asymptotes unless the procedure enumerates
  them — current procedures do not, and say so.
- Graph markers borrow shapes only with identical semantics: roots
  draw as roots (on y = 0 like every root marker), vertices/extrema
  as extrema. Y-intercepts, asymptotes, symmetry, domains, tangents,
  and parameters are text-only in Learn — they never wear a marker
  shape that would mislabel them.

## Where each basis appears

- Learn cards: basis badges (`exact`/`numerical`/`heuristic`) with
  hover explanations; the annotation list doubles as the text
  equivalent for every visual marker.
- Graph Studio: analysis markers are `numerical` (method notes in
  the Inspector); template markers are curated `exact` roots/extrema
  only, offered behind an explicit toggle plus an export-time
  checkbox (default on).
- Data Lab: fitted coefficients and spreads are `numerical` with
  method notes; R²-null and conditioning cases are stated limits.
