import type { LearnTemplate } from './library.ts'
import type { TemplateMarker } from './markers.ts'

export interface LearnTemplateData {
  readonly templates: LearnTemplate[]
  readonly markersFromTemplate: (template: LearnTemplate) => TemplateMarker[]
}

let templatePromise: Promise<LearnTemplateData> | null = null

/**
 * One shared on-demand load for curated template data and its graph-marker
 * projection. The Learn library UI uses the same module, so the browser
 * caches it; a restored annotation id must not pull template data or marker
 * helpers into the initial graph bundle. A failed load clears the cache so
 * an explicit retry can fetch the chunk again.
 */
export function loadLearnTemplates(): Promise<LearnTemplateData> {
  if (templatePromise === null) {
    templatePromise = import('./templates.ts')
      .then((module) => ({
        templates: module.LEARN_TEMPLATES,
        markersFromTemplate: module.markersFromTemplate,
      }))
      .catch((error: unknown) => {
        templatePromise = null
        throw error
      })
  }
  return templatePromise
}
