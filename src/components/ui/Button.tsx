import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'default' | 'ghost'
  ref?: Ref<HTMLButtonElement>
}

/**
 * Neutral button primitive (shadcn-style intent, dependency-free).
 * Full shadcn/ui adoption is deferred to a later audit if justified.
 */
export function Button({ children, type = 'button', variant = 'default', className = '', ref, ...rest }: ButtonProps): ReactNode {
  const base =
    'gc-transition inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50'
  const styles =
    variant === 'ghost'
      ? 'text-ink-soft hover:bg-surface hover:text-ink'
      : 'border border-line bg-surface text-ink shadow-panel hover:bg-bg'

  return (
    <button type={type} ref={ref} className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  )
}
