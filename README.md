# Overprint

**Web-based orienteering course setting software.**

Design orienteering courses in your browser — no installation required. Works on macOS, Windows, Linux, tablets, and phones.

## Why Overprint?

There's no serious web-based course setting tool in the orienteering ecosystem. Existing tools are desktop-only (Windows in most cases), which locks out a large part of the community. Overprint brings course design to any device with a modern browser.

Inspired by the excellent [PurplePen](https://purple-pen.org) — Overprint aims to make the core course setting workflow accessible everywhere.

## Features

### Map Support
- **OCAD files** (.ocd) — the industry standard for orienteering maps
- **PDF maps** — rendered client-side via PDF.js
- **Raster images** — PNG, JPEG, TIFF, GIF

### Course Design
- Place, move, and delete controls on the map
- Multiple courses per event with shared controls
- Background course layer — see other courses while editing
- Click a control from another course to reuse it
- Draggable control sequence numbers
- Automatic start/finish/control type derivation
- Course length calculation

### Control Descriptions
- Interactive IOF 8-column description sheet
- Symbol picker with 180+ IOF symbols
- **22 languages** for control descriptions
- PDF export of description sheets

### Export & Import
- **PDF course maps** — correct print scale, course-centered, title + scale bar
- **PDF description sheets** — IOF 8-column grid with SVG symbols
- **IOF XML v3** — export and import for data interchange
- **PNG/JPEG** — screenshot export at 2x resolution
- **`.overprint`** — native save/load format

### Print Settings
- Paper size (A4, A3, Letter)
- Portrait/landscape orientation
- Adjustable margins
- Print scale selection
- Print boundary preview on canvas

### Multi-Language
- **8 app interface languages**: English, French, German, Spanish, Finnish, Italian, Swedish, Japanese
- **22 IOF description languages** via [svg-control-descriptions](https://github.com/orienteering-js/svg-control-descriptions)

### Editing
- Undo/redo (Cmd/Ctrl+Z)
- Editable event name, course names, control codes
- Pan and zoom with mouse wheel, trackpad, and touch
- File System Access API save dialogs (Chrome/Edge) with fallback

## Quick Start

```bash
git clone git@github.com:leitchy/overprint.git
cd overprint
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) and load a map file to get started.

## Build & Test

```bash
pnpm build          # TypeScript check + Vite production build
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm typecheck      # TypeScript type checking only
```

## Tech Stack

- **React 19** + TypeScript + Vite
- **Konva.js** (react-konva) for canvas rendering
- **Zustand** + Immer for state management
- **pdf-lib** for PDF generation
- **PDF.js** for PDF map loading
- **ocad2geojson** for OCAD file support
- **Tailwind CSS v4** for UI styling
- **Vitest** for testing

Runs entirely in the browser — no backend required.

## IOF Standards

Overprint follows current International Orienteering Federation standards:

- **IOF Control Description Standard 2024**
- **IOF XML Data Standard v3**
- **ISOM 2017-2** overprint dimensions (5.0mm control circle, 6.0mm start triangle)
- **ISSprOM 2019-2** sprint map support

## Status

Overprint is under active development. The core course setting workflow is functional — you can load maps, design courses, and export print-ready PDFs. See the [CLAUDE.md](CLAUDE.md) for a detailed feature list and project context.

### Not yet implemented
- OpenOrienteering Mapper (.omap/.xmap) file support
- Multi-page PDF export
- Crossing points and map exchange symbols
- Score course support

## Contributing

Contributions are welcome! Please open an issue to discuss before submitting a PR.

## Licence

[AGPL-3.0-only](LICENSE)

The AGPL licence ensures Overprint remains free and open for the orienteering community. If you deploy a modified version as a web service, you must make your source code available under the same licence.
