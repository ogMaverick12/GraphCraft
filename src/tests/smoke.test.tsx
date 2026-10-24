import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from '../app/App.tsx'

describe('GraphCraft shell', () => {
  it('mounts the workspace regions with honest empty states', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'GraphCraft' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Expressions' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Graph viewport' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument()
    expect(screen.getByText(/No expressions yet/i)).toBeInTheDocument()
  })

  it('toggles the dark theme from the header control', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toggle = screen.getByRole('button', { name: /theme/i })
    await user.click(toggle)

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
