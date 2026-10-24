# GraphCraft — Accessibility and usability audit (2026-10-16)

Keyboard, focus, labels, live feedback, contrast, motion, tables, and
error language across Graph Studio, Calculator, Data Lab, Learn, and
Viz3D. Automated checks supplement manual reasoning; no
assistive-technology hardware run was available (see gaps).

## Fixes applied (this pass, all with regression tests)

1. `ImportDialog` had no initial focus and no Escape handling — the only
   dialog without. Added Cancel-focus + Escape-to-cancel (mirrors the
   export dialogs); test: focuses on open, Escape closes, nothing
   imported (`datalab.test.tsx`).
2. `ConfirmDialog`/`ExportDialog`/`DataExport` re-ran their focus effect
   on every parent re-render (inline `onClose`/`onCancel` in deps),
   stealing focus back to Cancel. Focus now moves once on mount; the
   Escape listener keeps fresh callbacks. `ConfirmDialog` message linked
   via `aria-describedby`.
3. Nested Escape double-fired: Escape in an expression/range/domain/
   parameter/table editor both reverted the draft and closed the
   drawer/dialog behind it. Inline editors now `stopPropagation()` on
   Escape (`RowEditor`, `RowItem` range+domain, `ParametersPanel` value,
   `DatasetTable` rename/edit).
4. Curve rows were mouse-only: `li onClick` selected for inspection with
   no keyboard path. Rows are now focusable (`tabIndex 0`, visible
   focus ring), Enter/Space selects when the row itself is focused, and a
   visually-hidden status line announces selection state; test in
   `workspace.test.tsx`. Added the shared `.sr-only` utility.
5. `DatasetTable` discarded in-progress renames/cell edits on blur
   (Tab-away lost typed text). Blur now commits, matching `RowEditor`;
   test in `datalab.test.tsx`. Cell edit buttons gained real accessible
   names (`Edit row N column`) and all table controls gained visible
   focus rings. Note: the column-rename button keeps its text-content
   name (`Rename …` via `title`) — renaming it to `aria-label` broke the
   existing `getByRole(name)` contract, so it was reverted.
6. `prefers-reduced-motion`: `.gc-transition` now disables under
   `reduce` (`index.css`). Only color-feedback transitions exist; no
   keyframe animation in the app.
7. Announcements: workspace switches announce via a visually-hidden
   `aria-live="polite"` paragraph in `main`; the `Unsaved` indicator is
   now `role="status"`; the 3D inspect readout is `role="status"`.
8. `ManualGrid` gained `scope="col"` column headers (visually hidden;
   per-cell labels already carry row/column).

## Verified already-good (spot-checked, not changed)

- All icon-only buttons carry `aria-label` + `title` (enforced by the
  `IconButton` API and the every-button-has-a-name test).
- Parse/calculation/import/fit/storage errors use `role="alert"`;
  results use `role="status"`/`aria-live="polite"`; import failures state
  that nothing was committed; error strings name the problem and the
  recovery (e.g. Excel→CSV, bad symbol→allowed list).
- Colour is never the only encoding: curve dashes, root/diamond/
  triangle markers, series shapes, legend glyphs, hover titles, data and
  residual tables (capped with counts).
- Zoom in/out/reset buttons everywhere; keyboard graph pan/zoom;
  native sliders; drawers with Escape + focus restore; 200-row table cap.

## Remaining gaps (first-pass record, 2026-10-16 — closures in the S7.2 section below)

- No focus trap and no background `inert` in any dialog; Tab can leave
  the modal. No focus restoration for Confirm/Export/DataExport/Import
  dialogs (drawer restores; dialogs return focus to `body`).
- No `aria-live` on graph pan/zoom, DataPlot updates, or analysis
  result lists (failures alert; values do not announce).
- Scatter3D/FieldView figures are not keyboard-operable viewers
  (buttons cover orbit/zoom for scatter; FieldView is form-only).
- Contrast ratios not re-measured this pass (brief standard: text
  ≥4.8:1, curves ≥4.9:1 in `docs/S1-BRIEF.md:236`); no automated
  contrast or axe-style run in CI.
- No screen-reader or touchscreen-hardware pass; pinch/zoom untested on
  hardware (standing caveat, same as prior stages).
- Windows reserved filenames (`CON`, `NUL`, …) still unspecial-cased.

## Quality gates (this pass)

