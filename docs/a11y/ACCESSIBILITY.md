# GraphCraft — Accessibility statement

GraphCraft aims to be operable by keyboard, readable in both themes,
and honest with assistive technology. Keyboard/focus/labels/live-
feedback reviews were conducted in successive passes (2026-10-16
through 2026-10-18; findings, fixes and measurements in
`docs/a11y/AUDIT.md`): labelled controls, focus-visible rings, dialog
and drawer Escape + Tab containment with opener focus restore, keyboard
curve selection, live result/error/status announcements, chart axes and
fixed-light canvases at ≥3:1, non-colour encodings (dashes, shapes,
labels, tables), and reduced-motion support.

No full conformance is claimed: there has been no formal WCAG audit,
no screen-reader software pass, and no touchscreen-hardware pass. The
current limitations are listed in `docs/a11y/AUDIT.md` (S7.4 residual
section); the previously listed gaps (dialog focus traps, pan/zoom
announcements, unmeasured contrast ratios, the 200%-zoom pass) have
since been closed there. Accessibility bug reports following the
template in `.github/ISSUE_TEMPLATE/bug_report.md` are welcome.
