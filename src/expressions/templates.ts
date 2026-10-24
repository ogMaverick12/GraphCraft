import { DEFAULT_PARAM_MAX, DEFAULT_PARAM_MIN, DEFAULT_PARAM_STEP, type Parameter } from '../parameters/model.ts'

/**
 * Transform starter templates (Stage 2): each generates NEW rows (plus
 * any missing parameters) — existing rows are never rewritten.
 */

export interface CartesianTemplate {
  readonly kind: 'cartesian'
  readonly id: string
  readonly label: string
  readonly description: string
  readonly expression: string
  readonly parameters: Parameter[]
}

export interface ParametricTemplate {
  readonly kind: 'parametric'
  readonly id: string
  readonly label: string
  readonly description: string
  readonly xSource: string
  readonly ySource: string
  readonly tMin: number
  readonly tMax: number
  readonly parameters: Parameter[]
}

export type TransformTemplate = CartesianTemplate | ParametricTemplate

function param(name: string, overrides?: Partial<Parameter>): Parameter {
  return {
    name,
    value: 1,
    min: DEFAULT_PARAM_MIN,
    max: DEFAULT_PARAM_MAX,
    step: DEFAULT_PARAM_STEP,
    defaultValue: 1,
    ...overrides,
  }
}

/** One full turn in radians (2π as a double): the canonical parametric range. */
export const FULL_TURN = 6.283185307179586

export const TRANSFORM_TEMPLATES: TransformTemplate[] = [
  {
    kind: 'cartesian',
    id: 'shifted-square',
    label: 'Shift (x−h)²+k',
    description: 'Horizontal and vertical shift of a parabola.',
    expression: '(x-h)^2+k',
    parameters: [param('h', { value: 0, defaultValue: 0 }), param('k', { value: 0, defaultValue: 0 })],
  },
  {
    kind: 'cartesian',
    id: 'scaled-sine',
    label: 'Stretch a·sin(x)',
    description: 'Vertical stretch of a sine wave.',
    expression: 'a*sin(x)',
    parameters: [param('a')],
  },
  {
    kind: 'cartesian',
    id: 'reflected-sine',
    label: 'Reflect sin(−x)',
    description: 'Mirror of a sine wave. No parameters needed.',
    expression: 'sin(-x)',
    parameters: [],
  },
  {
    kind: 'cartesian',
    id: 'squashed-sine',
    label: 'Squash sin(b·x)',
    description: 'Horizontal frequency control of a sine wave.',
    expression: 'sin(b*x)',
    parameters: [param('b')],
  },
  {
    kind: 'parametric',
    id: 'unit-circle',
    label: 'Circle x=cos t, y=sin t',
    description: 'Unit circle traced once counter-clockwise.',
    xSource: 'cos(t)',
    ySource: 'sin(t)',
    tMin: 0,
    tMax: FULL_TURN,
    parameters: [],
  },
  {
    kind: 'parametric',
    id: 'ellipse',
    label: 'Ellipse x=3cos t, y=2sin t',
    description: 'Axis-aligned ellipse, semi-axes 3 and 2.',
    xSource: '3*cos(t)',
    ySource: '2*sin(t)',
    tMin: 0,
    tMax: FULL_TURN,
    parameters: [],
  },
  {
    kind: 'parametric',
    id: 'lissajous',
    label: 'Lissajous x=sin 3t, y=sin 2t',
    description: '3:2 Lissajous figure through the origin.',
    xSource: 'sin(3*t)',
    ySource: 'sin(2*t)',
    tMin: 0,
    tMax: FULL_TURN,
    parameters: [],
  },
]
