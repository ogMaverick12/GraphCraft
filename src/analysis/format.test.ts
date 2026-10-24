import { describe, expect, it } from 'vitest'
import { formatSkippedPercent } from './format.ts'

describe('formatSkippedPercent', () => {
  it('omits exactly zero skipped fractions', () => {
    expect(formatSkippedPercent(0)).toBe(null)
  })

  it('labels positive fractions that would print as 0.0% as <0.1%', () => {
    expect(formatSkippedPercent(0.000244140625)).toBe('<0.1%')
    expect(formatSkippedPercent(0.00049)).toBe('<0.1%')
  })

  it('keeps the established one-decimal percent for ordinary fractions', () => {
    expect(formatSkippedPercent(0.33349609375)).toBe('33.3%')
    expect(formatSkippedPercent(0.5)).toBe('50.0%')
  })
})
