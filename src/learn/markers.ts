import type { LearnTemplate } from './library.ts'

export interface TemplateMarker {
  readonly x: number
  readonly y: number
  readonly kind: 'root' | 'extremum'
  readonly label: string
}

/**
 * Graph markers for annotations, limited to kinds with identical
 * marker semantics: x-intercepts are roots (drawn on y = 0 like every
 * root marker); vertices and extrema are extrema. Every other kind is
 * text-only in Learn — y-intercepts, asymptotes, symmetry, domains,
 * tangents, and parameters never borrow a marker shape that would
 * mislabel them.
 */
export function markersFromTemplate(template: LearnTemplate): TemplateMarker[] {
  const markers: TemplateMarker[] = []
  for (const annotation of template.annotations ?? []) {
    if (annotation.point === undefined) {
      continue
    }
    if (annotation.kind === 'root') {
      markers.push({ x: annotation.point.x, y: 0, kind: 'root', label: annotation.label })
    } else if (annotation.kind === 'vertex' || annotation.kind === 'extremum') {
      markers.push({ x: annotation.point.x, y: annotation.point.y, kind: 'extremum', label: annotation.label })
    }
  }
  return markers
}
