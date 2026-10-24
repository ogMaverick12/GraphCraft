import { useEffect, useMemo, useRef, useState } from 'react'
import { clampParameterValue, createParameter, validateParameter, type Parameter } from './model.ts'

export type { Parameter }

/**
 * Parameter store: ordered definitions plus live values. Actions read a
 * ref mirror and write plain next-values (same atomic pattern as the
 * expression workspace). Values stay clamped; invalid edits are rejected
 * with messages, never applied.
 */
export function useParameters(initial: Parameter[] = []): {
  parameters: Parameter[]
  addParameter: (name: string) => string | null
  /** Add the exact spec when the name is free; keep the user's version otherwise. */
  ensureParameter: (spec: Parameter) => string | null
  setValue: (name: string, value: number) => void
  resetValue: (name: string) => void
  updateBounds: (name: string, patch: { min?: number; max?: number; step?: number }) => string | null
  removeParameter: (name: string) => void
  replaceAll: (next: Parameter[]) => void
} {
  const [parameters, setParameters] = useState<Parameter[]>(initial)
  const ref = useRef(parameters)

  useEffect(() => {
    ref.current = parameters
  })

  const actions = useMemo(
    () => ({
      addParameter: (rawName: string): string | null => {
        const name = rawName.trim()
        const candidate = createParameter(name)
        if (ref.current.some((p) => p.name === name)) {
          return `Parameter "${name}" already exists.`
        }
        const problem = validateParameter(candidate)
        if (problem !== null) {
          return problem
        }
        setParameters([...ref.current, candidate])
        return null
      },
      setValue: (name: string, value: number): void => {
        setParameters(ref.current.map((p) => (p.name === name ? { ...p, value: clampParameterValue(p, value) } : p)))
      },
      resetValue: (name: string): void => {
        setParameters(ref.current.map((p) => (p.name === name ? { ...p, value: p.defaultValue } : p)))
      },
      ensureParameter: (spec: Parameter): string | null => {
        if (ref.current.some((p) => p.name === spec.name)) {
          return null
        }
        const problem = validateParameter(spec)
        if (problem !== null) {
          return problem
        }
        // Functional update: several ensures may batch in one handler.
        setParameters((current) => (current.some((p) => p.name === spec.name) ? current : [...current, spec]))
        return null
      },
      updateBounds: (name: string, patch: { min?: number; max?: number; step?: number }): string | null => {
        const current = ref.current.find((p) => p.name === name)
        if (current === undefined) {
          return `Parameter "${name}" does not exist.`
        }
        const next: Parameter = {
          ...current,
          min: patch.min ?? current.min,
          max: patch.max ?? current.max,
          step: patch.step ?? current.step,
          value: clampParameterValue({ ...current, min: patch.min ?? current.min, max: patch.max ?? current.max }, current.value),
        }
        const problem = validateParameter(next)
        if (problem !== null) {
          return problem
        }
        setParameters(ref.current.map((p) => (p.name === name ? next : p)))
        return null
      },
      removeParameter: (name: string): void => {
        setParameters(ref.current.filter((p) => p.name !== name))
      },
      replaceAll: (next: Parameter[]): void => {
        setParameters(next)
      },
    }),
    [],
  )

  return { parameters, ...actions }
}
