import type { ExportScene } from './scene.ts'

/**
 * Standalone SVG figure from an export scene. Curves stay vector paths
 * (one per sampler segment); axes, grid, labels, and legend are drawn
 * explicitly. Contains no application chrome — only the figure.
 */

const FONT_STACK = 'Inter, system-ui, -apple-system, \'Segoe UI\', sans-serif';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function pathFrom(points: Array<{ px: number; py: number }>): string {
  const first = points[0]
  if (first === undefined) {
    return ''
  }
  let d = `M ${first.px.toFixed(2)} ${first.py.toFixed(2)}`
  for (const p of points.slice(1)) {
    d += ` L ${p.px.toFixed(2)} ${p.py.toFixed(2)}`
  }
  return d
}

/**
 * Deterministic clip-path id for the plot frame. Scenes with the same
 * frame size share the id — the referenced rect is identical — while
 * differently sized scenes never collide, so several exported figures
 * can live in one document without fighting over a clip definition.
 */
function frameClipId(width: number, height: number): string {
  return `gc-export-frame-${width}x${height}`
}

/** Render at `scale` (vector: viewBox keeps output crisp at any scale). */
export function renderExportSvg(scene: ExportScene, scale: number): string {
  const totalHeight = scene.height + scene.legendHeight + scene.captionHeight
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width * scale}" height="${totalHeight * scale}" viewBox="0 0 ${scene.width} ${totalHeight}" font-family="${FONT_STACK}" role="img">`,
  )
  parts.push(`<title>GraphCraft figure${scene.title !== '' ? ` — ${escapeXml(scene.title)}` : ''}</title>`)
  if (scene.background === 'white') {
    parts.push(`<rect x="0" y="0" width="${scene.width}" height="${totalHeight}" fill="#ffffff"/>`)
  }
  // Curve geometry is clipped to the inner plot rectangle
  // (0,0,scene.width,scene.height) — the same pixel box the transform maps
  // world coordinates into. The legend and caption bands extend the figure
  // below it and stay outside the clip.
  const clipId = frameClipId(scene.width, scene.height)
  parts.push(`<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${scene.width}" height="${scene.height}"/></clipPath></defs>`)
  parts.push(`<g stroke="#e7e5e4" stroke-width="1">`)
  for (const line of scene.gridLines) {
    parts.push(`<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}"/>`)
  }
  parts.push(`</g>`)
  for (const fill of scene.fills) {
    parts.push(`<rect x="${fill.x.toFixed(2)}" y="${fill.y.toFixed(2)}" width="${fill.width.toFixed(2)}" height="${fill.height.toFixed(2)}" fill="${escapeXml(fill.color)}" fill-opacity="0.15"/>`)
  }
  parts.push(`<g stroke="#8e8985" stroke-width="1.5">`)
  for (const axis of scene.axes) {
    parts.push(`<line x1="${axis.x1.toFixed(2)}" y1="${axis.y1.toFixed(2)}" x2="${axis.x2.toFixed(2)}" y2="${axis.y2.toFixed(2)}"/>`)
  }
  parts.push(`</g>`)
  if (scene.origin !== null) {
    parts.push(`<circle cx="${scene.origin.px.toFixed(2)}" cy="${scene.origin.py.toFixed(2)}" r="3.5" fill="#4f46e5"/>`)
  }
  parts.push(`<g fill="#736c67" font-size="11">`)
  for (const tick of scene.tickLabels) {
    parts.push(
      `<text x="${tick.x.toFixed(2)}" y="${tick.y.toFixed(2)}" text-anchor="${tick.anchor}">${escapeXml(tick.text)}</text>`,
    )
  }
  parts.push(`</g>`)
  for (const bar of scene.bars) {
    parts.push(
      `<rect x="${bar.x.toFixed(2)}" y="${bar.y.toFixed(2)}" width="${bar.width.toFixed(2)}" height="${bar.height.toFixed(2)}" fill="${escapeXml(bar.color)}" fill-opacity="0.75"><title>${escapeXml(bar.label)}</title></rect>`,
    )
  }
  if (scene.rules.length > 0) {
    parts.push(`<g stroke-linecap="round">`)
    for (const rule of scene.rules) {
      const dash = rule.dash === '' ? '' : ` stroke-dasharray="${rule.dash}"`
      parts.push(
        `<line x1="${rule.x1.toFixed(2)}" y1="${rule.y1.toFixed(2)}" x2="${rule.x2.toFixed(2)}" y2="${rule.y2.toFixed(2)}" stroke="${escapeXml(rule.color)}" stroke-width="${rule.width}"${dash}/>`,
      )
    }
    parts.push(`</g>`)
  }
  parts.push(`<g clip-path="url(#${clipId})" fill="none" stroke-linejoin="round" stroke-linecap="round">`)
  for (const run of scene.curveRuns) {
    const dash = run.dash === '' ? '' : ` stroke-dasharray="${run.dash}"`
    parts.push(
      `<path d="${pathFrom(run.points)}" stroke="${escapeXml(run.color)}" stroke-width="${run.width}"${dash}><title>${escapeXml(run.label)} (part ${run.part})</title></path>`,
    )
  }
  parts.push(`</g>`)
  if (scene.points.length > 0) {
    parts.push(`<g>`)
    for (const point of scene.points) {
      const label = escapeXml(point.label)
      const color = escapeXml(point.color)
      const x = point.px.toFixed(2)
      const y = point.py.toFixed(2)
      if (point.shape === 'square') {
        parts.push(`<rect x="${(point.px - 3.5).toFixed(2)}" y="${(point.py - 3.5).toFixed(2)}" width="7" height="7" fill="${color}"><title>${label}</title></rect>`)
      } else if (point.shape === 'triangle') {
        parts.push(`<path d="M ${x} ${(point.py - 5).toFixed(2)} L ${(point.px + 5).toFixed(2)} ${(point.py + 4).toFixed(2)} L ${(point.px - 5).toFixed(2)} ${(point.py + 4).toFixed(2)} Z" fill="${color}"><title>${label}</title></path>`)
      } else if (point.shape === 'diamond') {
        parts.push(`<path d="M ${x} ${(point.py - 5).toFixed(2)} L ${(point.px + 5).toFixed(2)} ${y} L ${x} ${(point.py + 5).toFixed(2)} L ${(point.px - 5).toFixed(2)} ${y} Z" fill="${color}"><title>${label}</title></path>`)
      } else {
        parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"><title>${label}</title></circle>`)
      }
    }
    parts.push(`</g>`)
  }
  if (scene.markers.length > 0) {
    parts.push(`<g>`)
    for (const marker of scene.markers) {
      const x = marker.px.toFixed(2)
      const y = marker.py.toFixed(2)
      const label = escapeXml(`${marker.kind}: ${marker.label}`)
      if (marker.kind === 'root') {
        parts.push(`<circle cx="${x}" cy="${y}" r="5.5" fill="#ffffff" stroke="#4f46e5" stroke-width="2"><title>${label}</title></circle>`)
      } else if (marker.kind === 'intersection') {
        parts.push(`<path d="M ${x} ${(marker.py - 7).toFixed(2)} L ${(marker.px + 7).toFixed(2)} ${y} L ${x} ${(marker.py + 7).toFixed(2)} L ${(marker.px - 7).toFixed(2)} ${y} Z" fill="#4f46e5"><title>${label}</title></path>`)
      } else {
        parts.push(`<path d="M ${x} ${(marker.py - 7).toFixed(2)} L ${(marker.px + 7).toFixed(2)} ${(marker.py + 5).toFixed(2)} L ${(marker.px - 7).toFixed(2)} ${(marker.py + 5).toFixed(2)} Z" fill="#ffffff" stroke="#4f46e5" stroke-width="2" stroke-linejoin="round"><title>${label}</title></path>`)
      }
      parts.push(`<text x="${(marker.px + 9).toFixed(2)}" y="${(marker.py - 9).toFixed(2)}" font-size="10" fill="#736c67">${escapeXml(marker.label)}</text>`)
    }
    parts.push(`</g>`)
  }
  if (scene.legend.length > 0) {
    const top = scene.height + 10
    parts.push(`<g font-size="12" fill="#1c1917">`)
    scene.legend.forEach((entry, index) => {
      const y = top + index * 18 + 12
      if (entry.shape !== undefined && entry.dash === '') {
        const cx = 22
        const cy = y - 4
        const color = escapeXml(entry.color)
        if (entry.shape === 'square') {
          parts.push(`<rect x="${cx - 3.5}" y="${cy - 3.5}" width="7" height="7" fill="${color}"/>`)
        } else if (entry.shape === 'triangle') {
          parts.push(`<path d="M ${cx} ${cy - 5} L ${cx + 5} ${cy + 4} L ${cx - 5} ${cy + 4} Z" fill="${color}"/>`)
        } else if (entry.shape === 'diamond') {
          parts.push(`<path d="M ${cx} ${cy - 5} L ${cx + 5} ${cy} L ${cx} ${cy + 5} L ${cx - 5} ${cy} Z" fill="${color}"/>`)
        } else {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}"/>`)
        }
      } else {
        const dash = entry.dash === '' ? '' : ` stroke-dasharray="${entry.dash}"`
        parts.push(
          `<line x1="8" y1="${y - 4}" x2="36" y2="${y - 4}" stroke="${escapeXml(entry.color)}" stroke-width="2.5"${dash}/>`,
        )
      }
      parts.push(`<text x="44" y="${y}">${escapeXml(entry.label)}</text>`)
    })
    parts.push(`</g>`)
  }
  if (scene.captionLines.length > 0) {
    const top = scene.height + scene.legendHeight + 8
    parts.push(`<g font-size="11" fill="#57534e">`)
    scene.captionLines.forEach((line, index) => {
      parts.push(`<text x="8" y="${top + index * 14 + 11}">${escapeXml(line)}</text>`)
    })
    parts.push(`</g>`)
  }
  if (scene.title !== '' || scene.xLabel !== '' || scene.yLabel !== '') {
    parts.push(`<g fill="#1c1917" font-size="12">`)
    if (scene.title !== '') {
      parts.push(`<text x="${scene.width / 2}" y="16" text-anchor="middle" font-weight="600">${escapeXml(scene.title)}</text>`)
    }
    if (scene.xLabel !== '') {
      parts.push(`<text x="${scene.width / 2}" y="${scene.height - 6}" text-anchor="middle">${escapeXml(scene.xLabel)}</text>`)
    }
    if (scene.yLabel !== '') {
      parts.push(
        `<text x="12" y="${scene.height / 2}" text-anchor="middle" transform="rotate(-90 12 ${scene.height / 2})">${escapeXml(scene.yLabel)}</text>`,
      )
    }
    parts.push(`</g>`)
  }
  parts.push(`</svg>`)
  return parts.join('\n')
}
