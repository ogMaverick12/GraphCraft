import { colorbarStops } from './fields.ts'
import { colorForValue, shadeColor, type ProjectedAxes, type ProjectedQuad, type SurfaceAppearance } from './surface.ts'

/**
 * Surface SVG export (Stage 6 S6.7): the standalone figure builder
 * shared by download and tests. White plate, height-coloured quads
 * (solid/wireframe/shaded), projected axes + base ticks, labelled z
 * colour bar, title. No UI chrome, no interactivity — structure
 * asserted in tests, pixels in the fixed-2× PNG path.
 */

const FONT_STACK = 'Inter, system-ui, -apple-system, \'Segoe UI\', sans-serif'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface SurfaceFigureInput {
  quads: ProjectedQuad[]
  axes: ProjectedAxes | null
  xTicks: Array<{ px: number; label: string }>
  yTicks: Array<{ py: number; label: string }>
  vMin: number
  vMax: number
  title: string
  source: string
  appearance: SurfaceAppearance
  showGrid: boolean
  size: { width: number; height: number }
}

export function renderSurfaceSvgText(input: SurfaceFigureInput): string {
  const { quads, axes, xTicks, yTicks, vMin, vMax, title, source, appearance, showGrid, size } = input
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" font-family="${FONT_STACK}" role="img">`)
  parts.push(`<title>${escapeXml(title === '' ? 'GraphCraft 3D surface' : title)} — z = ${escapeXml(source)}</title>`)
  parts.push(`<rect x="0" y="0" width="${size.width}" height="${size.height}" fill="#ffffff"/>`)
  for (const quad of quads) {
    const base = colorForValue(quad.value, vMin, vMax)
    const fill = appearance === 'wireframe' ? 'none' : appearance === 'shaded' ? shadeColor(base, quad.shade) : base
    const stroke = appearance === 'wireframe' ? base : fill
    const d = quad.corners.map((c) => `${c.px.toFixed(2)},${c.py.toFixed(2)}`).join(' ')
    const fillAttr = fill === 'none' ? ' fill="none"' : ` fill="${fill}"`
    parts.push(`<polygon points="${d}"${fillAttr} stroke="${stroke}" stroke-width="${appearance === 'wireframe' ? 0.75 : 0.5}"/>`)
  }
  if (axes !== null) {
    parts.push(`<g stroke="#8e8985" stroke-width="1.5">`)
    const seg = (a: { px: number; py: number }, b: { px: number; py: number }): string => `<line x1="${a.px.toFixed(2)}" y1="${a.py.toFixed(2)}" x2="${b.px.toFixed(2)}" y2="${b.py.toFixed(2)}"/>`
    parts.push(seg(axes.origin, axes.xEnd))
    parts.push(seg(axes.origin, axes.yEnd))
    parts.push(seg(axes.origin, axes.zEnd))
    parts.push(`</g>`)
    parts.push(`<g font-size="12" fill="#1c1917">`)
    parts.push(`<text x="${axes.xEnd.px.toFixed(1)}" y="${(axes.xEnd.py + 14).toFixed(1)}" text-anchor="middle">x</text>`)
    parts.push(`<text x="${axes.yEnd.px.toFixed(1)}" y="${(axes.yEnd.py + 14).toFixed(1)}" text-anchor="middle">y</text>`)
    parts.push(`<text x="${(axes.zEnd.px + 6).toFixed(1)}" y="${axes.zEnd.py.toFixed(1)}">z</text>`)
    if (showGrid) {
      for (const tick of xTicks) {
        parts.push(`<text x="${tick.px.toFixed(1)}" y="${size.height - 6}" text-anchor="middle" font-size="10" fill="#736c67">${escapeXml(tick.label)}</text>`)
      }
      for (const tick of yTicks) {
        parts.push(`<text x="6" y="${tick.py.toFixed(1)}" text-anchor="start" font-size="10" fill="#736c67">${escapeXml(tick.label)}</text>`)
      }
    }
    parts.push(`</g>`)
    if (Number.isFinite(vMin) && Number.isFinite(vMax)) {
      const stops = colorbarStops(vMin, vMax, 'blue-red')
      parts.push(`<g font-size="10" fill="#1c1917">`)
      stops.forEach((stop, i) => {
        const y = 40 + ((size.height - 120) * i) / stops.length
        parts.push(`<rect x="${size.width - 30}" y="${y.toFixed(1)}" width="12" height="${((size.height - 120) / stops.length + 0.5).toFixed(1)}" fill="${stop.color}"/>`)
      })
      parts.push(`<text x="${size.width - 32}" y="48" text-anchor="end">z ${vMin.toPrecision(3)}</text>`)
      parts.push(`<text x="${size.width - 32}" y="${size.height - 52}" text-anchor="end">z ${vMax.toPrecision(3)}</text>`)
      parts.push(`</g>`)
    }
  }
  parts.push(`<g font-size="12" fill="#1c1917"><text x="${size.width / 2}" y="16" text-anchor="middle" font-weight="600">${escapeXml(title)}</text></g>`)
  parts.push(`</svg>`)
  return parts.join('\n')
}
