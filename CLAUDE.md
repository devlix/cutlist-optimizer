# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open `index.html` directly in a browser:

```
open index.html
```

Or serve it locally to avoid any file-protocol restrictions:

```
python3 -m http.server 8080
```

There are no tests, no linter, and no package manager.

## Architecture

Single-page app: plain HTML + CSS + vanilla JS, no bundler, no frameworks. All JS files are loaded as classic scripts (no ES modules), so classes are exposed as `window` globals and must be loaded in dependency order.

**Script load order** (defined in `index.html`):
1. `js/csv-parser.js` → `CSVParser`
2. `js/optimizer.js` → `MaxRectsBin`, `CutlistOptimizer`
3. `js/renderer.js` → `CutlistRenderer`
4. `js/pdf-export.js` → `PDFExporter`
5. `js/app.js` → wires everything together via a `State` singleton

### Module responsibilities

| File | Class | Role |
|---|---|---|
| `js/optimizer.js` | `MaxRectsBin` | MAXRECTS bin-packing (BSSF heuristic). Tracks free rectangles, splits on placement, prunes dominated rects. |
| `js/optimizer.js` | `CutlistOptimizer` | Groups parts by material, sorts by area descending, fills bins one sheet at a time, collects `unplaced`. |
| `js/renderer.js` | `CutlistRenderer` | Canvas-based viewer: pan (middle-click or alt+drag), zoom (wheel), drag-to-reposition parts, snap-to-kerf-grid, overlap detection with auto-snap-back. |
| `js/csv-parser.js` | `CSVParser` | Handles Format A (parts only) and Format B (`Type` column, sheets + parts). Auto-detects `,`/`;`/tab separator and `.`/`,` decimal. |
| `js/pdf-export.js` | `PDFExporter` | One landscape A4 page per sheet instance + a summary page. Uses jsPDF loaded from CDN. |
| `js/app.js` | — | Central `State` object (`settings`, `sheets`, `parts`, `results`), all DOM event binding, sidebar rendering, modal management, toast notifications. |

### Data flow

```
CSV / manual input → State.sheets / State.parts
  → CutlistOptimizer.optimize() → State.results
    → CutlistRenderer.setInstance()  (canvas display)
    → PDFExporter.export()           (PDF download)
```

`optimizer.optimize()` returns:
- `sheetResults[]` — per-material groups, each with `instances[]` (one per physical board used)
- `unplaced[]` — parts that didn't fit
- `totalEfficiency`, `totalSheets`

Each `instance` has `placements[]` with `{x, y, width, height, rotated, color, partName, partId}`.

### Key design notes

- **Kerf** is applied as a gap *after* each placed part inside `MaxRectsBin._place()`. The renderer also enforces the kerf gap during drag overlap checks.
- **Material matching**: parts are grouped by `part.material`; the optimizer looks up a sheet by name match. Parts with no material fall into `__default__` and use the first available sheet.
- **No state persistence** — all state lives in memory; refreshing the page resets everything. PWA / localStorage support is a planned future addition.
- The UI language is Norwegian; code identifiers and comments are in English.