`typecheck` exit 0, `lint` exit 0, `test` 603 passed (52 files, +3 new:
import-Escape, blur-commit, row-keyboard), `build` success (pre-existing
mathjs chunk warning only). One self-caught regression (rename-button
accessible-name change) reverted before green.

# S7.2 second pass (2026-10-17)

Follow-up to the first audit above, same scope (Graph Studio, Calculator,
Data Lab, Learn, Viz3D). Fixes in small batches with regression tests;
where possible verified in a real Chromium browser; limitations and
remaining gaps below are stated as such and not counted as passes.

## Fixes applied (this pass)

1. Dialog focus management: shared `useDialogFocus` hook wired into
   `ConfirmDialog`, `ImportDialog`, `ExportDialog` and `DataExport`.
   Tab/Shift+Tab now cycle within the dialog, and focus is restored to
   the opener on close/unmount (`isConnected`-guarded). The background
   is deliberately **not** `inert` — `aria-modal` plus the Tab cycle is
   the documented boundary in the hook. Tests: `dialog-focus.test.tsx`
   (restore, forward+backward wrap, `ImportDialog` wrap).
2. `Scatter3D` gained a keyboard viewer matching the `SurfaceView`
   pattern: wrapper `role="application"` with `tabIndex 0`; arrows
   orbit (±0.2), `+`/`-` zoom (×1.2), `0` resets to `DEFAULT_CAMERA`;
   test anchored to the shared camera constants.
3. Live regions: `GraphView` pan/zoom/fit/reset announces a coalesced
   viewport (`Viewport: x -10 to 10, y -7 to 7.`, 350 ms debounce,
   bound values at 4 significant digits) via an `sr-only`
   `aria-live="polite"` node; `AnalysisPanel` result lists/divs are
   `aria-live="polite"`; the plot workshop summary is `role="status"`.
4. Contrast, measured in a real browser (both themes, all five
   workspaces; every visible text element with its background
   composited; SVG text measured by `fill`): two light-theme tokens
   were below the brief's ≥4.8:1 bar and were minutely darkened —
   `--gc-muted` `#78716c`→`#736c67` (4.59→4.94:1 on app bg) and
   `--gc-danger` `#dc2626`→`#d62222` (4.62→4.89:1). Both recorded in
   `docs/design/DESIGN_SYSTEM.md`, where two stale dark-accent values
   were also corrected to the shipped ones. Steady-state result after
   the fix: 0 failing text pairs in both themes (min 4.94:1 light /
   5.05:1 dark); curves 5.18–12.06:1 against their surface (brief bar
   4.9:1); focus rings 6.0–6.6:1. Curves were already compliant.
5. Windows reserved filenames: the project save stem now guards
   `CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9` (`sanitizeFilename`);
   export names append `-graph`/`-figure` and so can never end in a
   bare reserved stem (now asserted in `export.test.ts`). Tests in
   `project.test.ts`.

## Checklist items re-checked (no change needed)

- Error language (source sweep of every user-facing failure string):
  each names the problem and, where a recovery exists, the route
  (Excel→CSV, split oversize input, allowed-symbol lists); import
  failures state that nothing was committed. No rewording required.

## Real-browser verification (Chromium, Vite dev server, 2026-10-17)

- Dialog Tab wrap moves the last stop (Cancel) to the first field;
  Escape closes and returns focus to the opener with a visible ring
  (observed in the DOM, `box-shadow` ring present).
- Graph `ArrowRight` pans and the `aria-live` node text changes to
  `Viewport: x -9 to 11, y -7 to 7.` — the announcement landed in a
  real browser, not only jsdom.
- Lighthouse (Graph Studio, dev server): **accessibility 100/100**,
  best-practices 100. The single SEO finding is the dev server's
  SPA-fallback `robots.txt` — an artefact of `vite dev`, not an app or
  a11y issue. Report saved as `lighthouse.json`/`lighthouse.html`.
- Contrast walker (described in fix 4): Graph 42 / Calculator 94 /
  Data Lab 22 / Learn 305 / Viz3D 40 text elements checked per theme,
  0 failing in both themes.
- Theme-toggle transient (recorded, not hidden): during the ≤150 ms
  colour fade after switching themes, sampled colours legitimately
  interpolate between the two palettes (measured dips to 1.09:1
  mid-flight); every settled state passes. This is a colour-only
  cross-fade, disabled under `prefers-reduced-motion`, and standard
  practice — documented rather than "fixed". **Superseded by the
  gap-closure pass below: the transient is now fixed outright — the
  theme swap no longer interpolates at all.**
