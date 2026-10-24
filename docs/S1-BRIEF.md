# GraphCraft Stage 1 — Build Brief

Complete record of everything done, built, verified, and decided from
project start through the Stage 1 exit audit. Auth/login steps are
excluded by request.

## 1. Environment and repository setup

- Working directory `C:\Users\sreej\Downloads\IDK`, repo folder `GraphCraft`.
- Node.js was missing, blocking all `npx` work. Installed Node.js LTS
  **24.20.0** + npm **11.19.0** via winget (meets the REA requirement of
  22.19+/24.11+). PowerShell execution-policy blocks `*.ps1` shims on
  this machine, so `npm.cmd` / `npx.cmd` / `rea.cmd` are used throughout.
- Installed Git 2.55.0 and GitHub CLI 2.102.0 via winget.
- Cloned `https://github.com/ogMaverick12/GraphCraft` (branch `main`).
  It was empty — no commits, only `.git/`. Nothing to preserve.
- Installed `rea-agents@latest` (**6.4.0**) globally and connected it to
  this agent via `npx rea-agents@latest setup --client opencode`:
  reviewed the dry-run plan first (`status: planned`), then applied it.
  Registration now lives in `~\.config\opencode\opencode.jsonc` on the
  stable global path (an earlier ephemeral npx-cache path was replaced
  by re-running setup after the global install). Skill
  `reverse-engineer-anything` v37 installed (170 tools).
- REA verification: `rea doctor --client opencode --skill --json` →
  `healthy: true` (node ok, registration ok, skill aligned);
  `environment_healthy: false` is expected (no Hopper on Windows, no
  Ghidra/IDA configured). Live `binary_session({})` confirmed 170 tools.
- For the live audit, installed `agent-browser` 0.39.1 globally (needed
  `--allow-scripts`) plus Chrome 155 (second download attempt succeeded
  after a first timeout) and drove the real app over a dev server.

## 2. Product definition (retained context)

**GraphCraft** — free, open-source, local-first scientific graphing and
mathematics studio for school/JEE/college learners, teachers, and
experimental-data users. Modules, in order: Graph Studio → Calculator →
Data Lab → Learn → Advanced visualisation. Principles: correctness
before visuals; quiet premium light-first UI + dark mode; local-first,
no login/server/telemetry; modular; evidence-driven; small verifiable
steps; honest limitations. Stage boundaries 1–7 per `docs/ROADMAP.md`.

## 3. Stage 0 — Constitution (Prompt 0 ✅)

- Audited the empty repo (git status/branch/remote, manifest and source
  checks) before writing anything; made no commits (rule 5).
- Created 7 governing documents (all still present and maintained):
  `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`,
  `docs/ROADMAP.md`, `docs/DECISIONS.md` (now ADR-001…ADR-019),
  `docs/DEPENDENCIES.md`, `docs/QUALITY_GATES.md`.
- Proposed the React + TypeScript + Vite baseline with risks; next
  module identified as FND-01.

## 4. REA reconnaissance (Prompt 1 ✅)

- Re-read the official `morluto/rea` docs instead of relying on memory;
  confirmed requirements, the `opencode` client id, and Windows limits.
- Verified the live session exposes 170 tools (static, browser/app,
  native-binary families) without claiming absent capability.
- Produced `docs/research/REFERENCE_WORKFLOWS.md`: Desmos (error rows),
  GeoGebra (zoom/pan), Veusz 4.2.1 GPL-2.0+ (regression/export),
  math.js Apache-2.0, Plotly.js MIT — one workflow each, evidence +
  confidence labels, black-box acceptance tests, independent
  implementation. No proprietary code copied; no live target inspection.

## 5. FND-01 — Application foundation ✅

- Scaffolded `create-vite@9.2.1` react-ts (React 19.3.0, Vite 8.3.4,
  TypeScript 6.0.3 strict — `"strict": true` added, the template omits
  it) into the repo root, preserving `AGENTS.md`/`docs`.
