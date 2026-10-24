import { describe, expect, it } from 'vitest'
import { checkPracticeAnswer, PRACTICE_ITEMS, validatePractice, type PracticeItem } from './practice.ts'
import { LEARN_TEMPLATES } from './templates.ts'
import { LEARN_TOPICS } from './topics.ts'

const TOPICS = new Set(LEARN_TOPICS.map((topic) => topic.id))
const TEMPLATES = new Set(LEARN_TEMPLATES.map((template) => template.id))

function byId(id: string): PracticeItem {
  const item = PRACTICE_ITEMS.find((entry) => entry.id === id)
  if (item === undefined) {
    throw new Error(`missing practice item ${id}`)
  }
  return item
}

describe('practice validation', () => {
  it('passes every shipped item', () => {
    expect(validatePractice(PRACTICE_ITEMS, TOPICS, TEMPLATES)).toEqual([])
  })

  it('rejects bad ids, unknown refs, and explore items with solution data', () => {
    const base = byId('predict-shift-right')
    expect(validatePractice([{ ...base, id: 'Bad!' }], TOPICS, TEMPLATES)).not.toEqual([])
    expect(validatePractice([{ ...base, topicId: 'nope' }], TOPICS, TEMPLATES)).not.toEqual([])
    expect(validatePractice([{ ...base, templateId: 'nope' }], TOPICS, TEMPLATES)).not.toEqual([])
    expect(validatePractice([byId('explore-rose-coefficient')], TOPICS, TEMPLATES)).toEqual([])
    expect(validatePractice([{ ...byId('explore-rose-coefficient'), options: ['a', 'b'], correctIndex: 0 }], TOPICS, TEMPLATES)).not.toEqual([])
    expect(validatePractice([base, base], TOPICS, TEMPLATES).some((problem) => problem.includes('duplicate'))).toBe(true)
  })

  it('covers predict, identify, match, and explore kinds', () => {
    const kinds = new Set(PRACTICE_ITEMS.map((item) => item.kind))
    expect(kinds).toEqual(new Set(['predict-transform', 'identify-feature', 'match-graph', 'explore']))
  })
})

describe('deterministic checking', () => {
  it('grades choices by stored index only', () => {
    expect(checkPracticeAnswer(byId('predict-shift-right'), { optionIndex: 0 })).toMatchObject({ correct: true })
    expect(checkPracticeAnswer(byId('predict-shift-right'), { optionIndex: 1 })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(byId('predict-shift-right'), { optionIndex: 9 })).toMatchObject({ correct: false })
  })

  it('matches numeric sets regardless of order within tolerance', () => {
    const item = byId('identify-quadratic-roots')
    expect(checkPracticeAnswer(item, { numbers: [2, -2] })).toMatchObject({ correct: true })
    expect(checkPracticeAnswer(item, { numbers: [-2, 2] })).toMatchObject({ correct: true })
    expect(checkPracticeAnswer(item, { numbers: [-2.0000000001, 2] })).toMatchObject({ correct: true })
    expect(checkPracticeAnswer(item, { numbers: [-2] })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(item, { numbers: [-2, 2, 0] })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(item, { numbers: [-1, 2] })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(item, { numbers: [Number.NaN, 2] })).toMatchObject({ correct: false })
  })

  it('never marks exploration correct and rejects mismatched shapes', () => {
    expect(checkPracticeAnswer(byId('explore-rose-coefficient'), { optionIndex: 0 })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(byId('predict-shift-right'), { numbers: [0] })).toMatchObject({ correct: false })
    expect(checkPracticeAnswer(byId('identify-quadratic-roots'), { optionIndex: 0 })).toMatchObject({ correct: false })
  })
})
