import { Component, type ReactNode } from 'react'
import { Button } from '../components/ui/Button.tsx'

interface WorkspaceBoundaryProps {
  /** Workspace name used in the failure message ("Calculator"). */
  workspace: string
  /** Test seam; production reloads the whole page. */
  onReload?: () => void
  children: ReactNode
}

interface WorkspaceBoundaryState {
  failed: boolean
}

/**
 * Catches a failed on-demand workspace load — typically its chunk was never
 * downloaded before the connection dropped — and explains the situation
 * instead of unmounting the app to a blank page. Recovery is an explicit
 * reload once online: the chunk then loads and is cached for offline use.
 * Keyed by view at the call site so switching workspaces clears the state.
 */
export class WorkspaceBoundary extends Component<WorkspaceBoundaryProps, WorkspaceBoundaryState> {
  state: WorkspaceBoundaryState = { failed: false }

  static getDerivedStateFromError(): WorkspaceBoundaryState {
    return { failed: true }
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    const reload = this.props.onReload ?? ((): void => window.location.reload())
    return (
      <div role="alert" className="flex max-w-prose shrink-0 flex-col items-start gap-2 rounded-md border border-danger bg-surface px-3 py-2 text-sm text-ink">
        <p>
          The {this.props.workspace} workspace could not load its code. It may not have been downloaded before the connection went offline — reconnect and
          reload the page once; after that it works offline too. Your saved work is unaffected.
        </p>
        <Button onClick={reload}>Reload page</Button>
      </div>
    )
  }
}

interface GraphStudioBoundaryProps {
  /** Restore a known-good viewport before retrying the render. */
  onRestoreView: () => void
  children: ReactNode
}

interface GraphStudioBoundaryState {
  failed: boolean
}

/**
 * Catches a Graph Studio render failure — an unrepresentable viewport or
 * any other render error — and offers a safe recovery instead of unmounting
 * the app to a blank page. Recovery restores the viewport only: the project
 * rows, files, and session backup are untouched and nothing is cleared. If
 * the error is not viewport-related, the retry returns to this same message
 * rather than looping silently.
 */
export class GraphStudioBoundary extends Component<GraphStudioBoundaryProps, GraphStudioBoundaryState> {
  state: GraphStudioBoundaryState = { failed: false }

  static getDerivedStateFromError(): GraphStudioBoundaryState {
    return { failed: true }
  }

  private readonly restore = (): void => {
    this.props.onRestoreView()
    this.setState({ failed: false })
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      <div role="alert" className="flex max-w-prose shrink-0 flex-col items-start gap-2 rounded-md border border-danger bg-surface px-3 py-2 text-sm text-ink">
        <p>Graph Studio could not render this view. Your project and saved files are unaffected. Restore the view to continue.</p>
        <Button onClick={this.restore}>Restore view</Button>
      </div>
    )
  }
}

interface ExportDialogBoundaryProps {
  onClose: () => void
  children: ReactNode
}

interface ExportDialogBoundaryState {
  failed: boolean
}

/**
 * Catches a failed on-demand export-dialog load - typically its chunk was
 * never downloaded before the connection dropped. Keeps the app mounted
 * and offers an explicit close; the export can be retried by reopening it.
 */
export class ExportDialogBoundary extends Component<ExportDialogBoundaryProps, ExportDialogBoundaryState> {
  state: ExportDialogBoundaryState = { failed: false }

  static getDerivedStateFromError(): ExportDialogBoundaryState {
    return { failed: true }
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div aria-hidden="true" className="absolute inset-0 bg-black/40" onClick={this.props.onClose} />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Export graph unavailable"
          className="relative w-full max-w-md rounded-lg border border-danger bg-elevated p-4 shadow-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              this.props.onClose()
            }
          }}
        >
          <h2 className="text-sm font-semibold text-ink">Export graph unavailable</h2>
          <p className="mt-2 text-sm text-ink">
            The export dialog could not load its code. It may not have been downloaded before the connection went offline. Reconnect and reload the page
            once; your graph and saved work are unaffected.
          </p>
          <div className="mt-4 flex justify-end">
            <Button autoFocus onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
