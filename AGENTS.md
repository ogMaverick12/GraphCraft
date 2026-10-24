# AGENTS.md — GraphCraft persistent instructions

This file governs all coding sessions for GraphCraft. Follow it word for word unless the user explicitly overrides it for a single task.

## What GraphCraft is
Free, open-source, local-first scientific graphing and mathematics studio.
Modules (incremental): Graph Studio (2D equation plotting) → Calculator → Data Lab → Learn → Advanced visualisation.
Current task scope is defined per-prompt. Do not build future modules early.

## Stack baseline (empty repo — no existing stack to preserve)
- React + TypeScript + Vite (preferred foundation; to be scaffolded in next module).
- Tailwind CSS + shadcn/ui for styling/components (add deliberately, not blindly).
- Purpose-built graphing/coordinate layer for the equation plotter. Plotly.js only for Data Lab / advanced chart families if an explicit evaluation justifies it.
- math.js only wrapped and configured deliberately for expression parsing/evaluation.
- Prefer maintained, documented, compatibly-licensed libraries. Audit exact version + licence before adding.

## Hard rules
1. Smallest change that properly solves the current task.
2. Never rewrite/delete functioning modules to fit a preferred pattern. Explain migration first.
3. No placeholders: no fake data, decorative dead buttons, misleading results, or success messages for unimplemented work.
4. No `any` casts to silence TypeScript, no unexplained lint disables, no deleting failing tests for green builds.
5. No destructive commands, no user-data deletion, no wholesale config replacement, no Git commits without explicit user request.
6. Before adding a dependency, explain: purpose, why native is insufficient, licence compatibility, maintenance status.
7. Every module gets risk-appropriate tests. Math outputs need deterministic fixtures + numerical tolerances.
8. Distinguish verified facts vs assumptions vs open questions vs future options in planning docs.
9. Respect licences/trademarks/copyright/access controls/terms. Learn workflows from lawful observation or permissively-licensed code only. No proprietary source/asset/brand copying. Independent behaviour specs + clean implementation.
10. If an acceptance criterion cannot be met, report plainly. Do not claim success.
11. Never execute user expressions via `eval` or `new Function`. Constrain parser capabilities, define resource/time limits, isolate expensive computation from rendering.
12. Keep numerical/math logic independent from React components.
13. No mandatory paid services, cloud backend, account, API key, telemetry, or AI dependency for core functionality.
14. Light-first UI with high-quality dark mode; muted neutrals; readable type; thin precise grids; restrained accent; subtle motion. Desktop-first, keyboard navigable, graceful small-screen degradation.

## Documentation
Maintain without overwriting useful material:
- `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/DEPENDENCIES.md`, `docs/QUALITY_GATES.md`.
- Merge updates into existing docs; no needless duplicates.

## Validation
Run the exact commands in `docs/QUALITY_GATES.md` for the active stage. Report what changed, what was validated, and the next prompt/module.
