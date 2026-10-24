/**
 * Unit conversion lane (Stage 3): a structured dimension registry, not
 * scattered conditionals. Every unit maps to its SI base by a scale
 * factor, except temperature, which is affine and converts through
 * (value + offset) × scale — handled on a separate path so plain
 * multiplicative code can never silently mis-convert °C/°F.
 *
 * Exactness: `exact` marks defined (not measured) relationships —
 * international inch/foot/mile/pound definitions, SI prefixes, the
 * exact eV and standard gravity, and conventional choices (thermo-
 * chemical calorie, IT BTU) which the note names. Conversions between
 * exact units are exact up to double rounding; anything else says so.
 */

export type Dimension =
  | 'length'
  | 'mass'
  | 'time'
  | 'temperature'
  | 'area'
  | 'volume'
  | 'speed'
  | 'acceleration'
  | 'force'
  | 'energy'
  | 'power'
  | 'pressure'
  | 'angle'

export interface UnitDef {
  readonly symbol: string
  readonly name: string
  /** Multiply by this to reach the SI base (after adding offset, if any). */
  readonly toBase: number
  /** Added before scaling (temperature only). */
  readonly offsetToBase?: number
  /** True when the definition is exact (or an exact conventional choice). */
  readonly exact: boolean
  readonly note?: string
}

export interface DimensionDef {
  readonly label: string
  readonly base: string
  readonly units: readonly UnitDef[]
}

const IN = 0.0254
const LB = 0.45359237
const G0 = 9.80665

