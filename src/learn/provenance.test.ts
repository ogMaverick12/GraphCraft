import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRACTICE_ITEMS } from './practice.ts'
import { LEARN_TEMPLATES } from './templates.ts'
import { LEARN_TOPICS } from './topics.ts'

const read = (relativePath: string): string => readFileSync(join(process.cwd(), relativePath), 'utf8')

const TEMPLATE_IDS = [
  'line-slope-intercept',
  'parabola-vertex',
  'line-through-origin',
  'line-point-slope',
  'line-intercept-form',
  'quadratic-factored',
  'quadratic-vertex-form',
  'cubic-inflection',
  'cubic-two-turns',
  'quartic-w-shape',
  'reciprocal',
  'rational-asymptote',
  'rational-bounded-bell',
  'absolute-value',
  'signum-step',
  'floor-staircase',
  'abs-shifted-scaled',
  'abs-reflected',
  'exponential-growth',
  'exponential-decay',
  'exponential-shifted',
  'natural-log',
  'common-log',
  'sine-wave',
  'cosine-wave',
  'tangent-poles',
  'arcsine',
  'arctangent',
  'unit-circle',
  'hyperbola-branches',
  'ellipse-parametric',
  'parabola-focus',
  'heaviside-step',
  'split-power-branches',
  'rose-four-petals',
  'cardioid',
  'parametric-parabola',
  'parabola-tangent-line',
  'sine-area-segment',
  'shift-right-parabola',
  'horizontal-scale-sine',
  'reflect-cubic',
] as const

const TOPIC_IDS = [
  'linear-functions',
  'trigonometric-graphs',
  'quadratics',
  'asymptotes-rational',
  'corners-steps',
  'exponentials-logarithms',
  'polynomial-behaviour',
  'inverse-trigonometry',
  'conic-sections',
  'piecewise-models',
  'polar-parametric-curves',
  'calculus-graphs',
] as const

const PRACTICE_IDS = [
  'predict-shift-right',
  'predict-reflect',
  'predict-frequency',
  'identify-quadratic-roots',
  'identify-exp-intercept',
  'match-unit-circle',
  'match-even-corner',
  'explore-rose-coefficient',
] as const

describe('S8.17 provenance remediation', () => {
  it('retains every stable Learn id and count', () => {
    expect(LEARN_TEMPLATES.map((template) => template.id)).toEqual([...TEMPLATE_IDS])
    expect(LEARN_TOPICS.map((topic) => topic.id)).toEqual([...TOPIC_IDS])
    expect(PRACTICE_ITEMS.map((item) => item.id)).toEqual([...PRACTICE_IDS])
    expect(new Set(LEARN_TEMPLATES.map((template) => template.title)).size).toBe(LEARN_TEMPLATES.length)
  })

  it('keeps human-readable prose free of external content URLs', () => {
    const prose = [
      ...LEARN_TEMPLATES.flatMap((template) => [
        template.title,
        template.description,
        template.objective,
        template.simplifications ?? '',
        template.transform?.note ?? '',
        template.properties?.domainText ?? '',
        template.properties?.rangeText ?? '',
        template.properties?.continuity ?? '',
        ...(template.annotations ?? []).flatMap((annotation) => [annotation.label, annotation.detail]),
      ]),
      ...LEARN_TOPICS.map((topic) => topic.summary),
      ...PRACTICE_ITEMS.flatMap((item) => [
        item.prompt,
        item.solution,
        item.explanation,
        ...(item.options ?? []),
      ]),
    ]
    for (const text of prose) {
      expect(text).not.toMatch(/https?:\/\//i)
    }
  })

  it('removes the old originality assertions from Learn source comments', () => {
    for (const path of ['src/learn/templates.ts', 'src/learn/topics.ts', 'src/learn/practice.ts', 'src/learn/library.ts']) {
      expect(read(path)).not.toContain('GraphCraft-original')
    }
  })

  it('ships a distinct GraphCraft favicon and preserves its asset references', () => {
    const favicon = read('public/favicon.svg')
    expect(favicon).toContain('viewBox="0 0 64 64"')
    expect(favicon).toContain('<path')
    expect(favicon).toContain('<circle')
    expect(favicon).not.toMatch(/<filter|<mask|<ellipse|<linearGradient|<radialGradient/i)
    expect(favicon).not.toMatch(/#863bff|#7e14ff|#47bfff|#ede6ff/i)
    expect(favicon).not.toContain('M25.946 44.938')
    expect(favicon).not.toContain('M25.842 44.938')

    const manifest = JSON.parse(read('public/manifest.webmanifest')) as { icons?: Array<{ src?: string }> }
    expect(manifest.icons?.some((icon) => icon.src === 'favicon.svg')).toBe(true)
    expect(read('index.html')).toContain('/favicon.svg')
    expect(read('public/sw.js')).toContain('/favicon.svg')
  })

  it('links the provenance record from notices and preserves the uncertainty statement', () => {
    const provenance = read('docs/PROVENANCE.md')
    const notices = read('THIRD_PARTY_NOTICES.md')
    expect(provenance).toContain('project owner has not independently attested')
    expect(provenance).toContain('E4FF4661C7879655E751EFC5F5A3D1FAE38CB8D5D067EF1894E8124E61A94ADC')
    expect(provenance).toContain('61BC9A161DE58248288E6905425D7180F0624C2865007B97D763FDAC12043A66')
    expect(notices).toContain('docs/PROVENANCE.md')
    expect(notices).not.toContain('The application favicon and Learn templates are project-authored')
  })
})
