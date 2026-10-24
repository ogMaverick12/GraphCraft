import { FilePlus2, FolderOpen, FunctionSquare, ImageDown, List, Moon, PanelLeft, PanelRight, Save, SlidersHorizontal, Sun } from 'lucide-react'
import { IconButton } from '../components/ui/IconButton.tsx'
import type { ThemeMode } from '../storage/theme.ts'
import type { DrawerPanel, StudioView } from './App.tsx'

interface TopBarProps {
  projectTitle: string
  onRenameProject: (title: string) => void
  dirty: boolean
  onNewProject: () => void
  onOpenProject: () => void
  onSaveProject: () => void
  onExportGraph: () => void
  exportDisabled: boolean
  view: StudioView
  onSwitchView: (view: StudioView) => void
  theme: ThemeMode
  onToggleTheme: () => void
  leftOpen: boolean
  rightOpen: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
  onOpenDrawer: (panel: DrawerPanel) => void
}

/** Compact top bar: identity, project title, document actions, theme control. */
export function TopBar({
  projectTitle,
  onRenameProject,
  dirty,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onExportGraph,
  exportDisabled,
  view,
  onSwitchView,
  theme,
  onToggleTheme,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  onOpenDrawer,
}: TopBarProps): React.JSX.Element {
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3">
      {/* Mobile drawers */}
      <div className="flex items-center md:hidden">
        <IconButton label="Open expression list" onClick={() => onOpenDrawer('expressions')}>
          <List size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Open inspector" onClick={() => onOpenDrawer('inspector')}>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <FunctionSquare size={20} aria-hidden="true" className="shrink-0 text-accent" />
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold tracking-tight text-ink">GraphCraft</h1>
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              type="text"
              value={projectTitle}
              aria-label="Project title"
              spellCheck={false}
              maxLength={200}
              onChange={(event) => onRenameProject(event.target.value)}
              className="w-36 min-w-0 truncate rounded bg-transparent text-xs text-muted hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {dirty && (
              <span title="Unsaved changes" role="status" className="flex shrink-0 items-center gap-1 text-xs text-warning">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
                Unsaved
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
        <div role="group" aria-label="Workspace" className="mr-1 flex gap-1 rounded-md border border-line bg-bg p-0.5">
          {(['graph', 'calculator', 'data', 'learn', 'viz3d'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              aria-label={option === 'graph' ? 'Show graph studio' : option === 'calculator' ? 'Show calculator' : option === 'data' ? 'Show data lab' : option === 'learn' ? 'Show learn library' : 'Show 3D surfaces'}
              title={option === 'graph' ? 'Show graph studio' : option === 'calculator' ? 'Show calculator' : option === 'data' ? 'Show data lab' : option === 'learn' ? 'Show learn library' : 'Show 3D surfaces'}
              onClick={() => onSwitchView(option)}
              className={`gc-transition rounded px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                view === option ? 'bg-surface text-ink shadow-panel' : 'text-muted hover:text-ink'
              }`}
            >
              {option === 'graph' ? 'Graph' : option === 'calculator' ? 'Calc' : option === 'data' ? 'Data' : option === 'learn' ? 'Learn' : '3D'}
            </button>
          ))}
        </div>
        <IconButton label="New project" title="New project" onClick={onNewProject}>
          <FilePlus2 size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Open project file" title="Open project file" onClick={onOpenProject}>
          <FolderOpen size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Save project to file" title="Save project to file" onClick={onSaveProject}>
          <Save size={18} aria-hidden="true" />
        </IconButton>
        <IconButton label="Export graph as image" title={exportDisabled ? 'Add an expression to enable export' : 'Export graph as image'} onClick={onExportGraph} disabled={exportDisabled}>
          <ImageDown size={18} aria-hidden="true" />
        </IconButton>
        <div className="hidden items-center md:flex">
          <IconButton
            label={leftOpen ? 'Collapse expression list' : 'Expand expression list'}
            aria-pressed={leftOpen}
            onClick={onToggleLeft}
          >
            <PanelLeft size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={rightOpen ? 'Collapse inspector' : 'Expand inspector'}
            aria-pressed={rightOpen}
            onClick={onToggleRight}
          >
            <PanelRight size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-pressed={theme === 'dark'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </IconButton>
      </div>
    </header>
  )
}
