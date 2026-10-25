# Contributing to GraphCraft

GraphCraft is free, open-source, local-first software (MIT — see
`LICENSE`). Contributions are welcome. The rules below keep every
change small, tested, and honest.

## Setup

Requires Node.js 24.20.0 with npm 11 (pinned in CI):

```bash
npm ci            # reproducible install from package-lock.json
npm run dev       # local dev server
```

## Commands (exact — also what CI runs)

| Command | Purpose |
|---|---|
| `npm run lint` | `oxlint --deny-warnings`, zero warnings |
| `npm run typecheck` | `tsc -b`, zero errors |
| `npm test` | `vitest run`, full suite must pass |
| `npm run build` | strict type-check + production build |
| `npm run notices:check` | validate distribution licence + third-party notices |
| `npm run preview` | serve the production build locally |
| `npm audit --audit-level=high` | dependency security signal |
| `node scripts/check-licenses.mjs` | direct-dependency licence guard (CI) |

## Branches and pull requests

- Work on a branch; open a PR against `main` with a short description,
  the tests you ran (paste the counts), and screenshots for UI changes
  (captured from the real app — never mockups or competitor shots).
- Keep PRs small and single-purpose. Do not bundle unrelated modules.
- CI must be green before review. Do not weaken or delete tests to get
  green; report failures plainly.
- No commits with secrets, user data, `dist/`, or `node_modules`.

## Style (from `AGENTS.md`)

- Smallest change that properly solves the task. No rewrites of working
  modules to fit a preference.
- No placeholders: no dead buttons, fake data, or success messages for
  unimplemented work.
- No `any` casts to silence TypeScript, no unexplained lint disables.
- Never `eval` / `new Function` user input; math goes through the
  gated engine (`src/math/engine.ts`).
- Numerical logic stays independent of React components.
- No mandatory network, account, telemetry, or paid service in core
  paths. No new dependency without purpose, licence, and maintenance
  justification recorded in `docs/DEPENDENCIES.md`.

## Reporting bugs

Use the bug-report template (`.github/ISSUE_TEMPLATE/bug_report.md`):
app version or commit, exact steps, expected vs actual, browser/OS,
and a minimal project file or expression when relevant.

## Adding a graph template

Read `docs/learn/ADDING_TEMPLATES.md` first. Templates must use
independently written prose and equations (no copied textbook or tool
content), pass engine-anchored verification, and never claim curriculum
alignment. The S8.17 rewrite record is `docs/PROVENANCE.md`; it describes
process and remaining uncertainty, not an ownership or legal-clearance
conclusion.

## Adding a numerical algorithm

- Implement in pure TypeScript under `src/math/`, `src/analysis/`, or
  `src/data/` — no React, no DOM.
- Ship deterministic fixtures with explicit tolerances, domain-error
  and overflow cases, and a method note shown beside every estimate.
- State limits honestly (convergence policy, what the method cannot
  prove). See `docs/learn/ANALYSES.md` for the taxonomy and
  `docs/data/FITS.md` for the fitting precedent.