export const DIMENSIONS: Record<Dimension, DimensionDef> = {
  length: {
    label: 'Length',
    base: 'm',
    units: [
      { symbol: 'mm', name: 'millimetre', toBase: 0.001, exact: true },
      { symbol: 'cm', name: 'centimetre', toBase: 0.01, exact: true },
      { symbol: 'm', name: 'metre', toBase: 1, exact: true },
      { symbol: 'km', name: 'kilometre', toBase: 1000, exact: true },
      { symbol: 'in', name: 'inch', toBase: IN, exact: true, note: 'International inch, exactly 2.54 cm.' },
      { symbol: 'ft', name: 'foot', toBase: 0.3048, exact: true },
      { symbol: 'yd', name: 'yard', toBase: 0.9144, exact: true },
      { symbol: 'mi', name: 'mile', toBase: 1609.344, exact: true },
    ],
  },
  mass: {
    label: 'Mass',
    base: 'kg',
    units: [
      { symbol: 'mg', name: 'milligram', toBase: 1e-6, exact: true },
      { symbol: 'g', name: 'gram', toBase: 1e-3, exact: true },
      { symbol: 'kg', name: 'kilogram', toBase: 1, exact: true },
      { symbol: 't', name: 'tonne', toBase: 1000, exact: true },
      { symbol: 'oz', name: 'ounce', toBase: LB / 16, exact: true },
      { symbol: 'lb', name: 'pound', toBase: LB, exact: true, note: 'International pound, exactly 0.45359237 kg.' },
    ],
  },
  time: {
    label: 'Time',
    base: 's',
    units: [
      { symbol: 'ms', name: 'millisecond', toBase: 1e-3, exact: true },
      { symbol: 's', name: 'second', toBase: 1, exact: true },
      { symbol: 'min', name: 'minute', toBase: 60, exact: true },
      { symbol: 'hr', name: 'hour', toBase: 3600, exact: true },
      { symbol: 'day', name: 'day', toBase: 86400, exact: true, note: 'Exactly 86400 s by definition (not a calendar day).' },
    ],
  },
  temperature: {
    label: 'Temperature',
    base: 'K',
    units: [
      { symbol: 'K', name: 'kelvin', toBase: 1, exact: true },
      { symbol: '°C', name: 'celsius', toBase: 1, offsetToBase: 273.15, exact: true },
      { symbol: '°F', name: 'fahrenheit', toBase: 5 / 9, offsetToBase: 459.67, exact: true },
      { symbol: '°R', name: 'rankine', toBase: 5 / 9, exact: true },
    ],
  },
  area: {
    label: 'Area',
    base: 'm²',
    units: [
      { symbol: 'cm²', name: 'square centimetre', toBase: 1e-4, exact: true },
      { symbol: 'm²', name: 'square metre', toBase: 1, exact: true },
      { symbol: 'ha', name: 'hectare', toBase: 10000, exact: true },
      { symbol: 'km²', name: 'square kilometre', toBase: 1e6, exact: true },
      { symbol: 'in²', name: 'square inch', toBase: IN * IN, exact: true },
      { symbol: 'ft²', name: 'square foot', toBase: 0.3048 * 0.3048, exact: true },
      { symbol: 'acre', name: 'acre', toBase: 4046.8564224, exact: true },
    ],
  },
  volume: {
    label: 'Volume',
    base: 'm³',
    units: [
      { symbol: 'mL', name: 'millilitre', toBase: 1e-6, exact: true },
      { symbol: 'L', name: 'litre', toBase: 1e-3, exact: true },
      { symbol: 'm³', name: 'cubic metre', toBase: 1, exact: true },
      { symbol: 'in³', name: 'cubic inch', toBase: IN * IN * IN, exact: true },
      { symbol: 'ft³', name: 'cubic foot', toBase: 0.3048 * 0.3048 * 0.3048, exact: true },
      { symbol: 'gal', name: 'US gallon', toBase: 231 * IN * IN * IN, exact: true, note: 'US gallon, exactly 231 in³.' },
      { symbol: 'qt', name: 'US quart', toBase: (231 * IN * IN * IN) / 4, exact: true },
    ],
  },
  speed: {
    label: 'Speed',
    base: 'm/s',
    units: [
      { symbol: 'm/s', name: 'metres per second', toBase: 1, exact: true },
      { symbol: 'km/h', name: 'kilometres per hour', toBase: 1000 / 3600, exact: true },
      { symbol: 'mph', name: 'miles per hour', toBase: 1609.344 / 3600, exact: true },
      { symbol: 'ft/s', name: 'feet per second', toBase: 0.3048, exact: true },
      { symbol: 'knot', name: 'knot', toBase: 1852 / 3600, exact: true, note: 'One nautical mile (1852 m) per hour.' },
    ],
  },
  acceleration: {
    label: 'Acceleration',
    base: 'm/s²',
    units: [
      { symbol: 'm/s²', name: 'metres per second squared', toBase: 1, exact: true },
      { symbol: 'ft/s²', name: 'feet per second squared', toBase: 0.3048, exact: true },
      { symbol: 'g₀', name: 'standard gravity', toBase: G0, exact: true, note: 'Exactly 9.80665 m/s² by definition. Written g₀ so it cannot collide with the mass gram (g).' },
    ],
  },
  force: {
    label: 'Force',
    base: 'N',
    units: [
      { symbol: 'N', name: 'newton', toBase: 1, exact: true },
      { symbol: 'kN', name: 'kilonewton', toBase: 1000, exact: true },
      { symbol: 'lbf', name: 'pound-force', toBase: LB * G0, exact: true },
    ],
  },
  power: {
    label: 'Power',
    base: 'W',
    units: [
      { symbol: 'W', name: 'watt', toBase: 1, exact: true },
      { symbol: 'kW', name: 'kilowatt', toBase: 1000, exact: true },
      { symbol: 'hp', name: 'mechanical horsepower', toBase: 745.6998715822702, exact: true, note: 'Exactly 550 ft·lbf/s by definition.' },
    ],
  },
  energy: {
    label: 'Energy',
    base: 'J',
    units: [
      { symbol: 'J', name: 'joule', toBase: 1, exact: true },
      { symbol: 'kJ', name: 'kilojoule', toBase: 1000, exact: true },
      { symbol: 'cal', name: 'thermochemical calorie', toBase: 4.184, exact: true, note: 'Thermochemical calorie convention (not IT).' },
      { symbol: 'kcal', name: 'kilocalorie', toBase: 4184, exact: true },
      { symbol: 'eV', name: 'electronvolt', toBase: 1.602176634e-19, exact: true, note: 'Exact by SI definition.' },
      { symbol: 'Wh', name: 'watt-hour', toBase: 3600, exact: true },
      { symbol: 'kWh', name: 'kilowatt-hour', toBase: 3.6e6, exact: true },
      { symbol: 'BTU', name: 'British thermal unit', toBase: 1055.05585262, exact: true, note: 'IT BTU convention (not thermochemical).' },
    ],
  },
  pressure: {
    label: 'Pressure',
    base: 'Pa',
    units: [
      { symbol: 'Pa', name: 'pascal', toBase: 1, exact: true },
      { symbol: 'kPa', name: 'kilopascal', toBase: 1000, exact: true },
      { symbol: 'bar', name: 'bar', toBase: 1e5, exact: true },
      { symbol: 'psi', name: 'pounds per square inch', toBase: (LB * G0) / (IN * IN), exact: true },
      { symbol: 'atm', name: 'standard atmosphere', toBase: 101325, exact: true },
      { symbol: 'torr', name: 'torr', toBase: 101325 / 760, exact: true },
    ],
  },
  angle: {
    label: 'Angle',
    base: 'rad',
    units: [
      { symbol: 'rad', name: 'radian', toBase: 1, exact: true },
      { symbol: 'deg', name: 'degree', toBase: Math.PI / 180, exact: false, note: 'π is irrational: the factor is a double approximation.' },
      { symbol: 'rev', name: 'revolution', toBase: 2 * Math.PI, exact: false, note: 'π is irrational: the factor is a double approximation.' },
    ],
  },
}

