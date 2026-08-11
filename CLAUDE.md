# Overprint

> Web-based orienteering course setting software. A spiritual successor to [PurplePen](https://purple-pen.org), built for the modern web — works on macOS, Windows, Linux, tablets, and phones.

## Project Context

Overprint is a side project / fun build. The goal is to bring orienteering course design to any platform via the browser, removing the Windows-only limitation of PurplePen.

**What PurplePen does (and we aim to replicate the core of):**
- Load orienteering maps (OCAD, OpenOrienteering Mapper .omap/.xmap, PDF, raster images)
- Visually place controls on the map to design courses
- Generate IOF-standard control description sheets (symbolic + textual)
- Calculate course lengths automatically
- Export course data as IOF XML (v2 and v3)
- Print/export maps with purple course overprints
- Support IOF Control Description Standards (2018/2024)

**What we are NOT building (at least initially):**
- Full OCAD file editing (that's OpenOrienteering Mapper's job)
- Event management / results / timing
- GPS tracking / route analysis (that's Livelox)

## Tech Stack

- **Frontend**: React 19 + TypeScript, Vite build
- **Map rendering**: HTML5 Canvas via Konva.js (react-konva) for map display and course overlay
- **State management**: Zustand + Immer + zundo (undo/redo)
- **File handling**: Client-side file processing (no server required)
- **IOF XML**: Custom parser/writer for IOF XML v3 data standard
- **PDF generation**: pdf-lib for client-side PDF export
- **PDF reading**: PDF.js for loading PDF map files
- **OCAD support**: ocad2geojson for loading .ocd files
- **IOF symbols**: svg-control-descriptions package (22 languages)
- **i18n**: Custom useT() hook with type-safe translation keys (8 UI languages)
- **CSS**: Tailwind CSS v4
- **Package manager**: pnpm
- **Testing**: Vitest + React Testing Library
- **Deployment**: Cloudflare Pages at overprint.com.au (static site, no backend)

## Project Structure

```
overprint/
├── CLAUDE.md                  # This file — project context for Claude Code
├── docs/
│   ├── product-spec.md        # Product specification and feature roadmap
│   ├── architecture.md        # Technical architecture decisions
│   ├── iof-standards.md       # IOF standard references and notes
│   ├── adrs/                  # Architecture Decision Records
│   ├── guides/                # Developer onboarding, workflows
│   ├── reference/             # Standards, specs
│   └── research/              # Exploration, spikes
├── src/
│   ├── app/                   # App shell, keyboard shortcuts
│   ├── components/
│   │   ├── map/               # Map canvas, pan/zoom, print boundary
│   │   ├── course/            # Course editor, control shapes, course list
│   │   ├── descriptions/      # Control description sheet renderer + picker
│   │   └── ui/                # Toolbar, file menu, modals, settings panels
│   ├── core/
│   │   ├── models/            # Domain types: Course, Control, Event, etc.
│   │   ├── iof/               # IOF XML import/export, symbol database
│   │   ├── files/             # Map file loaders (PDF, raster, OCAD, OMAP), save/load
│   │   ├── geometry/          # Distance calc, GPS↔pixel transforms, affine calibration, overprint dimensions
│   │   ├── export/            # PDF course map, description sheet, image export
│   │   └── descriptions/     # Canvas-based description renderer
│   ├── stores/                # Zustand stores (event, map-image, viewport, tool, gps, app-settings)
│   ├── hooks/                 # GPS position, wake lock, breakpoint, touch detection
│   ├── i18n/                  # Translations, language lists, useT() hook
│   └── utils/                 # Branded ID types
├── tests/
│   └── fixtures/              # Test data (maps/, events/, exports/ — gitignored)
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Coding Conventions

- **TypeScript strict mode** — no `any` types unless absolutely necessary
- **Functional React** — hooks only, no class components
- **Named exports** — no default exports (except where required by framework)
- **Barrel files** — use `index.ts` re-exports sparingly, only at module boundaries
- **Domain-driven types** — rich types for orienteering concepts (Control, Course, Leg, etc.)
- **File naming** — kebab-case for files, PascalCase for components
- **Tests alongside source** — `*.test.ts` files next to the code they test
- **CSS** — Tailwind CSS for UI, but canvas rendering is pure code
- **Commits** — conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)

## Key Domain Concepts

- **Event**: A container for an orienteering competition — has a map and one or more courses
- **Map**: The base orienteering map (loaded from file). Has a scale (e.g., 1:10000, 1:15000) and DPI
- **Course**: An ordered sequence of controls forming a route. Has a name and optional per-course print scale
- **Control**: A point on the map with a code (>30), position, and IOF description columns A-H
- **CourseControl**: A reference from a course to a control — carries type (start/finish/control) and number offset
- **Leg**: The connection between two consecutive controls — drawn as a line
- **Control Description**: The 8-column IOF standard grid describing what's at each control
- **Overprint**: The purple/violet layer drawn on top of the base map showing the course
- **Start Triangle / Finish Circle**: Special symbols at course start/end (double circle for finish)
- **Shared Controls**: Controls can be reused across multiple courses in an event
- **Fork / Variation**: A fork (gaffling) lets runners take one of several **branches** at an anchor control, rejoining after. The set of **variations** is the combination of branch choices, enumerated into flat control sequences by `variation-enumerator.ts` (which every renderer/exporter reuses). Anchored by a stable `CourseControlId` (not `ControlId`). See [ADR-017](docs/adrs/ADR-017-course-variations-forks.md).

## IOF Standards We Follow

- **IOF Control Description Standard 2024** (backwards-compatible with 2018)
- **IOF XML Data Standard v3** for course data interchange
- **ISOM 2017-2**: Control circle 5.0mm, start triangle 6.0mm side, finish 5.0mm/3.5mm
- **ISSprOM 2019-2**: Sprint map symbol set (smaller overprint dimensions)
- **Purple overprint colour**: IOF spec = CMYK 35/85/0/0 or PMS "Purple" (ISOM 2017 Appendix 1 §4; no official RGB). We use `#BB29BB` (sRGB of Pantone Purple C). Overprint is a **solid** colour — the standard's "map shows through" is by colour/draw **order** (black/brown/blue 100% over the purple), not alpha blending. See docs/adrs and the standards-conformance notes.

## Current Status

**Implemented features:**
- Map loading: raster images (PNG, JPEG, TIFF, GIF), PDF, OCAD (.ocd), OpenOrienteering Mapper (.omap/.xmap)
- Pan/zoom canvas with map display
- Control placement (click to add), drag to move, delete
- Multi-course management: add, rename, delete, switch courses
- Shared controls across courses (background layer rendering, click to reuse)
- IOF control description sheet (interactive, with symbol picker)
- Draggable control sequence numbers
- Save/load .overprint JSON format
- PDF export: course map (correct print scale, course-centered, title + scale bar)
- PDF export: description sheet (IOF 8-column grid with SVG symbols)
- IOF XML v3 export and import
- PNG/JPEG image export
- Print settings: page size, orientation, margins, print scale
- Print boundary overlay (optional, shows page extent on canvas)
- Multi-language: 8 app UI languages, 22 IOF description languages
- Undo/redo (Cmd/Ctrl+Z)
- Editable event name, control codes
- showSaveFilePicker save dialogs with fallback
- Crossing points and map exchange symbols (X and inverted triangle, type cycling in course panel)
- Multi-page PDF export (all courses in one PDF, per-course page orientation)

- Score course support (toggle, point values, no legs, sorted descriptions)
- Batch export: each course as separate PDF (via directory picker or auto-download fallback)
- Special items: text, lines, rectangles, description boxes, IOF symbols (out-of-bounds, dangerous area, water, first aid, forbidden route)
- Overprint blending (multiply blend on screen — dark map features show through purple)
- PDF vector preservation (re-embed original PDF pages in export)
- Leg bend points (draggable waypoints to route legs around obstacles)
- Leg gaps (hide segments of legs through uncrossable features)
- Duplicate course
- Event audit / validation (missing descriptions, duplicate codes, short/long legs, unused controls)
- All-controls view (view all controls across courses without selecting a course)
- GPS-based control placement (georef extraction from OCAD/OMAP, proj4 transforms, manual calibration, GPS UI, auto-follow, wake lock)
- Save with embedded map images (self-contained .overprint files)
- PurplePen .ppen file import (linked-list course parsing, IOF description mapping, OCAD viewBox coordinate conversion, text/line/rectangle appearance colour)
- Vector PDF map export: OCAD/OMAP maps embedded as **true vectors** (crisp at any scale, small files) via an in-house SVG→pdf-lib walker (`svg-to-pdf.ts`); print-DPI raster fallback for unsupported SVG (D5)
- True IOF colour-order in the vector PDF path: map black/brown/blue-100% linework redraws **above** the purple overprint, area screens stay below (four-pass draw; `ink-classification.ts` tags upper inks at load) (D2-true)
- OpenOrienteering Mapper (.omap) course-overprint export — course as OOM map objects in the source coordinate frame, for print-shop/mapper merge (`export-omap.ts`, D6)
- Unified overprint item-scaling model — None / RelativeToMap / RelativeTo15000, consistent between screen and PDF when print scale ≠ map scale; read from `.ppen` scale-sizes (A8)
- Roboto / Roboto Condensed control-description typography (PDF + on-screen), embedded via @pdf-lib/fontkit with per-document glyph subsetting; graceful Helvetica fallback (C8)
- Text/rectangle special items default to black (titles, borders); overprint symbols default to purple
- Course variations — **forks / gaffling** (E10 Phase 1) and butterfly / phi **loops** (E10 Phase 2)
  on a normal course. `Course.variations: CourseFork[]` with `kind:'fork'|'loop'` expanded by a pure
  enumerator (`variation-enumerator.ts`): forks = cartesian branch choices; loops = `k!` orderings of
  the loops from a central hub (visited k+1× per variation, sequence numbers fanned around one circle
  via `core/geometry/number-fan.ts`, shared by screen + PDF). Per-variation map / description / IOF
  export + on-canvas preview. IOF export writes one `<Course>` per variation grouped by `<CourseFamily>`
  (matches PurplePen; IOF XML v3 has no native fork/loop element). Hub must be an interior *normal*
  control; ≥2 loops; ≤4 recommended. **Relay team assignment (Phase 3, v0.27.0)**: `Course.relay
  { firstTeamNumber, teams, legs }` drives an on-demand team×leg variation assignment — a faithful port
  of PurplePen's `RelayVariations` greedy anti-following scrambler (`relay-assignment.ts`, seeded, over
  the flat generator list; grid codes match the picker via shared enumerator helpers). A "Relay teams…"
  modal previews the grid; exports as native IOF v3 `<TeamCourseAssignment>` (`export-relay-xml.ts`)
  and a paginating PDF table (`pdf-relay-table.ts`). **Fixed branch→leg pinning (Phase 3b, v0.28.0)**:
  `RelaySettings.fixedBranches` (keyed by BranchId) forces specific legs onto a branch via an inline
  branch×leg matrix in the modal; `minUniquePathsByLeg` is now genuinely per-leg, a fully-pinned-yet-
  stranded fork drops its whole pin set (PP semantics), and `duplicateCourse` remaps pins onto the
  clone's new BranchIds. **E10 loop fairness (v0.29.0)**: a loop-length-imbalance **audit** warning
  (butterfly loops should be near-equal length or the order permutation stops separating the field),
  and **cross-team first-loop spreading** in relay scoring (a deliberate improvement over PurplePen —
  spreads the mass-start first loop across teams). See
  [ADR-017](docs/adrs/ADR-017-course-variations-forks.md).

## Getting Started

```bash
cd overprint
pnpm install
pnpm dev
```

## Build & Test

```bash
pnpm build          # TypeScript check + Vite production build
pnpm test           # Run all tests (vitest)
pnpm test:watch     # Watch mode
pnpm typecheck      # TypeScript only (no emit)
```

## Notes

- This is Jim's side project. Keep it fun, keep it clean, ship incrementally.
- PurplePen source is on GitHub (C#/.NET) — useful for understanding algorithms and IOF symbol rendering.
- The orienteering community is international — i18n is implemented with 8 UI + 22 IOF languages.
- Accessibility: canvas-based apps are inherently tricky for a11y. Acknowledge this but don't let it block progress.
- OCAD files use 1/100mm internal coordinates. DPI is computed from viewBox geometry. Scale is from param string 1039.
- License: AGPL-3.0-only

## Knowledge Vault (claude-obsidian)

A persistent, cross-session knowledge base for this project lives in a separate
claude-obsidian vault (not this repo). claude-obsidian v2 keeps the plugin and the vault as
two distinct directories:

- **Vault** (the Obsidian knowledge base): `~/Development/Personal/Overprint-knowledge-vault`
- **Plugin / product tree** (the claude-obsidian clone): `~/Development/Personal/overprint-knowledge`

It holds distilled knowledge on map rendering, file loading, PurplePen fidelity, OCAD/OMAP,
and the SVG display architecture — organised into a linked wiki with provenance.

- To **build/update** it: run Claude Code **from the vault**, loading the plugin:
  `cd ~/Development/Personal/Overprint-knowledge-vault && claude --plugin-dir ~/Development/Personal/overprint-knowledge`.
  First time: `/claude-obsidian:wiki` (init). Then drop sources in the vault's `inbox/` and run
  `/claude-obsidian:wiki-ingest`. Those skills are NOT loaded when Claude runs from this repo.
- To **use** it from an Overprint session: read `Overprint-knowledge-vault/wiki/index.md` and
  drill into relevant pages (e.g. `map-rendering-roadmap`, `omap-renderer`, `svg-display-adr015`)
  when you need context not already in this repo.