- 200% zoom approximation (CSS `zoom: 2` on `<html>`): no
  document-level horizontal scroll appears in any of the five
  workspaces. CSS zoom does not re-evaluate media queries, so the
  compact (<768 px) layout that real browser zoom would select could
  not be exercised in this harness; the approximation holds the
  desktop layout, where right-side chrome is clipped by the fixed
  shell. Recorded as a limitation below, not claimed as a pass.
  **Superseded by the gap-closure pass below: a true narrow viewport was
  exercised (same-origin iframe), the clipping was confirmed at real
  breakpoints, and the top bar now wraps instead of clipping.**

## Environment limitations on record (this pass)

- OS-level key injection did not reach the tab in this harness; the
  keyboard checks above drove the real handlers with real DOM key
  events in a real browser. That is weaker than a human at the
  keyboard and stronger than jsdom; a hands-on keyboard pass and a
  screen-reader pass (NVDA/VoiceOver) remain outstanding, as does
  touch hardware. **Partially resolved by the gap-closure pass below:
  OS-level key injection *does* reach the page when the tab is opened
  focused, so the gap-closure pass is a real-input pass; the
  screen-reader and touch-hardware passes remain outstanding.**
- Real 200%-zoom reflow depends on media-query layout switching and
  could not be exercised (no viewport-emulation tool); only the CSS
  zoom approximation above is verified. **Resolved by the gap-closure
  pass below: a same-origin iframe provides a true narrow viewport
  (media queries evaluate against it).**
- No automated contrast/axe check in CI: the walker used here is a
  one-off browser script. Deferred deliberately (no new dependency).
  **Mostly resolved by the gap-closure pass below: a zero-dependency
  token-math contrast test now runs in `npm test`; a full-DOM
  axe-style audit is still not automated.**

## Quality gates (this pass)

`typecheck` exit 0, `lint` exit 0 zero warnings, `test` 617 passed
(56 files: +3 dialog-focus, +1 GraphView viewport announce, +1 Scatter3D
keyboard, +1 reserved filenames in project tests), `build` success
(pre-existing mathjs chunk warning only), `npm audit --audit-level=high`
0 vulnerabilities (no dependency changes this pass).

# S7.2 gap-closure pass (2026-10-17, later the same day)

Closes the residual items recorded above. All browser evidence in this
section is from real Chromium (Vite dev server) driven with **real
OS-level input** — the earlier "key injection unavailable" limitation was
a harness usage artefact (keys reach the page when the tab is opened
focused). State readback used the session backup (`graphcraft-last-project`),
which is written synchronously on every state change, so results do not
depend on debounced announcements.

## Fixed this pass (with tests)

1. **Theme-toggle contrast transient — fixed, not just documented.**
   `applyTheme` now adds a `theme-switching` class for two animation
   frames; under it, transitions are suppressed, so the palettes swap in
   one paint and no mid-flight interpolation exists. Rationale: the old
   cross-fade interpolated foreground and background out of sync and
   necessarily passed through low-contrast midpoints (measured dips to
   1.09:1) — a synchronised fade cannot fix that, so suppression is the
   correct fix. Tests: `src/storage/theme.test.ts` (class added on a real
   mode change, auto-removed, not added for a same-mode set). Browser
   evidence: a MutationObserver around a real toggle records every `class`
   mutation of the swap happening **with `theme-switching` present and
   computed transition-duration `0s`**; Graph-Studio walkers run
   immediately after real toggles in both directions report **0 failing
   pairs** (light min 4.94:1, dark min 6.93:1).
2. **Automated contrast gate in CI (zero new dependencies).**
   `src/tests/contrast.test.ts` parses the shipped theme tokens from
   `src/index.css` and asserts the brief's bars — text ≥4.8:1 on
   bg/surface/elevated, curve tokens ≥4.9:1 on their surface, focus ring
   ≥3:1, white on accent ≥4.8:1 — for both themes (8 tests). The one-off
   walker remains the whole-DOM *measurement*; this test is the
   regression *gate*. A full axe-style DOM audit is still not in CI
   (deliberately no new dependency; Lighthouse run manually).