- Scripts (all verified working): `dev`, `build` (`tsc -b && vite build`),
  `typecheck` (`tsc -b`), `lint` (`oxlint` 1.88.0, kept deliberately),
  `test` (`vitest run`), `preview`.
- Added Tailwind 4.3.3 + `@tailwindcss/vite`, `lucide-react` 0.561.0
  (ISC), Vitest 4.1.11 + jsdom + Testing Library; full licence audit in
  `docs/DEPENDENCIES.md`. `npm install`: 141 packages, 0 vulnerabilities.
- Minimal shell + smoke test (mounts, theme toggle). README + MIT
  `LICENSE` (confirmed 2026-10-21; copyright `ogMaverick12`; see ADR-011).
- Validation: typecheck 0, lint 0, test 2 passed, build success
  (225 kB JS), dev HTTP 200 with title. Fixed for real: lazy theme
  init, jsdom `matchMedia` guard + test cleanup.

## 6. FND-02 — Design system and shell (S1.1 ✅)

- 15 semantic tokens in `src/index.css` (`@theme inline`, light + dark),
  zero hardcoded surface colours (one found later and removed).
- Shell: top bar, collapsible/resizable expression panel (192–384px,
  drag + arrow keys), central viewport, collapsible inspector, status
  bar, mobile drawers (overlay/Escape/focus-return), no-flash theme init
  script in `index.html`.
- Every button performs a real action; icon-only buttons carry
  names + tooltips; honest empty states everywhere; no dead controls.
- Contrast computed: text ≥4.8:1 both themes; curves ≥4.9:1.
- `docs/design/DESIGN_SYSTEM.md` + ADR-007…ADR-012.
- Validation: typecheck 0, lint 0, test 7 passed, build success.

## 7. GS-01 — Math engine (S1.2 ✅)

- `src/math/`: `mathjs@15.2.0` (Apache-2.0) number-only bundle behind an
  owned interface (`types.ts`, `engine.ts`, `index.ts`). React/DOM-free
  (grep-verified). Never `eval`/`new Function`.
- AST allowlist (constants, `x`/`pi`/`e`, `+ - * / ^`, 13 functions,
  parens); accessors/assignment/containers rejected pre-compile; scope
  is exactly `{x}`. `log` = base-10, `ln` = natural (explicit override —
  mathjs defaults `log` to base e). Radians only. `^` right-associative;
  `-x^2` = −(x²); implicit `2x` deliberate. Limits: 500 chars, 300
  nodes, worker-ready via `source` carry.
- Result taxonomy: value / domain-error / overflow / evaluation-error —
  never coerced to zero. `docs/math/EXPRESSION_SYNTAX.md` + ADR-013.
- Validation: 32 expression tests (results, errors, 15 hostile strings
  incl. `window`/`fetch`/`process`/`import()`), 39/39 with shell suite.
  Fixed for real: parent-aware function-name exemption in the gate.

## 8. Sampler SMP-01 (S1.3 ✅)

- `src/sampling/`: uniform baseline (pixelWidth/4, 33–257) + midpoint
  refinement against local scale; invalid samples split; pole probing
  (subdivide once, gap only on persistent growth — roots resolve);
  domain-edge bisection snapping; half-pixel minimum width; budget 4000
  / depth 12 caps; `AbortSignal`; FIFO determinism; per-call stats.
- `docs/sampling/ADAPTIVE_SAMPLING.md` (guarantees + honest
  non-guarantees) + ADR-014.
- Validation: 18 sampler tests (`x^2`, `sin` off-grid root, `abs`
  kink, `1/x`, `1/(x-0.1)`, `sqrt`/`ln` clipping, `tan` poles,
  `exp`/`sin(1/x)` bounded, budget/cancel/determinism), 57/57 total.

## 9. GS-02/GS-03 — Viewport and renderer (S1.4 ✅)

