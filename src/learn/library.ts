import { compileRow } from '../expressions/compile.ts'
import { createExpressionId, type ExpressionRow, type RowBranch } from '../expressions/model.ts'
import type { WorldRect } from '../graph/coordinate.ts'
import { compileExpression } from '../math/index.ts'

/**
 * Learn library model (Stage 5 LEARN-01): curated graph templates with
 * searchable metadata and independently checked properties. Pure data
 * plus pure validation: no React, no DOM, no network — remote content
 * is never fetched. Human-readable prose was rewritten in the S8.17
 * clean-room pass; stable ids, formulas, checks, and numeric properties
 * were retained. The optional attribution field records a verified
 * external source when one exists; absence means no source is recorded,
 * not proof of originality. See docs/PROVENANCE.md.
 */

export type LearnCategory =
  | 'lines-quadratics'
  | 'polynomials'
  | 'rational'
  | 'modulus'
  | 'exp-log'
  | 'trigonometry'
  | 'conics'
  | 'piecewise'
  | 'polar-parametric'
  | 'calculus'

export const LEARN_CATEGORIES: Array<{ id: LearnCategory; label: string }> = [
  { id: 'lines-quadratics', label: 'Lines and quadratics' },
  { id: 'polynomials', label: 'Cubic and higher polynomials' },
  { id: 'rational', label: 'Reciprocal and rational functions' },
  { id: 'modulus', label: 'Absolute value, signum, floor' },
  { id: 'exp-log', label: 'Exponential and logarithmic' },
  { id: 'trigonometry', label: 'Trigonometric and inverse trigonometric' },
  { id: 'conics', label: 'Circles and conics' },
  { id: 'piecewise', label: 'Piecewise functions' },
  { id: 'polar-parametric', label: 'Polar and parametric' },
  { id: 'calculus', label: 'Calculus: tangents, extrema, area' },
]

export type LearnLevel = 'foundation' | 'school' | 'competition' | 'college'

export const LEARN_LEVELS: Array<{ id: LearnLevel; label: string }> = [
  { id: 'foundation', label: 'Foundation' },
  { id: 'school', label: 'School' },
  { id: 'competition', label: 'Competition' },
  { id: 'college', label: 'College' },
]

export type LearnRowKind = 'cartesian' | 'parametric' | 'polar' | 'implicit' | 'inequality'

export interface LearnCartesianSpec {
  readonly kind: 'cartesian'
  readonly source: string
  readonly domain?: { min: number; max: number } | null
  readonly branches?: RowBranch[] | null
  readonly defaultSource?: string
}

export interface LearnParametricSpec {
  readonly kind: 'parametric'
  readonly xSource: string
  readonly ySource: string
  readonly tMin: number
  readonly tMax: number
}

export interface LearnPolarSpec {
  readonly kind: 'polar'
  readonly source: string
  readonly thetaMin: number
  readonly thetaMax: number
}

export interface LearnImplicitSpec {
  readonly kind: 'implicit'
  readonly leftSource: string
  readonly rightSource: string
}

export interface LearnInequalitySpec {
  readonly kind: 'inequality'
  readonly leftSource: string
  readonly op: '<=' | '>=' | '<' | '>'
  readonly rightSource: string
}

export type LearnRowSpec = LearnCartesianSpec | LearnParametricSpec | LearnPolarSpec | LearnImplicitSpec | LearnInequalitySpec

/** Independently checked anchor values: evaluated in tests, never trusted from prose. */
export interface LearnCheck {
  /** Cartesian x (scalar rows) or parameter t/θ (point rows). */
  readonly at: number
  readonly x: number
  readonly y: number
}

export type LearnAnnotationKind =
  | 'intercept'
  | 'root'
  | 'vertex'
  | 'extremum'
  | 'asymptote'
  | 'symmetry'
  | 'domain'
  | 'range'
  | 'tangent'
  | 'parameter'

export type LearnBasis = 'exact' | 'numerical' | 'heuristic'

