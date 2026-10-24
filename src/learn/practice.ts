import type { LearnLevel } from './library.ts'

/**
 * Practice mode (Stage 5 S5.4): original authored prompts with
 * deterministic checking. Correctness comes only from exact,
 * decidable comparisons — stored option indices and numeric-set
 * matching within tolerance. Exploration items carry NO correctness
 * indicator at all: there is nothing to be "right" about, and the UI
 * says so. No accounts, no scores sent anywhere, no AI, no analytics.
 */

export type PracticeKind = 'predict-transform' | 'identify-feature' | 'match-graph' | 'explore'

export interface PracticeItem {
  readonly id: string
  /** Topic the item belongs to (must exist in the taxonomy). */
  readonly topicId: string
  readonly kind: PracticeKind
  readonly levels: LearnLevel[]
  /** Original authored prompt (no generated text). */
  readonly prompt: string
  /** Graph context: opened on demand, additively, never overwriting work. */
  readonly templateId: string
  /** Multiple-choice options (predict/match only). */
  readonly options?: string[]
  /** Index into options (predict/match only). */
  readonly correctIndex?: number
  /** Accepted numeric set, order-insensitive (identify only). */
  readonly expectedNumbers?: number[]
  /** Matching tolerance for numeric sets (identify only). */
  readonly tolerance?: number
  /** Revealed only through the explicit show-answer control. */
  readonly solution: string
  readonly explanation: string
}

export type PracticeAnswer = { optionIndex: number } | { numbers: number[] }

export interface PracticeVerdict {
  /** True only when the decidable check passes; explore items never produce one. */
  readonly correct: boolean
  readonly reason: string
}

/**
 * Decidable checking, nothing heuristic: option equality for
 * predict/match; sorted pairwise tolerance for numeric sets
 * (duplicates matched positionally after sorting). Anything else —
 * including algebraic equivalence beyond the offered forms — is out
 * of scope and stated in the item explanation instead of guessed.
 */
export function checkPracticeAnswer(item: PracticeItem, answer: PracticeAnswer): PracticeVerdict {
  if (item.kind === 'explore') {
    return { correct: false, reason: 'Exploration has no checked answer — there is nothing to be right about.' }
  }
  if ((item.kind === 'predict-transform' || item.kind === 'match-graph') && 'optionIndex' in answer) {
    if (item.options === undefined || item.correctIndex === undefined) {
      return { correct: false, reason: 'This item is missing its solution data.' }
    }
    if (!Number.isInteger(answer.optionIndex) || answer.optionIndex < 0 || answer.optionIndex >= item.options.length) {
      return { correct: false, reason: 'Choose one of the offered options.' }
    }
    const correct = answer.optionIndex === item.correctIndex
    return { correct, reason: correct ? 'Matches the verified solution.' : 'Does not match the verified solution — the answer control states why.' }
  }
  if (item.kind === 'identify-feature' && 'numbers' in answer) {
    if (item.expectedNumbers === undefined || item.expectedNumbers.length === 0) {
      return { correct: false, reason: 'This item is missing its solution data.' }
    }
    const tolerance = item.tolerance ?? 1e-9
    const expected = [...item.expectedNumbers].sort((a, b) => a - b)
    const given = [...answer.numbers].sort((a, b) => a - b)
    if (given.length !== expected.length || given.some((value) => !Number.isFinite(value))) {
      return { correct: false, reason: `Enter exactly ${expected.length} finite number${expected.length === 1 ? '' : 's'}.` }
    }
    const matched = expected.every((value, i) => Math.abs(value - (given[i] ?? Number.NaN)) <= tolerance)
    return { correct: matched, reason: matched ? 'Matches the verified solution set.' : 'Does not match the verified solution set — the answer control states why.' }
  }
  return { correct: false, reason: 'That answer shape does not fit this item.' }
}

/** Structural validation for practice items against topics and templates. */
export function validatePractice(items: PracticeItem[], topicIds: Set<string>, templateIds: Set<string>): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id) || item.id.length > 48) {
      problems.push(`practice id "${item.id}" must be lowercase-hyphenated, ≤ 48 chars.`)
    }
    if (seen.has(item.id)) {
      problems.push(`duplicate practice id "${item.id}".`)
    }
    seen.add(item.id)
    if (!topicIds.has(item.topicId)) {
      problems.push(`${item.id}: unknown topic "${item.topicId}".`)
    }
    if (!templateIds.has(item.templateId)) {
      problems.push(`${item.id}: unknown template "${item.templateId}".`)
    }
    if (item.levels.length === 0) {
      problems.push(`${item.id}: needs at least one level.`)
    }
    if (item.prompt.trim() === '' || item.solution.trim() === '' || item.explanation.trim() === '') {
      problems.push(`${item.id}: prompt, solution, and explanation are required.`)
    }
    if (item.kind === 'explore') {
      if (item.options !== undefined || item.correctIndex !== undefined || item.expectedNumbers !== undefined) {
        problems.push(`${item.id}: explore items must not carry solution data (no correct indicator exists).`)
      }
      continue
    }
    if (item.kind === 'predict-transform' || item.kind === 'match-graph') {
      if (item.options === undefined || item.options.length < 2 || item.correctIndex === undefined || item.correctIndex < 0 || item.correctIndex >= (item.options?.length ?? 0)) {
        problems.push(`${item.id}: choice items need ≥2 options and a valid correctIndex.`)
      }
      if (item.expectedNumbers !== undefined) {
        problems.push(`${item.id}: choice items must not carry numeric expectations.`)
      }
    }
    if (item.kind === 'identify-feature') {
      if (item.expectedNumbers === undefined || item.expectedNumbers.length === 0 || !item.expectedNumbers.every(Number.isFinite)) {
        problems.push(`${item.id}: identify items need finite expected numbers.`)
      }
      if (item.options !== undefined || item.correctIndex !== undefined) {
        problems.push(`${item.id}: identify items must not carry options.`)
      }
    }
  }
  return problems
}

