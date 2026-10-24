import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileExpression } from '../math/index.ts'
import { sampleFunction } from '../sampling/index.ts'
import { MAX_UPLOAD_BYTES, sanitizeFilename, uploadTooLarge } from './files.ts'
import { serializeProject } from './serialize.ts'
import { validateProjectText } from './validate.ts'
import type { GraphCraftProject } from './schema.ts'

const VALID = {
  format: 'graphcraft-project',
  version: 6,
  title: 'Round trip',
  expressions: [
    { kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' },
    { kind: 'cartesian', id: 'b', source: '1/x', visible: false, colorIndex: 3, label: 'Reciprocal', domain: { min: -5, max: 5 }, branches: null, defaultSource: '' },
  ],
  viewport: { xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: false, showGrid: true },
  parameters: [{ name: 'a', value: 2, min: -10, max: 10, step: 0.1, defaultValue: 1 }],
  dataLab: { datasets: [], analyses: {} },
  surfaces3d: [],
  fields2d: [],
  scatters3d: [],
}

describe('project validation', () => {
  it('round-trips a valid project exactly', () => {
    const text = JSON.stringify(VALID)
    const result = validateProjectText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected valid project')
    }
    expect(result.project).toEqual(VALID)
  })

  it('round-trips through the serializer', () => {
    const text = serializeProject({
      title: 'Round trip',
      rows: [
        { kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' },
        { kind: 'cartesian', id: 'b', source: '1/x', visible: false, colorIndex: 3, label: 'Reciprocal', domain: { min: -5, max: 5 }, branches: null, defaultSource: '' },
      ],
      world: { xMin: -10, xMax: 10, yMin: -7, yMax: 7 },
      equalAspect: false,
      showGrid: true,
      parameters: [{ name: 'a', value: 2, min: -10, max: 10, step: 0.1, defaultValue: 1 }],
    })
    expect(validateProjectText(text)).toEqual({ ok: true, project: VALID })
  })

  it('applies documented defaults for missing title and viewport', () => {
    const partial = { format: 'graphcraft-project', version: 1, expressions: [] }
    const result = validateProjectText(JSON.stringify(partial))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.title).toBe('Untitled project')
      expect(result.project.viewport).toEqual({ xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: false, showGrid: true })
    }
  })

  it('rejects malformed JSON', () => {
    expect(validateProjectText('{oops')).toEqual({ ok: false, error: 'File is not valid JSON.' })
    expect(validateProjectText('"just a string"').ok).toBe(false)
  })

  it('rejects oversized files before parsing', () => {
    const big = `{"format":"graphcraft-project","version":1,"pad":"${'x'.repeat(300 * 1024)}"}`
    const result = validateProjectText(big)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/too large/)
    }
  })

  it('rejects invalid ranges', () => {
    const bad = { ...VALID, viewport: { ...VALID.viewport, xMin: 5, xMax: -5 } }
    expect(validateProjectText(JSON.stringify(bad)).ok).toBe(false)
    const nan = { ...VALID, viewport: { ...VALID.viewport, xMin: 0, xMax: 1, yMin: 0, yMax: Number.NaN } }
    // JSON cannot encode NaN; null arrives instead and must be rejected.
    expect(validateProjectText(JSON.stringify(nan)).ok).toBe(false)
  })

  it('rejects newer versions clearly instead of guessing', () => {
    const result = validateProjectText(JSON.stringify({ ...VALID, version: 99 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/newer/)
    }
  })

  it('rejects missing versions and wrong tags', () => {
    const { version: _dropped, ...noVersion } = VALID
    void _dropped
    expect(validateProjectText(JSON.stringify(noVersion)).ok).toBe(false)
    expect(validateProjectText(JSON.stringify({ ...VALID, format: 'other-app' })).ok).toBe(false)
  })

  it('loads structurally valid rows even when the math is bad', () => {
    const doc = { ...VALID, expressions: [{ id: 'bad', source: 'x+', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }] }
    const result = validateProjectText(JSON.stringify(doc))
    expect(result.ok).toBe(true)
    // …and the engine reports the row error inline, exactly as if typed.
    expect(compileExpression('x+').ok).toBe(false)
  })

  it('rejects duplicate ids and invalid colours', () => {
    const dupes = { ...VALID, expressions: [VALID.expressions[0], VALID.expressions[0]] }
    const dupeResult = validateProjectText(JSON.stringify(dupes))
    expect(dupeResult.ok).toBe(false)
    if (!dupeResult.ok) {
      expect(dupeResult.error).toMatch(/Duplicate/)
    }
    const badColor = { ...VALID, expressions: [{ id: 'a', source: 'x', visible: true, colorIndex: 99 }] }
    expect(validateProjectText(JSON.stringify(badColor)).ok).toBe(false)
    const nonInteger = { ...VALID, expressions: [{ id: 'a', source: 'x', visible: true, colorIndex: 1.5 }] }
    expect(validateProjectText(JSON.stringify(nonInteger)).ok).toBe(false)
  })

  it('rejects oversized titles and row lists', () => {
    expect(validateProjectText(JSON.stringify({ ...VALID, title: 'x'.repeat(201) })).ok).toBe(false)
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `r${i}`, source: 'x', visible: true, colorIndex: 0 }))
    expect(validateProjectText(JSON.stringify({ ...VALID, expressions: many })).ok).toBe(false)
  })

  it('migrates a v0 sketch with documented defaults', () => {
    const v0 = { version: 0, title: 'Old', expressions: [{ id: 'a', source: 'x^2' }], viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, equalAspect: false, showGrid: true } }
    const result = validateProjectText(JSON.stringify(v0))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.version).toBe(6)
      expect(result.project.expressions).toEqual([{ kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }])
      expect(result.project.parameters).toEqual([])
      expect(result.project.dataLab?.datasets).toEqual([])
    }
  })

  it('migrates v1 rows by filling the Stage 2 fields', () => {
    const v1 = {
      format: 'graphcraft-project',
      version: 1,
      title: 'Legacy',
      expressions: [{ id: 'a', source: 'x^2', visible: true, colorIndex: 2 }],
      viewport: { xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: false, showGrid: true },
    }
    const result = validateProjectText(JSON.stringify(v1))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.version).toBe(6)
      // Behaviour preserved: same source, visibility, colour; new fields defaulted.
      expect(result.project.expressions).toEqual([
        { kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 2, label: '', domain: null, branches: null, defaultSource: '' },
      ])
      expect(result.project.parameters).toEqual([])
      expect(result.project.dataLab?.datasets).toEqual([])
    }
  })

  it('migrates v2 documents by adding an empty parameter list', () => {
    const v2 = {
      format: 'graphcraft-project',
      version: 3,
      title: 'Stage 2 doc',
      expressions: [{ kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }],
      viewport: { xMin: -10, xMax: 10, yMin: -7, yMax: 7, equalAspect: false, showGrid: true },
      parameters: [],
    }
    const result = validateProjectText(JSON.stringify(v2))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.version).toBe(6)
      expect(result.project.parameters).toEqual([])
      expect(result.project.dataLab?.datasets).toEqual([])
      expect(result.project.expressions).toEqual([
        { kind: 'cartesian', id: 'a', source: 'x^2', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' },
      ])
    }
  })

  it('round-trips implicit and inequality rows with visibility intact', () => {
    const doc = {
      format: 'graphcraft-project',
      version: 4,
      title: 'Implicit round trip',
      expressions: [
        { kind: 'implicit', id: 'c', leftSource: 'x^2 + y^2', rightSource: '1', visible: true, colorIndex: 0, label: 'Circle' },
        { kind: 'inequality', id: 'q', leftSource: 'y', op: '<=', rightSource: 'x^2', visible: false, colorIndex: 1, label: '' },
      ],
      viewport: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, equalAspect: false, showGrid: true },
      parameters: [],
    }
    const result = validateProjectText(JSON.stringify(doc))
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected a valid v6 document')
    }
    expect(result.project.expressions).toHaveLength(2)
    expect(result.project.expressions[1]).toMatchObject({ kind: 'inequality', visible: false, op: '<=' })
    // Serializing the validated project validates identically (stable round-trip).
    const reserialized = JSON.parse(JSON.stringify(result.project)) as unknown
    expect(validateProjectText(JSON.stringify(reserialized)).ok).toBe(true)
  })

  it('round-trips learn annotation selections and tolerates unknown templates', () => {    const withAnnotations = { ...VALID, learnAnnotations: { templateId: 'parabola-vertex' } }
    const result = validateProjectText(JSON.stringify(withAnnotations))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.learnAnnotations).toEqual({ templateId: 'parabola-vertex' })
    }
    const ghost = { ...VALID, learnAnnotations: { templateId: 'retired-template' } }
    expect(validateProjectText(JSON.stringify(ghost)).ok).toBe(true)
    const malformed = { ...VALID, learnAnnotations: { templateId: 42 } }
    expect(validateProjectText(JSON.stringify(malformed)).ok).toBe(true)
  })

  it('refuses oversized uploads before reading bytes', async () => {
    expect(uploadTooLarge(0, MAX_UPLOAD_BYTES)).toBe(false)
    expect(uploadTooLarge(MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES)).toBe(false)
    expect(uploadTooLarge(MAX_UPLOAD_BYTES + 1, MAX_UPLOAD_BYTES)).toBe(true)
    expect(uploadTooLarge(Number.NaN, MAX_UPLOAD_BYTES)).toBe(false)
    const { readFileText } = await import('./files.ts')
    const big = new File(['x'], 'big.graphcraft.json')
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 })
    await expect(readFileText(big)).rejects.toThrow(/too large/)
    const small = new File(['{"a":1}'], 'small.json')
    await expect(readFileText(small)).resolves.toBe('{"a":1}')
  })

  it('never emits Windows-reserved device names', () => {
    for (const stem of ['CON', 'con', 'Aux', 'nul', 'COM1', 'lpt9']) {
      expect(sanitizeFilename(stem)).toBe(`${stem.toLowerCase()}-project.graphcraft.json`)
    }
    expect(sanitizeFilename('')).toBe('graphcraft-project.graphcraft.json')
    expect(sanitizeFilename('My Project')).toBe('my-project.graphcraft.json')
  })

  it('rejects duplicate labels, bad domains, and bad branches', () => {
    const labelled = (label: string, extra?: Record<string, unknown>) => ({
      id: `r-${label === '' ? 'blank' : label}`,
      source: 'x',
      visible: true,
      colorIndex: 0,
      label,
      domain: null,
      branches: null,
      defaultSource: '',
      ...extra,
    })
    const dupes = { ...VALID, expressions: [labelled('Same'), labelled('same')] }
    const dupeResult = validateProjectText(JSON.stringify(dupes))
    expect(dupeResult.ok).toBe(false)
    if (!dupeResult.ok) {
      expect(dupeResult.error).toMatch(/Duplicate.*label/)
    }

    for (const domain of [{ min: 5, max: 5 }, { min: 5, max: 2 }, { min: 'a', max: 2 }]) {
      const bad = { ...VALID, expressions: [labelled('d', { domain })] }
      expect(validateProjectText(JSON.stringify(bad)).ok).toBe(false)
    }

    const badOp = { ...VALID, expressions: [labelled('b', { branches: [{ op: 'eq', value: 0, source: 'x' }], defaultSource: '0' })] }
    expect(validateProjectText(JSON.stringify(badOp)).ok).toBe(false)
    const badValue = { ...VALID, expressions: [labelled('b', { branches: [{ op: 'lt', value: null, source: 'x' }], defaultSource: '0' })] }
    expect(validateProjectText(JSON.stringify(badValue)).ok).toBe(false)
    const badSource = { ...VALID, expressions: [labelled('b', { branches: [{ op: 'lt', value: 0, source: '' }], defaultSource: '0' })] }
    expect(validateProjectText(JSON.stringify(badSource)).ok).toBe(false)
    const emptyPieces = { ...VALID, expressions: [labelled('b', { branches: [], defaultSource: '' })] }
    expect(validateProjectText(JSON.stringify(emptyPieces)).ok).toBe(false)

    const good = {
      ...VALID,
      expressions: [labelled('Step', { branches: [{ op: 'lt', value: 0, source: '0' }], defaultSource: '1' })],
    }
    expect(validateProjectText(JSON.stringify(good)).ok).toBe(true)
  })

  it('validates parameter lists strictly', () => {
    const param = (overrides?: Record<string, unknown>) => ({
      name: 'a',
      value: 2,
      min: -10,
      max: 10,
      step: 0.1,
      defaultValue: 1,
      ...overrides,
    })
    expect(validateProjectText(JSON.stringify({ ...VALID, parameters: [param()] })).ok).toBe(true)

    const cases: Array<[string, Record<string, unknown>]> = [
      ['reserved name', { name: 'x' }],
      ['reserved implicit variable', { name: 'y' }],
      ['reserved polar variable', { name: 'theta' }],
      ['overlong name', { name: 'abcdefghijklmnopq' }],
      ['bad name', { name: '9lives' }],
      ['reversed bounds', { min: 5, max: -5 }],
      ['zero step', { step: 0 }],
      ['tiny step', { step: 1e-12 }],
      ['too many steps', { min: 0, max: 10, step: 0.00001 }],
      ['value outside', { value: 99 }],
      ['default outside', { defaultValue: -99 }],
      ['huge bounds', { min: -1e12, max: 1e12 }],
    ]
    for (const [label, overrides] of cases) {
      expect(validateProjectText(JSON.stringify({ ...VALID, parameters: [param(overrides)] })).ok, label).toBe(false)
    }
    const dupes = { ...VALID, parameters: [param(), param({ value: 3 })] }
    const dupeResult = validateProjectText(JSON.stringify(dupes))
    expect(dupeResult.ok).toBe(false)
    if (!dupeResult.ok) {
      expect(dupeResult.error).toMatch(/Duplicate parameter/)
    }
  })

  it('accepts the shipped example file and can sample it', () => {
    const text = readFileSync(join(import.meta.dirname, '..', '..', 'examples', 'quadratic-and-sine.graphcraft.json'), 'utf8')
    const result = validateProjectText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Example file must validate')
    }
    const project: GraphCraftProject = result.project
    expect(project.expressions.map((row) => (row.kind === 'cartesian' ? row.source : row.kind))).toEqual(['x^2', 'sin(x)'])
    for (const row of project.expressions) {
      if (row.kind !== 'cartesian') {
        throw new Error('Example rows are cartesian')
      }
      const compiled = compileExpression(row.source)
      expect(compiled.ok).toBe(true)
      if (compiled.ok) {
        const sampled = sampleFunction(compiled.expression, { xMin: project.viewport.xMin, xMax: project.viewport.xMax, pixelWidth: 400 })
        expect(sampled.segments.length).toBeGreaterThan(0)
      }
    }
  })
})
