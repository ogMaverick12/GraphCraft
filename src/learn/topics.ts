import type { LearnTopic } from './curriculum.ts'

/**
 * Curated topic taxonomy (Stage 5 S5.1): twelve topics over the
 * template catalog, ordered by prerequisites (a DAG — cycles are
 * rejected by validation). Summaries were rewritten in the S8.17
 * clean-room pass; ids, titles, prerequisite links, and template
 * references are unchanged. No curriculum-alignment claims. See
 * docs/PROVENANCE.md.
 */
export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: 'linear-functions',
    title: 'Linear functions',
    summary: 'Equations whose graphs are straight lines: constant rate of change, axis crossings, and proportional relationships.',
    levels: ['foundation', 'school'],
    prerequisites: [],
    templateIds: ['line-slope-intercept', 'line-through-origin', 'line-point-slope', 'line-intercept-form'],
  },
  {
    id: 'trigonometric-graphs',
    title: 'Trigonometric graphs',
    summary: 'Repeating curves and vertical poles: amplitude, cycle length, and the intervals where sine, cosine, and tangent are defined.',
    levels: ['foundation', 'school'],
    prerequisites: [],
    templateIds: ['sine-wave', 'tangent-poles', 'horizontal-scale-sine', 'cosine-wave'],
  },
  {
    id: 'quadratics',
    title: 'Quadratics',
    summary: 'Second-degree curves: vertex, factored zeros, and how shifting or stretching changes the parabola.',
    levels: ['school'],
    prerequisites: ['linear-functions'],
    templateIds: ['parabola-vertex', 'quadratic-factored', 'shift-right-parabola', 'quadratic-vertex-form'],
  },
  {
    id: 'asymptotes-rational',
    title: 'Asymptotes and rational functions',
    summary: 'Rational expressions: where denominators vanish, how branches behave near poles, and the limiting heights far from the origin.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['reciprocal', 'rational-asymptote', 'rational-bounded-bell'],
  },
  {
    id: 'corners-steps',
    title: 'Corners and steps',
    summary: 'Functions with abrupt changes: absolute-value corners, sign jumps, and floor steps that test continuity and differentiability.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['absolute-value', 'signum-step', 'floor-staircase', 'abs-shifted-scaled', 'abs-reflected'],
  },
  {
    id: 'exponentials-logarithms',
    title: 'Exponentials and logarithms',
    summary: 'Exponential change and inverse logarithmic scales: growth, decay, domain restrictions, and slow logarithmic increase.',
    levels: ['school', 'competition'],
    prerequisites: ['linear-functions'],
    templateIds: ['exponential-growth', 'exponential-decay', 'natural-log', 'common-log', 'exponential-shifted'],
  },
  {
    id: 'polynomial-behaviour',
    title: 'Polynomial end behaviour and turns',
    summary: 'How a polynomial’s degree and leading term shape its tails, and how its turning points accumulate.',
    levels: ['school', 'competition', 'college'],
    prerequisites: ['quadratics'],
    templateIds: ['cubic-inflection', 'cubic-two-turns', 'quartic-w-shape', 'reflect-cubic'],
  },
  {
    id: 'inverse-trigonometry',
    title: 'Inverse trigonometric functions',
    summary: 'Principal branches of inverse sine and tangent: restricted domains, restricted ranges, and horizontal limits.',
    levels: ['competition', 'college'],
    prerequisites: ['trigonometric-graphs'],
    templateIds: ['arcsine', 'arctangent'],
  },
  {
    id: 'conic-sections',
    title: 'Conic sections',
    summary: 'Circles, ellipses, hyperbolas, and parabolas described by equations and parameters rather than a single y = f(x) rule.',
    levels: ['school', 'competition'],
    prerequisites: ['quadratics'],
    templateIds: ['unit-circle', 'hyperbola-branches', 'ellipse-parametric', 'parabola-focus'],
  },
  {
    id: 'piecewise-models',
    title: 'Piecewise models',
    summary: 'Functions assembled from separate rules, with attention to switches, joins, and behavior at boundaries.',
    levels: ['college'],
    prerequisites: ['corners-steps'],
    templateIds: ['heaviside-step', 'split-power-branches'],
  },
  {
    id: 'polar-parametric-curves',
    title: 'Polar and parametric curves',
    summary: 'Curves described by radius and angle or by a parameter, including roses, cardioids, and parameterized parabolas.',
    levels: ['competition', 'college'],
    prerequisites: ['trigonometric-graphs', 'conic-sections'],
    templateIds: ['rose-four-petals', 'cardioid', 'parametric-parabola'],
  },
  {
    id: 'calculus-graphs',
    title: 'Tangents and areas',
    summary: 'Local slope and accumulated area: tangent contact and the definite integral as the area under a curve.',
    levels: ['school', 'college'],
    prerequisites: ['polynomial-behaviour', 'trigonometric-graphs'],
    templateIds: ['parabola-tangent-line', 'sine-area-segment'],
  },
]
