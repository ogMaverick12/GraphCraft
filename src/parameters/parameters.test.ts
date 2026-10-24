import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { compileExpression } from '../math/index.ts'
import { sampleFunction } from '../sampling/index.ts'
import { clampParameterValue, createParameter, validateParameter } from './model.ts'
import { useParameters } from './useParameters.ts'

describe('parameter validation', () => {
  it('accepts sane definitions', () => {
    expect(validateParameter(createParameter('a'))).toBe(null)
  })

  it('accepts case-sensitive names within the identifier grammar', () => {
    for (const name of ['a', 'amplitude', 'amplitude_1', 'A', 'X', 'Y', 'T', 'Theta', 'PI', 'E', 'Sin', 'abcdefghijklmnop']) {
      expect(validateParameter(createParameter(name))).toBe(null)
    }
  })

  it('explains reserved names, the length cap, and syntax in one actionable diagnostic', () => {
    const expected = (name: string): string =>
      `Invalid parameter name "${name}". Use 1-16 characters: a letter first, then letters, digits, or underscores. Names are case-sensitive; lowercase x, y, t, theta, pi, e, and all supported function names are reserved.`
    for (const name of ['x', 'y', 't', 'theta', 'pi', 'e', 'sin', 'abcdefghijklmnopq', '9a', '_a', 'a b', '']) {
      expect(validateParameter(createParameter(name))).toBe(expected(name))
    }
  })

  it('rejects bad names, bounds, steps, and out-of-range values', () => {
    const base = createParameter('a')
    expect(validateParameter({ ...base, name: 'x' })).toMatch(/Invalid parameter name/)
    expect(validateParameter({ ...base, name: 'sin' })).toMatch(/Invalid parameter name/)
    expect(validateParameter({ ...base, name: '9a' })).toMatch(/Invalid parameter name/)
    expect(validateParameter({ ...base, min: 5, max: -5 })).toMatch(/min below max/)
    expect(validateParameter({ ...base, step: 0 })).toMatch(/positive step/)
    expect(validateParameter({ ...base, step: 1e-12 })).toMatch(/minimum/)
    expect(validateParameter({ ...base, min: 0, max: 10, step: 0.00001 })).toMatch(/100000/)
    expect(validateParameter({ ...base, value: 99 })).toMatch(/inside/)
    expect(validateParameter({ ...base, min: -1e12, max: 1e12 })).toMatch(/±/)
  })

  it('clamps stray values instead of failing', () => {
    const parameter = createParameter('a')
    expect(clampParameterValue(parameter, 999)).toBe(10)
    expect(clampParameterValue(parameter, -999)).toBe(-10)
    expect(clampParameterValue(parameter, 3)).toBe(3)
    expect(clampParameterValue(parameter, Number.NaN)).toBe(parameter.value)
  })
})

describe('parameter store', () => {
  it('adds, renames-guards, resets, and removes', () => {
    const { result } = renderHook(() => useParameters())
    let error: string | null = null
    act(() => {
      error = result.current.addParameter('a')
    })
    expect(error).toBe(null)
    expect(result.current.parameters.map((p) => p.name)).toEqual(['a'])

    act(() => {
      error = result.current.addParameter('a')
    })
    expect(error).toMatch(/already exists/)
    act(() => {
      error = result.current.addParameter('x')
    })
    expect(error).toMatch(/Invalid parameter name/)

    act(() => {
      result.current.setValue('a', 5)
    })
    expect(result.current.parameters[0]?.value).toBe(5)
    act(() => {
      result.current.setValue('a', 999)
    })
    expect(result.current.parameters[0]?.value).toBe(10)

    act(() => {
      result.current.resetValue('a')
    })
    expect(result.current.parameters[0]?.value).toBe(1)

    act(() => {
      result.current.removeParameter('a')
    })
    expect(result.current.parameters).toHaveLength(0)
  })

  it('rejects invalid bound edits without applying them', () => {
    const { result } = renderHook(() => useParameters())
    act(() => {
      result.current.addParameter('b')
    })
    let error: string | null = null
    act(() => {
      error = result.current.updateBounds('b', { min: 5, max: -5 })
    })
    expect(error).toMatch(/min below max/)
    expect(result.current.parameters[0]?.min).toBe(-10)
  })
})

describe('sampling with parameters', () => {
  it('samples with supplied values and skips missing ones', () => {
    const compiled = compileExpression('a*x', { parameters: ['a'] })
    if (!compiled.ok) {
      throw new Error('Expected compilation')
    }
    const withValues = sampleFunction(compiled.expression, { xMin: 0, xMax: 2, pixelWidth: 100, parameters: { a: 3 } })
    expect(withValues.segments.length).toBeGreaterThan(0)
    const last = withValues.segments[0]?.points.at(-1)
    expect(last?.y).toBeCloseTo(6, 6)

    const withoutValues = sampleFunction(compiled.expression, { xMin: 0, xMax: 2, pixelWidth: 100 })
    expect(withoutValues.segments).toHaveLength(0)
  })
})
