import { calculate, type AngleMode } from './evaluate.ts'
import { formatDisplay } from './format.ts'

/**
 * Complex lane (Stage 3 structured modes): rectangular a+bi arithmetic
 * implemented natively. The shared engine is real-only by design
 * (mathjs number bundle), so real and imaginary parts evaluate through
 * it and combination happens here — no second parser, no new dependency.
 *
 * Supported reliably: parsing, add/sub/mul/div, conjugate, magnitude,
 * argument, real/imaginary parts, integer powers, rectangular/polar
 * conversion, principal nth roots, and the principal-branch
 * transcendental set (exp, log, sin, cos, tan) below. Anything else is
 * an explicit unsupported error, not a silent real coercion.
 * Argument convention: atan2 branch (−π, π]; arg(0) is undefined
 * (domain error). The logarithm shares the branch with a cut along the
 * negative real axis: log(−1) = iπ exactly in this convention.
 */

export interface Complex {
  readonly re: number
  readonly im: number
}

export type ComplexOutcome =
  | { status: 'value'; value: Complex }
  | { status: 'error'; kind: 'syntax' | 'domain' | 'overflow' | 'unsupported'; message: string }

/** Split `body` (without trailing i) at the last top-level +/-, honouring brackets and exponents. */
function splitParts(body: string): { reText: string; imText: string } | null {
  let depth = 0
  for (let i = body.length - 1; i >= 0; i -= 1) {
    const char = body[i]
    if (char === ')') {
      depth += 1
    } else if (char === '(') {
      depth -= 1
    } else if (depth === 0 && (char === '+' || char === '-')) {
      if (i > 0 && (body[i - 1] === 'e' || body[i - 1] === 'E')) {
        continue
      }
      if (i === 0) {
        return { reText: '0', imText: body }
      }
      return { reText: body.slice(0, i), imText: body.slice(i) }
    }
  }
  return null
}

function realPart(text: string, mode: AngleMode): number | null {
  const outcome = calculate(text, mode)
  return outcome.status === 'value' ? outcome.value : null
}

/** Parse `a+bi` (parts may be engine expressions), pure imaginary, real, or polar `r∠θ` (θ in radians). */
export function parseComplex(source: string, mode: AngleMode): ComplexOutcome {
  const text = source.trim()
  if (text === '') {
    return { status: 'error', kind: 'syntax', message: 'Expression is empty.' }
  }
  const polarAt = text.indexOf('∠')
  if (polarAt >= 0) {
    if (text.indexOf('∠', polarAt + 1) >= 0) {
      return { status: 'error', kind: 'syntax', message: 'Polar form takes one angle: r∠θ.' }
    }
    const r = realPart(text.slice(0, polarAt), mode)
    const theta = realPart(text.slice(polarAt + 1), mode)
    if (r === null || theta === null || !Number.isFinite(r) || !Number.isFinite(theta)) {
      return { status: 'error', kind: 'domain', message: 'Polar r and θ must be finite real expressions (θ in radians).' }
    }
    return { status: 'value', value: fromPolar(r, theta) }
  }
  if (!text.endsWith('i') && !text.endsWith('I')) {
    const value = realPart(text, mode)
    if (value === null) {
      return { status: 'error', kind: 'domain', message: 'The real part is not a finite number.' }
    }
    return { status: 'value', value: { re: value, im: 0 } }
  }
  const body = text.slice(0, -1).trim()
  if (body === '' || body === '+') {
    return { status: 'value', value: { re: 0, im: 1 } }
  }
  if (body === '-') {
    return { status: 'value', value: { re: 0, im: -1 } }
  }
  const split = splitParts(body)
  const reText = split?.reText ?? '0'
  const imText = split?.imText ?? body
  const re = reText.trim() === '' ? 0 : realPart(reText, mode)
  const im = realPart(imText === '+' ? '1' : imText === '-' ? '-1' : imText, mode)
  if (re === null || im === null || !Number.isFinite(re) || !Number.isFinite(im)) {
    return { status: 'error', kind: 'domain', message: 'Both parts of a+bi must be finite real expressions.' }
  }
  return { status: 'value', value: { re, im } }
}

export function addComplex(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im }
}

export function subComplex(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im }
}

export function mulComplex(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

export function divComplex(a: Complex, b: Complex): ComplexOutcome {
  if (b.re === 0 && b.im === 0) {
    return { status: 'error', kind: 'domain', message: 'Division by zero complex number.' }
  }
  // Smith's scaled method: divide by whichever part of b is larger in
  // magnitude instead of forming b.re² + b.im² first. That sum cannot
  // represent extremes: |b| ~ 1e200 overflowed it (silent 0 result) and
  // |b| ~ 1e-300 underflowed it to a false division-by-zero.
  let re: number
  let im: number
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const ratio = b.im / b.re
    const den = b.re + b.im * ratio
    re = (a.re + a.im * ratio) / den
    im = (a.im - a.re * ratio) / den
  } else {
    const ratio = b.re / b.im
    const den = b.im + b.re * ratio
    re = (a.re * ratio + a.im) / den
    im = (a.im * ratio - a.re) / den
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return { status: 'error', kind: 'overflow', message: 'Complex division overflowed.' }
  }
  return { status: 'value', value: { re, im } }
}

