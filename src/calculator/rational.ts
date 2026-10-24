/**
 * Exact rational lane (Stage 3): BigInt numerator/denominator arithmetic
 * with automatic reduction. This is the narrow, verifiable "symbolic-ish"
 * capability shipped instead of a CAS: every result is exact by
 * construction, and decimals are shown alongside — never instead of —
 * the fraction. No dependency, no parse-surface widening.
 */

export interface Rational {
  readonly n: bigint
  readonly d: bigint
}

export type RationalOutcome = { status: 'value'; value: Rational } | { status: 'error'; kind: 'syntax' | 'domain'; message: string }

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Reduce and normalise the sign onto the numerator. */
export function reduce(n: bigint, d: bigint): RationalOutcome {
  if (d === 0n) {
    return { status: 'error', kind: 'domain', message: 'Division by zero: the denominator cannot be 0.' }
  }
  const sign = d < 0n ? -1n : 1n
  const divisor = gcd(n, d)
  return { status: 'value', value: { n: (sign * n) / divisor, d: (sign * d) / divisor } }
}

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/

/** Parse integers, `a/b`, decimals, and scientific notation — all exactly. */
export function parseRational(source: string): RationalOutcome {
  const text = source.trim()
  if (text === '') {
    return { status: 'error', kind: 'syntax', message: 'Enter a rational like 3/2, -5, 0.25, or 1e-3.' }
  }
  const slash = text.indexOf('/')
  if (slash >= 0) {
    const top = text.slice(0, slash).trim()
    const bottom = text.slice(slash + 1).trim()
    if (!/^[+-]?\d+$/.test(top) || !/^[+-]?\d+$/.test(bottom)) {
      return { status: 'error', kind: 'syntax', message: 'A fraction needs integer parts: a/b with integers a and b.' }
    }
    return reduce(BigInt(top), BigInt(bottom))
  }
  const match = DECIMAL.exec(text)
  if (match === null || (match[2] === '' && match[3] === undefined)) {
    return { status: 'error', kind: 'syntax', message: `"${text}" is not an integer, fraction, decimal, or scientific value.` }
  }
  const sign = match[1] === '-' ? -1n : 1n
  const intPart = match[2] === '' ? '0' : (match[2] ?? '0')
  const fracPart = match[3] ?? ''
  const exp = match[4] === undefined ? 0 : Number.parseInt(match[4], 10)
  const digits = `${intPart}${fracPart}`
  const numerator = sign * BigInt(digits === '' ? '0' : digits)
  const places = fracPart.length - exp
  if (places <= 0) {
    return reduce(numerator * 10n ** BigInt(-places), 1n)
  }
  return reduce(numerator, 10n ** BigInt(places))
}

export function addRational(a: Rational, b: Rational): Rational {
  const n = a.n * b.d + b.n * a.d
  const d = a.d * b.d
  const divisor = gcd(n, d)
  return { n: n / divisor, d: d / divisor }
}

export function subRational(a: Rational, b: Rational): Rational {
  return addRational(a, { n: -b.n, d: b.d })
}

export function mulRational(a: Rational, b: Rational): Rational {
  const n = a.n * b.n
  const d = a.d * b.d
  const divisor = gcd(n, d)
  return { n: n / divisor, d: d / divisor }
}

export function divRational(a: Rational, b: Rational): RationalOutcome {
  if (b.n === 0n) {
    return { status: 'error', kind: 'domain', message: 'Division by zero rational.' }
  }
  return reduce(a.n * b.d, a.d * b.n)
}

/** Exact `p/q`, or the bare integer when the denominator is 1. */
export function formatRational(r: Rational): string {
  return r.d === 1n ? r.n.toString() : `${r.n.toString()}/${r.d.toString()}`
}

/** Decimal approximation for orientation — always beside the fraction. */
export function rationalToDecimal(r: Rational): number {
  return Number(r.n) / Number(r.d)
}
