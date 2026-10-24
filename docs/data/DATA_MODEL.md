# GraphCraft — Data Lab data model (Stage 4 preflight)

Design record only — no implementation yet. Everything here is local:
datasets live in memory and (later) in the project file; browser
storage is never a data store.

## Dataset

```ts
interface Dataset {
  id: string                    // stable, unique within the document
  name: string                  // user label, ≤ 60 chars
  columns: Column[]             // 1–32 columns
  rows: Cell[][]                // 0–10000 rows; each row matches columns length
  provenance: ImportProvenance  // where it came from (below)
  cleaningLog: CleaningEntry[]  // every transformation, in order
}

interface Column {
  name: string                  // unique within the dataset, ≤ 60 chars
  type: 'numeric' | 'categorical'
  unit?: string                 // calculator-registry symbol (e.g. 'm', 's'); display only, never auto-converted
}

type Cell = number | string | null  // null = missing, always explicit

interface ImportProvenance {
  kind: 'paste' | 'file' | 'manual' | 'example'
  fileName?: string
  delimiter?: string            // sniffed or chosen: comma, semicolon, tab
  importedAt: string            // ISO timestamp
  skippedLines?: number         // header/comment lines skipped, stated
}
```

## Missing values

- Missing is always `null` — never zero, never interpolated silently.
- Cleaning actions (drop-row, drop-column, fill-with-value) append to
  `cleaningLog` with their parameters; the raw import is recoverable
  until the user clears it. Fits refuse columns containing `null`
  unless a cleaning action resolved them first (stated, not guessed).

## Chart configuration

```ts
interface ChartConfig {
  kind: 'scatter' | 'line' | 'error-bar' | 'histogram'
  xColumn: string               // column id; histogram bins x instead
  yColumns: string[]            // one or more numeric series
  errorColumn?: string          // symmetric ± errors, same units as y
  viewport?: WorldRect          // optional fixed view; otherwise auto-fit with padding
}
```

Charts render on the existing coordinate layer (`src/graph/`); series
reuse the sampler palette by index. No Plotly.js unless the DATA-02
evaluation gate documents a win.

## Fits and uncertainty

```ts
interface FitResult {
  model: 'line' | 'poly-2' | 'poly-3'
  parameters: number[]          // slope/intercept or coefficients, full precision
  parameterErrors: number[]     // standard errors, same order
  rSquared: number
  residualStd: number           // unbiased (÷(n−p)) residual standard deviation
  n: number                     // points actually fitted
  method: string                // e.g. 'Ordinary least squares, normal equations'
}

interface UncertaintyMeta {
  errorKind: 'std' | 'range' | 'explicit-column'
  confidence?: number           // only when a stated interval is drawn
}
```

Fits are estimates with methods attached (S2.5 honesty policy):
residual plots accompany every fit; R² is never presented without the
residual spread; non-convergence and rank deficiency are errors, not
silent lines.

## Limits (enforced, not advisory)

- 10,000 rows × 32 columns per dataset; larger pastes are refused with
  the limit stated (sampling a subset silently would lie about the data).
- Project file cap stays 256 KB: datasets beyond it are session-only
  with a clear notice, or stored by reference-later (explicit decision
  at DATA-01, not silent truncation).
- All numerics are doubles; exactness claims follow the calculator policy.

## Project format path

Datasets are NOT in the file yet (format v5). DATA-01 will propose a
`datasets` array plus a `v5 → v6` migration in `src/project/`,
keeping unknown-field tolerance and the newer-version refusal rule.