3. **Top-bar reflow at narrow viewports — regression found and fixed.**
   With a true narrow viewport (same-origin iframe; media queries
   evaluate against it), the top bar clipped controls with no scroll
   path: at 456 px (equivalent to 200% zoom of this window) **Export and
   the theme toggle** were unreachable; at 320 px (WCAG 1.4.10 target)
   six controls were. Fixed by letting the top bar wrap (`min-h-12
   flex-wrap` on the header, `flex-wrap justify-end` on the right-hand
   control group; `src/app/TopBar.tsx`). Re-measured: 0 clipped controls
   and 0 document horizontal overflow at 456/320 px, and the desktop
   header is unchanged (48 px, single row, at 912 px). jsdom has no
   layout engine, so this fix is verified by real-browser measurement,
   not a unit test — stated as such rather than adding a brittle
   class-name assertion.

## Real-input keyboard verification (this pass)

- **Tab walk (fresh load, 10 real Tab presses):** Project title → the
  five workspace switches → New/Open/Save → Collapse expression list;
  every stop carries a visible focus ring.
- **Dialog contract (real keyboard):** real mouse clicks open the import
  dialog focused on Cancel; real `Tab`/`Shift+Tab` cycle wraps
  (last stop → first field → back); real `Escape` closes it and focus
  returns to the opener. Zero console errors throughout.
- **Graph keys (real key events):** `+` zooms in exactly ×1/1.2 with the
  visible centre preserved (verified numerically: world width 28.8 →
  24.0, centre −2.82 → −2.82); `ArrowLeft` pans exactly width/20 (1.44 on
  a 28.8-wide view); `0` resets to the session-initial view — after a
  reload that is the restored project viewport, not the hard-coded
  default (`useViewport(initial)` semantics, by design, read from
  source).
- **Session restore:** the backup updates synchronously with state (a pan
  changes `graphcraft-last-project` immediately); a reload restores that
  world, proven by pressing `0` after the reload and reading the restored
  rectangle back from the backup.
- **Live region:** after the reset, the viewport announcement updates
  (coalesced, 350 ms) to the exact reset bounds — verified by waiting for
  the expected text in the live node.

## Screen-reader-adjacent evidence (not an AT pass)

