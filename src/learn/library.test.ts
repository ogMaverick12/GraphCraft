import { describe, expect, it } from 'vitest'
import { checkTemplate, checkTransformRelation, formatBound, formatInterval, formatMath, searchTemplates, templateKinds, validateLibrary, validateTemplate, verifyAnnotations, verifyProperties, type LearnTemplate } from './library.ts'
import { LEARN_TEMPLATES, markersFromTemplate } from './templates.ts'

describe('template schema', () => {
  it('passes library validation with unique ids', () => {
    expect(validateLibrary(LEARN_TEMPLATES)).toEqual([])
  })

  it('rejects bad ids, unknown categories, and empty rows', () => {
    const base = LEARN_TEMPLATES[0]
    if (base === undefined) {
      throw new Error('expected a template')
    }
    expect(validateTemplate({ ...base, id: 'Bad ID!' })).not.toEqual([])
    expect(validateTemplate({ ...base, id: 'x', category: 'nope' as never })).not.toEqual([])
    expect(validateTemplate({ ...base, id: 'x', rows: [] })).not.toEqual([])
    expect(validateTemplate({ ...base, id: 'x', rows: [{ kind: 'cartesian', source: 'sin(' }] })).not.toEqual([])
    expect(validateTemplate({ ...base, id: 'x', viewport: { xMin: 5, xMax: -5, yMin: 0, yMax: 1 } })).not.toEqual([])
  })

  it('covers every category with at least two templates', () => {
    const counts = new Map<string, number>()
    for (const template of LEARN_TEMPLATES) {
      counts.set(template.category, (counts.get(template.category) ?? 0) + 1)
    }
    for (const [category, count] of counts) {
      expect(count, category).toBeGreaterThanOrEqual(2)
    }
    expect(counts.size).toBe(10)
  })

  it('uses only supported graph kinds', () => {
    for (const template of LEARN_TEMPLATES) {
      for (const kind of templateKinds(template)) {
        expect(['cartesian', 'parametric', 'polar', 'implicit', 'inequality']).toContain(kind)
      }
    }
  })

  it('claims no external curriculum alignment', () => {
    const text = LEARN_TEMPLATES.map((t) => `${t.title} ${t.description} ${t.objective}`.toLowerCase()).join('\n')
    expect(text).not.toContain('jee')
    expect(text).not.toContain('cbse')
    expect(text).not.toContain('ncert')
  })
})

describe('anchor checks', () => {
  it('passes every template through the real compile pipeline', () => {
    for (const template of LEARN_TEMPLATES) {
      const outcome = checkTemplate(template)
      expect(outcome, template.id).toEqual({ ok: true, checked: template.checks.length })
    }
  })

  it('fails honestly on wrong anchors and missing checks', () => {
    const base = LEARN_TEMPLATES[0]
    if (base === undefined) {
      throw new Error('expected a template')
    }
    expect(checkTemplate({ ...base, checks: [{ at: 0, x: 0, y: 999 }] })).toMatchObject({ ok: false })
    expect(checkTemplate({ ...base, checks: [] })).toMatchObject({ ok: false })
  })
})

describe('search and filter', () => {
  const blank = { query: '', category: 'all', level: 'all', kind: 'all' } as const

  it('returns everything unfiltered and narrows by each facet', () => {
    expect(searchTemplates(LEARN_TEMPLATES, blank)).toHaveLength(LEARN_TEMPLATES.length)
    const conics = searchTemplates(LEARN_TEMPLATES, { ...blank, category: 'conics' })
    expect(conics.length).toBeGreaterThanOrEqual(2)
    expect(conics.every((t) => t.category === 'conics')).toBe(true)
    const college = searchTemplates(LEARN_TEMPLATES, { ...blank, level: 'college' })
    expect(college.length).toBeGreaterThan(0)
    const polar = searchTemplates(LEARN_TEMPLATES, { ...blank, kind: 'polar' })
    expect(polar.length).toBeGreaterThanOrEqual(2)
  })

  it('matches multi-word queries across titles, text, and formulas', () => {
    expect(searchTemplates(LEARN_TEMPLATES, { ...blank, query: 'asymptote' }).length).toBeGreaterThanOrEqual(2)
    expect(searchTemplates(LEARN_TEMPLATES, { ...blank, query: 'cardioid' })).toHaveLength(1)
    expect(searchTemplates(LEARN_TEMPLATES, { ...blank, query: 'zzz-no-match' })).toHaveLength(0)
  })

  it('finds lessons by stated mathematical properties', () => {
    const decreasing = searchTemplates(LEARN_TEMPLATES, { ...blank, query: 'decreasing' })
    expect(decreasing.map((t) => t.id)).toContain('split-power-branches')
    const periodic = searchTemplates(LEARN_TEMPLATES, { ...blank, query: 'period' })
    expect(periodic.length).toBeGreaterThanOrEqual(2)
    expect(periodic.every((t) => t.properties?.period !== undefined)).toBe(true)
  })
})

describe('template immutability contract', () => {
  it('declares checks per row so opening cannot drift from verification', () => {
    for (const template of LEARN_TEMPLATES) {
      expect(template.checks.length, template.id).toBe(template.rows.length)
    }
  })

  it('keeps every template object frozen-shape stable for contributors', () => {
    const template: LearnTemplate = LEARN_TEMPLATES[0] as LearnTemplate
    expect(typeof template.id).toBe('string')
    expect(Array.isArray(template.levels)).toBe(true)
    expect(Array.isArray(template.rows)).toBe(true)
  })
})