- Decision (ADR-015): **SVG**, no charting dependency (DOM text = free
  accessibility + HiDPI sharpness; Stage 1 point counts trivial for SVG;
  canvas-hybrid reserved behind profiling).
- `src/graph/`: sole-conversion `coordinate.ts` (transforms,
  edge-clamped axes, 1/2/5 ticks, Cohen–Sutherland clipping with finite
  pre-clamp), theme-aware 6-style `palette.ts` (colour + dash, never
  colour-only), `GraphView` (grid/axes/labels/origin/one path per
  segment, drag-pan, cursor-anchored wheel zoom, keyboard), `useViewport`
  (resize never touches world bounds), `useCurves` (compile once,
  resample on view change — proven by hook test).
- Aspect policy: independent ranges fill by default; real equal-scales
  checkbox. `docs/rendering/RENDERER.md`. No screenshot tests (no
  reliable harness — stated).
- Validation: 74/74 (round-trips incl. negative/non-square/extreme,
  ticks, clipping, palette, segment separation, demo, resample).

## 10. Workspace integration (S1.5 ✅)

- `src/expressions/`: typed rows with crypto-stable ids, colour cursor
  (never position-derived), add/edit/duplicate/hide/delete/select;
  debounced editors (250 ms, Enter commits, Esc reverts, blur commits);
  inline `role=alert` errors; empty state with tappable `x^2`/`sin(x)`/
  `1/x` chips (ADR-016: empty start chosen over preloaded demo).
- Sampling sees committed text only — stale keystrokes can never plot.
  Invalid rows never affect valid ones. Memo'd `GraphView`, stable
  callbacks, CSS-only hover (canvas-safe).
- Validation: 9-step acceptance workflow green in the running app
  (parabola → two colours → hide/show → edit stability → isolated
  error → unjoined asymptote → delete), 89/89 total.

## 11. Navigation + inspection (S1.6 ✅)

- `clampWorldRect` (spans 1e-6…1e12, ±1e12 fence) inside every setter —
  unbounded zoom/pan can no longer crash rendering.
- Overlay zoom in/out/reset buttons, keyboard +/−/arrows/0, pinch via
  the same pipeline (`touch-none` scoped to viewport), toggleable
  crosshair with numeric text readout (pointer-leave clears;
  screen-reader-silent by design), live view label in the status bar,
  rAF-coalesced pan (one resample per frame; hover never resamples).
- ADR-017. Validation: 98/98 (limits, centre invariance at 1e-9,
  button/keyboard equivalence, data stability).

## 12. Persistence (S1.7 ✅)

- `src/project/`: versioned `*.graphcraft.json` (tag/version/title ≤200,
  ≤100 rows, unique ids, colours 0–5, finite ordered ranges, 256 KB
  cap); newer versions rejected outright; v0 migrates via registry.
  Bad-syntax rows load with inline errors (consistent with typing).
- Top bar: New/Open/Save-to-file, editable title, `Unsaved` indicator,
  Save/Discard/Cancel guard; prefs + session backup in guarded storage
  with quota/corruption notices; files always work regardless.
- Shipped `examples/quadratic-and-sine.graphcraft.json`, validated and
  sampled in tests. `docs/project/PROJECT_FORMAT.md` + ADR-018.
- Validation: 118/118 (13 schema/migration + 7 workflows).

## 13. Export (S1.8 ✅)

- `src/export/`: one renderer-neutral scene → SVG vectors (one path
  per segment, parsed-valid, chrome-free) + scaled PNG (1×/2×/3×,
  2400px/6MP caps, in-house encoder — IDAT inflated and pixel-compared
  in tests). Fixed light figure theme; white default, real
  transparency; sanitised names; sampler warnings disclosed in-dialog.
  No PDF (no reliable licensed implementation; documented, not faked).
  `docs/export/EXPORT.md` + ADR-019.
- Validation: 134/134 (12 unit + 4 dialog incl. real download bytes).

## 14. Stage 1 audit — PASS, Stage 1 complete ✅

