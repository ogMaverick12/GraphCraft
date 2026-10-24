import type { LearnLevel, LearnTemplate } from './library.ts'

/**
 * Learn curriculum (Stage 5 S5.1): topics group templates into a
 * prerequisite-ordered hierarchy. Pure data + pure validation — no
 * React, no DOM. Topics reference templates by id; the resolver joins
 * them at read time, so content stays independent of presentation and
 * a template can serve several topics without duplication.
 */

export interface LearnTopic {
  readonly id: string
  /** Learner-facing title, 1–60 characters. */
  readonly title: string
  /** One or two sentences: what this topic covers. */
  readonly summary: string
  /** Audience groupings (school / competition / college / foundation). */
  readonly levels: LearnLevel[]
  /** Topic ids the learner should meet first (must form a DAG). */
  readonly prerequisites: string[]
  /** Template ids demonstrating this topic (1–8, all must exist). */
  readonly templateIds: string[]
}

export interface ResolvedLesson {
  readonly topic: LearnTopic;
  readonly templates: LearnTemplate[];
  /** Prerequisite topics, resolved (missing ids are validation errors, never silent gaps). */
  readonly required: LearnTopic[];
}

/** Structural validation across topics and against the template catalog. */
export function validateCurriculum(topics: LearnTopic[], templates: LearnTemplate[]): string[] {
  const problems: string[] = []
  const templateIds = new Set(templates.map((template) => template.id))
  const seen = new Set<string>()
  for (const topic of topics) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic.id) || topic.id.length > 48) {
      problems.push(`topic id "${topic.id}" must be lowercase-hyphenated, ≤ 48 chars.`)
    }
    if (seen.has(topic.id)) {
      problems.push(`duplicate topic id "${topic.id}".`)
    }
    seen.add(topic.id)
    if (topic.title.trim() === '' || topic.title.length > 60) {
      problems.push(`${topic.id}: title must be 1–60 characters.`)
    }
    if (topic.summary.trim() === '') {
      problems.push(`${topic.id}: summary is required.`)
    }
    if (topic.levels.length === 0) {
      problems.push(`${topic.id}: needs at least one level.`)
    }
    if (topic.templateIds.length < 1 || topic.templateIds.length > 8) {
      problems.push(`${topic.id}: needs 1–8 template ids.`)
    }
    for (const templateId of topic.templateIds) {
      if (!templateIds.has(templateId)) {
        problems.push(`${topic.id}: unknown template id "${templateId}".`)
      }
    }
    for (const prerequisite of topic.prerequisites) {
      if (prerequisite === topic.id) {
        problems.push(`${topic.id}: cannot require itself.`)
      } else if (!topics.some((other) => other.id === prerequisite)) {
        problems.push(`${topic.id}: unknown prerequisite "${prerequisite}".`)
      }
    }
  }
  // Prerequisite cycles would make every ordering a lie: detect and name them.
  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string, trail: string[]): void => {
    if (done.has(id) || !seen.has(id)) {
      return
    }
    if (visiting.has(id)) {
      problems.push(`prerequisite cycle: ${[...trail, id].join(' → ')}.`)
      return
    }
    visiting.add(id)
    const topic = topics.find((entry) => entry.id === id)
    for (const prerequisite of topic?.prerequisites ?? []) {
      visit(prerequisite, [...trail, id])
    }
    visiting.delete(id)
    done.add(id)
  };
  for (const topic of topics) {
    visit(topic.id, [])
  }
  return problems
}

/** Join a topic with its templates and prerequisites (validated input assumed). */
export function resolveLesson(topics: LearnTopic[], templates: LearnTemplate[], id: string): ResolvedLesson | null {
  const topic = topics.find((entry) => entry.id === id)
  if (topic === undefined) {
    return null
  }
  const byId = new Map(templates.map((template) => [template.id, template]))
  return {
    topic,
    templates: topic.templateIds.flatMap((templateId) => {
      const template = byId.get(templateId)
      return template === undefined ? [] : [template]
    }),
    required: topic.prerequisites.flatMap((prerequisite) => {
      const required = topics.find((entry) => entry.id === prerequisite)
      return required === undefined ? [] : [required]
    }),
  }
}

/**
 * Foundations-first learning path to a target: prerequisites before
 * dependents, each topic once. Empty when the target is unknown.
 */
export function learningPath(topics: LearnTopic[], targetId: string): string[] {
  const byId = new Map(topics.map((topic) => [topic.id, topic]))
  if (!byId.has(targetId)) {
    return []
  }
  const ordered: string[] = []
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) {
      return
    }
    visited.add(id)
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(prerequisite)) {
        visit(prerequisite)
      }
    }
    ordered.push(id)
  };
  visit(targetId)
  return ordered
}

/** Template ids no topic references (catalog hygiene: every example should teach somewhere). */
export function orphanTemplates(topics: LearnTopic[], templates: LearnTemplate[]): string[] {
  const covered = new Set(topics.flatMap((topic) => topic.templateIds))
  return templates.filter((template) => !covered.has(template.id)).map((template) => template.id)
}

export interface DuplicateGroup {
  readonly signature: string
  readonly templateIds: string[]
}

function rowSignature(row: LearnTemplate['rows'][number]): string {
  const normalized = (source: string): string => source.replace(/\s+/g, '')
  switch (row.kind) {
    case 'cartesian':
      return `cartesian:${normalized(row.source)}|${row.domain === undefined || row.domain === null ? '-' : `${row.domain.min},${row.domain.max}`}|${(row.branches ?? []).map((branch) => `${branch.op}${branch.value}:${normalized(branch.source)}`).join(';')}|${normalized(row.defaultSource ?? '')}`
    case 'parametric':
      return `parametric:${normalized(row.xSource)}|${normalized(row.ySource)}|${row.tMin},${row.tMax}`
    case 'polar':
      return `polar:${normalized(row.source)}|${row.thetaMin},${row.thetaMax}`
    case 'implicit':
      return `implicit:${normalized(row.leftSource)}|${normalized(row.rightSource)}`
    case 'inequality':
      return `inequality:${normalized(row.leftSource)}|${row.op}|${normalized(row.rightSource)}`
  }
}

/**
 * Coverage/duplication audit: groups of distinct templates sharing an
 * identical row (same kind, sources, and ranges). Variants with
 * different domains or objectives are distinct by signature and never
 * flagged — only true duplicates land here, for a human to merge.
 */
export function auditDuplicates(templates: LearnTemplate[]): DuplicateGroup[] {
  const groups = new Map<string, string[]>()
  for (const template of templates) {
    for (const row of template.rows) {
      const signature = rowSignature(row)
      const group = groups.get(signature) ?? []
      if (!group.includes(template.id)) {
        group.push(template.id)
      }
      groups.set(signature, group)
    }
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([signature, templateIds]) => ({ signature, templateIds: [...templateIds].sort() }))
}
