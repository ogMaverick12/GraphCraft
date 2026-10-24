# GraphCraft — Security and privacy audit

Two passes so far: **2026-10-16** (read-only inspection plus two minimal
fixes — upload size guards) and **2026-10-17** (S7.1 re-verification of
every checklist item against a tree that had since gained the S7.2
math/a11y fixes, the offline service worker, and S7.3 read-ordering
guards; recorded in the re-verification section at the end). No features
added in either pass. Nothing here claims absolute security — only what
was checked, what was found, and what remains open.

## Method

- Grepped all of `src/` for execution/network sinks (`eval`,
  `new Function`, `innerHTML`, `fetch`, `WebSocket`, `console.*`).
- Read every SVG string builder for unescaped interpolation.
- Read file upload/download paths, storage access, and the engine gate.
- Ran `npm audit --json` (0 vulnerabilities / 212 deps) and
  `npm outdated --json` (stale majors noted, none installed).
- No dependency was added, upgraded, or removed in this task.

## Findings (all addressed or accepted)

| # | Area | Finding | Evidence | Severity | Disposition |
|---|---|---|---|---|---|
| 1 | Uploads | Project/data readers decoded the whole file before any size check — a GB-scale file would sit in memory first. | `files.ts:readFileText`, `csv.ts:readDataFileText` (pre-fix) | Medium | **Fixed**: `MAX_UPLOAD_BYTES` (8 MB) + `uploadTooLarge` pure check in both readers; regression tests in `project.test.ts`, `import.test.ts` (spoofed `size`, no big allocs). |
| 2 | SVG export | All user-text interpolations escaped (`title`, ticks, bars, runs, points, markers, legend, caption, axis labels). Colors/dashes are internally generated. | `svg.ts` (35 interpolations reviewed), `surfaceSvg.ts`, `Scatter3D`/`FieldView` builders | Low | Verified + new hostile-markup regression test in `export.test.ts`. |
| 3 | Expressions | No `eval`/`new Function`/`innerHTML`; mathjs behind an AST allowlist with 500-char / 300-node caps; hostile inputs (`fetch(…)`, `while`) refused by tested taxonomy. | `engine.ts:13` + hostile suites | Low (accepted) | No evaluation timeout/worker — sampler budgets + input caps bound the workload instead. Documented residual risk. |
| 4 | Project files | Schema-validated, versioned, size-capped (256 KB / v6 2 MB); failed imports leave state untouched (tested); filenames stripped to `[a-z0-9-_ ]` (no traversal); downloads are Blob-based (browser owns naming, no silent overwrite). | `validate.ts`, `filenames.ts`, persistence tests | Low | None needed. |
| 5 | CSV/XLSX | Parser emits inert strings (no macro/formula execution surface exists); export `'`-prefixes `=+-@`; `.xlsx` refused, never sniffed; 5 MB/10k×32 caps. | `csv.ts`, `csvExport.ts`, `DataLab.tsx:46` | Low | None needed. |
| 6 | Storage | Guarded reads/writes (`prefs.ts`); backup validated before restore; keys: `graphcraft-prefs`, `graphcraft-last-project`, `graphcraft-learn-bookmarks`, `graphcraft-learn-progress`, theme key. No sensitive data beyond the user's own documents (backup holds the project incl. datasets — local only). | `prefs.ts`, `bookmarks.ts`, `progress.ts` | Low | None needed. |
| 7 | Dependencies | 0 vulnerabilities. Stale majors exist (`jsdom` 27→30, `lucide-react` 0.561→1.58, `@types/node` 24→26, jest-dom 6→7) — dev/test or icon-only surface; explicitly NOT upgraded (breaking-change review required first). | `npm audit`, `npm outdated` | Info | Recorded; revisit on a maintenance pass. |
| 8 | Privacy/network | Zero `fetch`/WebSocket/beacon/console calls in `src/`; system font stack (local `Inter` fallback, no remote fonts); no accounts, telemetry, or AI calls. Builders import no network surface. | Greps (empty) + import review | — | None needed. Documented below. |
| 9 | Headers/CSP | No server config in scope (`vite.config.ts` is dev/test only; `vite preview` sets no headers). | `vite.config.ts` | Info | Deployment guidance below; no code change (host unknown). |