- Gates: lint 0, typecheck 0, **135/135 tests** (13 files), build
  success. Console during workflows: clean (Vite HMR + dev-only React
  hint only; jsdom canvas/download notices are asserted graceful
  paths). No tests deleted, no assertions softened.
- Live browser pass (dev server + Chrome automation): empty state,
  chips, two-curve plot, local parse error, `1/x` gap screenshot,
  theme toggle both ways, export dialog with warnings disclosure,
  crosshair readout "x 0, y 0", 9 live curve paths. Daemon flaked twice
  (transient 10060s); headless blob-download capture cancels (harness
  quirk — blob bytes unit-verified).
- Audit fixes (features, not chores): single-compile pipeline
  (`useCurves` took pre-compiled input; sampler re-export removed),
  stale README rewritten, save→open E2E test added (now 135).
- All 15 mandatory cases pass (see §16). Residual risks recorded in
  `docs/ROADMAP.md`: no touch hardware coverage; no screenshot tests;
  mathjs chunk >500 KB (Stage 6); clean-checkout README check awaits
  first commit/push approval; minor sanitizer duplication accepted.

## 15. Test inventory (final: 135 across 13 files)

- `tests/smoke` 2 · `tests/workspace` 5 · `math/expression` 32 ·
  `sampling/sampler` 18 · `graph/coordinate` 12 · `graph/graphview` 5 ·
  `graph/navigation` 9 · `expressions/model` 6 ·
  `expressions/plotting` 9 · `project/project` 13 ·
  `project/persistence` 8 · `export/export` 12 ·
  `export/export-dialog` 4.

## 16. Mandatory cases (all pass)

1. `x^2`/`x^3` plot (unit + live). 2. `sin(x)` radians (unit + live).
3. `abs(x)` kink tight, no gap. 4. `sqrt(x)` nothing for x<0, snapped
at 0. 5. `ln(x)` domain-clipped. 6. `1/x` gapped, unjoined (unit +
live screenshot). 7. `tan(x)` poles never spanned. 8. Malformed input
→ local message + position, valid graphs intact (unit + live). 9.
Toggle/edit/delete isolated per row. 10. Pan direction, zoom-centre
invariance, limits, reset, resize stability, readout (unit + live).
11. Save→open round-trip incl. visibility, colours, viewport, clean
state. 12. SVG parses valid/chrome-free; PNG bytes pixel-exact;
dialog warnings live. 13. Debounce + rAF coalescing; no stale
overwrite. 14. Length/node/budget/depth/output caps, all tested.
15. Full keyboard operation; both themes (text ≥4.8:1, curves ≥4.9:1).

## 17. File inventory

- **Created (~60):** full `src/` tree (`app/`, `components/ui/`,
  `expressions/`, `export/`, `graph/`, `math/`, `project/`,
  `sampling/`, `storage/`, `rendering/` note, `tests/`), `examples/`,
  `docs/` tree (10 notes), `README.md`, `LICENSE` (MIT confirmed 2026-10-21),
  configs (`package.json`, `vite.config.ts`, `tsconfig.*`,
  `.gitignore`, `.oxlintrc.json`), `index.html`.
- **Modified:** `README.md` (rewritten at audit), `ARCHITECTURE.md`,
  `ROADMAP.md`, `DECISIONS.md`, `DEPENDENCIES.md`,
  `QUALITY_GATES.md`, `tsconfig.app.json` (`strict`, `node` types for
  tests), `index.css` (tokens), `index.html` (no-flash theme).
- **Deleted:** `src/graph/Viewport.tsx` and
  `src/app/ExpressionPanel.tsx` (replaced by `GraphView` /
  `ExpressionList`), `src/math/README.md` (replaced by the module),
  one scratch debug test (removed same session).
- **Repo state:** everything uncommitted on `main` (rule 5 — no commits
  without explicit request).

## 18. Next

Stage 2 (richer equation graphing + numerical analysis) — awaiting
explicit instruction. Do not begin without it.
