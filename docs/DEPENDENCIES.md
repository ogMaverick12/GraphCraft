# GraphCraft — Dependencies

Audited 2026-10-14 at FND-01 (`npm install`: 141 packages, 0 vulnerabilities); versions re-verified 2026-10-16 against installed `node_modules` (table below shows installed versions; `package.json` carries compatible ranges); re-verified again 2026-10-17 (S7.1): `npm audit --audit-level=high` 0 vulnerabilities, no additions/upgrades/removals since FND-01.
Rule: exact version + licence + maintenance checked before install. No network/telemetry dependencies in core path.

CI enforcement: `scripts/check-licenses.mjs` (dependency-free) checks every direct dependency in `node_modules` against an allowlist — MIT, ISC, Apache-2.0 — and fails on disallowed **or absent** licence metadata. It runs in `.github/workflows/quality.yml` (after `npm audit`), covered by three fixture tests (`src/tests/license-check.test.ts`). New direct deps must still be justified and recorded here before install. The separate distribution notice check (`node scripts/check-notices.mjs`) validates the licence and complete third-party notice bundle emitted into `dist/` from the actual production module graph; see `THIRD_PARTY_NOTICES.md`.

## Runtime
| Package | Version | Purpose | Licence | Why not native | Maintained |
|---|---|---|---|---|---|
| react / react-dom | 19.3.0 | UI framework | MIT | Commodity framework; required baseline | Yes — Meta, active releases |
| tailwindcss | 4.3.3 | Build-time utility CSS generation; generated CSS shipped | MIT | Design velocity + consistency over hand CSS | Yes — Tailwind Labs, active |
| lucide-react | 0.561.0 | Icons (theme toggle) | ISC, plus Feather-derived MIT notice | Consistent icon set over hand SVGs | Yes — Lucide, active |
| mathjs | 15.2.0 | Expression parsing behind the GS-01 wrapper (`src/math/engine.ts`) | Apache-2.0 (with `NOTICE`) | Hand-rolled parsers risk precedence/edge bugs; number-only bundle + AST allowlist keeps semantics tight | Yes — active, ~1.2M weekly downloads |

## Toolchain / tests (dev only — not shipped)
| Package | Version | Purpose | Licence | Maintained |
|---|---|---|---|---|
| @tailwindcss/vite | 4.3.3 | Official Tailwind↔Vite build integration; dev-only, not emitted | MIT | Yes — Tailwind Labs |
| vite | 8.3.4 | Dev server + production build | MIT | Yes — VoidZero, active |
| @vitejs/plugin-react | 6.1.2 | React fast-refresh integration | MIT | Yes |
| typescript | 6.0.3 | Strict type-checking | Apache-2.0 | Yes — Microsoft, active |
| oxlint | 1.88.0 | Linter (scaffold default, kept deliberately) | MIT | Yes — oxc project, active |
| vitest | 4.1.11 | Test runner | MIT | Yes — Vitest team, active |
| jsdom | 27.4.0 | DOM for component tests | MIT | Yes, active |
| @testing-library/react | 16.3.3 | Component rendering/interaction | MIT | Yes, active |
| @testing-library/jest-dom | 6.9.1 | DOM matchers | MIT | Yes, active |
| @testing-library/user-event | 14.6.8 | Realistic input simulation | MIT | Yes, active |
| @types/react / react-dom / node | 19.3.0 / 19.3.0 / 24.19.2 | Type definitions | MIT (DefinitelyTyped) | Yes |

## Bundle review (historical baseline — measured 2026-10-17, S7.5 production build)

| Chunk | Raw (KiB) | Gzip (KiB) | Notes |
|---|---|---|---|
| `index` (graph + mathjs) | 792.3 | 229.1 | mathjs number bundle dominates; >500 KB warning accepted |
| `DataLab` (lazy) | 91.6 | 24.0 | Loads on first Data Lab visit; graphing starts without it |
| `Viz3D` (lazy) | 57.0 | 14.8 | Loads on first Advanced-visualisation visit |
| `Calculator` (lazy) | 44.4 | 12.3 | Loads on first Calculator visit |
| `LearnLibrary` (lazy) | 29.3 | 8.3 | Loads on first Learn visit |
| `stats` (lazy) | 20.5 | 6.7 | Calculator stats-lane split |
| CSS | 20.4 | 5.0 | Tailwind tokens |

Method: fresh `npm run build`; raw = on-disk bytes, gzip = `node:zlib.gzipSync` per file, KiB (Vite prints decimal kB for the same bytes). Full output including `index.html`, `sw.js`, favicon and manifest, plus the reproducible script, benchmark tables and budgets, are in `docs/perf/S7.5-BASELINE.md`. Historical note: at the S7.5 measurement, Learn template data did ship in the initial chunk via eager imports; S7.5.1 later extracted it into a lazy `templates` chunk loaded by `LearnLibrary`. The table above is therefore the historical baseline, not a current measurement. Current build evidence (available `dist/`, not a fresh benchmark): `index-*.js` 564,162 B raw / 166,608 B gzip (550.9/162.7 KiB); `templates-*.js` 31,945 B raw / 7,876 B gzip (31.2/7.7 KiB), lazy and imported by `LearnLibrary`.

Lazy-loading decisions: Calculator and Data Lab route-level `lazy()` in `App.tsx` (graph-first startup); no route prefetches (explicit user navigation only). No new dependency added since FND-01; export/CSV/figure/v6 work is dependency-free by design (in-house PNG encoder, native CSV, versioned JSON).

## Deliberately deferred
- PDF export (no library selected): refused with criteria in ADR-032 — a verified licence, measured bundle delta, a tested renderer, and a reopen task must ALL hold before a dependency is even evaluated. A renamed PNG/SVG is never passed off as a PDF.
- Plotly.js (MIT, plotly.js-dist 4.1.2, ~11.5 MB unpacked per registry metadata): evaluated for DATA-02 and declined in ADR-029 — two orders of magnitude heavier than the native DataPlot chunk for chart families the coordinate layer already renders, plus a second theming/interaction model to restyle and maintain.
- shadcn/ui: dependency-free `Button` primitive added instead; full adoption deferred to FND-02 audit.
- Excel import (no library selected): `.xlsx` parsing would need a maintained, compatibly-licensed library plus its own macro/formula-surface audit, for a payload on the order of the app itself. Deferred with criteria in ADR-028; `.xlsx` files are explicitly refused, never parsed as CSV. CSV covers DATA-01 via a native dependency-free parser.