export interface LearnAnnotation {
  readonly kind: LearnAnnotationKind
  /** Which template row the annotation belongs to (default 0). */
  readonly row?: number
  /** Display label, e.g. "Root x ≈ 2". Approximation markers (≈) required for non-exact bases. */
  readonly label: string
  /** How the claim is justified (see docs/learn/ANALYSES.md). */
  readonly basis: LearnBasis
  /** World point for markers (roots sit on y = 0 by definition). */
  readonly point?: { x: number; y: number }
  /** One-sentence justification shown beside the annotation. */
  readonly detail: string
  /** Asymptote probe: |f(x)| must exceed minAbs (growth check). */
  readonly probe?: { x: number; minAbs: number }
  /** Symmetry probe: f(−probeX) compared against ±f(probeX). */
  readonly symmetry?: { kind: 'even' | 'odd'; probeX: number }
}

/** A known transformation with its original function and honest semantics. */
export interface LearnTransform {
  /** Original source (same row kind and variables as the template row). */
  readonly baseSource: string
  /** "What changed?" note with correct sign conventions. */
  readonly note: string
}

export type LearnTrend = 'increasing' | 'decreasing' | 'constant'

export interface LearnMonotonic {
  /** Null means −∞. */
  readonly lo: number | null
  /** Null means +∞. */
  readonly hi: number | null
  readonly trend: LearnTrend
}

export interface LearnTurning {
  readonly x: number
  readonly y: number
  readonly kind: 'max' | 'min'
}

/**
 * Displayed properties for (currently cartesian) rows: authored
 * domain/range/continuity wording plus machine-checked monotonicity,
 * turning points, and period/amplitude. Absent fields mean "not
 * applicable or not established" — never an empty value. Turning
 * points evaluate exactly; intervals are sampled densely;
 * period/amplitude are probed; see ANALYSES.md.
 */
export interface LearnProperties {
  readonly row?: number
  readonly domainText?: string
  readonly rangeText?: string
  readonly monotonicity?: LearnMonotonic[];
  readonly turningPoints?: LearnTurning[];
  readonly period?: number
  readonly amplitude?: number
  readonly continuity?: string
}

export interface LearnTemplate {
  readonly id: string
  readonly title: string
  readonly category: LearnCategory
  readonly levels: LearnLevel[]
  readonly description: string
  readonly objective: string
  /** Anchor values checked by tests (tolerance 1e-6 unless stated). */
  readonly checks: LearnCheck[]
  /** Rows that open as editable copies; ids are assigned fresh on open. */
  readonly rows: LearnRowSpec[]
  readonly viewport: WorldRect
  /** Pedagogical simplifications, stated (e.g. signum convention at 0). */
  readonly simplifications?: string
  /** Required when derived from external material; omission records no external source, not originality. */
  readonly attribution?: string
  /** Curated feature annotations (verified per ANALYSES.md). */
  readonly annotations?: LearnAnnotation[]
  /** Known transformation vs its original (compare toggle + sign-convention tests). */
  readonly transform?: LearnTransform
  /** Displayed mathematical properties (verified per ANALYSES.md; absent = not applicable). */
  readonly properties?: LearnProperties
}

export interface LearnSearch {
  query: string
  category: LearnCategory | 'all'
  level: LearnLevel | 'all'
  kind: LearnRowKind | 'all'
}

/** Row kinds used by a template (for kind filtering). */
export function templateKinds(template: LearnTemplate): LearnRowKind[] {
  return [...new Set(template.rows.map((row) => row.kind))]
}

/** Builder used by the graph workspace to insert an opened template row. */
export type RowBuilder = (colorIndex: number) => ExpressionRow

