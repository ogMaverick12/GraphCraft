import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearnTemplateData } from './load-templates.ts'

const templateLoad = vi.hoisted(() => {
  interface Deferred {
    resolve: (data: LearnTemplateData) => void
    reject: (error: unknown) => void
  }
  const deferreds: Deferred[] = []
  let pending: Promise<LearnTemplateData> | null = null
  return {
    load(): Promise<LearnTemplateData> {
      if (pending === null) {
        pending = new Promise<LearnTemplateData>((resolve, reject) => {
          deferreds.push({ resolve, reject })
        }).catch((error: unknown) => {
          pending = null
          throw error
        })
      }
      return pending
    },
    resolveNext(data: LearnTemplateData): void {
      const deferred = deferreds.shift()
      if (deferred === undefined) {
        throw new Error('Expected a pending Learn template load')
      }
      deferred.resolve(data)
    },
    rejectNext(error: unknown): void {
      const deferred = deferreds.shift()
      if (deferred === undefined) {
        throw new Error('Expected a pending Learn template load')
      }
      deferred.reject(error)
    },
    reset(): void {
      pending = null
      deferreds.length = 0
    },
  }
})

vi.mock('./load-templates.ts', () => ({ loadLearnTemplates: templateLoad.load }))

import { LEARN_TEMPLATES, markersFromTemplate } from './templates.ts'
import { App } from '../app/App.tsx'

const TEMPLATE_DATA: LearnTemplateData = { templates: LEARN_TEMPLATES, markersFromTemplate }

function project(templateId: string, title: string, source: string): string {
  return JSON.stringify({
    format: 'graphcraft-project',
    version: 6,
    title,
    expressions: [{ kind: 'cartesian', id: `row-${title}`, source, visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }],
    viewport: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, equalAspect: false, showGrid: true },
    parameters: [],
    dataLab: { datasets: [], analyses: {} },
    learnAnnotations: { templateId },
    surfaces3d: [],
    fields2d: [],
    scatters3d: [],
  })
}

async function uploadProject(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected the hidden project-file input')
  }
  await user.upload(input, new File([text], 'project.graphcraft.json', { type: 'application/json' }))
}

function captureUnhandledRejections(): { reasons: unknown[]; stop: () => void } {
  const reasons: unknown[] = []
  const handler = (event: PromiseRejectionEvent): void => {
    reasons.push(event.reason)
    event.preventDefault()
  }
  window.addEventListener('unhandledrejection', handler)
  return { reasons, stop: () => window.removeEventListener('unhandledrejection', handler) }
}

describe('lazy Learn template data', () => {
  beforeEach(() => {
    templateLoad.reset()
  })

  it('never draws markers from a project replaced while template data is pending', async () => {
    const unhandled = captureUnhandledRejections()
    window.localStorage.setItem('graphcraft-last-project', project('parabola-vertex', 'Old project', 'x^2-4'))
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Old project')

    await uploadProject(user, project('sine-wave', 'New project', 'sin(x)'))
    expect(await screen.findByDisplayValue('New project')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('sin(x)')

    // The old annotation's request resolves only now; the active project's
    // sine annotation must be the only marker state applied.
    await act(async () => {
      templateLoad.resolveNext(TEMPLATE_DATA)
    })
    expect(await screen.findByLabelText('root marker: Root x = 0', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByLabelText('root marker: Root x = 2')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/extremum marker: Vertex/)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('New project')).toBeInTheDocument()
    expect(unhandled.reasons).toEqual([])
    unhandled.stop()
  })

  it('keeps saved work usable after a failed load and retries for a new annotation', async () => {
    const unhandled = captureUnhandledRejections()
    window.localStorage.setItem('graphcraft-last-project', project('parabola-vertex', 'Saved project', 'x^2-4'))
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Saved project')

    await act(async () => {
      templateLoad.rejectNext(new Error('offline'))
    })
    expect(await screen.findByText(/Learn annotations could not load/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2-4')
    expect(screen.getByDisplayValue('Saved project')).toBeInTheDocument()
    expect(screen.queryByLabelText(/root marker:/)).not.toBeInTheDocument()
    const saved = JSON.parse(window.localStorage.getItem('graphcraft-last-project') ?? '{}') as { learnAnnotations?: { templateId?: string } }
    expect(saved.learnAnnotations?.templateId).toBe('parabola-vertex')

    await uploadProject(user, project('sine-wave', 'Retry project', 'sin(x)'))
    expect(await screen.findByDisplayValue('Retry project')).toBeInTheDocument()
    await act(async () => {
      templateLoad.resolveNext(TEMPLATE_DATA)
    })
    expect(await screen.findByLabelText('root marker: Root x = 0', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText(/Learn annotations could not load/)).not.toBeInTheDocument()
    expect(unhandled.reasons).toEqual([])
    unhandled.stop()
  })
})
