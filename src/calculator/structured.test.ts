import { describe, expect, it } from 'vitest'
import {
  addComplex,
  argument,
  conjugate,
  cosComplex,
  divComplex,
  expComplex,
  formatComplex,
  formatPolar,
  logComplex,
  magnitude,
  mulComplex,
  parseComplex,
  powComplex,
  rootComplex,
  sinComplex,
  subComplex,
  tanComplex,
  type Complex,
} from './complex.ts'
import {
  addMatrices,
  addVectors,
  crossVectors,
  determinant,
  dotVectors,
  inverseMatrix,
  mulMatrices,
  normalizeVector,
  parseMatrix,
  parseVector,
  scaleVector,
  solveLinear,
  subMatrices,
  transposeMatrix,
  type LinalgOutcome,
  type Matrix,
  type Vector,
} from './linalg.ts'
import { describe as describeStats, describePaired, formatPaired, formatStats, movingAverage, parseDataList, parseSecondList } from './stats.ts'

function complexOf(source: string): Complex {
  const outcome = parseComplex(source, 'radians')
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected complex value for "${source}"`)
  }
  return outcome.value
}

function vectorOf(source: string): Vector {
  const outcome = parseVector(source, 'radians')
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected vector for "${source}"`)
  }
  return outcome.value
}

