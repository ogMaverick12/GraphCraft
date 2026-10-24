import { Button } from '../components/ui/Button.tsx'
import type { ThemeMode } from '../storage/theme.ts'

interface StatusBarProps {
  expressionCount: number
  theme: ThemeMode
  viewLabel: string
  notice: string | null
  online: boolean
  updateAvailable: boolean
  onApplyUpdate: () => void
}

/** Small feedback area: parse state, viewport state, theme. All values real. */
export function StatusBar({ expressionCount, theme, viewLabel, notice, online, updateAvailable, onApplyUpdate }: StatusBarProps): React.JSX.Element {
  return (
    <footer
      aria-label="Status"
      className="flex h-8 shrink-0 items-center gap-4 overflow-x-auto border-t border-line bg-surface px-3 text-xs text-muted"
    >
      <span role="status">
        {expressionCount === 0 ? 'No expressions' : `${expressionCount} expression${expressionCount === 1 ? '' : 's'}`}
      </span>
      <span title="Current mathematical view">{viewLabel}</span>
      {!online && (
        <span role="status" title="Network unavailable — files and saved work keep working locally">
          Offline — working locally
        </span>
      )}
      {updateAvailable && (
        <Button onClick={onApplyUpdate} title="Load the new version now (reloads the page)" className="px-2 py-0 text-xs">
          Update available — Refresh
        </Button>
      )}
      {notice !== null && (
        <span role="status" className="shrink-0 text-warning">
          {notice}
        </span>
      )}
      <nav aria-label="Licence and notices" className="ml-auto flex shrink-0 items-center gap-3 border-l border-line pl-4">
        <a
          href="/LICENSE.txt"
          className="rounded-sm underline decoration-current underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Licence
        </a>
        <a
          href="/THIRD_PARTY_NOTICES.txt"
          className="rounded-sm underline decoration-current underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Third-party notices
        </a>
      </nav>
      <span className="shrink-0">Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
    </footer>
  )
}