/** Build a live editable row from a spec (fresh id every call — the template is never handed out). */
export function buildRowFromSpec(spec: LearnRowSpec, colorIndex: number): ExpressionRow {
  const id = createExpressionId()
  switch (spec.kind) {
    case 'cartesian':
      return {
        kind: 'cartesian',
        id,
        source: spec.source,
        visible: true,
        colorIndex,
        label: '',
        domain: spec.domain === undefined || spec.domain === null ? null : { ...spec.domain },
        branches: spec.branches === undefined || spec.branches === null ? null : spec.branches.map((branch) => ({ ...branch })),
        defaultSource: spec.defaultSource ?? '',
      }
    case 'parametric':
      return { kind: 'parametric', id, xSource: spec.xSource, ySource: spec.ySource, tMin: spec.tMin, tMax: spec.tMax, visible: true, colorIndex, label: '' }
    case 'polar':
      return { kind: 'polar', id, source: spec.source, thetaMin: spec.thetaMin, thetaMax: spec.thetaMax, visible: true, colorIndex, label: '' }
    case 'implicit':
      return { kind: 'implicit', id, leftSource: spec.leftSource, rightSource: spec.rightSource, visible: true, colorIndex, label: '' }
    case 'inequality':
      return { kind: 'inequality', id, leftSource: spec.leftSource, op: spec.op, rightSource: spec.rightSource, visible: true, colorIndex, label: '' }
  }
}

function matchesQuery(template: LearnTemplate, query: string): boolean {
  const text = query.trim().toLowerCase()
  if (text === '') {
    return true
  }
  const properties = template.properties === undefined ? '' : [
    template.properties.domainText ?? '',
    template.properties.rangeText ?? '',
    template.properties.continuity ?? '',
    ...(template.properties.monotonicity ?? []).map((m) => m.trend),
    ...(template.properties.turningPoints ?? []).map((t) => t.kind),
    ...(template.properties.period === undefined ? [] : ['period', String(template.properties.period)]),
    ...(template.properties.amplitude === undefined ? [] : ['amplitude', String(template.properties.amplitude)]),
  ].join(' ')
  const haystack = `${template.title} ${template.description} ${template.objective} ${properties} ${template.rows
    .map((row) => (row.kind === 'cartesian' ? row.source : row.kind === 'parametric' ? `${row.xSource} ${row.ySource}` : row.kind === 'polar' ? row.source : `${row.leftSource} ${row.rightSource}`))
    .join(' ')}`.toLowerCase()
  return text
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word))
}

/** Filter without mutating the library; all filters combine (AND). */
export function searchTemplates(templates: LearnTemplate[], search: LearnSearch): LearnTemplate[] {
  return templates.filter(
    (template) =>
      matchesQuery(template, search.query) &&
      (search.category === 'all' || template.category === search.category) &&
      (search.level === 'all' || template.levels.includes(search.level)) &&
      (search.kind === 'all' || templateKinds(template).includes(search.kind)),
  )
}

function isFiniteRange(min: unknown, max: unknown): boolean {
  return typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && max > min
}

