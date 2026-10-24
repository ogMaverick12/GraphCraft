# Adding Learn templates (Stage 5 LEARN-01)

Every template is GraphCraft-original prose plus engine-checked
mathematics. Copying textbook pages, proprietary course content, or
claiming curriculum alignment (JEE/CBSE/NCRT or otherwise) without a
deliberately checked, documented mapping is forbidden — tests enforce
the last two.

## Where templates live

`src/learn/templates.ts` (`LEARN_TEMPLATES`), validated by
`src/learn/library.ts`, tested in `src/learn/library.test.ts`.

## Template checklist

1. **Stable id**: lowercase-hyphenated, ≤ 48 chars, unique in the file.
2. **Category**: one of the ten ids in `LEARN_CATEGORIES` (lines,
   polynomials, rational, modulus, exp-log, trigonometry, conics,
   piecewise, polar-parametric, calculus).
3. **Levels**: at least one of foundation/school/competition/college.
   Never write exam-board names anywhere in the entry.
4. **Rows**: 1–4 graph rows using engine-compatible syntax only
   (`log` is base-10 here; natural log is `ln`; no `sign` function —
   build signum from branches). Branched rows need a `defaultSource`.
   Removable discontinuities (holes like (x²−1)/(x−1) at x = 1) are not
   demonstrable — single-point gaps fall below sampler resolution, so
   do not author hole templates claiming a visible hole.
5. **Checks**: exactly one anchor per row, verified by running
   `npx vitest run src/learn/library.test.ts`:
   - cartesian: `f(at) = y` (the most telling point: vertex, root, pole side, crossing);
   - parametric/polar: world `(x, y)` at parameter `at`;
   - implicit: an on-curve `(x, y)` with |left − right| ≈ 0.
   Tolerance is 1e-6; pick anchors the engine evaluates exactly
   (integers, known constants) over pretty-but-irrational ones.
6. **Viewport**: finite ranges, max above min, within ±1e12, chosen so
   the described behaviour is visible (asymptotes, turns, gaps).
7. **Prose**: concise `description` (what the graph shows),
   `objective` starting with an action ("Locate…", "Contrast…"),
   `simplifications` whenever a convention is arbitrary (signum at 0,
   jump rendering, pole gaps).
8. **Attribution**: omit for GraphCraft-original work; required
   (author/source/licence) for anything derived.

## Verification before merge

- `validateLibrary` returns `[]` (schema, ids, parse, ranges).
- `checkTemplate` passes every anchor through `compileRow`.
- `searchTemplates` still filters the new entry correctly.
- Opening the template in the app adds editable copies and leaves
  existing rows untouched (covered by `learn-ui.test.tsx` patterns).

## Topics

Twelve topics live in `src/learn/topics.ts` (see
`docs/learn/CONTENT_MODEL.md`). A new template should join at least
one topic's `templateIds`, or the orphan check fails the suite —
every example must teach somewhere. New topics need a summary,
levels, acyclic prerequisites, and 1–8 existing template ids.

## Annotations and transforms

- `annotations`: curated feature claims (`intercept`, `root`,
  `vertex`, `extremum`, `asymptote`, `symmetry`, `domain`, `range`,
  `tangent`, `parameter`), each with a basis (`exact`, `numerical`,
  `heuristic` — see `docs/learn/ANALYSES.md`), a one-sentence
  `detail`, and verification data: `point` for value claims
  (non-exact labels need ≈), `probe` for asymptotes (`|f|` growth),
  `symmetry` for mirror checks. Domain/range/parameter entries are
  reviewed wording, never computed. Only root/extremum annotations
  reach the graph as markers; everything else is text-only by design.
- `transform`: for single-change demos only — `baseSource` plus a
  `note` with correct sign conventions (f(x−h) goes RIGHT, f(−x)
  mirrors on y, f(bx) scales x by 1/b). Numeric relation tests pin
  each convention and its classic trap.
- `verifyAnnotations` runs per template in the suite; a stale fact
  fails the build instead of shipping.

## Practice items

`src/learn/practice.ts` holds authored prompts (`PRACTICE_ITEMS`):
`predict-transform` and `match-graph` carry options plus a stored
correct index; `identify-feature` carries a numeric set with
tolerance (order-insensitive, duplicates positional); `explore`
carries neither — exploration has no correctness indicator by
design. Checking lives in `checkPracticeAnswer` (exact comparisons
only); algebraic equivalence beyond the offered forms is out of
scope and must be stated in the explanation, not guessed. Progress
(last topic, answered/revealed marks) persists in guarded storage
(`progress.ts`) and degrades to stateless practice. Authoring rules:
original prompts, level labels, one topic + one template each, and
a `validatePractice` pass on every suite run.

No AI tutoring, no remote fetching, no new dependencies for
templates — static data plus the existing engine.
