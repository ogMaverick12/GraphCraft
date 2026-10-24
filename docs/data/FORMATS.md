# GraphCraft — Supported data formats (Stage 4 DATA-01, export + persistence S4.5)

## Accepted input

| Source | How | Notes |
|---|---|---|
| Pasted text | Data Lab → Paste data | CSV-shaped text; settings below apply |
| File | Data Lab → Open file, or drop onto the Data Lab | `.csv`, `.tsv`, `.txt` read as strict UTF-8 (BOM stripped; invalid bytes refused, never mojibake) |
| Manual grid | Data Lab → Manual entry | Small tables typed by hand; same validation as pasted text |
| Excel `.xlsx`/`.xls`/`.xlsm` | — | **Not supported yet.** Re-save the sheet as CSV and import that. Excel files are never parsed as CSV; picking one shows this message instead of importing anything. |

## Import settings (chosen per import, shown before commit)

- **Delimiter**: comma, semicolon, or tab. Pick what the file uses — it is never sniffed silently; the preview shows the split live.
- **Decimal separator**: point (`3.14`) or comma (`3,14`). With comma decimals, use a semicolon/tab delimiter, and dots are thousands separators only in strict `1.234` grouping — otherwise the cell is malformed, not guessed.
- **Header row**: auto-detect (text-first-row plus later numbers), forced yes, or forced no. The preview states which rule applied; change it if wrong. Duplicates are suffixed (`a (2)`), blanks become `Column N` — both flagged. Column identity always uses stable ids, never names alone.
- **Column types**: auto-typed per column (numeric only when every non-blank cell parses), correctable in the preview. Forcing numeric clears non-parsing cells to missing with a count; forcing categorical only relabels. Both are logged.

## What imports honestly

- Quoted fields may hold delimiters, newlines, and `""` escapes.
- Blank cells become missing (`∅`), never zero. Non-numeric cells in a numeric-leaning column stay as text and the column types categorical with a mixed-column flag.
- Short rows pad with missing, long rows truncate past the header width — both counted and listed, never hidden.
- All-blank lines are skipped with a count; a conventional trailing newline is not a row.
- Non-finite values (`Infinity`, `NaN`) are malformed, never imported as numbers.
- Nothing commits until Import is pressed; Cancel and parse failures leave existing datasets untouched.

## Limits (refused with numbers, never truncated silently)

- 5 MB of input text, 10,000 rows, 32 columns. Larger inputs are refused with a split-the-input message.
- Formula-looking cells (`=SUM(…)`, `+cmd`, …) are inert plain text on import — GraphCraft has no formula evaluator. CSV export (DataExport dialog, four selectable tables) `'`-prefixes leading `= + - @` cells against spreadsheet formula injection and round-trips through this importer.

## Exported output

- **Figures**: SVG vectors / scaled PNGs through the shared scene (`docs/export/EXPORT.md`); title, units, legend, error bars, and fit overlays survive.
- **Tables**: dataset, plotted points, residuals, fit summary — quoting with `""` escapes, full-precision numbers, missing as empty.
- **Projects**: v6 bundles datasets + analyses (`docs/project/PROJECT_FORMAT.md`).

## Stored in v6 projects

Datasets, plot/fit/uncertainty/export analyses, import options, cleaning log, and missing census persist in `*.graphcraft.json` (v6, ≤2 MB); zoom overrides stay transient. Session-only was the pre-v6 story — see `docs/project/PROJECT_FORMAT.md` for the exact stored fields.

## Preparation (per-dataset table)

- **Editing**: click any cell to correct it (point decimals for numeric columns; text in a numeric column is refused with a retag hint). Click a header name to rename (non-empty, unique).
- **Types**: retag numeric/categorical per column after import. Numeric promotion clears text cells to missing with a count; demotion only relabels.
- **Units**: attach a registry symbol (`m`, `s`, …) per column; unknown symbols are refused. Units flow into plot axis labels.
- **Sort/filter**: views only — raw row order never changes. Nulls sort last; filters cover comparisons, text match, and missing/present; the shown count is always visible.
- **Missing strategies**: leave (plots skip + count), drop rows with missing, fill a constant, or fill column means. Each is a logged revision.
- **Derived columns**: new numeric columns from expressions over stable ids (`c1*2+c2`) through the validated engine; `x` rejected, unknown names fail at compile, non-value cells become missing with a count.
- **Reversibility**: every mutation snapshots first (20-deep undo); the import snapshot is kept separately for Restore source. Deleting rows or the dataset itself is explicit and, for rows, undoable.
