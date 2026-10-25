import type { LearnLevel } from './library.ts'

/**
 * Practice mode (Stage 5 S5.4): curated prompts with deterministic
 * checking. Prompts, solutions, and explanations were rewritten in the
 * S8.17 clean-room pass; ids, graph references, correct option
 * indices, expected numeric sets, and tolerances are unchanged. Five
 * formula/number solutions were retained; three prose/match solutions
 * and two match-item option lists were updated to the new template
 * titles. See docs/PROVENANCE.md. Correctness comes only from exact,
 * decidable comparisons. Exploration items carry NO correctness indicator at all:
 * there is nothing to be "right" about, and the UI says so. No accounts,
 * no scores sent anywhere, no AI, no analytics.
 */

export type PracticeKind = 'predict-transform' | 'identify-feature' | 'match-graph' | 'explore'

export interface PracticeItem {
  readonly id: string
  /** Topic the item belongs to (must exist in the taxonomy). */
  readonly topicId: string
  readonly kind: PracticeKind
  readonly levels: LearnLevel[]
  /** Curated prompt written for this library (no generated text). */
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
    prompt: 'The graph of y = x² is moved 2 units to the right. Which expression describes the new graph?',
    templateId: 'shift-right-parabola',
    options: ['(x−2)²', '(x+2)²', 'x²−2', 'x²+2'],
    correctIndex: 0,
    solution: '(x−2)²',
    explanation: 'Replacing x by x − 2 delays each input by 2, so the whole parabola moves toward positive x. The expression (x + 2)² shifts left.',
  },
  {
    id: 'predict-reflect',
    topicId: 'polynomial-behaviour',
    kind: 'predict-transform',
    levels: ['school'],
    prompt: 'The graph of y = x³ is reflected across the y-axis. Which expression gives the reflected graph?',
    templateId: 'reflect-cubic',
    options: ['(−x)³', 'x³−1', 'x³+1', '(x−1)³'],
    correctIndex: 0,
    solution: '(−x)³',
    explanation: 'Substituting −x for x mirrors each point to the opposite side of the y-axis. For an odd power, (−x)³ and −(x³) are equal, so both describe the same reflected curve; the options select one written form.',
  },
  {
    id: 'predict-frequency',
    topicId: 'trigonometric-graphs',
    kind: 'predict-transform',
    levels: ['school', 'competition'],
    prompt: 'The graph of y = sin(x) is compressed horizontally so that it completes twice as many cycles in the same interval. Which expression matches?',
    templateId: 'horizontal-scale-sine',
    options: ['sin(2x)', '2·sin(x)', 'sin(x/2)', 'sin(x)+2'],
    correctIndex: 0,
    solution: 'sin(2x)',
    explanation: 'Multiplying the input by 2 makes the sine function run through its cycle twice as fast, halving the horizontal span of each wave. Multiplying the output by 2 would change the height instead.',
  },
  {
    id: 'identify-quadratic-roots',
    topicId: 'quadratics',
    kind: 'identify-feature',
    levels: ['school'],
    prompt: 'Find the x-values where y = x² − 4 crosses the x-axis. Enter them separated by commas; order does not matter.',
    templateId: 'parabola-vertex',
    expectedNumbers: [-2, 2],
    tolerance: 1e-9,
    solution: '−2, 2',
    explanation: 'Setting x² − 4 = 0 gives x² = 4, so the two crossings are x = −2 and x = 2.',
  },
  {
    id: 'identify-exp-intercept',
    topicId: 'exponentials-logarithms',
    kind: 'identify-feature',
    levels: ['school'],
    prompt: 'Find the y-value where y = eˣ meets the y-axis. Enter one number.',
    templateId: 'exponential-growth',
    expectedNumbers: [1],
    tolerance: 1e-9,
    solution: '1',
    explanation: 'At x = 0, e⁰ = 1, so the graph crosses the y-axis at y = 1.',
  },
  {
    id: 'match-unit-circle',
    topicId: 'conic-sections',
    kind: 'match-graph',
    levels: ['school'],
    prompt: 'Which template represents the set of points exactly 1 unit from the origin?',
    templateId: 'unit-circle',
    options: ['Unit circle as an implicit relation', 'Hyperbola opening left and right', 'Ellipse traced by cosine and sine', 'Cardioid polar curve'],
    correctIndex: 0,
    solution: 'Unit circle as an implicit relation',
    explanation: 'The equation x² + y² = 1 is satisfied exactly by points at distance 1 from (0, 0), which is the unit circle.',
  },
  {
    id: 'match-even-corner',
    topicId: 'corners-steps',
    kind: 'match-graph',
    levels: ['school'],
    prompt: 'Which template shows a function that is symmetric about the y-axis and has a sharp corner at the origin?',
    templateId: 'absolute-value',
    options: ['Absolute-value graph with a sharp corner', 'Sign function built from three rules', 'Greatest-integer staircase', 'Reciprocal curve with a vertical pole'],
    correctIndex: 0,
    solution: 'Absolute-value graph with a sharp corner',
    explanation: 'The absolute-value graph satisfies f(−x) = f(x), and its two straight arms meet at a corner where the slope changes abruptly.',
  },
  {
    id: 'explore-rose-coefficient',
    topicId: 'polar-parametric-curves',
    kind: 'explore',
    levels: ['college'],
    prompt: 'Open the four-petal rose and change its equation (for example, try 2·cos(3θ)). Watch how the number of petals and their length respond. This is exploration; no answer is checked.',
    templateId: 'rose-four-petals',
    solution: 'The multiplier outside cosine sets petal length; the integer inside cosine controls how many petals appear. Test a few values and compare the graph.',
    explanation: 'Use the live graph as feedback: change one coefficient at a time, then describe what changed. There is no score for this item.',
  },
]
