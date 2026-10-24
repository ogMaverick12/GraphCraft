import { describe, expect, it } from 'vitest'
import { calculate } from './evaluate.ts'

describe('acceptance hostile probes', () => {
  it('refuses every hostile or out-of-grammar input without a value', () => {
    const hostile = [
      'constructor',
      '__proto__',
      'process.exit(1)',
      'fetch("x")',
      'while(true){}',
      '[1,2].map(x=>x)',
      '2**3',
      'sin=5',
      'x=2',
      'import("fs")',
      '2==2',
      'true',
      'null',
      'a=1',
      'sin(x',
      'window.x',
      'globalThis',
      '2;3',
      'sin[0]',
      'a?b:c',
    ]
    for (const text of hostile) {
      const outcome = calculate(text, 'radians')
      expect(outcome.status, text).not.toBe('value')
    }
  })
})
