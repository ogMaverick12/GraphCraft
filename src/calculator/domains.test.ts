import { describe, expect, it } from 'vitest'
import {
  addRational,
  divRational,
  formatRational,
  mulRational,
  parseRational,
  rationalToDecimal,
  subRational,
  type Rational,
} from './rational.ts'
import { convert, DIMENSIONS, findUnit } from './units.ts'

function rationalOf(source: string): Rational {
  const outcome = parseRational(source)
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected rational for "${source}"`)
  }
  return outcome.value
}

describe('exact rational lane', () => {
  it('parses integers, fractions, decimals, and scientific notation exactly', () => {
    expect(formatRational(rationalOf('3/2'))).toBe('3/2')
    expect(formatRational(rationalOf('-5'))).toBe('-5')
    expect(formatRational(rationalOf('0.25'))).toBe('1/4')
    expect(formatRational(rationalOf('1e-3'))).toBe('1/1000')
    expect(formatRational(rationalOf('2.50'))).toBe('5/2')
    expect(formatRational(rationalOf('4/6'))).toBe('2/3')
    expect(parseRational('1/0')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(parseRational('1.5/2')).toMatchObject({ status: 'error', kind: 'syntax' })
    expect(parseRational('')).toMatchObject({ status: 'error', kind: 'syntax' })
  })

  it('adds, subtracts, multiplies, and divides exactly', () => {
    expect(formatRational(addRational(rationalOf('1/3'), rationalOf('1/6')))).toBe('1/2')
    expect(formatRational(subRational(rationalOf('1/2'), rationalOf('1/3')))).toBe('1/6')
    expect(formatRational(mulRational(rationalOf('2/3'), rationalOf('9/4')))).toBe('3/2')
    const quotient = divRational(rationalOf('1/2'), rationalOf('3/4'))
    expect(quotient.status).toBe('value')
    if (quotient.status === 'value') {
      expect(formatRational(quotient.value)).toBe('2/3')
    }
    expect(divRational(rationalOf('1/2'), rationalOf('0'))).toMatchObject({ status: 'error', kind: 'domain' })
  })

  it('keeps thirds exact where doubles cannot', () => {
    const third = addRational(rationalOf('1/3'), rationalOf('1/3'))
    const sum = addRational(third, rationalOf('1/3'))
    expect(formatRational(sum)).toBe('1')
    expect(rationalToDecimal(sum)).toBe(1)
  })
})

describe('unit conversion lane', () => {
  it('converts the temperature triple on the affine path', () => {
    // Defined-exact relationships still round in doubles: assert tightly.
    const freezing = convert(0, '°C', '°F')
    expect(freezing.status === 'value' && freezing.value).toBeCloseTo(32, 12)
    const boiling = convert(100, '°C', 'K')
    expect(boiling.status === 'value' && boiling.value).toBeCloseTo(373.15, 12)
    const back = convert(32, '°F', '°C')
    expect(back.status === 'value' && back.value).toBeCloseTo(0, 12)
    expect(convert(-40, '°C', '°F')).toMatchObject({ status: 'value' })
    const crossing = convert(-40, '°C', '°F')
    expect(crossing.status === 'value' && crossing.value).toBeCloseTo(-40, 12)
    const absolute = convert(273.15, 'K', '°C')
    expect(absolute.status === 'value' && Math.abs(absolute.value)).toBeLessThan(1e-9)
  })

  it('converts known length, mass, energy, and pressure values', () => {
    const mile = convert(1, 'mi', 'km')
    expect(mile.status === 'value' && mile.value).toBeCloseTo(1.609344, 12)
    const pound = convert(1, 'kg', 'lb')
    expect(pound.status === 'value' && pound.value).toBeCloseTo(2.2046226218, 10)
    const atm = convert(1, 'atm', 'Pa')
    expect(atm).toMatchObject({ status: 'value', value: 101325 })
    const ev = convert(1, 'eV', 'J')
    expect(ev.status === 'value' && Math.abs(ev.value - 1.602176634e-19) / 1.602176634e-19).toBeLessThan(1e-12)
    const rightAngle = convert(90, 'deg', 'rad')
    expect(rightAngle.status === 'value' && rightAngle.value).toBeCloseTo(Math.PI / 2, 12)
  })

  it('round-trips through the base without drift beyond doubles', () => {
    for (const [from, to, value] of [['mi', 'ft', 3], ['gal', 'L', 2.5], ['mph', 'km/h', 60], ['psi', 'kPa', 14.7]] as const) {
      const forward = convert(value, from, to)
      expect(forward.status).toBe('value')
      if (forward.status !== 'value') {
        throw new Error(`No forward conversion ${from} to ${to}`)
      }
      const back = convert(forward.value, to, from)
      expect(back.status === 'value' && Math.abs(back.value - value) / Math.abs(value)).toBeLessThan(1e-12)
    }
  })

  it('converts power with the defined horsepower', () => {
    const hp = convert(1, 'hp', 'W')
    expect(hp.status === 'value' && hp.value).toBeCloseTo(745.6998715822702, 9)
    const back = convert(745.6998715822702, 'W', 'hp')
    expect(back.status === 'value' && back.value).toBeCloseTo(1, 9)
    expect(convert(1, 'W', 'J')).toMatchObject({ status: 'error', kind: 'dimension' })
  })

  it('keeps angle conversion consistent with the radian engine', () => {
    const toRad = convert(180, 'deg', 'rad')
    expect(toRad.status === 'value' && toRad.value).toBeCloseTo(Math.PI, 12)
    const toDeg = convert(Math.PI, 'rad', 'deg')
    expect(toDeg.status === 'value' && toDeg.value).toBeCloseTo(180, 9)
    const rev = convert(1, 'rev', 'deg')
    expect(rev).toMatchObject({ status: 'value', value: 360 })
  })

  it('rejects incompatible dimensions and unknown units loudly', () => {
    expect(convert(1, 'm', 'kg')).toMatchObject({ status: 'error', kind: 'dimension' })
    expect(convert(1, 's', 'm')).toMatchObject({ status: 'error', kind: 'dimension' })
    expect(convert(1, 'furlong', 'm')).toMatchObject({ status: 'error', kind: 'unknown-unit' })
    expect(findUnit('m')?.dimension).toBe('length')
    expect(findUnit('hp')?.dimension).toBe('power')
    expect(Object.keys(DIMENSIONS)).toHaveLength(13)
  })

  it('keeps unit symbols globally unique so findUnit is unambiguous', () => {
    const seen = new Map<string, string>()
    for (const [dimension, def] of Object.entries(DIMENSIONS)) {
      for (const unit of def.units) {
        const previous = seen.get(unit.symbol)
        expect(previous, `"${unit.symbol}" appears in both ${previous ?? ''} and ${dimension}`).toBeUndefined()
        seen.set(unit.symbol, dimension)
        const found = findUnit(unit.symbol)
        expect(found?.dimension).toBe(dimension)
        expect(found?.def.symbol).toBe(unit.symbol)
      }
    }
  })

  it('resolves the former g collision explicitly (mass gram vs standard gravity)', () => {
    // 'g' is the mass gram; acceleration uses g₀, so a dropdown selection
    // can no longer resolve to the wrong dimension (pre-fix, every
    // acceleration conversion through 'g' failed dimension checks).
    expect(findUnit('g')?.dimension).toBe('mass')
    const gravity = convert(1, 'g₀', 'm/s²')
    expect(gravity).toMatchObject({ status: 'value', value: 9.80665 })
    expect(convert(1, 'g', 'm/s²')).toMatchObject({ status: 'error', kind: 'dimension' })
  })
})
