# GraphCraft — Architecture

Status: FND-01 foundation in place (2026-10-14). No math/graphing implementation yet.

## Target module boundaries
- `math-core/` — pure TypeScript numerical logic: expression parsing/evaluation wrapper, sampling, regression, statistics, units. No React imports. No DOM. Deterministic, tested with tolerances.
- `graphing/coordinate/` — purpose-built coordinate layer: world↔screen transforms, axis ticks, grid geometry, viewport, polar/parametric extension points. No React. No rendering library coupling.
- `graphing/rendering/` — canvas/SVG renderer consuming sampled paths + coordinate layer. Keeps draw code isolated for testability and performance work.
- `storage/` — local persistence (localStorage / IndexedDB / files): graphs, settings, history. Versioned schemas. No network.
- `ui-state/` — React state, routing, keyboard navigation, theme (light/dark). Depends on above; never the reverse.
- `components/` — Tailwind + shadcn/ui presentational components. No math inside.
- Future: `calculator/`, `data-lab/`, `learn/`, `advanced-viz/` — each decoupled, added per ROADMAP.

## Dependency rules
- `math-core` and `coordinate` must not import React, DOM, or rendering libraries.
- `rendering` must not contain math semantics; it draws what it is given.
- `ui-state` / `components` orchestrate; expensive computation isolated from render (web worker or deferred evaluation where justified).
- User expressions: only through a configured, wrapped parser (e.g. math.js scoped instance). Forbidden: `eval`, `new Function`, unconstrained parser scope, unbounded input length/iterations.
- New dependencies require: purpose, why-native-insufficient, licence + version audit, maintenance check. Record in `docs/DEPENDENCIES.md`.
- No mandatory network/telemetry/AI/cloud dependencies in core path.

## Current dependency graph
FND-01 shell + design system + GS-01 math engine: `app` (App, TopBar, StatusBar, panels) →
`components/ui` (Button, IconButton, Panel), `graph/Viewport` (static grid,
`showGrid` prop), `storage/theme`, `math` (types, engine, index; pure TS, no
React/DOM), `sampling` (types, sampler, index; depends on `math` only —
never recompiles in the loop), `graph` (coordinate, palette, GraphView,
useViewport, useCurves; renders sampler segments opaquely, never joins
them), `expressions` (discriminated row union: cartesian, parametric,
polar, implicit, inequality; model, useWorkspace, ExpressionList, RowEditor, RowItem,
PiecewiseEditor, compileRow, templates; drafts commit debounced,
sampling sees only committed text), `parameters` (model, store, panel; names compile, values
sample; templates generate rows only), `project` (schema v5, validate+migrate, serialize, files,
prefs; documents are user-owned files, storage degrades gracefully),
`export` (scene, SVG/PNG renderers, filenames, dialog; figures contain
no UI chrome). `rendering/` retired as reserved (see `docs/rendering/RENDERER.md`
for the SVG decision). S2.5 adds `analysis` (pure numerics, panel,
`useAnalysis` snapshots; depends on `math` + `expressions` types only),
`graph/markers` (world-point contract consumed by `GraphView` and the
export scene), and overlay curves through the existing sampler. Styling flows only from `src/index.css` tokens; components
carry no hardcoded surface colours.

## Risks
- Math correctness regressions if UI and numerics couple — mitigated by boundary above + fixture tests.
- Parser abuse / DoS via crafted expressions — mitigated by limits + worker isolation.
- Renderer lock-in if Plotly adopted prematurely — mitigated by purpose-built default + explicit evaluation gate.