/** Structural + compilability validation for one template (tests assert every template passes). */
export function validateTemplate(template: LearnTemplate): string[] {
  const problems: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(template.id) || template.id.length > 48) {
    problems.push(`id "${template.id}" must be lowercase-hyphenated, ≤ 48 chars.`)
  }
  if (template.title.trim() === '' || template.title.length > 80) {
    problems.push(`title must be 1–80 characters.`)
  }
  if (!LEARN_CATEGORIES.some((entry) => entry.id === template.category)) {
    problems.push(`unknown category "${template.category}".`)
  }
  if (template.levels.length === 0 || !template.levels.every((level) => LEARN_LEVELS.some((entry) => entry.id === level))) {
    problems.push(`levels must list at least one known level.`)
  }
  if (template.description.trim() === '' || template.objective.trim() === '') {
    problems.push(`description and objective are required.`)
  }
  if (template.rows.length < 1 || template.rows.length > 4) {
    problems.push(`rows must list 1–4 graph rows.`)
  }
  const world = template.viewport
  if (!isFiniteRange(world.xMin, world.xMax) || !isFiniteRange(world.yMin, world.yMax)) {
    problems.push(`viewport needs finite ranges with max above min.`)
  } else if (Math.max(Math.abs(world.xMin), Math.abs(world.xMax), Math.abs(world.yMin), Math.abs(world.yMax)) > 1e12) {
    problems.push(`viewport exceeds the ±1e12 view fence.`)
  }
  const sources: Array<{ source: string; variables: string[] }> = []
  for (const row of template.rows) {
    if (row.kind === 'cartesian') {
      sources.push({ source: row.source, variables: ['x'] })
      if (row.domain !== undefined && row.domain !== null && !isFiniteRange(row.domain.min, row.domain.max)) {
        problems.push(`cartesian domain needs finite min below max.`)
      }
      for (const branch of row.branches ?? []) {
        sources.push({ source: branch.source, variables: ['x'] })
        if (!['lt', 'le', 'gt', 'ge'].includes(branch.op) || !Number.isFinite(branch.value)) {
          problems.push(`branch conditions need a known operator and finite value.`)
        }
      }
      if (row.branches !== undefined && row.branches !== null && (row.defaultSource ?? '') === '') {
        problems.push(`branched rows need a default source.`)
      }
    } else if (row.kind === 'parametric') {
      sources.push({ source: row.xSource, variables: ['t'] }, { source: row.ySource, variables: ['t'] })
      if (!isFiniteRange(row.tMin, row.tMax)) {
        problems.push(`parametric range needs finite min below max.`)
      }
    } else if (row.kind === 'polar') {
      sources.push({ source: row.source, variables: ['theta'] })
      if (!isFiniteRange(row.thetaMin, row.thetaMax)) {
        problems.push(`polar range needs finite min below max.`)
      }
    } else {
      sources.push({ source: row.leftSource, variables: ['x', 'y'] }, { source: row.rightSource, variables: ['x', 'y'] })
    }
  }
  for (const { source, variables } of sources) {
    const compiled = compileExpression(source, { variables })
    if (!compiled.ok) {
      problems.push(`source rejected by the engine: "${source}" (${compiled.error.message})`)
    }
  }
  const kinds = ['intercept', 'root', 'vertex', 'extremum', 'asymptote', 'symmetry', 'domain', 'range', 'tangent', 'parameter']
  for (const annotation of template.annotations ?? []) {
    if (!kinds.includes(annotation.kind)) {
      problems.push(`unknown annotation kind "${annotation.kind}".`)
    }
    if (!['exact', 'numerical', 'heuristic'].includes(annotation.basis)) {
      problems.push(`unknown annotation basis "${annotation.basis}".`)
    }
    if (annotation.label.trim() === '' || annotation.detail.trim() === '') {
      problems.push(`annotations need a label and a detail.`)
    }
    const rowIndex = annotation.row ?? 0
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= template.rows.length) {
      problems.push(`annotation row ${String(annotation.row)} is outside the template rows.`)
    }
    if (annotation.basis !== 'exact' && !annotation.label.includes('≈') && annotation.point !== undefined) {
      problems.push(`non-exact point annotation "${annotation.label}" must carry an ≈ marker.`)
    }
    if (annotation.kind === 'asymptote' && (annotation.probe === undefined || !(annotation.probe.minAbs > 0))) {
      problems.push(`asymptote annotations need a growth probe with minAbs > 0.`)
    }
    if (annotation.kind === 'symmetry' && annotation.symmetry === undefined) {
      problems.push(`symmetry annotations need a kind and probeX.`)
    }
  }
  if (template.transform !== undefined) {
    if (template.rows[0]?.kind !== 'cartesian') {
      problems.push(`transform compare currently supports cartesian first rows only.`)
    } else if (template.transform.baseSource.trim() === '' || template.transform.note.trim() === '') {
      problems.push(`transform needs a base source and a note.`)
    } else {
      const compiled = compileExpression(template.transform.baseSource, { variables: ['x'] })
      if (!compiled.ok) {
        problems.push(`transform base rejected: "${template.transform.baseSource}" (${compiled.error.message})`)
      }
    }
  }
  const properties = template.properties
  if (properties !== undefined) {
    const rowIndex = properties.row ?? 0
    const target = template.rows[rowIndex]
    if (target === undefined || target.kind !== 'cartesian') {
      problems.push(`properties currently describe cartesian rows only.`)
    }
    if (properties.domainText !== undefined && properties.domainText.trim() === '') {
      problems.push(`domain text must not be blank.`)
    }
    if (properties.rangeText !== undefined && properties.rangeText.trim() === '') {
      problems.push(`range text must not be blank.`)
    }
    for (const interval of properties.monotonicity ?? []) {
      if (!['increasing', 'decreasing', 'constant'].includes(interval.trend)) {
        problems.push(`unknown trend "${interval.trend}".`)
      }
      if (interval.lo !== null && interval.hi !== null && !(interval.hi > interval.lo)) {
        problems.push(`monotonic interval needs lo below hi.`)
      }
      if ((interval.lo !== null && !Number.isFinite(interval.lo)) || (interval.hi !== null && !Number.isFinite(interval.hi))) {
        problems.push(`monotonic bounds must be finite or null.`)
      }
    }
    for (const point of properties.turningPoints ?? []) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || (point.kind !== 'max' && point.kind !== 'min')) {
        problems.push(`turning points need finite coords and a max/min kind.`)
      }
    }
    if (properties.period !== undefined && (!Number.isFinite(properties.period) || properties.period <= 0)) {
      problems.push(`period must be a positive finite number.`)
    }
    if (properties.amplitude !== undefined && (!Number.isFinite(properties.amplitude) || properties.amplitude < 0)) {
      problems.push(`amplitude must be a finite non-negative number.`)
    }
    if (properties.continuity !== undefined && properties.continuity.trim() === '') {
      problems.push(`continuity note must not be blank.`)
    }
  }
  return problems
}

