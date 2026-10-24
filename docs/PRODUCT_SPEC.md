# GraphCraft — Product Specification

## Users
- School learners studying functions and graph transformations.
- JEE / competitive-exam learners inspecting standard and piecewise graphs.
- College students in calculus, coordinate geometry, trigonometry.
- Students/researchers plotting experimental data and fitting curves.
- Anyone needing an accessible scientific calculator and focused plotting workspace.

## What GraphCraft is
Free, open-source, local-first scientific graphing and mathematics studio:
- **Graph Studio:** accurate 2D equation plotting and exploration.
- **Calculator:** scientific calculations; later complex numbers, vectors, matrices, statistics, unit conversion.
- **Data Lab:** data import, scientific plots, regression, uncertainty, high-quality export.
- **Learn:** curated mathematical graph examples, templates, explanatory annotations.
- **Advanced visualisation:** later polar, parametric, implicit, contour, vector-field, 3D.

## Core principles
1. Mathematical correctness before visual effects.
2. Premium, quiet, usable design. Light-first + well-built dark mode; neutral surfaces; strong typography; fine grid lines; restrained accent/animation; no cluttered dashboard.
3. Local-first and free. No mandatory login, paid API, server, analytics beacon, or network dependency for core calculations.
4. Modular architecture: math evaluation, sampling, coordinate transforms, rendering, storage, UI state decoupled.
5. Observable, evidence-driven compatibility: learn workflows from established tools; implement independently.
6. Small, verifiable steps: no major capability without tests, explicit scope, acceptance gate.
7. Honest limitations: state when computation is approximate, unsupported, too expensive, unstable, or unresolvable.

## Product boundaries (this constitution task)
- Establish rules, docs, and delivery baseline only.
- No Graph Studio features in this task. No full application generation.

## Non-goals
- No cloud backend, accounts, or paid services for core functionality.
- No telemetry / analytics beacons.
- No AI dependency for core calculation/plotting.
- No copying proprietary source, assets, brand identity, or protected implementation.
- No placeholder UI that implies unimplemented capability.
- No Plotly.js as default equation renderer; selective use only with explicit justification.
- No `eval` / `new Function` for user expressions.

## Verified facts
- Repository `ogMaverick12/GraphCraft`, branch `main`, is empty (no commits, no files except `.git/`). Verified 2026-10-14.
- No existing stack to preserve; React + TypeScript + Vite baseline is therefore applicable.

## Assumptions
- MIT License confirmed for public open-source distribution; copyright holder `ogMaverick12` (2026). See `LICENSE` and ADR-011.
- npm is the default package manager (Node 24.20.0 / npm 11.19.0 available in this environment).

## Open questions
- Licence choice — resolved: MIT License (see ADR-011).
- Package manager lock-in: npm vs pnpm (default: npm unless user prefers otherwise).
- shadcn/ui inclusion timing: with scaffolding or deferred to first UI module.

## Future options
- Data Lab / advanced chart families may justify Plotly.js after explicit evaluation.
- PWA / offline packaging deferred to Stage 7.

## Numerical analysis (Stage 2, implemented S2.5)
- Graph Studio offers roots, intersections, extrema, tangent/normal lines, and definite integrals over visible cartesian functions, from the Inspector's Analysis section.
- Every value is a labelled numerical estimate with its method attached (bracketing/minimization, golden-section refinement, central differences, adaptive Simpson) — never claimed analytic. Scans cannot prove absence of roots/extrema; the UI says so.
- Results are computed for the current viewport and slider values. After pan/zoom/slider changes, on-graph markers and overlays are suppressed while the panel shows a recompute warning; per-tool visibility toggles and Clear controls are provided.
- Current markers/overlays export into SVG/PNG figures with the same mapping. Deferred: analysis for parametric/polar/implicit rows, integral-area shading, symbolic results.