describe('property verification', () => {
  it('verifies every stated property against the engine', () => {
    let total = 0
    let withProperties = 0
    for (const template of LEARN_TEMPLATES) {
      const outcome = verifyProperties(template)
      expect(outcome, template.id).toEqual({ ok: true, checked: expect.any(Number) })
      if (template.properties !== undefined) {
        withProperties += 1
        total += outcome.ok ? outcome.checked : 0
      }
    }
    expect(withProperties).toBeGreaterThan(20)
    expect(total).toBeGreaterThan(40)
  })

  it('rejects wrong trends, points, periods, and amplitudes', () => {
    const base = LEARN_TEMPLATES.find((template) => template.id === 'parabola-vertex')
    if (base?.properties === undefined) {
      throw new Error('expected parabola properties')
    }
    expect(verifyProperties({ ...base, properties: { ...base.properties, monotonicity: [{ lo: null, hi: null, trend: 'decreasing' }] } })).toMatchObject({ ok: false })
    expect(verifyProperties({ ...base, properties: { ...base.properties, turningPoints: [{ x: 0, y: 99, kind: 'min' }] } })).toMatchObject({ ok: false })
    const sine = LEARN_TEMPLATES.find((template) => template.id === 'sine-wave')
    if (sine?.properties === undefined) {
      throw new Error('expected sine properties')
    }
    expect(verifyProperties({ ...sine, properties: { ...sine.properties, period: 1 } })).toMatchObject({ ok: false })
    expect(verifyProperties({ ...sine, properties: { ...sine.properties, amplitude: 5 } })).toMatchObject({ ok: false })
  })

  it('formats engine syntax readably without reparsing it', () => {
    expect(formatMath('x^2-4')).toBe('x²−4')
    expect(formatMath('2*x+1')).toBe('2·x+1')
    expect(formatMath('(x-1)*(x-3)')).toBe('(x−1)·(x−3)')
    expect(formatMath('sin(x)/x')).toBe('sin(x)/x')
    expect(formatBound(null)).toBe('∞')
    expect(formatBound(2)).toBe('2')
    expect(formatInterval(null, 0)).toBe('(−∞, 0)')
    expect(formatInterval(0, null)).toBe('(0, ∞)')
  })
})

describe('annotation verification', () => {
  it('verifies every curated annotation against the engine', () => {
    let total = 0
    for (const template of LEARN_TEMPLATES) {
      const outcome = verifyAnnotations(template)
      expect(outcome, template.id).toEqual({ ok: true, checked: template.annotations?.length ?? 0 })
      total += template.annotations?.length ?? 0
    }
    expect(total).toBeGreaterThan(10)
  })

  it('covers every annotation kind at least once', () => {
    const kinds = new Set(LEARN_TEMPLATES.flatMap((template) => (template.annotations ?? []).map((annotation) => annotation.kind)))
    for (const kind of ['intercept', 'root', 'vertex', 'extremum', 'asymptote', 'symmetry', 'domain', 'range', 'tangent', 'parameter'] as const) {
      expect(kinds.has(kind), kind).toBe(true)
    }
  })

  it('maps only root and extremum annotations to graph markers', () => {
    const markers = LEARN_TEMPLATES.flatMap((template) => markersFromTemplate(template).map((marker) => ({ template: template.id, ...marker })))
    expect(markers.length).toBeGreaterThan(0)
    for (const marker of markers) {
      expect(['root', 'extremum']).toContain(marker.kind)
      if (marker.kind === 'root') {
        expect(marker.y).toBe(0)
      }
    }
    // Text-only kinds never borrow a marker shape within their own template.
    let textOnlyCount = 0
    for (const template of LEARN_TEMPLATES) {
      const markedPoints = new Set(markersFromTemplate(template).map((marker) => `${marker.x},${marker.y}`))
      for (const annotation of template.annotations ?? []) {
        if (['intercept', 'asymptote', 'symmetry', 'domain', 'range', 'tangent', 'parameter'].includes(annotation.kind) && annotation.point !== undefined) {
          textOnlyCount += 1
          expect(markedPoints.has(`${annotation.point.x},${annotation.point.y}`), `${template.id} "${annotation.label}"`).toBe(false)
        }
      }
    }
    expect(textOnlyCount).toBeGreaterThan(0)
  })
})

describe('transformation sign conventions', () => {
  it('shifts right for f(x − h): transformed(x) = base(x − h)', () => {
    expect(checkTransformRelation('x^2', '(x-2)^2', [{ x: 2, baseX: 0 }, { x: 3, baseX: 1 }, { x: 0, baseX: -2 }])).toEqual({ ok: true, checked: 3 })
  })

  it('compresses horizontally for f(bx): transformed(x) = base(b·x)', () => {
    expect(checkTransformRelation('sin(x)', 'sin(2*x)', [{ x: 0.5, baseX: 1 }, { x: 1, baseX: 2 }, { x: 0, baseX: 0 }])).toEqual({ ok: true, checked: 3 })
  })

  it('mirrors across the y-axis for f(−x): transformed(x) = base(−x)', () => {
    expect(checkTransformRelation('x^3', '(-x)^3', [{ x: 1, baseX: -1 }, { x: -2, baseX: 2 }])).toEqual({ ok: true, checked: 2 })
  })

  it('fails honestly on a wrong mapping', () => {
    // The trap: claiming (x − 2)² shifts LEFT (base(x + h)) must not verify.
    expect(checkTransformRelation('x^2', '(x-2)^2', [{ x: 2, baseX: 4 }])).toMatchObject({ ok: false })
  })

  it('declares a transform entry on the dedicated templates', () => {
    const transformed = LEARN_TEMPLATES.filter((template) => template.transform !== undefined)
    expect(transformed.map((template) => template.id).sort()).toEqual(['horizontal-scale-sine', 'reflect-cubic', 'shift-right-parabola'])
    for (const template of transformed) {
      expect(template.transform?.note).toMatch(/f\(/)
    }
  })
})