/** Library-wide validation: every template valid, ids unique. */
export function validateLibrary(templates: LearnTemplate[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const template of templates) {
    if (seen.has(template.id)) {
      problems.push(`duplicate template id "${template.id}".`)
    }
    seen.add(template.id)
    for (const problem of validateTemplate(template)) {
      problems.push(`${template.id}: ${problem}`)
    }
  }
  return problems
}

export type CheckOutcome = { ok: true; checked: number } | { ok: false; message: string }

const CHECK_TOLERANCE = 1e-6

/**
 * Independently check a template's anchor values: each row is compiled
 * through the real pipeline and probed at the stated coordinates.
 * Cartesian probes read y at x; parametric/polar probes read (x, y) at
 * t/θ; implicit probes assert |left − right| ≈ 0 at (x, y).
 */
export function checkTemplate(template: LearnTemplate): CheckOutcome {
  if (template.checks.length === 0) {
    return { ok: false, message: `${template.id} declares no anchor checks.` }
  }
  if (template.checks.length !== template.rows.length) {
    return { ok: false, message: `${template.id} needs one anchor check per row.` }
  }
  for (let i = 0; i < template.rows.length; i += 1) {
    const spec = template.rows[i]
    const check = template.checks[i]
    if (spec === undefined || check === undefined) {
      return { ok: false, message: `${template.id} row ${i + 1} is missing its check.` }
    }
    const row = buildRowFromSpec(spec, 0)
    const compiled = compileRow(row)
    if (compiled.error !== null || compiled.evaluator === null || compiled.evaluatorKind === null) {
      return { ok: false, message: `${template.id} row ${i + 1} does not compile: ${compiled.error ?? 'unknown error'}.` }
    }
    if (spec.kind === 'cartesian' && compiled.evaluatorKind === 'scalar' && 'evaluate' in compiled.evaluator) {
      const result = compiled.evaluator.evaluate(check.at, {})
      if (result.kind !== 'value' || Math.abs(result.value - check.y) > CHECK_TOLERANCE) {
        return { ok: false, message: `${template.id} row ${i + 1}: f(${check.at}) expected ${check.y}.` }
      }
      continue
    }
    if ((spec.kind === 'parametric' || spec.kind === 'polar') && compiled.evaluatorKind === 'point' && 'evaluatePoint' in compiled.evaluator) {
      const point = compiled.evaluator.evaluatePoint(check.at, {})
      if (point === null || Math.abs(point.x - check.x) > CHECK_TOLERANCE || Math.abs(point.y - check.y) > CHECK_TOLERANCE) {
        return { ok: false, message: `${template.id} row ${i + 1}: point(${check.at}) expected (${check.x}, ${check.y}).` }
      }
      continue
    }
    if (spec.kind === 'implicit' && compiled.evaluatorKind === 'field' && 'evaluateField' in compiled.evaluator) {
      const field = compiled.evaluator.evaluateField(check.x, check.y, {})
      const residual = field === null ? Number.NaN : Math.abs(field.value)
      if (!Number.isFinite(residual) || residual > CHECK_TOLERANCE) {
        return { ok: false, message: `${template.id} row ${i + 1}: field(${check.x}, ${check.y}) is not on the curve.` }
      }
      continue
    }
    if (spec.kind === 'inequality' && compiled.evaluatorKind === 'field' && 'evaluateField' in compiled.evaluator) {
      const field = compiled.evaluator.evaluateField(check.x, check.y, {})
      const signed = field === null ? Number.NaN : field.value
      const satisfied = spec.op === '<=' || spec.op === '<' ? signed <= CHECK_TOLERANCE : signed >= -CHECK_TOLERANCE
      if (!Number.isFinite(signed) || !satisfied) {
        return { ok: false, message: `${template.id} row ${i + 1}: region point (${check.x}, ${check.y}) violates ${spec.op}.` }
      }
      continue
    }
    return { ok: false, message: `${template.id} row ${i + 1}: evaluator kind does not match the spec.` }
  }
  return { ok: true, checked: template.checks.length }
}

