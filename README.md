# GraphCraft

Free, open-source, local-first scientific graphing and mathematics
studio. No backend, no accounts, no telemetry — documents are files,
computation happens in your browser, and the production build works
offline after the first load.

## What works today (all tested, all local)

- **Graph Studio** — equation plotting with inline errors, domains,
  piecewise branches, parameters with sliders, polar/parametric/
  implicit rows, roots/intersections/extrema/derivatives/integrals as
  labelled estimates, SVG/PNG export.
- **Calculator** — scientific evaluation with shown conventions
  (degrees, percent), complex/vector/matrix/statistics lanes, units
  with exact rationals, history and memory.
- **Data Lab** — CSV import with preview-before-commit, cleaning,
  scatter/line/bar/histogram plots, OLS + linearized fits with honest
  diagnostics, uncertainty bars, figure/table export.
- **Learn** — 42 original graph templates with verified properties,
  topic paths, annotations, and practice mode.
- **3D + fields** — bounded `z = f(x, y)` surfaces, contours,
  heatmaps, vector fields, and dataset-backed 3D scatter.
- **Projects** — versioned `*.graphcraft.json` save/open with
  migrations, dirty guard, and session backup.

Angles are in radians unless a control states otherwise. Every numeric
result is a labelled estimate with its method attached — never claimed
analytic. Method notes: `docs/math/`, `docs/sampling/`,
`docs/data/FITS.md`, `docs/learn/ANALYSES.md`.

## Screenshots

No screenshots are committed yet. To generate them: `npm run dev`,
open each workspace, capture at 1440×900 in both themes, and save
under `docs/images/` (real app captures only — never mockups or other
tools' output). This section will embed them once they exist.

## Quick start

Requires Node.js 24.20.0 with npm 11 (pinned in CI).

```bash
npm ci           # reproducible install from package-lock.json
npm run dev      # local dev server (http://localhost:5173 by default)
```

Supported platforms: any modern desktop browser with ES2023,
`localStorage`, and file download support (developed and tested on
Windows + Chrome; other Chromium browsers and Firefox are expected to
work — please report otherwise). No mobile-hardware testing has been
done. Touch works through pointer events; pinch gestures are
unimplemented on some views.

Try: add `x^2`, then `sin(x)`; toggle, edit, and delete rows; save the
project to a file and reopen it. An example project lives in
`examples/quadratic-and-sine.graphcraft.json`.

## Offline scope

After one online load of `npm run build` + `npm run preview` output,
everything above works with the network disabled (versioned service
worker; user files never enter the cache). Details, update flow, and
limits: README “Offline use” below and `docs/offline/OFFLINE.md`.

## Known limitations (honest, non-exhaustive)

- No symbolic algebra, no universal nonlinear solver, no inference
  intervals — deferred with criteria in the docs.
- `.xlsx` import refused (re-save as CSV); PDF export refused.
- No formal WCAG audit, screen-reader, or touchscreen-hardware pass —
  see `docs/a11y/ACCESSIBILITY.md`.
- Service worker is production-builds-only; OS install prompts are not
  supported (SVG icon only).

## Contributing, conduct, security

- `CONTRIBUTING.md` — setup, gates, style, templates, algorithms.
- `CODE_OF_CONDUCT.md` — participation expectations.
- `SECURITY.md` — how to report vulnerabilities privately.
- `THIRD_PARTY_NOTICES.md` — dependency licences.
- GraphCraft is an independent project, not affiliated with or
  endorsed by Desmos, GeoGebra, Autodesk, Adobe, or any other vendor.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Strict type-check + production build |
| `npm run typecheck` | `tsc -b` project check |
| `npm run lint` | `oxlint` |
| `npm test` | `vitest run` (unit + component suites) |
| `npm run notices:check` | Validate `dist/LICENSE`, `dist/LICENSE.txt`, and generated third-party notices |
| `npm run preview` | Serve the production build locally |

Try: add `x^2`, then `sin(x)`; toggle, edit, and delete rows; save the
project to a file and reopen it. Angles are in radians. An example
project lives in `examples/quadratic-and-sine.graphcraft.json`.

## Offline use

After the first online load, the production build works offline: a
versioned service worker (`public/sw.js`, no new dependency) precaches
the app shell and every hashed build bundle — including the lazily
loaded workspaces — so graphing, calculator, Data Lab, Learn, 3D
surfaces, theme, project files, and CSV import/export never need the
network. There is no backend, account, or telemetry to reach.

- **What is cached:** the app shell, the project licence and third-party
  notice files, plus immutable `/assets/*` bundles (the asset list is
  injected into the worker at build time from the real build output —
  `scripts/inject-sw-assets.mjs` — and the build fails loudly if a piece
  is missing). The status bar links to the readable licence and notices;
  their cached copies remain available offline. Your project files stay
  as files and browser storage; they never enter the HTTP cache.
- **Updates:** a new version installs in the background and waits. The
  status bar shows **Update available — Refresh**; only clicking it
  loads the new version (the page reloads). A running session is never
  swapped mid-work, and old/new code never mix on one page.
- **Limits:** the worker registers on production builds served over
  HTTP(S) only (never on `npm run dev`, never on `file://`). If a
  workspace chunk is missing from the cache while offline, that
  workspace shows an honest reload message while the rest keeps
  working; if the whole cache is gone, you get a short offline notice
  instead of a partial page. A missing licence or notice file returns
  honest plain-text 503 content, never the app shell. If the browser
  refuses workers or storage is full, the app keeps loading online and
  says so — delete the site data and reload once to rebuild the cache.
- **Verify:** `npm run build && npm run preview`, load once, then in
  DevTools → Network check **Offline** and reload — every workspace
  must work. Check Application → Service Workers for the active
  `graphcraft-offline-v3` worker.

## Docs

- `AGENTS.md` — session rules
- `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`
- `docs/DECISIONS.md`, `docs/DEPENDENCIES.md`, `docs/QUALITY_GATES.md`
- `docs/research/REFERENCE_WORKFLOWS.md` — lawful reference observations
- `docs/math/EXPRESSION_SYNTAX.md` — supported syntax, limits, errors
- `docs/sampling/ADAPTIVE_SAMPLING.md` — guarantees and honest limits
- `docs/rendering/RENDERER.md` — SVG decision and navigation behaviour
- `docs/project/PROJECT_FORMAT.md` — project file format and flows
- `docs/export/EXPORT.md` — export formats and fidelity decisions
- `docs/design/DESIGN_SYSTEM.md` — tokens and layout decisions
- `docs/testing/TEST_INVENTORY.md` — test inventory, coverage map, known gaps

## Licence

MIT License. Copyright (c) 2026 ogMaverick12. See [LICENSE](LICENSE).
Production builds also emit byte-identical `dist/LICENSE` and
`dist/LICENSE.txt`, plus a complete, generated
`dist/THIRD_PARTY_NOTICES.txt`. The in-app status bar links to the
readable `/LICENSE.txt` and `/THIRD_PARTY_NOTICES.txt`; the extensionless
`/LICENSE` remains for repository and release references. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
