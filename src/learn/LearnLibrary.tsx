import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { PracticeMode } from './PracticeMode.tsx'
import { compileRow } from '../expressions/compile.ts'
import { compileExpression } from '../math/index.ts'
import { createTransform, worldToScreen, type WorldRect } from '../graph/coordinate.ts'
import { lightCurveHex } from '../graph/palette.ts'
import { sampleImplicit, sampleInequality } from '../sampling/implicit.ts'
import { sampleParametric } from '../sampling/parametric.ts'
import { sampleFunction } from '../sampling/index.ts'
import { loadBookmarks, saveBookmarks } from './bookmarks.ts'
import { buildRowFromSpec, formatBound, formatInterval, formatMath, LEARN_CATEGORIES, LEARN_LEVELS, searchTemplates, templateKinds, type LearnCategory, type LearnLevel, type LearnProperties, type LearnRowKind, type LearnTemplate, type RowBuilder } from './library.ts'
import { LEARN_TEMPLATES, markersFromTemplate, type TemplateMarker } from './templates.ts'
import { LEARN_TOPICS } from './topics.ts'
import { resolveLesson } from './curriculum.ts'

interface LearnLibraryProps {
  /** Add every template row as an editable copy without touching existing rows. */
  onOpenTemplate: (builds: RowBuilder[]) => void
  /** Apply the template's recommended viewport explicitly. */
  onApplyView: (world: WorldRect) => void
  /** Template whose annotations currently mark the graph (null when off). */
  activeAnnotationId: string | null
  /** Show or hide a template's root/extremum annotations on the graph. */
  onToggleAnnotations: (template: LearnTemplate, enabled: boolean) => void
  /** Open a transform template together with its original as two editable rows. */
  onCompareTemplate: (baseSource: string, builds: RowBuilder[]) => void
}

function rowBuilders(template: LearnTemplate): RowBuilder[] {
  return template.rows.map((spec) => (colorIndex: number) => buildRowFromSpec(spec, colorIndex))
}

const PREVIEW_SIZE = { width: 220, height: 140 }