function evaluateCartesianAt(source: string, x: number): number | null {
  const compiled = compileExpression(source, { variables: ['x'] })
  if (!compiled.ok) {
    return null
  }
  const result = compiled.expression.evaluate(x, {})
  return result.kind === 'value' && Number.isFinite(result.value) ? result.value : null
}

/**
 * Verify curated annotations against the engine (tests run this per
 * template): point claims (intercept/root/vertex/extremum/tangent)
 * evaluate to their stated values; asymptotes show probed growth;
 * symmetry holds at the probe mirror. Domain/range/parameter entries
 * are human-reviewed wording — structural presence only, never
 * presented as computed.
 */
export function verifyAnnotations(template: LearnTemplate): CheckOutcome {
  for (const annotation of template.annotations ?? []) {
    const rowIndex = annotation.row ?? 0
    const spec = template.rows[rowIndex]
    const probeScalar = (x: number): number | null => {
      if (spec?.kind !== 'cartesian') {
        return null
      }
      const compiled = compileRow(buildRowFromSpec(spec, 0))
      if (compiled.evaluatorKind !== 'scalar' || compiled.evaluator === null || !('evaluate' in compiled.evaluator)) {
        return null
      }
      const result = compiled.evaluator.evaluate(x, {})
      return result.kind === 'value' && Number.isFinite(result.value) ? result.value : null
    };
    const probeImplicit = (x: number, y: number): boolean => {
      if (spec?.kind !== 'implicit') {
        return false
      }
      const compiled = compileRow(buildRowFromSpec(spec, 0))
      if (compiled.evaluatorKind !== 'field' || compiled.evaluator === null || !('evaluateField' in compiled.evaluator)) {
        return false
      }
      const field = compiled.evaluator.evaluateField(x, y, {})
      return field !== null && Number.isFinite(field.value) && Math.abs(field.value) <= CHECK_TOLERANCE
    };
    if (annotation.point !== undefined) {
      if (!['intercept', 'root', 'vertex', 'extremum', 'tangent'].includes(annotation.kind)) {
        return { ok: false, message: `${template.id} annotation "${annotation.label}" cannot carry a point for its kind.` }
      }
      if (spec?.kind === 'implicit') {
        if (!probeImplicit(annotation.point.x, annotation.point.y)) {
          return { ok: false, message: `${template.id} annotation "${annotation.label}" is not on the curve.` }
        }
        continue
      }
      const value = probeScalar(annotation.point.x)
      if (value === null || Math.abs(value - annotation.point.y) > CHECK_TOLERANCE) {
        return { ok: false, message: `${template.id} annotation "${annotation.label}" does not evaluate.` }
      }
      continue
    }
    if (annotation.kind === 'asymptote' && annotation.probe !== undefined && spec?.kind === 'cartesian') {
      const value = probeScalar(annotation.probe.x)
      if (value === null || Math.abs(value) < annotation.probe.minAbs) {
        return { ok: false, message: `${template.id} asymptote probe at x=${annotation.probe.x} shows no growth.` }
      }
      continue
    }
    if (annotation.kind === 'symmetry' && annotation.symmetry !== undefined && spec?.kind === 'cartesian') {
      const left = probeScalar(-annotation.symmetry.probeX)
      const right = probeScalar(annotation.symmetry.probeX)
      if (left === null || right === null) {
        return { ok: false, message: `${template.id} symmetry probe is undefined at ±${annotation.symmetry.probeX}.` }
      }
      const mirrored = annotation.symmetry.kind === 'even' ? right : -right
      if (Math.abs(left - mirrored) > CHECK_TOLERANCE) {
        return { ok: false, message: `${template.id} is not ${annotation.symmetry.kind} at ±${annotation.symmetry.probeX}.` }
      }
      continue
    }
    if (['domain', 'range', 'parameter'].includes(annotation.kind)) {
      continue
    }
    return { ok: false, message: `${template.id} annotation "${annotation.label}" is not verifiable for its kind.` }
  }
  return { ok: true, checked: template.annotations?.length ?? 0 }
}