export const PRACTICE_ITEMS: PracticeItem[] = [
  {
    id: 'predict-shift-right',
    topicId: 'quadratics',
    kind: 'predict-transform',
    levels: ['school', 'competition'],
    prompt: 'y = x² shifts right by 2. Which equation is the result?',
    templateId: 'shift-right-parabola',
    options: ['(x−2)²', '(x+2)²', 'x²−2', 'x²+2'],
    correctIndex: 0,
    solution: '(x−2)²',
    explanation: 'Inside the brackets, minus means right: f(x−2) moves every point toward +x. The trap answer (x+2)² shifts left.',
  },
  {
    id: 'predict-reflect',
    topicId: 'polynomial-behaviour',
    kind: 'predict-transform',
    levels: ['school'],
    prompt: 'y = x³ is mirrored across the y-axis. Which equation is the result?',
    templateId: 'reflect-cubic',
    options: ['(−x)³', 'x³−1', 'x³+1', '(x−1)³'],
    correctIndex: 0,
    solution: '(−x)³',
    explanation: 'f(−x) mirrors on y. Note: −(x³) is an equally correct form for odd powers — the options fix one written form.',
  },
  {
    id: 'predict-frequency',
    topicId: 'trigonometric-graphs',
    kind: 'predict-transform',
    levels: ['school', 'competition'],
    prompt: 'y = sin(x) is squeezed to twice the frequency. Which equation is the result?',
    templateId: 'horizontal-scale-sine',
    options: ['sin(2x)', '2·sin(x)', 'sin(x/2)', 'sin(x)+2'],
    correctIndex: 0,
    solution: 'sin(2x)',
    explanation: 'f(2x) compresses horizontally by 1/2. 2·sin(x) instead doubles the height — a different change.',
  },
  {
    id: 'identify-quadratic-roots',
    topicId: 'quadratics',
    kind: 'identify-feature',
    levels: ['school'],
    prompt: 'List the x-intercepts (roots) of y = x² − 4, separated by commas. Order does not matter.',
    templateId: 'parabola-vertex',
    expectedNumbers: [-2, 2],
    tolerance: 1e-9,
    solution: '−2, 2',
    explanation: 'x² − 4 = 0 gives x = ±2: both crossings, in any order.',
  },
  {
    id: 'identify-exp-intercept',
    topicId: 'exponentials-logarithms',
    kind: 'identify-feature',
    levels: ['school'],
    prompt: 'What is the y-intercept of y = eˣ? Enter the single number.',
    templateId: 'exponential-growth',
    expectedNumbers: [1],
    tolerance: 1e-9,
    solution: '1',
    explanation: 'e⁰ = 1: every exponential a·e^(bx) is scaled from this crossing.',
  },
  {
    id: 'match-unit-circle',
    topicId: 'conic-sections',
    kind: 'match-graph',
    levels: ['school'],
    prompt: 'Which template draws the circle of radius 1 centered on the origin?',
    templateId: 'unit-circle',
    options: ['Unit circle (implicit)', 'Hyperbola in two branches', 'Ellipse, parametric form', 'Cardioid'],
    correctIndex: 0,
    solution: 'Unit circle (implicit)',
    explanation: 'x² + y² = 1: every plotted point is distance 1 from the origin.',
  },
  {
    id: 'match-even-corner',
    topicId: 'corners-steps',
    kind: 'match-graph',
    levels: ['school'],
    prompt: 'Which template is even with a corner at the origin?',
    templateId: 'absolute-value',
    options: ['Absolute value corner', 'Signum step function', 'Floor staircase', 'Reciprocal hyperbola'],
    correctIndex: 0,
    solution: 'Absolute value corner',
    explanation: '|x| mirrors across the y-axis with a non-differentiable corner at (0, 0).',
  },
  {
    id: 'explore-rose-coefficient',
    topicId: 'polar-parametric-curves',
    kind: 'explore',
    levels: ['college'],
    prompt: 'Open the rose, then edit its sources (try 2·cos(3θ)): how do petal count and length respond? No checked answer — explore.',
    templateId: 'rose-four-petals',
    solution: 'Petal count follows the frequency (2θ → 4 petals); amplitude sets petal length.',
    explanation: 'Guided exploration: the graph is the feedback, not a score.',
  },
]
