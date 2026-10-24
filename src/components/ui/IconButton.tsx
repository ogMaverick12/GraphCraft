import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** Accessible name; also shown as the native tooltip. Required for icon-only buttons. */
  label: string
  ref?: Ref<HTMLButtonElement>
}

/** Icon-only button. Always carries an accessible name + tooltip via `label`. */
export function IconButton({ children, label, className = '', ref, ...rest }: IconButtonProps): ReactNode {
  return (
    <button
      type="button"
      ref={ref}
      aria-label={label}
      title={label}
      className={`gc-transition inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