/**
 * Check a transform relation numerically: transformed(x) must equal
 * base(shifted-input) at probe points. Callers state the mapping
 * (e.g. shift right by h: transformed(x) = base(x − h)).
 */
export function checkTransformRelation(baseSource: string, transformedSource: string, probes: Array<{ x: number; baseX: number }>): CheckOutcome {
  for (const probe of probes) {
    const base = evaluateCartesianAt(baseSource, probe.baseX)
    const transformed = evaluateCartesianAt(transformedSource, probe.x)
    if (base === null || transformed === null || Math.abs(base - transformed) > CHECK_TOLERANCE) {
      return { ok: false, message: `transform breaks at x=${probe.x} (base at ${probe.baseX}).` }
    }
  }
  return { ok: true, checked: probes.length }
}

const SUPERSCRIPTS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/**
 * Readable display for engine syntax (display only — never reparsed):
 * `x^2` → x², `*` → ·, hyphen → −. Anything else passes through
 * unchanged, so unknown syntax degrades to source text, not garbage.
 */
export function formatMath(source: string): string {
  return source
    .replace(/\^(\d+)/g, (_, digits: string) => [...digits].map((digit) => SUPERSCRIPTS[digit] ?? digit).join(''))
    .replace(/\*/g, '·')
    .replace(/-/g, '−')
}

