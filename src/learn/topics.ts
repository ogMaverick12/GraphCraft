import type { LearnTopic } from './curriculum.ts'

/**
 * Curated topic taxonomy (Stage 5 S5.1): twelve topics over the
 * template catalog, ordered by prerequisites (a DAG — cycles are
 * rejected by validation). All prose is GraphCraft-original; no
 * curriculum-alignment claims.
 */
export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: 'linear-functions',
    title: 'Linear functions',
    summary: 'Straight lines: slope as rate of change, intercepts, and direct proportion.',
    levels: ['foundation', 'school'],
    prerequisites: [],
    templateIds: ['line-slope-intercept', 'line-through-origin', 'line-point-slope', 'line-intercept-form'],
  },
  {
    id: 'trigonometric-graphs',
    title: 'Trigonometric graphs',
    summary: 'Sine waves and tangent poles: amplitude, period, and where functions break.',
    levels: ['foundation', 'school'],
    prerequisites: [],
    templateIds: ['sine-wave', 'tangent-poles', 'horizontal-scale-sine', 'cosine-wave'],
  },
  {
    id: 'quadratics',
    title: 'Quadratics',
    summary: 'Parabolas through vertex form and factored form: turning points and roots.',
    levels: ['school'],
    prerequisites: ['linear-functions'],
    templateIds: ['parabola-vertex', 'quadratic-factored', 'shift-right-parabola', 'quadratic-vertex-form'],
  },
  {
    id: 'asymptotes-rational',
    title: 'Asymptotes and rational functions',
    summary: 'Poles, end behaviour, and the difference between undefined points and big values.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['reciprocal', 'rational-asymptote', 'rational-bounded-bell'],
  },
  {
    id: 'corners-steps',
    title: 'Corners and steps',
    summary: 'Absolute value, signum, and floor: continuity without smoothness, jumps without slopes.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['absolute-value', 'signum-step', 'floor-staircase', 'abs-shifted-scaled', 'abs-reflected'],
  },
  {
    id: 'exponentials-logarithms',
    title: 'Exponentials and logarithms',
    summary: 'Growth and decay, the natural and decimal logs, and why logs grow so slowly.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['exponential-growth', 'exponential-decay', 'natural-log', 'common-log', 'exponential-shifted'],
  },
  {
    id: 'polynomial-behaviour',
    title: 'Polynomial end behaviour and turns',
    summary: 'How degree and leading coefficient control tails, and how turning points multiply.',
    levels: ['school', 'competition', 'college'],
    prerequisites: ['quadratics'],
    templateIds: ['cubic-inflection', 'cubic-two-turns', 'quartic-w-shape', 'reflect-cubic'],
  },
  {
    id: 'inverse-trigonometry',
    title: 'Inverse trigonometric functions',
    summary: 'Principal branches: what restricting domain and range buys back from non-injective trig.',
    levels: ['competition', 'college'],
    prerequisites: ['trigonometric-graphs'],
    templateIds: ['arcsine', 'arctangent'],
  },
  {
    id: 'conic-sections',
    title: 'Conic sections',
    summary: 'Circles, hyperbolas, ellipses, and parabolas as equations in two variables.',
    levels: ['school', 'competition'],
    prerequisites: ['quadratics'],
    templateIds: ['unit-circle', 'hyperbola-branches', 'ellipse-parametric', 'parabola-focus'],
  },
  {
    id: 'piecewise-models',
    title: 'Piecewise models',
    summary: 'Different rules on different regions: switches, joins, and what happens at boundaries.',
    levels: ['college'],
    prerequisites: ['corners-steps'],
    templateIds: ['heaviside-step', 'split-power-branches'],
  },
  {
    id: 'polar-parametric-curves',
    title: 'Polar and parametric curves',
    summary: 'Roses, cardioids, and motion-parametrized paths beyond y-as-a-function-of-x.',
    levels: ['competition', 'college'],
    prerequisites: ['trigonometric-graphs', 'conic-sections'],
    templateIds: ['rose-four-petals', 'cardioid', 'parametric-parabola'],
  },
  {
    id: 'calculus-graphs',
    title: 'Tangents and areas',
    summary: 'Tangency as shared point plus shared slope, and integrals as area under humps.',
    levels: ['school', 'college'],
    prerequisites: ['polynomial-behaviour', 'trigonometric-graphs'],
    templateIds: ['parabola-tangent-line', 'sine-area-segment'],
  },
]
