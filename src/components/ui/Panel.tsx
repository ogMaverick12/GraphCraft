import { useId, type ReactNode } from 'react'

interface PanelProps {
  /** Visible panel title. */
  title: string
  /** Optional header-end actions (collapse, close, …). */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Reusable sidebar/inspector panel: title row + scrollable body. */
export function Panel({ title, action, children, className = '' }: PanelProps): ReactNode {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 id={headingId} className="text-sm font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  )
}
