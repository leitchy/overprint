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

- **Frontend**: React + TypeScript, Vite build
- **Map rendering**: HTML5 Canvas (via Konva.js or Fabric.js) for map display and course overlay
- **State management**: Zustand
- **File handling**: Client-side file processing (no server required for MVP)
- **IOF XML**: Custom parser/writer for IOF XML v3 data standard
- **PDF generation**: pdf-lib for client-side PDF export
- **Map file support (progressive)**:
  - Phase 0: Raster images (PNG, JPEG, TIFF, GIF)
  - Phase 1: PDF (via PDF.js) + OCAD files (via ocad2geojson — see ADR-010)
  - Phase 5: OpenOrienteering Mapper (.omap/.xmap) — XML-based, parseable in browser
- **Deployment**: Static site (Cloudflare Pages, Vercel, or Netlify) — no backend needed for MVP
- **Testing**: Vitest + React Testing Library

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
│   ├── plans/                 # Implementation plans
│   ├── reference/             # Standards, specs
│   ├── research/              # Exploration, spikes
│   └── archive/               # Superseded docs
├── src/
│   ├── app/                   # App shell, routing, layout
│   ├── components/
│   │   ├── map/               # Map canvas, pan/zoom, layers
│   │   ├── course/            # Course editor, control placement
│   │   ├── descriptions/      # Control description sheet renderer
│   │   └── ui/                # Shared UI components
│   ├── core/
│   │   ├── models/            # Domain types: Course, Control, Event, etc.
│   │   ├── iof/               # IOF XML import/export
│   │   ├── files/             # Map file loaders (PDF, raster, omap)
│   │   └── geometry/          # Distance calc, coordinate transforms
│   ├── stores/                # Zustand stores
│   └── utils/                 # Shared utilities
├── public/
│   └── symbols/               # IOF control description symbol SVGs
├── package.json
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
- **Map**: The base orienteering map (loaded from file). Has a scale (e.g., 1:10000, 1:15000)
- **Course**: An ordered sequence of controls forming a route. Has a name and class assignments
- **Control**: A point on the map with a code (>30), position, and IOF description columns A-H
- **Leg**: The connection between two consecutive controls — drawn as a line
- **Control Description**: The 8-column IOF standard grid describing what's at each control
- **Overprint**: The purple/violet layer drawn on top of the base map showing the course
- **Start Triangle / Finish Circle**: Special symbols at course start/end (double circle for finish)

## IOF Standards We Follow

- **IOF Control Description Standard 2024** (backwards-compatible with 2018)
- **IOF XML Data Standard v3** for course data interchange
- **ISOM 2017-2** / **ISSprOM 2019-2** for map symbol cross-referencing
- **Purple overprint colour**: Defined in IOF printing standards — Pantone 814, or RGB approximation

## Competitive Landscape

- **PurplePen** (free, open source, Windows only) — the gold standard for course setting. Our primary inspiration.
- **Condes** (commercial, Windows only) — full-featured, used by larger events. Paid licence.
- **OCAD** (commercial, Windows + Mac) — primarily a map editor, has course setting module. Expensive.
- **OpenOrienteering Mapper** (free, cross-platform) — map editor with basic course setting. Not focused on it.

There is **no serious web-based course setting tool** in the orienteering ecosystem. This is our niche.

## Current Phase

**Phase 0 — Foundation** (where we are now)
- Project scaffolding and tooling
- Map loading (raster + PDF)
- Pan/zoom canvas with map display
- Basic control placement (click to add)
- Simple course model

## Getting Started (for Claude Code)

```bash
cd /Users/jim/Development/Personal/Overprint
# After scaffolding:
npm install
npm run dev
```

## Notes

- This is Jim's side project. Keep it fun, keep it clean, ship incrementally.
- PurplePen source is on GitHub (C#/.NET) — useful for understanding algorithms and IOF symbol rendering.
- The orienteering community is international — i18n will matter eventually, but not for MVP.
- Accessibility: canvas-based apps are inherently tricky for a11y. Acknowledge this but don't let it block progress.