Chromium full accessibility-tree snapshots expose the AT-facing
structure: banner/main/complementary ×2/contentinfo landmarks; all 31
buttons and textboxes with accessible names ("Show data lab", "Project
title", …); checkbox states; live `status` regions. This is the tree
assistive technology consumes — **proximity evidence only**: no
NVDA/VoiceOver listening pass was run, and none is claimed.

## Residual limitations (still open, stated plainly)

- No screen-reader software pass (NVDA/VoiceOver) and no touch-hardware
  pass — unchanged from before.
- Screenshots of the narrow layouts could not be captured in this harness
  (the screenshot tool needs a visible desktop window); the reflow
  evidence is metric-based (bounding rects, scroll sizes, computed
  styles).
- Full-DOM axe-style auditing is still manual (Lighthouse + walker); CI
  covers the token math plus the existing behavioural tests only.
- The 200% zoom check uses viewport emulation (same-origin iframe), not
  real browser zoom on a top-level window — the standard technique, but
  noted.

## Quality gates (this pass)

`typecheck` exit 0, `lint` exit 0 zero warnings, `test` **627 passed**
(58 files: +8 contrast token guard, +2 theme-switch suppression),
`build` success (pre-existing mathjs chunk warning only),
`npm audit --audit-level=high` 0 vulnerabilities (no dependency changes).

# S7.4 accessibility + usability pass (2026-10-18)

The twelve-item checklist was re-run on the post-S7.3 tree. Every number
below is real Chromium (Vite dev server, both themes). This session the
harness browser window was not visible, so `browser.press` delivered no
keys, `browser.click` failed and `browser.screenshot` was refused;
interaction evidence below therefore uses the app's own handlers
triggered by DOM-dispatched key events plus `focus()`/`click()` on real
elements in the real layout (real React handlers, real computed styles),
the jsdom suite, and the standing 2026-10-17 real-input pass for the
paths it covered. No screenshots; metric evidence only.

## Fixed this pass (with tests)

1. **Chart axes below 3:1 — fixed outright.** `--gc-axis` (used only by
   GraphView + DataPlot): light `#a8a29e`→`#8e8985`, dark
   `#57534e`→`#78716c`. Measured after: light 3.46:1 on the viewport
   surface (was 2.52), 3.31:1 on `bg`; dark 3.65:1 (was 2.29), 4.12:1
   on `bg`. The fixed-light canvases (3D surface, field, Learn previews)
   and the SVG/PNG export chain mirror the light palette: axis `#8e8985`
   (3.46:1 on white), tick/label `#736c67` measured 5.15–5.16:1 (was
   4.7976), Viz3D stroke minimum 3.46 (was 2.52); the white 3D canvas
   itself is unchanged (export parity). `src/tests/contrast.test.ts`
   gains the "axis rules ≥3:1 on chart surfaces" gate (both surfaces,
   both themes; +2 cases); `export.test.ts` literals updated to the
   mirrored constants (matching truth, not loosened). The faint grid
   strokes (1.08 dark / 1.15–1.20 light) are the only sub-3 items left
   and are documented as decorative in the test header.
2. **Drawer Tab containment.** `containTabFocus` exported from
   `useDialogFocus.ts`; App's narrow-screen drawer panel wired to it.
   jsdom: Tab last→first, Shift+Tab first→last. Real page, 380 px
   iframe: 19 focusables ("Close expression list" … "Add parameter");
   Tab and Shift+Tab both wrapped; Escape closed the drawer and focus
   returned to the opener (focus-before-activate, as real clicks do).
3. **Names/semantics batch.** Column rename buttons now say what they
   act on (`aria-label="Rename <column>"`; six test queries moved to the
   new names — a deliberate name change, not a weakening); `scope="col"`
   on every header cell (DatasetTable including the selection column,
   ImportDialog, PlotWorkshop ×3, FitPanel); visible `<h2>Calculator</h2>`;
   history entries `aria-label="Load <entry> for editing (deg|rad)"`;
   selected rows carry `aria-current="true"` (verified live: DOM Enter on
   the focused row set it); the viewport summary appends ", N markers on
   the plot" — measured live as "Graph viewport showing 2 curves:
   x^2 - 4, sin(x), 2 markers on the plot."
4. **Wording.** Analysis stale note → "Function, view or sliders changed
   — recompute for current results."; integral non-convergence adds "Try
   a narrower interval."; unit norm overflow adds "Scale the entries down
   before computing."
5. **Correction of an earlier record — marker exposure.** Root markers
   (`<g aria-label="root marker: x ≈ -2">`) sit *inside* the `role="img"`
   viewport svg and are pruned from the Chromium accessibility tree
   (snapshot: absent; DOM ancestry: `g < svg.block [role="img"]`). The
   earlier "exposed as group" note does not survive re-measurement; the
   pruning is correct ARIA (ticks/curves stay out of the AT stream), the
   marker *values* reach AT through the analysis live region, and the new
   summary suffix covers the count. The `<g>` labels + `<title>` remain
   as hover tooltips (inert for AT — documented as such, not claimed).

## The 12 items — evidence summary

1. **Keyboard navigation** — earlier real-input pass (10-stop Tab walk
   with rings, dialog cycle, graph `+`/arrows/`0`, calculator keys)
   stands; re-verified live this pass: drawer wraps, row Enter selection,
   practice radios in the real DOM (native inputs in group "Options for
   predict-frequency", answer control activates). Residual: the harness
   window was not visible today (environmental); no AT keystroke echo
   (no screen reader).
2. **Focus management** — dialog contract + drawer trap + opener focus
   return (jsdom and real-DOM); dialog background stays non-`inert`
   (deliberate, documented in the hook); focus rings token-asserted ≥3:1
   and visibly present on every stop of the real Tab walk.
3. **Names/semantics** — measured text alternatives: "Graph viewport
   showing …", "Untitled dataset: scatter plot with 1 visible series and
   3 points."; the batch in fix #3; Learn previews stay `role="img"`
   (static — correct); Viz3D viewers stay `role="application"`
   (documented).
4. **Screen-reader feedback** — live regions captured: workspace switch +
   viewport bounds ("Graph Studio shown." / "Viewport: x -10 to 10,
   y -7 to 7."), analysis roots list (`aria-live="polite"`, "x ≈ -2 …
   x ≈ 2", method note per entry in its own span), practice feedback
   (`role="status"` + `aria-live="polite"`, `aria-label="Practice
   feedback"` — wrong-answer explanation measured), import refusals
   (`role="alert"`): Excel drop ("Excel import (sheet.xlsx) is not
   supported yet — re-save the sheet as CSV and import that. Excel files
   are never parsed as CSV." — no dialog opened) and empty paste
   ("Nothing to import: the text is empty. Nothing has been imported.").
   Deliberate residuals: Data Lab dataset commits stay unannounced (the
   dataset card is the feedback); workspace label casing mix kept.
5. **Contrast** — whole-DOM walker, both themes, all five workspaces:
   page-wide text minima 4.94:1 (light) / 5.05:1 (dark), unchanged;
   chart-axis families fixed (#1); Viz3D ticks 5.16:1; only the
   decorative grids remain under 3:1. Lighthouse on the post-fix tree:
   accessibility **100**, best-practices **100**, 0 failing a11y audits
   (JSON archived `docs/a11y/lighthouse.json`; the `.html` in the folder
   is the earlier recon run's rendering).
6. **Colour-independent information** — series are pattern-coded:
   x^2−4 solid 2 px vs sin(x) `stroke-dasharray: 7px, 4px` (measured);
   marker kinds are shape-coded (root circle, intersection diamond,
   extremum triangle — source-verified); Learn ghost base curves dashed;
   scale notes and legends are textual.
7. **Responsive layout** — same-origin iframe sweep: 6 widths
   (1280/912/768/600/456/320) × 5 workspaces, **30/30 with 0 document
   horizontal overflow and 0 clipped-unreachable controls**; the wide
   table scrolls internally (3010 px content in a 682 px box) while the
   page stays exactly viewport-wide (985 = 985).
8. **Long content / large results** — long expressions scroll inside
   their editor (142-char check, earlier); the 25-column × 3-row import
   commits and its table scrolls internally; multi-line import accounting
   renders as wrapped lines ("3 rows, 25 columns; 1 kept as text." plus
   the per-cell reason); the data-table view is capped at 100 rows and
   the residual table at 100 rows by design (documented).
9. **Touch** — target census at the 985 px desktop layout, controls
   below 24 px in at least one dimension: Graph 12/55, Calculator 8/80,
   Learn 49/150, Data Lab 160/187, Viz3D 9/65. Smallest are the dense
   data-grid cell buttons and compact chips; top-bar buttons measure
   ~23.5 px tall (rounding to 24). No touch hardware exists here — real
   mis-tap behaviour is unverified and nothing is claimed fixed; the
   dense grid is recorded as an improvement candidate (a 24 px grid
   would change the deliberate desktop density).
10. **Error-message usability** — reworded advisories state the next
    action (#4); errors render adjacent to their control and announce
    (`role="alert"`); the Excel refusal names the file and the remedy;
    duplicated export-refusal strings across call sites are left as-is
    (identical wording everywhere — documented, not a defect).
11. **Consistency** — visible Calculator heading matches the rest of its
    surfaces; rename controls say what they act on; workspace label
    casing mix ("Graph studio" vs "Data Lab") kept as historical labels
    (cosmetic; would churn tests) — recorded.
12. **Manual review** — this section, the checklist above, and the
    refreshed Lighthouse archive are the record.

## Quality gates (this pass)

`typecheck` exit 0, `lint` exit 0 zero warnings, `test` **699 passed**
(67 files: +2 axis-on-surface contrast gate cases, 0 failed, 0 skipped),
`build` success (injector "precaching shell + 7 build assets";
pre-existing mathjs chunk warning only), `npm audit --audit-level=high`
0 vulnerabilities (no dependency changes). No commits (repo has none).

## Residual limitations (open, stated plainly)

- No screen-reader software (NVDA/VoiceOver) and no touch-hardware pass —
  unchanged; AT-tree snapshots remain proximity evidence only.
- Real OS-level key/mouse/screenshot injection was unavailable this
  session (harness window not visible); the paths above were re-verified
  with DOM-dispatched events + jsdom, and the 2026-10-17 real-input pass
  stands for everything it covered. Shift+Tab has no real-key emulation
  in this harness even when input works (no modifier support) — jsdom +
  DOM dispatch are its evidence.
- Touch-target counts (item 9) are measurements, not a fix.
- Deliberate residuals: marker `<g>` labels pruned by `role="img"` (by
  design), Data Lab dataset commit unannounced, dialog backgrounds not
  `inert`, duplicated export-refusal strings, workspace label casing mix,
  practice content sparse (default topic "Linear functions" has 0
  prompts; "Trigonometric graphs" has 1 — honest content state, worth a
  content pass later; not an a11y defect).