function matrixOf(source: string): Matrix {
  const outcome = parseMatrix(source, 'radians')
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected matrix for "${source}"`)
  }
  return outcome.value
}

function numberOf(outcome: LinalgOutcome<number>): number {
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error('Expected numeric linalg value')
  }
  return outcome.value
}

describe('complex lane', () => {
  it('parses rectangular, pure-imaginary, and expression parts', () => {
    expect(complexOf('3+4i')).toEqual({ re: 3, im: 4 })
    expect(complexOf('3-4i')).toEqual({ re: 3, im: -4 })
    expect(complexOf('-2.5i')).toEqual({ re: 0, im: -2.5 })
    expect(complexOf('i')).toEqual({ re: 0, im: 1 })
    expect(complexOf('-i')).toEqual({ re: 0, im: -1 })
    expect(complexOf('pi/2+1i')).toMatchObject({ re: Math.PI / 2, im: 1 })
    expect(complexOf('5')).toEqual({ re: 5, im: 0 })
  })

  it('adds, subtracts, multiplies, and divides', () => {
    expect(addComplex(complexOf('1+2i'), complexOf('3+4i'))).toEqual({ re: 4, im: 6 })
    expect(subComplex(complexOf('1+2i'), complexOf('3+4i'))).toEqual({ re: -2, im: -2 })
    expect(mulComplex(complexOf('1+2i'), complexOf('3+4i'))).toEqual({ re: -5, im: 10 })
    const quotient = divComplex(complexOf('1+2i'), complexOf('3+4i'))
    expect(quotient.status).toBe('value')
    if (quotient.status === 'value') {
      expect(quotient.value.re).toBeCloseTo(0.44, 12)
      expect(quotient.value.im).toBeCloseTo(0.08, 12)
    }
  })

  it('reports conjugate, magnitude, and argument on the stated branch', () => {
    expect(conjugate(complexOf('3-4i'))).toEqual({ re: 3, im: 4 })
    expect(magnitude(complexOf('3+4i'))).toBe(5)
    const arg = argument(complexOf('-1+0i'))
    expect(arg.status).toBe('value')
    if (arg.status === 'value') {
      expect(arg.value.re).toBeCloseTo(Math.PI, 12)
    }
    expect(argument({ re: 0, im: 0 }).status).toBe('error')
  })

  it('refuses zero division and coerces nothing silently', () => {
    expect(divComplex(complexOf('1+i'), complexOf('0')).status).toBe('error')
    const power = powComplex(complexOf('1+i'), 2)
    expect(power.status).toBe('value')
    if (power.status === 'value') {
      expect(power.value.re).toBeCloseTo(0, 9)
      expect(power.value.im).toBeCloseTo(2, 9)
    }
    expect(powComplex(complexOf('1+i'), 0.5).status).toBe('error')
  })

  it('divides safely across extreme magnitudes (Smith scaling)', () => {
    // Pre-fix these silently returned 0 for the huge divisor and a false
    // division-by-zero for the tiny one; closed references below.
    const huge = divComplex(complexOf('1i'), complexOf('1e200+1e200i'))
    expect(huge.status).toBe('value')
    if (huge.status === 'value') {
      expect(Math.abs(huge.value.re - 5e-201) / 5e-201).toBeLessThan(1e-12)
      expect(Math.abs(huge.value.im - 5e-201) / 5e-201).toBeLessThan(1e-12)
    }
    const tiny = divComplex(complexOf('1'), complexOf('1e-300+1e-300i'))
    expect(tiny.status).toBe('value')
    if (tiny.status === 'value') {
      expect(Math.abs(tiny.value.re - 5e299) / 5e299).toBeLessThan(1e-12)
      expect(Math.abs(tiny.value.im + 5e299) / 5e299).toBeLessThan(1e-12)
    }
    expect(divComplex(complexOf('1e300+1e300i'), complexOf('1e-300+1e-300i'))).toMatchObject({ status: 'error', kind: 'overflow' })
  })

  it('checks complex powers for representability and zero bases', () => {
    // Pre-fix (1e200)² and 2^-2000 returned non-finite parts as values.
    expect(powComplex(complexOf('1e200'), 2)).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(powComplex(complexOf('2'), -2000)).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(powComplex(complexOf('0'), -2)).toMatchObject({ status: 'error', kind: 'domain' })
    const reciprocal = powComplex(complexOf('1e-200'), -1)
    expect(reciprocal.status).toBe('value')
    if (reciprocal.status === 'value') {
      expect(Math.abs(reciprocal.value.re - 1e200) / 1e200).toBeLessThan(1e-12)
    }
  })

  it('formats rectangular results canonically', () => {
    expect(formatComplex({ re: 3, im: 4 })).toBe('3+4i')
    expect(formatComplex({ re: 3, im: -4 })).toBe('3-4i')
    expect(formatComplex({ re: 0, im: 1 })).toBe('i')
    expect(formatComplex({ re: 2, im: 0 })).toBe('2')
  })

  it('verifies conjugate identities instead of single values', () => {
    const z = complexOf('3+4i')
    expect(conjugate(conjugate(z))).toEqual(z)
    const sum = addComplex(z, conjugate(z))
    expect(sum).toEqual({ re: 6, im: 0 })
    const product = mulComplex(z, conjugate(z))
    expect(product.re).toBeCloseTo(magnitude(z) ** 2, 9)
    expect(product.im).toBeCloseTo(0, 9)
  })

  it('converts between rectangular and polar forms consistently', () => {
    expect(formatPolar(complexOf('1+i'))).toBe('1.41421356237∠0.785398163397')
    expect(complexOf('5∠0')).toEqual({ re: 5, im: 0 })
    const back = complexOf('2∠1.5707963267948966')
    expect(back.re).toBeCloseTo(0, 9)
    expect(back.im).toBeCloseTo(2, 9)
    expect(parseComplex('1∠2∠3', 'radians').status).toBe('error')
  })

  it('takes principal roots on the stated branch', () => {
    const fourth = rootComplex(complexOf('-1+0i'), 4)
    expect(fourth.status).toBe('value')
    if (fourth.status === 'value') {
      expect(magnitude(fourth.value)).toBeCloseTo(1, 12)
      expect(fourth.value.re).toBeCloseTo(Math.SQRT1_2, 9)
      expect(fourth.value.im).toBeCloseTo(Math.SQRT1_2, 9)
    }
    expect(rootComplex(complexOf('8+0i'), 3).status).toBe('value')
    expect(rootComplex(complexOf('1+i'), 0).status).toBe('error')
    expect(rootComplex(complexOf('1+i'), 2.5).status).toBe('error')
  })

  it('evaluates principal transcendentals with documented limits', () => {
    expect(expComplex({ re: 0, im: 0 })).toEqual({ re: 1, im: 0 })
    const logNeg = logComplex(complexOf('-1+0i'))
    expect(logNeg.status).toBe('value')
    if (logNeg.status === 'value') {
      expect(logNeg.value.re).toBeCloseTo(0, 12)
      expect(logNeg.value.im).toBeCloseTo(Math.PI, 12)
    }
    expect(logComplex({ re: 0, im: 0 }).status).toBe('error')
    const sin = sinComplex({ re: 0, im: 0 })
    expect(sin.re).toBeCloseTo(0, 12)
    expect(sin.im).toBeCloseTo(0, 12)
    const cos0 = cosComplex({ re: 0, im: 0 })
    expect(cos0.re).toBeCloseTo(1, 12)
    expect(cos0.im).toBeCloseTo(0, 12)
    const tan = tanComplex({ re: 0, im: 0 })
    expect(tan.status).toBe('value')
    const euler = expComplex({ re: 0, im: Math.PI })
    expect(euler.re).toBeCloseTo(-1, 12)
    expect(euler.im).toBeCloseTo(0, 9)
  })
})

describe('vector lane', () => {
  it('parses bracketed vectors with engine-evaluated entries', () => {
    expect(vectorOf('[1, 2, 3]')).toEqual([1, 2, 3])
    expect(vectorOf('[sqrt(4), pi/2]')).toEqual([2, Math.PI / 2])
    expect(parseVector('[1, 2', 'radians').status).toBe('error')
    expect(parseVector('[]', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(parseVector('[x, 2]', 'radians').status).toBe('error')
  })

  it('adds, subtracts, dots, and norms with dimension checks', () => {
    expect(addVectors(vectorOf('[1, 2]'), vectorOf('[3, 4]'))).toMatchObject({ status: 'value', value: [4, 6] })
    expect(addVectors(vectorOf('[1, 2]'), vectorOf('[1, 2, 3]'))).toMatchObject({ status: 'error', kind: 'dimension' })
    expect(numberOf(dotVectors(vectorOf('[1, 2, 3]'), vectorOf('[4, 5, 6]')))).toBe(32)
    expect(numberOf(dotVectors(vectorOf('[1, 0]'), vectorOf('[0, 1]')))).toBe(0)
  })

  it('computes the 3D cross product and rejects other dimensions', () => {
    const cross = crossVectors(vectorOf('[1, 0, 0]'), vectorOf('[0, 1, 0]'))
    expect(cross).toMatchObject({ status: 'value', value: [0, 0, 1] })
    expect(crossVectors(vectorOf('[1, 2]'), vectorOf('[3, 4]'))).toMatchObject({ status: 'error', kind: 'dimension' })
  })

  it('normalizes vectors and refuses the zero vector', () => {
    const unit = normalizeVector(vectorOf('[3, 4]'))
    expect(unit.status).toBe('value')
    if (unit.status === 'value') {
      expect(unit.value[0]).toBeCloseTo(0.6, 12)
      expect(unit.value[1]).toBeCloseTo(0.8, 12)
    }
    expect(normalizeVector(vectorOf('[0, 0, 0]'))).toMatchObject({ status: 'error', kind: 'domain' })
  })

  it('reports overflow and normalizes beyond-norm vectors instead of non-finite output', () => {
    // Pre-fix these returned non-finite entries as values (rendered '—').
    expect(addVectors(vectorOf('[1e308, 0]'), vectorOf('[1e308, 0]'))).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(dotVectors(vectorOf('[1e300, 0]'), vectorOf('[1e300, 0]'))).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(scaleVector(1e300, vectorOf('[1e300]'))).toMatchObject({ status: 'error', kind: 'overflow' })
    // |[1.7e308, 1.7e308]| overflows a double; pre-fix the division by ∞
    // silently produced [0, 0]. The unit vector itself is representable.
    const unit = normalizeVector(vectorOf('[1.7e308, 1.7e308]'))
    expect(unit.status).toBe('value')
    if (unit.status === 'value') {
      expect(unit.value[0]).toBeCloseTo(Math.SQRT1_2, 12)
      expect(unit.value[1]).toBeCloseTo(Math.SQRT1_2, 12)
    }
  })
})

describe('matrix lane', () => {
  it('parses nested brackets and rejects ragged input', () => {
    expect(matrixOf('[[1, 2], [3, 4]]')).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(parseMatrix('[[1, 2], [3]]', 'radians')).toMatchObject({ status: 'error', kind: 'dimension' })
    expect(parseMatrix('[[1, 2]', 'radians').status).toBe('error')
  })

  it('adds, subtracts, multiplies, and transposes with dimension guards', () => {
    const a = matrixOf('[[1, 2], [3, 4]]')
    const b = matrixOf('[[5, 6], [7, 8]]')
    expect(addMatrices(a, b)).toMatchObject({
      status: 'value',
      value: [
        [6, 8],
        [10, 12],
      ],
    })
    expect(subMatrices(b, a)).toMatchObject({
      status: 'value',
      value: [
        [4, 4],
        [4, 4],
      ],
    })
    expect(mulMatrices(a, b)).toMatchObject({
      status: 'value',
      value: [
        [19, 22],
        [43, 50],
      ],
    })
    expect(mulMatrices(matrixOf('[[1, 2, 3]]'), b).status).toBe('error')
    expect(transposeMatrix(a)).toEqual([
      [1, 3],
      [2, 4],
    ])
  })

  it('computes determinant and inverse fixtures', () => {
    expect(numberOf(determinant(matrixOf('[[1, 2], [3, 4]]')))).toBeCloseTo(-2, 12)
    expect(numberOf(determinant(matrixOf('[[6, 1, 1], [4, -2, 5], [2, 8, 7]]')))).toBeCloseTo(-306, 9)
    const inverse = inverseMatrix(matrixOf('[[4, 7], [2, 6]]'))
    expect(inverse.status).toBe('value')
    if (inverse.status === 'value') {
      expect(inverse.value[0]?.[0]).toBeCloseTo(0.6, 12)
      expect(inverse.value[1]?.[1]).toBeCloseTo(0.4, 12)
    }
    const solved = solveLinear(matrixOf('[[3, 2], [1, 2]]'), [5, 5])
    expect(solved.status).toBe('value')
    if (solved.status === 'value') {
      expect(solved.value[0]).toBeCloseTo(0, 9)
      expect(solved.value[1]).toBeCloseTo(2.5, 9)
    }
  })

  it('diagnoses singular matrices instead of inventing results', () => {
    expect(inverseMatrix(matrixOf('[[1, 2], [2, 4]]'))).toMatchObject({ status: 'error', kind: 'domain' })
    expect(determinant(matrixOf('[[1, 2], [2, 4]]'))).toMatchObject({ status: 'value', value: 0 })
    expect(solveLinear(matrixOf('[[0, 0], [0, 0]]'), [1, 2]).status).toBe('error')
    expect(determinant(matrixOf('[[1, 2, 3], [4, 5, 6]]'))).toMatchObject({ status: 'error', kind: 'dimension' })
  })

  it('flags ill-conditioned inverses by residual instead of blessing them', () => {
    const sound = inverseMatrix(matrixOf('[[4, 7], [2, 6]]'))
    expect(sound.status).toBe('value')
    if (sound.status === 'value') {
      expect(sound.warning ?? '').not.toMatch(/ill-conditioned/)
    }
    // Hilbert 8×8: famously ill-conditioned; the residual check must fire.
    const hilbert = `[${Array.from({ length: 8 }, (_, i) => `[${Array.from({ length: 8 }, (_, j) => `1/${i + j + 1}`).join(', ')}]`).join(', ')}]`
    const shaky = inverseMatrix(matrixOf(hilbert))
    expect(shaky.status).toBe('value')
    if (shaky.status === 'value') {
      expect(shaky.warning ?? '').toMatch(/ill-conditioned/)
    }
  })

  it('reports overflow for determinants and products outside the double range', () => {
    // Pre-fix these returned Infinity as a value (rendered '—').
    expect(determinant(matrixOf('[[1e308, 0], [0, 1e308]]'))).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(addMatrices(matrixOf('[[1e308]]'), matrixOf('[[1e308]]'))).toMatchObject({ status: 'error', kind: 'overflow' })
    expect(mulMatrices(matrixOf('[[1e200]]'), matrixOf('[[1e200]]'))).toMatchObject({ status: 'error', kind: 'overflow' })
  })

  it('enforces the documented vector and matrix size caps', () => {
    const overVector = `[${Array.from({ length: 257 }, (_, i) => i).join(', ')}]`
    expect(parseVector(overVector, 'radians')).toMatchObject({ status: 'error', kind: 'limit' })
    const tallMatrix = `[${Array.from({ length: 9 }, () => '[1]').join(', ')}]`
    expect(parseMatrix(tallMatrix, 'radians')).toMatchObject({ status: 'error', kind: 'limit' })
    const wideMatrix = `[[${Array.from({ length: 9 }, () => '1').join(', ')}]]`
    expect(parseMatrix(wideMatrix, 'radians')).toMatchObject({ status: 'error', kind: 'limit' })
  })
})

describe('statistics lane', () => {
  it('summarises the classic dataset with explicit conventions', () => {
    const summary = describeStats([2, 4, 4, 4, 5, 5, 7, 9])
    expect(summary.n).toBe(8)
    expect(summary.sum).toBe(40)
    expect(summary.mean).toBe(5)
    expect(summary.median).toBe(4.5)
    expect(summary.modes).toEqual([4])
    expect(summary.min).toBe(2)
    expect(summary.max).toBe(9)
    expect(summary.range).toBe(7)
    expect(summary.q1).toBe(4)
    expect(summary.q3).toBe(5.5)
    expect(summary.iqr).toBe(1.5)
    expect(summary.popStd).toBeCloseTo(2, 12)
    expect(summary.sampleStd).toBeCloseTo(2.138089935, 9)
  })

  it('uses compensated summation so cancellation cannot zero the mean', () => {
    // Naive Σ of [1e16, 1, −1e16] is 0 (the 1 is absorbed); the true sum is 1.
    const hostile = describeStats([1e16, 1, -1e16])
    expect(hostile.sum).toBe(1)
    expect(hostile.mean).toBeCloseTo(1 / 3, 12)
    // Ordinary datasets are bit-identical under compensation.
    expect(describeStats([2, 4, 4, 4, 5, 5, 7, 9]).sum).toBe(40)
  })

  it('reports zero, one, or multiple modes by the stated rule', () => {
    expect(describeStats([1, 2, 3]).modes).toEqual([])
    expect(describeStats([1, 2, 2, 3]).modes).toEqual([2])
    expect(describeStats([1, 2, 2, 3, 3]).modes).toEqual([2, 3])
    expect(formatStats(describeStats([1, 2, 3]))).toContain('mode: none (all values unique)')
  })

  it('interpolates quartiles on small and boundary datasets', () => {
    const single = describeStats([5])
    expect(single.q1).toBe(5)
    expect(single.q3).toBe(5)
    expect(single.iqr).toBe(0)
    const pair = describeStats([1, 3])
    expect(pair.q1).toBe(1.5)
    expect(pair.q3).toBe(2.5)
    expect(pair.median).toBe(2)
  })

  it('handles medians, single values, and bad input honestly', () => {
    expect(describeStats([3, 1, 2]).median).toBe(2)
    const single = describeStats([5])
    expect(single.sampleStd).toBe(null)
    expect(single.notes.some((note) => note.includes('n ≥ 2'))).toBe(true)
    expect(parseDataList('[]', 'radians')).toMatchObject({ status: 'error', kind: 'domain' })
    expect(parseDataList('1, 2, 3', 'radians')).toMatchObject({ status: 'error', kind: 'syntax' })
    expect(formatStats(describeStats([2, 4, 4, 4, 5, 5, 7, 9]))).toContain('σ = 2')
  })
})

describe('paired covariance and correlation', () => {
  it('matches hand-computed covariance and perfect correlations', () => {
    // xs [1,2,3,4], ys [2,4,6,8]: co-deviation 10, ÷4 = 2.5, ÷3 ≈ 3.333, r = 1.
    const perfect = describePaired([1, 2, 3, 4], [2, 4, 6, 8])
    expect(perfect.popCovariance).toBeCloseTo(2.5, 12)
    expect(perfect.sampleCovariance).toBeCloseTo(10 / 3, 12)
    expect(perfect.pearsonR).toBeCloseTo(1, 12)
    const flipped = describePaired([1, 2, 3, 4], [8, 6, 4, 2])
    expect(flipped.pearsonR).toBeCloseTo(-1, 12)
    // Uncorrelated by construction: co-deviation exactly 0.
    expect(describePaired([1, 2, 3], [1, 0, 1]).pearsonR).toBeCloseTo(0, 12)
    expect(formatPaired(perfect)).toContain('Pearson r = 1')
  })

  it('refuses constant columns and single pairs honestly', () => {
    const constant = describePaired([5, 5, 5], [1, 2, 3])
    expect(constant.pearsonR).toBe(null)
    expect(constant.notes.some((note) => note.includes('Constant column'))).toBe(true)
    expect(describePaired([1], [2]).sampleCovariance).toBe(null)
    expect(parseSecondList('', 'radians').status).toBe('error')
    expect(parseSecondList('[1, oops]', 'radians').status).toBe('error')
  })
})

describe('moving averages', () => {
  it('averages trailing windows with full support only', () => {
    expect(movingAverage([1, 2, 3, 4], 2, 'trailing')).toEqual({ status: 'value', value: [1.5, 2.5, 3.5] })
    expect(movingAverage([1, 2, 3, 4, 5], 3, 'trailing')).toEqual({ status: 'value', value: [2, 3, 4] })
  })

  it('centres odd windows and refuses even ones', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3, 'centered')).toEqual({ status: 'value', value: [2, 3, 4] })
    expect(movingAverage([1, 2, 3, 4], 2, 'centered')).toMatchObject({ status: 'error' })
  })

  it('refuses short, tiny, and non-finite inputs with reasons', () => {
    expect(movingAverage([1, 2], 5, 'trailing')).toMatchObject({ status: 'error' })
    expect(movingAverage([1, 2, 3], 1, 'trailing')).toMatchObject({ status: 'error' })
    expect(movingAverage([1, Number.NaN, 3], 2, 'trailing')).toMatchObject({ status: 'error' })
  })
})
