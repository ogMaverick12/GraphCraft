# GraphCraft provenance record — S8.17 remediation

Status: implementation record for the S8.17 clean-room prose and favicon
remediation. The changes described here were made in the working tree on
2026-10-25 and are not committed. This is a process record, not an independent
audit, ownership verification, legal-clearance opinion, or compatibility
certification.

Baseline revision: `344ceb98afc99957a40d80efa6a1804b36373f9e` (verified as both
`HEAD` and `origin/main` before editing). The existing release candidate and the
S8.14 clearance dossier were treated as immutable; this work does not create a
new candidate.

## Favicon

`public/favicon.svg` was replaced with a from-scratch mathematical-graph mark.
The URL `/favicon.svg`, the manifest entry in `public/manifest.webmanifest`, and
the service-worker shell reference are unchanged.

| Item | Before | After |
|---|---|---|
| Path | `public/favicon.svg` | `public/favicon.svg` |
| Bytes | 9,522 | 515 |
| SHA-256 | `61BC9A161DE58248288E6905425D7180F0624C2865007B97D763FDAC12043A66` | `E4FF4661C7879655E751EFC5F5A3D1FAE38CB8D5D067EF1894E8124E61A94ADC` |
| Canvas | 48×46 | 64×64 |
| Design | Earlier asset; source and permission not independently established | Cream rounded tile, ink axes, indigo plotted curve, orange sample point |

The replacement was hand-authored for GraphCraft. It uses no filters, masks,
gradients, glow ellipses, or Vite bolt geometry, and it does not reuse the
earlier favicon's path data or palette. The colours are the project's cream,
ink, indigo accent, and orange curve token values. The mark is intentionally
simple so the axes and curve remain visible at browser-tab sizes.

The earlier favicon's source, version, and permission remain unresolved. The
new mark is a replacement, not a conclusion about the earlier asset.

## Learn prose

All human-readable Learn prose whose provenance was unresolved was rewritten in
this pass. Stable identifiers and mathematical behaviour were retained.

| Path | Records | Rewritten human-readable fields | Retained |
|---|---:|---|---|
| `src/learn/templates.ts` | 42 templates | 42 titles, 42 descriptions, 42 objectives, 35 annotation details, 5 simplification notes, 3 transform notes, 35 continuity sentences, 1 domain label, and 3 range labels; annotation labels retained where they are coordinate-standard | ids, order, categories, levels, rows, checks, viewports, annotation kinds/bases/points/probes, numeric properties, formulas, parser contracts |
| `src/learn/topics.ts` | 12 topics | 12 summaries; generic topic titles retained | ids, titles, levels, prerequisite DAG, template id links |
| `src/learn/practice.ts` | 8 items | 8 prompts and 8 explanations; 3 prose/match solutions and 2 match-item option lists updated; 5 formula/number solutions retained | ids, topic/template links, kinds, levels, correct option indices, expected numeric sets, tolerances, checking semantics |
| `src/learn/library.ts` | schema/comments | provenance comments and attribution-field wording | validation, search, row builders, anchor checks, schemas |
| `src/learn/LearnLibrary.tsx`, `src/learn/PracticeMode.tsx` | UI copy | removed unsupported originality wording; descriptive headings only | behaviour, controls, accessibility labels, layout |

The rewrite used the displayed equations, engine-checked anchors, and standard
mathematical definitions as its starting points. No external prose, course text,
search-result snippets, or third-party examples were introduced as source
material. No citation was fabricated, and no `attribution` value was added
because no verified external source was identified for these records. Absence of
an attribution value records the absence of a source; it is not proof of
originality.

### Retained template ids (42)

```text
line-slope-intercept
parabola-vertex
line-through-origin
line-point-slope
line-intercept-form
quadratic-factored
quadratic-vertex-form
cubic-inflection
cubic-two-turns
quartic-w-shape
reciprocal
rational-asymptote
rational-bounded-bell
absolute-value
signum-step
floor-staircase
abs-shifted-scaled
abs-reflected
exponential-growth
exponential-decay
exponential-shifted
natural-log
common-log
sine-wave
cosine-wave
tangent-poles
arcsine
arctangent
unit-circle
hyperbola-branches
ellipse-parametric
parabola-focus
heaviside-step
split-power-branches
rose-four-petals
cardioid
parametric-parabola
parabola-tangent-line
sine-area-segment
shift-right-parabola
horizontal-scale-sine
reflect-cubic
```

### Retained topic ids (12)

```text
linear-functions
trigonometric-graphs
quadratics
asymptotes-rational
corners-steps
exponentials-logarithms
polynomial-behaviour
inverse-trigonometry
conic-sections
piecewise-models
polar-parametric-curves
calculus-graphs
```

### Retained practice ids (8)

```text
predict-shift-right
predict-reflect
predict-frequency
identify-quadratic-roots
identify-exp-intercept
match-unit-circle
match-even-corner
explore-rose-coefficient
```

## Changed paths

| Path | Change |
|---|---|
| `public/favicon.svg` | Replacement GraphCraft graph mark |
| `src/learn/templates.ts` | 42-record human-readable prose rewrite |
| `src/learn/topics.ts` | 12 topic summaries rewritten |
| `src/learn/practice.ts` | 8 prompts and 8 explanations rewritten; 3 prose/match solutions and 2 match-item option lists updated; 5 formula/number solutions retained |
| `src/learn/library.ts` | Provenance comments and attribution-field wording |
| `src/learn/LearnLibrary.tsx`, `src/learn/PracticeMode.tsx` | Unsupported originality wording removed from UI copy |
| `src/learn/learn-ui.test.tsx`, `src/learn/practice-ui.test.tsx` | Selectors updated for the rewritten titles and notes |
| `src/learn/provenance.test.ts` | Focused integrity and favicon regression coverage |
| `README.md`, `CONTRIBUTING.md` | Originality wording corrected; this record linked |
| `THIRD_PARTY_NOTICES.md` | Provenance wording corrected; licence texts unchanged |
| `docs/DECISIONS.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/learn/ADDING_TEMPLATES.md`, `docs/learn/CONTENT_MODEL.md`, `docs/ROADMAP.md` | Provenance, design, and contributor wording corrected |
| `docs/QUALITY_GATES.md` | S8.17 validation results recorded |
| `docs/PROVENANCE.md` | This process record |

## What this record does and does not establish

- It records the files and fields changed, the counts, the stable id sets, and
  the process followed during S8.17.
- It records that the project owner has not independently attested to the
  original Learn content’s provenance, including the earlier favicon and earlier
  text.
- It does not establish independent authorship, originality, non-infringement,
  legal clearance, trademark clearance, or fitness for any jurisdiction.
- It does not claim an exhaustive external search. Common mathematical
  phrasing can coincide with unrelated material; this record does not attempt
  to prove the absence of every possible similarity.
- It does not resolve the earlier favicon's source or permission, the earlier
  Learn text's provenance, the separate question of copyright in generated
  Tailwind CSS, or the other release-evidence gaps recorded in the S8.14
  dossier.
- It does not modify the MIT licence, the `ogMaverick12` copyright holder, the
  verified third-party licence texts, or the notice-generation architecture.

## Verification

Focused regression coverage lives in `src/learn/provenance.test.ts` and the
updated Learn UI tests. The full gate results, counts, and durations are recorded
in the S8.17 entry in `docs/QUALITY_GATES.md` and in the S8.17 validation
report. Those results verify repository behaviour; they are not a legal or
ownership conclusion.