## Privacy statement

GraphCraft is offline by construction: documents are files, storage
is browser-local, figures/CSVs render locally, and no request ever
leaves the machine for app functionality. There is no analytics,
telemetry, remote font/API, hidden request, or account requirement.
No optional network-dependent feature exists to document separately.
The offline service worker is the only network-adjacent mechanism: it
fetches same-origin app assets to precache them and nothing else (see
deployment guidance, and `docs/offline/OFFLINE.md`).

## Deployment guidance (host operator)

- Serve `dist/` over HTTPS with a restrictive Content Security
  Policy, e.g. `default-src 'self'; script-src 'self'
  'sha256-CltYLy5heL1+vg2ualDLVNfNBgrgna0PUWvGyZn5doY='; style-src
  'self' 'unsafe-inline'; img-src 'self' blob: data:; object-src
  'none'; base-uri 'self'; frame-ancestors 'self'; worker-src 'self'`.
  Tailwind v4 inlines styles at build time (hence `unsafe-inline` for
  style). One inline script exists — the pre-paint theme boot in
  `index.html`; the hash above is its built form (419 chars, scan
  2026-10-17). Without the hash (or a nonce) the policy blocks it: the
  app still loads, only the dark-mode flash returns. Recompute the hash
  if that script or the build's inline-script handling changes.
- `blob:` is required for file downloads/exports; `data:` covers
  only test/edge paths (no data-URI content is produced by the app).
- A service worker (`sw.js`) precaches the same-origin static app
  assets for offline use. It caches only GET responses from its own
  origin, never user documents, and passes every other request through
  untouched; `worker-src 'self'` (already implied by `default-src
  'self'`) admits it. No cookies, no third-party origins. See
  `docs/offline/OFFLINE.md` for the update/recovery protocol.

## Residual risks (accepted, not hidden)

- mathjs is a large real parser behind an allowlist, not a sandbox:
  a gate bug would matter; the hostile suite + caps are the
  mitigation, not a proof.
- No evaluation deadline: a 300-node expression × sampler budgets is
  bounded but not timed; a worker + timeout reopens on measurement.
- Backup holds user datasets in `localStorage` (quota-guarded):
  users on shared machines should use files + browser clearing.
- Service worker caches only same-origin app assets (never user
  documents); a stale-release risk is bounded by the versioned cache +
  user-controlled update prompt (`docs/offline/OFFLINE.md`).
- Supply chain: stale majors pending review; lockfile pins current
  installs (`package-lock.json` committed).