/** Short bound display: integers exact, others to 4 significant decimals. */
export function formatBound(value: number | null): string {
  if (value === null) {
    return '∞'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(parseFloat(value.toPrecision(4)))
}

/** Interval display with −∞ for null lower bounds. */
export function formatInterval(lo: number | null, hi: number | null): string {
  return `(${lo === null ? '−∞' : formatBound(lo)}, ${hi === null ? '∞' : formatBound(hi)})`
}

function probeRowScalar(template: LearnTemplate, rowIndex: number, x: number): number | null {
  const spec = template.rows[rowIndex]
  if (spec?.kind !== 'cartesian') {
    return null
  }
  const compiled = compileRow(buildRowFromSpec(spec, 0))
  if (compiled.evaluatorKind !== 'scalar' || compiled.evaluator === null || !('evaluate' in compiled.evaluator)) {
    return null
  }
  const result = compiled.evaluator.evaluate(x, {})
  return result.kind === 'value' && Number.isFinite(result.value) ? result.value : null
}

/**
 * Verify displayed properties: turning points evaluate exactly,
 * monotonicity holds densely across each interval (strict trend with
 * 1e-9 separation — flat or noisy intervals fail loudly), period
 * reproduces values at three anchors while a half-period probe proves
 * non-degeneracy, and amplitude matches the sampled maximum within
 * 0.01. Templates without properties pass vacuously (absent means
 * not applicable, never an empty claim).
 */
export function verifyProperties(template: LearnTemplate): CheckOutcome {
  const properties = template.properties
  if (properties === undefined) {
    return { ok: true, checked: 0 }
  }
  const rowIndex = properties.row ?? 0
  let checked = 0
  for (const point of properties.turningPoints ?? []) {
    const value = probeRowScalar(template, rowIndex, point.x)
    if (value === null || Math.abs(value - point.y) > CHECK_TOLERANCE) {
      return { ok: false, message: `${template.id} turning point (${point.x}, ${point.y}) does not evaluate.` }
    }
    checked += 1
  }
  for (const interval of properties.monotonicity ?? []) {
    // Probe a window strictly inside the interval: the full span when
    // both ends are finite, a 2-unit window at the finite end for rays,
    // and [−1, 1] for whole-line claims. Endpoints are never probed —
    // derivatives legitimately vanish at vertices and inflection flats.
    let a: number
    let b: number
    if (interval.lo === null && interval.hi === null) {
      a = -1
      b = 1
    } else if (interval.lo === null && interval.hi !== null) {
      a = interval.hi - 2
      b = interval.hi
    } else if (interval.lo !== null && interval.hi === null) {
      a = interval.lo
      b = interval.lo + 2
    } else if (interval.lo !== null && interval.hi !== null) {
      a = interval.lo
      b = interval.hi
    } else {
      return { ok: false, message: `${template.id} monotonic interval is degenerate.` }
    }
    if (!(b > a)) {
      return { ok: false, message: `${template.id} monotonic interval is degenerate.` }
    }
    let previous: number | null = null
    for (let i = 1; i <= 8; i += 1) {
      const x = a + ((b - a) * i) / 9
      const value = probeRowScalar(template, rowIndex, x)
      if (value === null) {
        return { ok: false, message: `${template.id} is undefined inside a claimed ${interval.trend} interval.` }
      }
      if (previous !== null) {
        const delta = value - previous
        const okTrend = interval.trend === 'increasing' ? delta > 1e-9 : interval.trend === 'decreasing' ? delta < -1e-9 : Math.abs(delta) <= 1e-9
        if (!okTrend) {
          return { ok: false, message: `${template.id} is not ${interval.trend} on (${a}, ${b}).` }
        }
      }
      previous = value
    }
    checked += 1
  }
  if (properties.period !== undefined) {
    const period = properties.period
    for (const anchor of [0.3, 1.1, 2.7]) {
      const base = probeRowScalar(template, rowIndex, anchor)
      const shifted = probeRowScalar(template, rowIndex, anchor + period)
      if (base === null || shifted === null || Math.abs(base - shifted) > 1e-6) {
        return { ok: false, message: `${template.id} period ${period} does not reproduce values.` }
      }
    }
    const half = probeRowScalar(template, rowIndex, 0.3 + period / 2)
    const whole = probeRowScalar(template, rowIndex, 0.3)
    if (half === null || whole === null || Math.abs(half - whole) <= 1e-3) {
      return { ok: false, message: `${template.id} period ${period} looks degenerate (half-period matches).` }
    }
    checked += 1
  }
  if (properties.amplitude !== undefined) {
    const period = properties.period ?? 6.283185307179586
    let peak = 0
    for (let i = 0; i < 64; i += 1) {
      const value = probeRowScalar(template, rowIndex, (period * i) / 64)
      if (value === null) {
        return { ok: false, message: `${template.id} amplitude probe is undefined.` }
      }
      peak = Math.max(peak, Math.abs(value))
    }
    if (Math.abs(peak - properties.amplitude) > 0.01) {
      return { ok: false, message: `${template.id} amplitude ${properties.amplitude} mismatches sampled peak ${peak}.` }
    }
    checked += 1
  }
  return { ok: true, checked }
}
