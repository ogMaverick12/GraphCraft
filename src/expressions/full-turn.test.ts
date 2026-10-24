import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FULL_TURN, TRANSFORM_TEMPLATES } from './templates.ts'
import { useWorkspace } from './useWorkspace.ts'

/**
 * A6: operations that trace a complete revolution must use the shared
 * FULL_TURN constant (2π as a double), never the rounded 6.2832.
 */
describe('shared full-turn constant (A6)', () => {
  it('defines one full turn as exactly 2π radians', () => {
    expect(FULL_TURN).toBe(2 * Math.PI)
    expect(FULL_TURN).not.toBe(6.2832)
  })

  it('keeps the parametric templates on their intended full-turn ranges', () => {
    const parametric = TRANSFORM_TEMPLATES.filter((template) => template.kind === 'parametric')
    expect(parametric.map((template) => template.id)).toEqual(['unit-circle', 'ellipse', 'lissajous'])
    for (const template of parametric) {
      expect(template.tMin).toBe(0)
      expect(template.tMax).toBe(FULL_TURN)
    }
  })

  it('creates parametric and polar rows over exactly one full turn', () => {
    const { result } = renderHook(() => useWorkspace())
    let parametricId = ''
    let polarId = ''
    act(() => {
      parametricId = result.current.addParametricRow()
    })
    act(() => {
      polarId = result.current.addPolarRow()
    })

    expect(result.current.rows.map((row) => row.id)).toEqual([parametricId, polarId])
    expect(result.current.rows[0]).toMatchObject({
      kind: 'parametric',
      xSource: 'cos(t)',
      ySource: 'sin(t)',
      tMin: 0,
      tMax: FULL_TURN,
      label: '',
      visible: true,
    })
    expect(result.current.rows[1]).toMatchObject({
      kind: 'polar',
      source: '2*cos(3*theta)',
      thetaMin: 0,
      thetaMax: FULL_TURN,
      label: '',
      visible: true,
    })
    expect(result.current.selectedId).toBe(polarId)
  })
})
