import { describe, expect, it } from 'vitest'
import { auditDuplicates, learningPath, orphanTemplates, resolveLesson, validateCurriculum, type LearnTopic } from './curriculum.ts'
import { LEARN_TEMPLATES } from './templates.ts'
import { LEARN_TOPICS } from './topics.ts'

describe('curriculum validation', () => {
  it('passes the shipped taxonomy with no orphans', () => {
    expect(validateCurriculum(LEARN_TOPICS, LEARN_TEMPLATES)).toEqual([])
    expect(orphanTemplates(LEARN_TOPICS, LEARN_TEMPLATES)).toEqual([])
  })

  it('rejects unknown templates, prerequisites, duplicates, and cycles', () => {
    const base: LearnTopic = LEARN_TOPICS[0] as LearnTopic
    expect(validateCurriculum([{ ...base, templateIds: ['no-such-template'] }], LEARN_TEMPLATES)).not.toEqual([])
    expect(validateCurriculum([{ ...base, prerequisites: ['no-such-topic'] }], LEARN_TEMPLATES)).not.toEqual([])
    expect(validateCurriculum([base, base], LEARN_TEMPLATES).some((problem) => problem.includes('duplicate'))).toBe(true)
    const cyclic: LearnTopic[] = [
      { ...base, id: 'a', prerequisites: ['b'], templateIds: [LEARN_TEMPLATES[0]?.id ?? 'x'] },
      { ...base, id: 'b', prerequisites: ['a'], templateIds: [LEARN_TEMPLATES[0]?.id ?? 'x'] },
    ]
    expect(validateCurriculum(cyclic, LEARN_TEMPLATES).some((problem) => problem.includes('cycle'))).toBe(true)
    expect(validateCurriculum([{ ...base, id: 'a', prerequisites: ['a'] }], LEARN_TEMPLATES).some((problem) => problem.includes('itself'))).toBe(true)
  })

  it('covers every template category across topics', () => {
    const covered = new Set(LEARN_TOPICS.flatMap((topic) => topic.templateIds))
    expect(covered.size).toBe(LEARN_TEMPLATES.length)
  })

  it('finds no true duplicate rows across templates', () => {
    // Variants differing by domain or objective are distinct by signature;
    // only byte-identical rows in different templates land here.
    expect(auditDuplicates(LEARN_TEMPLATES)).toEqual([])
  })

  it('flags byte-identical rows as duplicates for review', () => {
    const base = LEARN_TEMPLATES[0]
    if (base === undefined) {
      throw new Error('expected a template')
    }
    const copy = { ...base, id: 'copy-of-first' }
    const groups = auditDuplicates([base, copy])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.templateIds).toEqual(['copy-of-first', base.id])
  })
})

describe('lesson resolution', () => {
  it('joins topics with their templates and prerequisites', () => {
    const lesson = resolveLesson(LEARN_TOPICS, LEARN_TEMPLATES, 'conic-sections')
    expect(lesson?.templates.map((template) => template.id)).toEqual(['unit-circle', 'hyperbola-branches', 'ellipse-parametric', 'parabola-focus'])
    expect(lesson?.required.map((topic) => topic.id)).toEqual(['quadratics'])
    expect(resolveLesson(LEARN_TOPICS, LEARN_TEMPLATES, 'no-such-topic')).toBe(null)
  })

  it('orders foundations before dependents along a path', () => {
    const path = learningPath(LEARN_TOPICS, 'polar-parametric-curves')
    expect(path[path.length - 1]).toBe('polar-parametric-curves')
    expect(path.indexOf('trigonometric-graphs')).toBeLessThan(path.indexOf('polar-parametric-curves'))
    expect(path.indexOf('conic-sections')).toBeLessThan(path.indexOf('polar-parametric-curves'))
    expect(path.indexOf('quadratics')).toBeLessThan(path.indexOf('conic-sections'))
    expect(new Set(path).size).toBe(path.length)
    expect(learningPath(LEARN_TOPICS, 'linear-functions')).toEqual(['linear-functions'])
    expect(learningPath(LEARN_TOPICS, 'no-such-topic')).toEqual([])
  })
})