export function magnitude(z: Complex): number {
  return Math.hypot(z.re, z.im)
}

export function conjugate(z: Complex): Complex {
  return { re: z.re, im: -z.im }
}

/** Argument on the atan2 branch (−π, π]; undefined at the origin. */
export function argument(z: Complex): ComplexOutcome {
  if (z.re === 0 && z.im === 0) {
    return { status: 'error', kind: 'domain', message: 'arg(0) is undefined.' }
  }
  return { status: 'value', value: { re: Math.atan2(z.im, z.re), im: 0 } }
}

/** Integer powers via De Moivre; non-integers are unsupported, not approximated. */
export function powComplex(z: Complex, n: number): ComplexOutcome {
  if (!Number.isInteger(n)) {
    return { status: 'error', kind: 'unsupported', message: 'Complex powers support integer exponents only (De Moivre); fractional powers need a branch-cut CAS.' }
  }
  if (n === 0) {
    if (z.re === 0 && z.im === 0) {
      return { status: 'error', kind: 'domain', message: '0^0 is undefined.' }
    }
    return { status: 'value', value: { re: 1, im: 0 } }
  }
  const r = magnitude(z)
  if (r === 0) {
    if (n < 0) {
      return { status: 'error', kind: 'domain', message: 'Zero base with a negative exponent divides by zero.' }
    }
    return { status: 'value', value: { re: 0, im: 0 } }
  }
  const theta = Math.atan2(z.im, z.re)
  const mag = Math.pow(r, Math.abs(n))
  const ang = theta * Math.abs(n)
  const scaled = { re: mag * Math.cos(ang), im: mag * Math.sin(ang) }
  if (!Number.isFinite(scaled.re) || !Number.isFinite(scaled.im)) {
    return { status: 'error', kind: 'overflow', message: 'Complex power result is outside the double range.' }
  }
  if (n > 0) {
    return { status: 'value', value: scaled }
  }
  // Negative exponent: reciprocal of the magnitude, angle sign flipped.
  // Dividing directly avoids the denominator underflow from squaring
  // the scaled result (e.g. (1e-200)^-1 = 1e200 is representable).
  const recip = 1 / mag
  const value = { re: recip * Math.cos(ang), im: -recip * Math.sin(ang) }
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
    return { status: 'error', kind: 'overflow', message: 'Complex power result is outside the double range.' }
  }
  return { status: 'value', value }
}

/** Rectangular display: `3+4i`, `3-4i`, `5i`, `-i`, or a bare real. */
export function formatComplex(z: Complex): string {
  const re = formatDisplay(z.re)
  if (z.im === 0) {
    return re
  }
  const absIm = formatDisplay(Math.abs(z.im))
  const imPart = absIm === '1' ? 'i' : `${absIm}i`
  if (z.re === 0) {
    return z.im < 0 ? `-${imPart}` : imPart
  }
  return `${re}${z.im < 0 ? '-' : '+'}${imPart}`
}

/** Polar components under the (−π, π] argument convention. */
export function toPolar(z: Complex): { r: number; theta: number } {
  return { r: magnitude(z), theta: Math.atan2(z.im, z.re) }
}

export function fromPolar(r: number, theta: number): Complex {
  return { re: r * Math.cos(theta), im: r * Math.sin(theta) }
}

/** Polar display `r∠θ` with θ in radians. */
export function formatPolar(z: Complex): string {
  const { r, theta } = toPolar(z)
  return `${formatDisplay(r)}∠${formatDisplay(theta)}`
}

/** Principal nth root (n a positive integer): r^(1/n)·e^(iθ/n). */
export function rootComplex(z: Complex, n: number): ComplexOutcome {
  if (!Number.isInteger(n) || n < 1) {
    return { status: 'error', kind: 'domain', message: 'Roots need a positive integer n.' }
  }
  if (z.re === 0 && z.im === 0) {
    return { status: 'value', value: { re: 0, im: 0 } }
  }
  const { r, theta } = toPolar(z)
  const root = Math.pow(r, 1 / n)
  const ang = theta / n
  return { status: 'value', value: { re: root * Math.cos(ang), im: root * Math.sin(ang) } }
}

/** Principal complex exponential: e^a·(cos b + i·sin b). Exact formula. */
export function expComplex(z: Complex): Complex {
  const scale = Math.exp(z.re)
  return { re: scale * Math.cos(z.im), im: scale * Math.sin(z.im) }
}

/** Principal logarithm ln|z| + i·arg(z); cut along the negative real axis. */
export function logComplex(z: Complex): ComplexOutcome {
  if (z.re === 0 && z.im === 0) {
    return { status: 'error', kind: 'domain', message: 'log(0) is undefined.' }
  }
  return { status: 'value', value: { re: Math.log(magnitude(z)), im: Math.atan2(z.im, z.re) } }
}

/** sin(a+bi) = sin a·cosh b + i·cos a·sinh b. */
export function sinComplex(z: Complex): Complex {
  return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) }
}

/** cos(a+bi) = cos a·cosh b − i·sin a·sinh b. */
export function cosComplex(z: Complex): Complex {
  return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) }
}

/** tan via sin/cos; poles land on large finite values, honestly. */
export function tanComplex(z: Complex): ComplexOutcome {
  const sin = sinComplex(z)
  const cos = cosComplex(z)
  return divComplex(sin, cos)
}
