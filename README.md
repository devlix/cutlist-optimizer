# Cutlist Optimizer

A browser-based cut list optimizer that runs entirely as a local HTML file — no server, no build step, no installation required.

## Features

- **MAXRECTS bin-packing** (Best Short Side Fit heuristic) for optimal placement
- **Multiple sheet types** in one session — parts are routed to the correct material
- **CSV import** — auto-detects comma/semicolon/tab separator and decimal format
- **Saw blade kerf** — configurable thickness applied during optimization *and* manual moves
- **Part rotation** — optional 90° rotation to improve packing efficiency
- **Canvas visualizer** — zoom (scroll wheel), pan (drag), per-sheet tabs with efficiency %
- **Drag & drop** — manually reposition parts; real-time red highlight + dashed kerf zone when a move would violate spacing
- **PDF export** — one page per board + summary page with part table (via jsPDF)
- **Material Design** inspired UI — Roboto font, elevation shadows, animated modals

## Getting started

1. Download or clone the repository
2. Open `index.html` directly in your browser (`file://` — no server needed)
3. Click **Optimaliser** to run the built-in demo, or **Importer CSV** to load your own cut list

## CSV format

### Format A – parts only
```csv
Name,Length,Width,Qty,Material
Sideplate,800,600,4,Plywood 18mm
Shelf,760,380,6,Plywood 18mm
```

### Format B – sheets and parts combined (recommended)
```csv
Type,Name,Length,Width,Qty,Material
Sheet,Plywood 18mm,2440,1220,3,
Sheet,MDF 12mm,2440,1220,2,
Part,Sideplate,800,600,4,Plywood 18mm
Part,Door,400,590,4,MDF 12mm
```

See [`example.csv`](example.csv) for a full sample.

Column headers are case-insensitive. Norwegian aliases (`Lengde`, `Bredde`, `Antall`, `Materiale`) are also recognised. Old-style `Width`/`Height` headers continue to work for backwards compatibility.

## File structure

```
cutlist-optimizer/
├── index.html          # App shell
├── css/
│   └── style.css       # Material Design-inspired styles
├── js/
│   ├── csv-parser.js   # CSV parsing (multi-format)
│   ├── optimizer.js    # MAXRECTS bin-packing algorithm
│   ├── renderer.js     # Canvas renderer + drag-and-drop
│   ├── pdf-export.js   # PDF generation (jsPDF)
│   └── app.js          # State management & event wiring
└── example.csv
```

## Roadmap

- [ ] PWA support (service worker + manifest for offline use)
- [ ] Grain direction lock (prevent rotation for veneered sheets)
- [ ] Edge banding calculator
- [ ] Multiple optimisation passes (try different sort orders, keep best)
- [ ] Import/export project as JSON
- [ ] Dark mode

## License

MIT