- The CSP hash for the inline theme script must be recomputed if that
  script (or the build's handling of inline scripts) changes.

## S7.1 re-verification (2026-10-17)

Full 12-item checklist re-run against the current tree (post S7.2
math/a11y fixes, offline worker, S7.3 read-ordering guards). Method:
source re-reads (`engine.ts`, `validate.ts`, `files.ts`, `prefs.ts`,
`sw.js`), execution/network sink greps over `src/`, a scan of the built
bundles for absolute URLs, `npm audit`, and re-runs of the adversarial
suites plus the full gate set. Two test gaps were found and closed; no
code defect was found.

| # | Checklist item | Verdict | Evidence on this tree |
|---|---|---|---|
| 1 | Expression evaluation | SOURCE-VERIFIED + TEST-VERIFIED | `math/engine.ts`: mathjs number bundle for parsing only, then an AST walk admitting exactly constants, parentheses, symbols (variables/`pi`/`e`/declared parameters), operators `+ - * / ^ !`, and 21 whitelisted functions; the default branch rejects property access, assignment, arrays, objects, ranges, conditionals. Caps 500 chars / 300 nodes. Compiled scope holds numbers only; results classified (NaN → domain-error, non-finite → overflow). The calculator scalar lane compiles through the same gate (`calculator/evaluate.ts:205`). No `eval`/`new Function`/`innerHTML` in `src/` (grep). Tests: `math/expression.test.ts` (limits, hostile table, scope isolation), `calculator/acceptance-probe.test.ts`, `calculator/calculator.test.ts` (hidden-binding refusal). |
| 2 | Hostile-input coverage | TEST-VERIFIED | Property access (`window.x`, `document.cookie`, `sin[0]`, `x.constructor`), dangerous identifiers (`constructor`, `__proto__`, `prototype`, `globalThis`, `process`, `require`, `argv`), assignment (`x=2`, `f(x)=x`, `sin=5`, `a=1`), unexpected syntax (`;`, `%`, `>`, `==`, `**`, ternary, arrays, objects, braces, incomplete parens), unsupported calls (`fetch`, `process.exit`, `import()`). Graph-engine table extended this pass to 18 cases; the calculator probe carries 20 inputs. |
| 3 | Imported project validation | TEST-VERIFIED | `validate.ts` checks every field/range/type and drops unknown data; `project.test.ts` (21 cases): malformed JSON, **future versions refused explicitly rather than guessed**, missing version / wrong tag, size caps before parsing, invalid ranges, duplicate ids/labels/colours, strict parameter lists, v0–v2 migrations, unknown-template tolerance; `datalab.test.ts` malformed bundles; a failed open keeps the current graph (`persistence.test.tsx`). |
| 4 | Resource limits | TEST-VERIFIED | Each cap has a test: expression 500/300; upload 8 MB before reading bytes (`files.ts`/`csv.ts`); CSV 5 MB and 10k×32 with row floods **refused, not truncated**; project 256 KB / v6 2 MB, ≤100 rows, ≤32 params, ≤20 datasets, ≤200 cleaning entries; sampler budget exhaustion reported; implicit 30k evaluations; extrema 20k / integral 50k with user-visible warnings; vectors 256 / matrices 8×8; polynomial degree ≤6; piecewise ≤20 branches; surface grid 8–128; field arrow stride caps; export ≤2400 px / 6 MP; calculator history cap; 20-step undo. |
| 5 | File-name sanitisation | SOURCE-VERIFIED + TEST-VERIFIED | `sanitizeFilename`/`sanitizeExportFilename`/`sanitizeFigureFilename` strip to `[a-z0-9-_ ]`, ≤60 chars, Windows reserved stems guarded; traversal neutralised (`../../evil` → `evil-figure.svg`, `C:\temp\x` → `ctempx-figure.png`); downloads are Blob + `a.download` only — no filesystem path is ever constructed (`files.ts`, `export.test.ts`, `project.test.ts`). |
| 6 | Local storage | TEST-VERIFIED (gap closed this pass) | `prefs.ts` guards reads/writes and returns honest notices for unavailable/corrupted storage; backup validated before restore; corrupted backup → empty + notice; thrown storage → app keeps working (`persistence.test.tsx`); **new `prefs.test.ts` (5 cases)** covers corrupted JSON reset, blocked reads, missing `localStorage`, failed writes; the quota path was also demonstrated live in the offline pass (storage filled to quota → notice, plotting continued). |
| 7 | Data loss during editing | TEST-VERIFIED | Unsaved indicator + Save/Discard/Cancel on New (`persistence.test.tsx`); Data Lab guard (`workflow.test.tsx`); failed import preserves state; S7.3 stale-read ordering guards for project open and CSV import are mutation-verified and read live dirty state (`stale-reads.test.tsx` ×2 files). |
| 8 | Clipboard + file interactions | TEST-VERIFIED | No clipboard reads anywhere; the only writes are two `navigator.clipboard.writeText` copies (fit equation, calculator result). Calculator paste runs through the full gate (`calculator-ui.test.tsx`, "evaluates pasted expressions through the same safe gate"); Data Lab paste and file drops share one validation path (`ImportDialog` → `analyzeTable` → `commitAnalysis`); exported SVG escapes hostile user text (regression test). |
| 9 | Dependency security | MEASURED | `npm audit --audit-level=high`: 0 high/critical vulnerabilities (2026-10-17; S8.1 re-run on 2026-10-23: high gate exit 0, with 2 moderate dev-only `@vitest/mocker` advisories reported and not fixed in scope); no dependency added/upgraded/removed since FND-01; direct-dependency licences are MIT / ISC / Apache-2.0. The full lockfile also contains dev-only MPL-2.0 entries (mainly `lightningcss`) that are not emitted; no GPL/AGPL was found. The production build now emits `dist/LICENSE` plus a complete generated `dist/THIRD_PARTY_NOTICES.txt`, checked by `npm run notices:check`. Stale majors recorded-not-installed; lockfile present (`docs/DEPENDENCIES.md` re-stamped). |
| 10 | Privacy | SOURCE-VERIFIED + MEASURED | Zero `fetch`/XHR/WebSocket/beacon/EventSource/console calls in `src/` (greps); built-bundle URL scan: 5 absolute strings, all inert (four W3C XML namespace identifiers + React's error-link base), none fetched; no remote fonts, accounts, telemetry, or AI; manifest and assets all relative; the single network-adjacent mechanism is the service worker, which caches same-origin app assets only; full offline workflows demonstrated live with the origin stopped (offline pass). |
| 11 | Malformed / oversized input honesty | TEST-VERIFIED | Refusals carry the real numbers (8 MB guard names the actual file size); CSV floods refused "instead of truncating silently"; invalid UTF-8 refused; oversized project/v6 bundles refused with messages; sampler/extrema budget exhaustion surfaced as warnings; out-of-range surface resolutions and bad PNG dimensions refused; no silent truncation found in any tested path. |
| 12 | Tests + record | MEASURED | `typecheck` exit 0; `lint` exit 0 zero warnings; `test` **694 passed (66 files)**; `build` success (injector "precaching shell + 7 build assets"; pre-existing mathjs chunk warning only); `npm audit` 0 vulnerabilities. Addition this pass: **+8 cases** (`prefs.test.ts` 5; expression hostile +3). Unresolved items below. |

### Closed this pass
- `src/project/prefs.test.ts` (new, 5 cases): the corrupted / unavailable
  / missing-storage / failed-write preference paths previously had
  app-level coverage only.
- `math/expression.test.ts`: +3 hostile cases (`__proto__`, `prototype`,
  `x.constructor`) so the graph-engine table names the dangerous-
  identifier and property-access families directly (the calculator probe
  already did).

### Verified changes since the first pass
- Service worker added (offline pass): cache scope re-checked (same-origin
  GET only; user documents never cached; honest 503 offline). Deployment
  guidance above corrected — it previously said "no service worker".
- Inline theme-boot script in `index.html` survives the build verbatim:
  CSP guidance corrected — `script-src` now needs its SHA-256 hash (or the
  policy blocks it and only the theme flash returns; the app still loads).
- S7.2 (reserved filename stems, contrast fixes) and S7.3 (stale-read
  guards) re-verified; the suite grew 600 → 686 → 694 across these passes.

### Unresolved (carried or new — recorded, not hidden)
- No evaluation deadline/worker: caps bound work, wall-clock time is not
  enforced (unchanged).
- mathjs is a real parser behind an allowlist, not a sandbox (unchanged).
- Stale majors pending a maintenance pass (unchanged, recorded).
- Real-browser service-worker + Cache API behaviour is verified by 15
  sandbox tests and a manual demo, not automated in-browser runs.
- The CSP hash is tied to the built inline script; recompute on change.
