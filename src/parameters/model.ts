import { isValidParameterName } from '../math/index.ts'

/**
 * Named numeric parameters (Stage 2): user-defined values usable in any
 * expression alongside x. Pure data + validation; React-free.
 */

export interface Parameter {
  readonly name: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly defaultValue: number
}

/** Hard caps against pathological update rates and ranges. */
export const MAX_PARAM_STEPS = 100000
export const MIN_PARAM_STEP = 1e-9
export const MAX_PARAM_BOUND = 1e9

export const DEFAULT_PARAM_MIN = -10
export const DEFAULT_PARAM_MAX = 10
export const DEFAULT_PARAM_STEP = 0.1
export const DEFAULT_PARAM_VALUE = 1

/** Actionable validation for a full parameter record. Null means usable. */
export function validateParameter(candidate: Omit<Parameter, 'defaultValue'> & { defaultValue?: number }): string | null {
  if (!isValidParameterName(candidate.name)) {
    return `Invalid parameter name "${candidate.name}". Use 1-16 characters: a letter first, then letters, digits, or underscores. Names are case-sensitive; lowercase x, y, t, theta, pi, e, and all supported function names are reserved.`
  }
  for (const [key, value] of [['min', candidate.min], ['max', candidate.max], ['step', candidate.step], ['value', candidate.value]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Parameter "${candidate.name}" needs a finite ${key}.`
    }
  }
  if (Math.abs(candidate.min) > MAX_PARAM_BOUND || Math.abs(candidate.max) > MAX_PARAM_BOUND) {
    return `Parameter "${candidate.name}" bounds must stay within ±${MAX_PARAM_BOUND}.`
  }
  if (!(candidate.max > candidate.min)) {
    return `Parameter "${candidate.name}" needs min below max.`
  }
  if (!(candidate.step > 0)) {
    return `Parameter "${candidate.name}" needs a positive step.`
  }
  if (candidate.step < MIN_PARAM_STEP) {
    return `Parameter "${candidate.name}" step is below the ${MIN_PARAM_STEP} minimum.`
  }
  if ((candidate.max - candidate.min) / candidate.step > MAX_PARAM_STEPS) {
    return `Parameter "${candidate.name}" allows more than ${MAX_PARAM_STEPS} steps; widen the step or narrow the range.`
  }
  if (candidate.value < candidate.min || candidate.value > candidate.max) {
    return `Parameter "${candidate.name}" value must stay inside [min, max].`
  }
  return null
}

export function createParameter(name: string): Parameter {
  return {
    name,
    value: DEFAULT_PARAM_VALUE,
    min: DEFAULT_PARAM_MIN,
    max: DEFAULT_PARAM_MAX,
    step: DEFAULT_PARAM_STEP,
    defaultValue: DEFAULT_PARAM_VALUE,
  }
}

export function clampParameterValue(parameter: Parameter, value: number): number {
  if (!Number.isFinite(value)) {
    return parameter.value
  }
  return Math.min(parameter.max, Math.max(parameter.min, value))
}
