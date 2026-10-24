import { describe, expect, it } from 'vitest'
import { evaluateFit, evaluateModelFit, fitModel, MAX_POLY_DEGREE, type FitResult } from './fits.ts'

function fitted(request: Parameters<typeof fitModel>[0]): FitResult {
  const outcome = fitModel(request)
  expect(outcome.status).toBe('value')
  if (outcome.status !== 'value') {
    throw new Error(`Expected a fit: ${JSON.stringify(outcome)}`)
  }
  return outcome.fit
}

describe('least-squares fitting', () => {
  it('recovers an exact line fixture', () => {
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2, 3], ys: [1, 3, 5, 7] })
    expect(fit.coefficients[0]).toBeCloseTo(1, 12)
    expect(fit.coefficients[1]).toBeCloseTo(2, 12)
    expect(fit.rSquared).toBeCloseTo(1, 12)
    expect(fit.n).toBe(4)
    expect(fit.converged).toBe(true)
    expect(fit.methodNote).toMatch(/Householder QR/)
  })

  it('matches hand-computed OLS on noisy data within tolerance', () => {
    // Closed-form reference: slope 1.96, intercept 1.06, R² ≈ 0.99834.
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2, 3], ys: [1.1, 2.9, 5.1, 6.9] })
    expect(fit.coefficients[1]).toBeCloseTo(1.96, 9)
    expect(fit.coefficients[0]).toBeCloseTo(1.06, 9)
    expect(fit.rSquared).not.toBe(null)
    if (fit.rSquared !== null) {
      expect(fit.rSquared).toBeCloseTo(0.99834, 5)
    }
    expect(fit.residualStd).toBeCloseTo(Math.sqrt(0.032 / 2), 9)
    expect(fit.minResidual).toBeCloseTo(-0.12, 9)
    expect(fit.maxResidual).toBeCloseTo(0.12, 9)
  })

  it('recovers exact polynomial fixtures', () => {
    const quad = fitted({ model: 'poly', degree: 2, xs: [0, 1, 2, 3], ys: [1, 2, 5, 10] })
    expect(quad.coefficients[0]).toBeCloseTo(1, 9)
    expect(quad.coefficients[1]).toBeCloseTo(0, 9)
    expect(quad.coefficients[2]).toBeCloseTo(1, 9)
    const cubic = fitted({ model: 'poly', degree: 3, xs: [-2, -1, 0, 1, 2], ys: [-3, 2, 1, 0, 5] })
    // y = x^3 - 2x + 1 exactly at these points.
    expect(cubic.coefficients[0]).toBeCloseTo(1, 6)
    expect(cubic.coefficients[1]).toBeCloseTo(-2, 6)
    expect(cubic.coefficients[2]).toBeCloseTo(0, 6)
    expect(cubic.coefficients[3]).toBeCloseTo(1, 6)
  })

  it('rejects constant and repeated X as singular', () => {
    expect(fitModel({ model: 'line', degree: 1, xs: [5, 5, 5], ys: [1, 2, 3] })).toMatchObject({ status: 'error', kind: 'singular' })
    expect(fitModel({ model: 'poly', degree: 2, xs: [1, 1, 1, 1], ys: [1, 2, 3, 4] })).toMatchObject({ status: 'error', kind: 'singular' })
  })

  it('rejects too few observations and bad degrees', () => {
    // A line needs 3+ points (one degree of freedom for residual spread).
    expect(fitModel({ model: 'line', degree: 1, xs: [0], ys: [1] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(fitModel({ model: 'line', degree: 1, xs: [0, 1], ys: [0, 1] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(fitModel({ model: 'poly', degree: 2, xs: [0, 1, 2], ys: [0, 1, 4] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(fitModel({ model: 'poly', degree: 2, xs: [0, 1, 2, 3], ys: [0, 1, 4, 9] }).status).toBe('value')
    expect(fitModel({ model: 'poly', degree: 7, xs: [0, 1, 2, 3], ys: [0, 1, 2, 3] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(MAX_POLY_DEGREE).toBe(6)
  })

  it('skips missing points with an exact count and stays reproducible', () => {
    const request = { model: 'line' as const, degree: 1, xs: [0, 1, 2, NaN], ys: [1, 3, 5, 100] }
    const first = fitted(request)
    const second = fitted(request)
    expect(first.n).toBe(3)
    expect(first.skipped).toBe(1)
    expect(first).toEqual(second)
    expect(first.coefficients[1]).toBeCloseTo(2, 12)
  })

  it('reports constant Y honestly instead of a bogus R²', () => {
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2], ys: [5, 5, 5] })
    expect(fit.rSquared).toBe(null)
    expect(fit.converged).toBe(false)
    expect(fit.warnings.some((w) => w.includes('R² is undefined'))).toBe(true)
  })

  it('survives a scale stress test and flags ill-conditioning', () => {
    const xs = [1e6, 2e6, 3e6, 4e6]
    const fit = fitted({ model: 'line', degree: 1, xs, ys: xs.map((x) => 2 * x + 1) })
    expect(fit.coefficients[1]).toBeCloseTo(2, 6)
    // Degree-3 on megascale X stresses the Vandermonde basis: must solve
    // or refuse, never return garbage silently.
    const big = [1e6, 2e6, 3e6, 4e6, 5e6, 6e6]
    const cubic = fitModel({ model: 'poly', degree: 3, xs: big, ys: big.map((x) => x ** 3) })
    if (cubic.status === 'value') {
      for (let i = 0; i < big.length; i += 1) {
        expect(evaluateFit(cubic.fit.coefficients, big[i] ?? 0)).toBeCloseTo((big[i] ?? 0) ** 3, 0)
      }
    } else {
      expect(cubic.kind).toBe('singular')
    }
  })

  it('warns about overfitting on high-degree polynomials', () => {
    const fit = fitted({ model: 'poly', degree: 4, xs: [0, 1, 2, 3, 4, 5], ys: [0, 1, 4, 9, 16, 25] })
    expect(fit.warnings.some((w) => w.includes('overfit'))).toBe(true)
    expect(fit.converged).toBe(false)
  })

  it('reports RMSE, MAE, and degrees of freedom on the noisy fixture', () => {
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2, 3], ys: [1.1, 2.9, 5.1, 6.9] })
    // Residuals: 0.04, −0.12, 0.12, −0.04 → MAE 0.08, RMSE √(0.032/4).
    expect(fit.dof).toBe(2)
    expect(fit.rmse).toBeCloseTo(Math.sqrt(0.032 / 4), 9)
    expect(fit.mae).toBeCloseTo(0.08, 9)
    const quad = fitted({ model: 'poly', degree: 2, xs: [0, 1, 2, 3, 4], ys: [0, 1, 4, 9, 16] })
    expect(quad.dof).toBe(2)
    expect(quad.rmse).toBeCloseTo(0, 9)
    expect(quad.mae).toBeCloseTo(0, 9)
  })

  it('fits weighted least squares with w = 1/σ² against a hand reference', () => {
    // Closed form: slope 2, intercept 1 (downweighted third point).
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2], ys: [1, 3, 5], sigmas: [1, 1, 2] })
    expect(fit.coefficients[1]).toBeCloseTo(2, 9)
    expect(fit.coefficients[0]).toBeCloseTo(1, 9)
    expect(fit.warnings.some((w) => w.includes('w = 1/σ²'))).toBe(true)
  })

  it('excludes non-positive and missing weights with counts, never silently', () => {
    const fit = fitted({ model: 'line', degree: 1, xs: [0, 1, 2, 3, 4], ys: [1, 3, 5, 7, 9], sigmas: [1, 0, 1, -2, 1] })
    expect(fit.n).toBe(3)
    expect(fit.warnings.some((w) => w.includes('2 points excluded'))).toBe(true)
    expect(fitModel({ model: 'line', degree: 1, xs: [0, 1], ys: [0, 1], sigmas: [1] })).toMatchObject({ status: 'error', kind: 'data' })
  })
})

describe('linearized nonlinear fitting (documented selection)', () => {
  it('recovers exact exponential parameters y = 2·e^(0.5x)', () => {
    const xs = [0, 1, 2, 3]
    const ys = xs.map((x) => 2 * Math.exp(0.5 * x))
    const fit = fitted({ model: 'exp', degree: 1, xs, ys })
    expect(fit.model).toBe('exp')
    expect(fit.coefficients[0]).toBeCloseTo(2, 9)
    expect(fit.coefficients[1]).toBeCloseTo(0.5, 9)
    expect(fit.methodNote).toMatch(/Linearized/)
    expect(fit.warnings.some((w) => w.includes('approximate'))).toBe(true)
    for (let i = 0; i < xs.length; i += 1) {
      expect(evaluateModelFit('exp', fit.coefficients, xs[i] ?? 0)).toBeCloseTo(ys[i] ?? 0, 9)
    }
  })

  it('recovers exact logarithmic parameters y = 1 + 2·ln(x)', () => {
    const xs = [1, 2, 3, 4]
    const ys = xs.map((x) => 1 + 2 * Math.log(x))
    const fit = fitted({ model: 'log', degree: 1, xs, ys })
    expect(fit.coefficients[0]).toBeCloseTo(1, 9)
    expect(fit.coefficients[1]).toBeCloseTo(2, 9)
  })

  it('recovers exact power parameters y = 3·x^2', () => {
    const xs = [1, 2, 3, 4]
    const ys = xs.map((x) => 3 * x ** 2)
    const fit = fitted({ model: 'power', degree: 1, xs, ys })
    expect(fit.coefficients[0]).toBeCloseTo(3, 6)
    expect(fit.coefficients[1]).toBeCloseTo(2, 6)
  })

  it('refuses out-of-domain and insufficient data honestly', () => {
    // exp needs y > 0; log/power need x > 0.
    expect(fitModel({ model: 'exp', degree: 1, xs: [0, 1], ys: [1, -2] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(fitModel({ model: 'log', degree: 1, xs: [0, -1, 2], ys: [1, 2, 3] })).toMatchObject({ status: 'error', kind: 'data' })
    expect(fitModel({ model: 'power', degree: 1, xs: [1, 2], ys: [1, 4] })).toMatchObject({ status: 'error', kind: 'data' })
    const partial = fitted({ model: 'exp', degree: 1, xs: [0, 1, 2, 3], ys: [1, 0, 2, 4] })
    expect(partial.n).toBe(3)
    expect(partial.warnings.some((w) => w.includes('domain'))).toBe(true)
  })

  it('reports singular transformed designs instead of parameters', () => {
    expect(fitModel({ model: 'exp', degree: 1, xs: [2, 2, 2], ys: [1, 2, 3] })).toMatchObject({ status: 'error', kind: 'singular' })
    expect(fitModel({ model: 'log', degree: 1, xs: [1, 1, 1], ys: [1, 2, 3] })).toMatchObject({ status: 'error', kind: 'singular' })
  })
})
