# GraphCraft — Design system note (Stage 1 shell)

Independent system. Reference tools (Desmos, GeoGebra, Veusz) informed workflow
principles only; no layout, icon, asset, or brand copied. See
`docs/research/REFERENCE_WORKFLOWS.md`.

## Tokens (`src/index.css`)
Single source of truth; components use semantic utilities only
(`bg-bg`, `bg-surface`, `text-ink`, `text-muted`, `border-line`, …).
No hardcoded surface colours in components.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#fafaf9` | `#0c0a09` | App background |
| `surface` | `#ffffff` | `#1c1917` | Panels, bars |
| `elevated` | `#ffffff` + `shadow-panel` | `#292524` | Drawers, menus |
| `ink` / `ink-soft` | `#1c1917` / `#44403c` | `#f5f5f4` / `#d6d3d1` | Primary / secondary text |
| `muted` | `#736c67` | `#a8a29e` | Hints, empty states (light value darkened 2026-10-17 for the ≥4.8:1 brief bar on `bg`) |
| `line` | `#e7e5e4` | `#2e2a27` | Borders, grid |
| `ring` | `#4f46e5` | `#818cf8` | Focus rings (2px, always visible) |
| `accent` / `accent-strong` | `#4f46e5` / `#4338ca` | `#5b5fe0` / `#5457d6` | Product mark, active states |
| `danger` / `warning` / `success` | `#d62222` / `#b45309` / `#047857` | `#f87171` / `#fbbf24` / `#34d399` | Reserved for parse/analysis states (light danger darkened 2026-10-17 for the ≥4.8:1 brief bar) |
| `grid` / `axis` | `#eceae8` / `#8e8985` | `#23201d` / `#78716c` | Viewport only (axis darkened 2026-10-18 to clear the ≥3:1 chart-surface bar; the fixed-light Viz3D/Field/Learn canvases mirror the light axis + `#736c67` ticks) |

Typography: system sans, `text-xs` labels, `text-sm` body, `text-sm semibold`
headings. Radii: `rounded-md` controls, `rounded-lg` viewport frame.
Shadows: `shadow-panel` (1px, 5% black) on elevated layers only — no
glassmorphism, no gradients. Motion: `--duration-feedback: 150ms` colour
transitions only (`.gc-transition`).

## Layout decisions
- `TopBar` (h-12): identity + project title left; panel toggles + theme right.
  Every button performs a real action; icon-only buttons carry `aria-label`
  + native tooltip. No Save/Export buttons until those modules exist.
- Left panel 192–384px (default 256), collapsible + draggable/keyboard
  (`role=separator`, arrows) resize. Right inspector fixed 16rem, collapsible.
- Below `md`, panels become modal drawers (overlay click / Escape closes,
  focus returns to opener). Graph keeps full space on all sizes.
- `StatusBar`: real values only (expression count, viewport mode, theme).
  Live cursor readout deferred to GS-03 (no mock readout rendered).
- Theme: persisted `localStorage` + OS fallback, applied by a blocking
  `index.html` script before first paint — no flash. React state mirrors it.

## Component inventory
`Button` (default/ghost), `IconButton` (label-required), `Panel`
(title + scroll body), `TopBar`, `StatusBar`, `ExpressionPanel` (empty),
`InspectorPanel` (one real setting: grid visibility), `Viewport`
(static grid + axes; `showGrid` prop).

## Incomplete by design (not mock)
Equation entry, parse states, sampling, ticks, pan/zoom, cursor readout,
project save, export — reserved for GS-01…GS-03 and later. Panels state this
in place.
