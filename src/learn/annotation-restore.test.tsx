import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

function projectWithAnnotation(templateId: string, title: string): string {
  return JSON.stringify({
    format: 'graphcraft-project',
    version: 6,
    title,
    expressions: [{ kind: 'cartesian', id: 'parabola', source: 'x^2-4', visible: true, colorIndex: 0, label: '', domain: null, branches: null, defaultSource: '' }],
    viewport: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, equalAspect: false, showGrid: true },
    parameters: [],
    dataLab: { datasets: [], analyses: {} },
    learnAnnotations: { templateId },
    surfaces3d: [],
    fields2d: [],
    scatters3d: [],
  })
}

describe('restored Learn annotations', () => {
  it('renders the project synchronously and resolves valid saved markers after code loads', async () => {
    window.localStorage.setItem('graphcraft-last-project', projectWithAnnotation('parabola-vertex', 'Restored annotations'))
    render(<App />)

    // initialRestore remains synchronous: rows and title exist before any
    // templates or helper chunk resolves.
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Restored annotations')
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2-4')

    expect(await screen.findByLabelText('root marker: Root x = 2', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByLabelText('root marker: Root x = −2')).toBeInTheDocument()
    expect(screen.getByLabelText('extremum marker: Vertex (0, −4)')).toBeInTheDocument()
  })

  it('checks an unknown saved id after template data loads, then clears it without dropping the project', async () => {
    window.localStorage.setItem('graphcraft-last-project', projectWithAnnotation('retired-template', 'Unknown annotation'))
    render(<App />)

    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Unknown annotation')
    await waitFor(
      () => {
        const saved = JSON.parse(window.localStorage.getItem('graphcraft-last-project') ?? '{}') as { learnAnnotations?: unknown }
        expect(saved.learnAnnotations).toBeUndefined()
      },
      { timeout: 5000 },
    )
    expect(screen.queryByLabelText(/root marker:/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Expression' })).toHaveValue('x^2-4')
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue('Unknown annotation')
  })
})
