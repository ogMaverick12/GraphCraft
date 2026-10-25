# GraphCraft — Learn content architecture (Stage 5 S5.1)

Two static layers plus one thin view. No database, no fetching, no
tutoring service — everything ships with the app and works offline.

## Layers

```
src/learn/templates.ts    42 templates (stable ids; prose rewritten in S8.17)
src/learn/topics.ts       12 topics (titles, summaries, levels, prereq DAG, template ids)
src/learn/practice.ts     8 prompts (options/sets/solutions per kind)
src/learn/library.ts      template validation, search, row builders, anchor checks
src/learn/curriculum.ts   topic validation (refs, DAG cycles), lesson resolve, learning paths, duplicate audit
src/learn/bookmarks.ts    guarded localStorage stars (degrades to empty)
src/learn/progress.ts     last topic + practice marks (degrades to stateless)
src/learn/PracticeMode.tsx  topic picker, decidable checking, show-answer flow
src/learn/LearnLibrary.tsx  search/filter cards, previews, compare, open, bookmarks, topics
```

Content (`templates.ts`, `topics.ts`) holds no components; the view
(`LearnLibrary.tsx`) holds no mathematics beyond mapping sample points
to pixels. Validation lives beside the data it guards.

## Provenance

The S8.17 clean-room pass rewrote all 42 template titles, descriptions,
objectives, annotation details, simplification notes, transform notes, and
continuity prose; all 12 topic summaries; and all 8 practice prompts and
explanations. Three prose/match solutions and two match option lists were
updated to the new template titles; five formula/number solutions were retained.
Stable ids, formulas, checks, viewports, curriculum links, and practice check
semantics were retained. See `docs/PROVENANCE.md`. The record describes process
and unresolved provenance; it is not legal clearance, and the project owner has
not independently attested to the original Learn content’s provenance.

## Offline, accessibility, and performance notes

- Offline by construction: the library is static data plus the
  existing engine — no fetch, no accounts, no remote content. It
  ships in a lazily loaded chunk (`LearnLibrary-*`), so startup pays
  nothing until the first Learn visit.
- Card previews use a fixed white plate with the fixed palette, so
  curves stay legible in both themes (same convention as export
  figures). All controls are native labelled elements with visible
  focus; cards, radios, and dialogs are keyboard-operable (tested).
- Approximations and unsupported properties follow `ANALYSES.md`:
  labelled bases, stated probes, absent-means-not-applicable.

## Lesson schema

A lesson is a resolved topic, not a stored object:

- `LearnTopic`: id, title (≤60), summary, levels, prerequisites
  (topic ids, DAG-enforced), templateIds (1–8, all must exist).
- `LearnTemplate`: id, title, category, levels, description,
  objective, checks (one anchor per row), rows (1–4 graph specs),
  viewport, optional simplifications/attribution.
- `resolveLesson(topics, templates, id)` joins them; unknown ids are
  validation errors, never silent gaps. A template serves several
  topics without duplication; `orphanTemplates` keeps every example
  teaching somewhere.

## Verification metadata

Each template's `checks` are anchor values probed through `compileRow`
(tolerance 1e-6): cartesian `f(at) = y`, parametric/polar world
`(x, y)` at `t/θ`, implicit `|left − right| ≈ 0`, inequality region
membership. `validateLibrary` (schema, unique ids, engine parse,
viewport bounds) plus `checkTemplate` run on every test pass; the
contributor guide (`ADDING_TEMPLATES.md`) makes both merge gates.

## Adding a topic

Pick an id, title, summary, levels, prerequisites (existing ids,
acyclic), and 1–8 template ids that already exist. Run
`npx vitest run src/learn/` — validation names unknown refs and
cycles, and the orphan check fails if a template teaches nowhere.
Wire the topic into no other file: the library reads the static list.