/** Static miniature of the template through the real compile + sample pipeline. */
function TemplatePreview({ template, showMarkers, showBase }: { template: LearnTemplate; showMarkers: boolean; showBase: boolean }): React.JSX.Element {
  const { paths, marks } = useMemo(() => {
    const transform = createTransform(template.viewport, PREVIEW_SIZE, false)
    const runs: Array<{ d: string; color: string; dash: string }> = []
    const compileBase = template.transform !== undefined && showBase ? compileExpression(template.transform.baseSource, { variables: ['x'] }) : null
    if (compileBase !== null && compileBase.ok) {
      const basePoints: Array<{ x: number; y: number }> = []
      for (let i = 0; i <= 120; i += 1) {
        const x = template.viewport.xMin + ((template.viewport.xMax - template.viewport.xMin) * i) / 120
        const result = compileBase.expression.evaluate(x, {})
        if (result.kind === 'value' && Number.isFinite(result.value)) {
          basePoints.push({ x, y: result.value })
        }
      }
      const mapped = basePoints.flatMap((p) => {
        const s = worldToScreen(transform, p.x, p.y)
        return Number.isFinite(s.px) && Number.isFinite(s.py) ? [`${s.px.toFixed(1)},${s.py.toFixed(1)}`] : []
      })
      if (mapped.length >= 2) {
        runs.push({ d: `M${mapped.join('L')}`, color: '#8e8985', dash: '5 3' })
      }
    }
    template.rows.forEach((spec, index) => {
      const compiled = compileRow(buildRowFromSpec(spec, index))
      if (compiled.error !== null || compiled.evaluator === null || compiled.evaluatorKind === null) {
        return
      }
      const color = lightCurveHex(index)
      const toPath = (points: Array<{ x: number; y: number }>): string | null => {
        const mapped = points.flatMap((p) => {
          const s = worldToScreen(transform, p.x, p.y)
          return Number.isFinite(s.px) && Number.isFinite(s.py) ? [`${s.px.toFixed(1)},${s.py.toFixed(1)}`] : []
        })
        return mapped.length >= 2 ? `M${mapped.join('L')}` : null
      };
      if (compiled.evaluatorKind === 'scalar' && 'evaluate' in compiled.evaluator) {
        const sampled = sampleFunction(compiled.evaluator, { xMin: template.viewport.xMin, xMax: template.viewport.xMax, pixelWidth: PREVIEW_SIZE.width, breaks: compiled.breakpoints })
        for (const segment of sampled.segments) {
          const d = toPath(segment.points)
          if (d !== null) {
            runs.push({ d, color, dash: '' })
          }
        }
      } else if (compiled.evaluatorKind === 'point' && 'evaluatePoint' in compiled.evaluator) {
        const range = spec.kind === 'parametric' ? { xMin: spec.tMin, xMax: spec.tMax } : spec.kind === 'polar' ? { xMin: spec.thetaMin, xMax: spec.thetaMax } : null
        if (range !== null) {
          const sampled = sampleParametric(compiled.evaluator, { ...range, pixelWidth: PREVIEW_SIZE.width, breaks: [] })
          for (const segment of sampled.segments) {
            const d = toPath(segment.points)
            if (d !== null) {
              runs.push({ d, color, dash: '' })
            }
          }
        }
      } else if (compiled.evaluatorKind === 'field' && 'evaluateField' in compiled.evaluator) {
        const options = { xMin: template.viewport.xMin, xMax: template.viewport.xMax, yMin: template.viewport.yMin, yMax: template.viewport.yMax, pixelWidth: PREVIEW_SIZE.width, breaks: [] as number[] }
        const sampled = spec.kind === 'inequality' ? sampleInequality(compiled.evaluator, spec.op, options) : sampleImplicit(compiled.evaluator, options)
        for (const segment of sampled.segments) {
          const d = toPath(segment.points)
          if (d !== null) {
            runs.push({ d, color, dash: '' })
          }
        }
      }
    })
    const marks: Array<{ px: number; py: number; label: string }> = showMarkers
      ? markersFromTemplate(template).flatMap((marker: TemplateMarker) => {
          const s = worldToScreen(transform, marker.x, marker.y)
          return Number.isFinite(s.px) && Number.isFinite(s.py) ? [{ px: s.px, py: s.py, label: marker.label }] : []
        })
      : []
    return { paths: runs.slice(0, 12), marks }
  }, [template, showMarkers, showBase])

  if (paths.length === 0) {
    return <p className="text-xs text-muted">No curve preview — open the template to view it.</p>
  }
  return (
    <svg role="img" aria-label={`Preview of ${template.title}`} width={PREVIEW_SIZE.width} height={PREVIEW_SIZE.height} viewBox={`0 0 ${PREVIEW_SIZE.width} ${PREVIEW_SIZE.height}`} className="block rounded-md border border-line bg-white">
      {paths.map((run, i) => (
        <path key={i} d={run.d} fill="none" stroke={run.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" {...(run.dash === '' ? {} : { strokeDasharray: run.dash })} />
      ))}
      {marks.map((mark, i) => (
        <circle key={`m-${i}`} cx={mark.px} cy={mark.py} r={4.5} fill="none" stroke="#4f46e5" strokeWidth={1.75}>
          <title>{mark.label}</title>
        </circle>
      ))}
    </svg>
  )
}

function formulaOf(template: LearnTemplate): string {
  // Readable notation for learners (display only — opened rows keep engine syntax).
  return template.rows
    .map((row) => {
      switch (row.kind) {
        case 'cartesian':
          return `y = ${formatMath(row.source)}`
        case 'parametric':
          return `x = ${formatMath(row.xSource)}, y = ${formatMath(row.ySource)}`
        case 'polar':
          return `r = ${formatMath(row.source)}`
        case 'implicit':
          return `${formatMath(row.leftSource)} = ${formatMath(row.rightSource)}`
        case 'inequality':
          return `${formatMath(row.leftSource)} ${row.op} ${formatMath(row.rightSource)}`
      }
    })
    .join(' · ')
}

/** Verified property summary, present fields only (absent means not applicable — never an empty claim). */
function PropertySummary({ properties }: { properties: LearnProperties }): React.JSX.Element {
  const lines: string[] = []
  if (properties.domainText !== undefined) {
    lines.push(`Domain: ${properties.domainText}`)
  }
  if (properties.rangeText !== undefined) {
    lines.push(`Range: ${properties.rangeText}`)
  }
  for (const interval of properties.monotonicity ?? []) {
    lines.push(`${interval.trend === 'increasing' ? 'Increasing' : interval.trend === 'decreasing' ? 'Decreasing' : 'Constant'} on ${formatInterval(interval.lo, interval.hi)}`)
  }
  for (const point of properties.turningPoints ?? []) {
    lines.push(`${point.kind === 'max' ? 'Maximum' : 'Minimum'} at (${formatBound(point.x)}, ${formatBound(point.y)})`)
  }
  if (properties.period !== undefined) {
    lines.push(`Period ${formatBound(properties.period)}${properties.amplitude === undefined ? '' : `, amplitude ${formatBound(properties.amplitude)}`}`)
  }
  if (properties.continuity !== undefined) {
    lines.push(properties.continuity)
  }
  if (lines.length === 0) {
    return <></>
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="Verified properties">
      {lines.map((line, i) => (
        <li key={i} className="text-xs text-muted">
          <span className="font-semibold text-ink">Property: </span>
          {line}
        </li>
      ))}
    </ul>
  )
}

/**
 * Learn library (Stage 5 LEARN-01): searchable cards over curated
 * templates. Search and filter are pure functions over static data;
 * opening adds editable row copies (existing rows untouched); previews
 * render through the real sampler. Quiet list UI — no marketplace.
 */
export function LearnLibrary({ onOpenTemplate, onApplyView, activeAnnotationId, onToggleAnnotations, onCompareTemplate }: LearnLibraryProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<LearnCategory | 'all'>('all')
  const [level, setLevel] = useState<LearnLevel | 'all'>('all')
  const [kind, setKind] = useState<LearnRowKind | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<string[]>(() => loadBookmarks())
  const [notice, setNotice] = useState<string | null>(null)
  const [bookmarksOnly, setBookmarksOnly] = useState(false)
  const [topicId, setTopicId] = useState<string | 'all'>('all')
  const [previewMarkers, setPreviewMarkers] = useState(true)
  const [compareBase, setCompareBase] = useState(false)
  const [tab, setTab] = useState<'browse' | 'practice'>('browse')

  const lesson = useMemo(() => (topicId === 'all' ? null : resolveLesson(LEARN_TOPICS, LEARN_TEMPLATES, topicId)), [topicId])
  const topicTemplateIds = useMemo(() => (lesson === null ? null : new Set(lesson.templates.map((template) => template.id))), [lesson])

  const results = useMemo(
    () => {
      const found = searchTemplates(LEARN_TEMPLATES, { query, category, level, kind })
      const inTopic = topicTemplateIds === null ? found : found.filter((template) => topicTemplateIds.has(template.id))
      return bookmarksOnly ? inTopic.filter((template) => bookmarks.includes(template.id)) : inTopic
    },
    [query, category, level, kind, bookmarks, bookmarksOnly, topicTemplateIds],
  )

  function toggleBookmark(id: string): void {
    setNotice(null)
    setBookmarks((current) => {
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
      if (!saveBookmarks(next)) {
        setNotice('Bookmarks could not be saved in this browser; the library still works.')
      }
      return next
    })
  }

  function openTemplate(template: LearnTemplate): void {
    onOpenTemplate(rowBuilders(template))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex gap-1" role="group" aria-label="Learn section">
        {(['browse', 'practice'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tab === option}
            aria-label={`Learn ${option}`}
            onClick={() => setTab(option)}
            className={`gc-transition rounded-md border px-2.5 py-1 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === option ? 'border-accent bg-accent text-white dark:text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {tab === 'practice' ? (
        <PracticeMode onOpenTemplate={openTemplate} />
      ) : (
      <>
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">Learn — curated graph templates</h2>
        <p className="mt-1 text-xs text-muted">Original GraphCraft examples with checked properties. Opening adds editable copies to Graph Studio — your current graph is never overwritten.</p>
        <label className="mt-3 block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Collection (topic path)</span>
          <select
            aria-label="Browse by topic"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All templates</option>
            {LEARN_TOPICS.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>
        {lesson !== null && (
          <div className="mt-2 rounded-md border border-line bg-bg px-2 py-1.5 text-xs text-muted" data-testid="topic-banner">
            <p>
              <span className="font-semibold text-ink">{lesson.topic.title}: </span>
              {lesson.topic.summary}
            </p>
            {lesson.required.length > 0 && (
              <p className="mt-1">
                Start with:{' '}
                {lesson.required.map((required, i) => (
                  <span key={required.id}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      onClick={() => setTopicId(required.id)}
                      title={`Browse ${required.title}`}
                      className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {required.title}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Search</span>
            <input
              type="search"
              aria-label="Search templates"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. asymptote circle"
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Topic</span>
            <select
              aria-label="Filter by topic"
              value={category}
              onChange={(event) => setCategory(event.target.value as LearnCategory | 'all')}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All topics</option>
              {LEARN_CATEGORIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Level</span>
            <select
              aria-label="Filter by level"
              value={level}
              onChange={(event) => setLevel(event.target.value as LearnLevel | 'all')}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All levels</option>
              {LEARN_LEVELS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Graph type</span>
            <select
              aria-label="Filter by graph type"
              value={kind}
              onChange={(event) => setKind(event.target.value as LearnRowKind | 'all')}
              className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All types</option>
              <option value="cartesian">Cartesian</option>
              <option value="parametric">Parametric</option>
              <option value="polar">Polar</option>
              <option value="implicit">Implicit</option>
              <option value="inequality">Inequality</option>
            </select>
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" aria-label="Show bookmarked only" checked={bookmarksOnly} onChange={(event) => setBookmarksOnly(event.target.checked)} className="h-4 w-4 accent-accent" />
          Bookmarked only
        </label>
        {notice !== null && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {notice}
          </p>
        )}
      </div>

      <p className="text-xs text-muted" data-testid="learn-count">
        {results.length} template{results.length === 1 ? '' : 's'}
        {query.trim() !== '' || category !== 'all' || level !== 'all' || kind !== 'all' || bookmarksOnly || topicId !== 'all' ? ' match the current filters' : ' in the library'}.
      </p>

      <ul className="flex flex-col gap-2">
        {results.map((template) => {
          const expanded = expandedId === template.id
          const bookmarked = bookmarks.includes(template.id)
          return (
            <li key={template.id} className="rounded-md border border-line bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : template.id)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${template.title}`}
                  className="text-left font-mono text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {template.title}
                </button>
                <span className="text-xs text-muted">{templateKinds(template).join(', ')}</span>
                {template.levels.map((entry) => (
                  <span key={entry} className="rounded border border-line px-1 text-xs text-muted">
                    {entry}
                  </span>
                ))}
                <span className="ml-auto flex gap-1">
                  <Button
                    onClick={() => toggleBookmark(template.id)}
                    title={bookmarked ? `Remove ${template.title} bookmark` : `Bookmark ${template.title} locally`}
                    aria-label={bookmarked ? `★ Saved ${template.title}` : `☆ Save ${template.title}`}
                    aria-pressed={bookmarked}
                    variant="ghost"
                    className="px-2 py-0.5 text-xs"
                  >
                    {bookmarked ? '★ Saved' : '☆ Save'}
                  </Button>
                  <Button onClick={() => openTemplate(template)} title={`Open ${template.title} as editable copies in Graph Studio`} aria-label={`Open ${template.title}`} variant="ghost" className="px-2 py-0.5 text-xs">
                    Open
                  </Button>
                  {template.transform !== undefined && (
                    <Button
                      onClick={() => {
                        if (template.transform !== undefined) {
                          onCompareTemplate(template.transform.baseSource, rowBuilders(template))
                        }
                      }}
                      title={`Open ${template.title} together with its original as editable copies`}
                      aria-label={`Compare ${template.title} with original`}
                      variant="ghost"
                      className="px-2 py-0.5 text-xs"
                    >
                      Compare both
                    </Button>
                  )}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-ink-soft">{formulaOf(template)}</p>
              {expanded && (
                <div className="mt-2 flex flex-col gap-2">
                  <TemplatePreview template={template} showMarkers={previewMarkers} showBase={compareBase} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" aria-label="Show annotation markers on preview" checked={previewMarkers} onChange={(event) => setPreviewMarkers(event.target.checked)} className="h-4 w-4 accent-accent" />
                      Markers
                    </label>
                    {template.transform !== undefined && (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" aria-label="Compare with original function" checked={compareBase} onChange={(event) => setCompareBase(event.target.checked)} className="h-4 w-4 accent-accent" />
                        Compare original
                      </label>
                    )}
                    {(template.annotations?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => onToggleAnnotations(template, activeAnnotationId !== template.id)}
                        aria-pressed={activeAnnotationId === template.id}
                        title={activeAnnotationId === template.id ? 'Hide annotation markers on the graph' : 'Show root and extremum annotations on the graph'}
                        className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {activeAnnotationId === template.id ? 'Hide graph markers' : 'Show on graph'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted">{template.description}</p>
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink">Try this: </span>
                    {template.objective}
                  </p>
                  {template.transform !== undefined && (
                    <p className="text-xs text-muted">
                      <span className="font-semibold text-ink">What changed: </span>
                      {template.transform.note}
                    </p>
                  )}
                  {(template.annotations?.length ?? 0) > 0 && (
                    <ul className="flex flex-col gap-1" aria-label={`Annotations for ${template.title}`}>
                      {(template.annotations ?? []).map((annotation, i) => (
                        <li key={i} className="text-xs text-muted">
                          <span
                            title={annotation.basis === 'exact' ? 'Closed-form fact, checked by substitution' : annotation.basis === 'numerical' ? 'Produced by a numerical procedure' : 'Inferred pattern, probed at sample points'}
                            className="mr-1 rounded border border-line px-1 font-semibold uppercase"
                          >
                            {annotation.basis}
                          </span>
                          <span className="font-mono text-ink">{annotation.label}</span> — {annotation.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  {template.properties !== undefined && <PropertySummary properties={template.properties} />}
                  {template.simplifications !== undefined && <p className="text-xs text-warning">Simplification: {template.simplifications}</p>}
                  <p className="text-xs text-muted">
                    Recommended view x ∈ [{template.viewport.xMin}, {template.viewport.xMax}], y ∈ [{template.viewport.yMin}, {template.viewport.yMax}].{' '}
                    <button type="button" onClick={() => onApplyView({ ...template.viewport })} title="Apply the recommended viewport" className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Use recommended view
                    </button>
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {results.length === 0 && <p className="text-sm text-muted">No templates match. Clear a filter or try a shorter search.</p>}
      </>
      )}
    </div>
  )
}