export type UnitLookup = { dimension: Dimension; def: UnitDef } | null

/** Find a unit by symbol (exact) or name (case-insensitive). */
export function findUnit(symbol: string): UnitLookup {
  const text = symbol.trim()
  if (text === '') {
    return null
  }
  const lowered = text.toLowerCase()
  for (const [dimension, def] of Object.entries(DIMENSIONS) as Array<[Dimension, DimensionDef]>) {
    for (const unit of def.units) {
      if (unit.symbol === text || unit.name.toLowerCase() === lowered) {
        return { dimension, def: unit }
      }
    }
  }
  return null
}

export type ConversionOutcome =
  | { status: 'value'; value: number; exact: boolean; dimension: Dimension; note: string | null }
  | { status: 'error'; kind: 'unknown-unit' | 'dimension' | 'domain'; message: string }

/**
 * Convert `value` from one unit to another. Units must share a
 * dimension — metres never become kilograms, loudly. Temperature
 * travels through kelvin with its offset; everything else scales.
 */
export function convert(value: number, from: string, to: string): ConversionOutcome {
  if (!Number.isFinite(value)) {
    return { status: 'error', kind: 'domain', message: 'Convert a finite number.' }
  }
  const source = findUnit(from)
  if (source === null) {
    return { status: 'error', kind: 'unknown-unit', message: `Unknown unit "${from}". Pick both units from one dimension.` }
  }
  const target = findUnit(to)
  if (target === null) {
    return { status: 'error', kind: 'unknown-unit', message: `Unknown unit "${to}". Pick both units from one dimension.` }
  }
  if (source.dimension !== target.dimension) {
    return {
      status: 'error',
      kind: 'dimension',
      message: `Incompatible dimensions: ${source.def.name} is ${source.dimension}, ${target.def.name} is ${target.dimension}. No silent conversion.`,
    }
  }
  if (source.dimension === 'temperature') {
    const kelvin = (value + (source.def.offsetToBase ?? 0)) * source.def.toBase
    const result = kelvin / target.def.toBase - (target.def.offsetToBase ?? 0)
    return {
      status: 'value',
      value: result,
      exact: source.def.exact && target.def.exact,
      dimension: source.dimension,
      note: 'Affine conversion through kelvin.',
    }
  }
  return {
    status: 'value',
    value: (value * source.def.toBase) / target.def.toBase,
    exact: source.def.exact && target.def.exact,
    dimension: source.dimension,
    note: source.def.note ?? target.def.note ?? null,
  }
}
