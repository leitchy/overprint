# Changelog

A condensed, in-repo index of notable changes per release. The full, canonical release
notes live on **[GitHub Releases](https://github.com/leitchy/overprint/releases)** — this
file summarises each tagged version. Dates are release dates; versions follow semver
(0.x pre-1.0). Untitled patch releases are grouped with their feature release.

## 0.32.0 — 2026-08-13
- **Offline / installable app (PWA).** A service worker precaches the whole app — shell, sample
  map/event, PDF fonts, and the PDF.js worker — so once Overprint has loaded it keeps working in
  the field with no signal. Add it to your home screen / desktop for a standalone window via
  **File → Install App**.
- **Safe updates.** A new version downloads in the background and is applied on your next launch —
  never mid-edit while you might be offline. A gentle banner offers to reload now (saving your work
  first), and **File → Check for Updates** forces a check.
- **Fix:** the shipped `Permissions-Policy` header was disabling geolocation in production, which
  broke GPS-based control placement; GPS now works on the live site again.
- *Under the hood:* a Playwright end-to-end harness verifies real offline behaviour (network cut →
  the app and sample map still render from cache), gated in CI.

## 0.31.1 — 2026-08-13
- **Fix:** the contextual help "?" popover no longer runs off the right edge of the screen (it
  now clamps within the viewport regardless of which panel it opens from — e.g. the right-hand
  Variations panel).

## 0.31.0 — 2026-08-13
- **Tool & zoom keyboard shortcuts.** `A` Add Control · `V` Pan · `D` Descriptions · `Space` (hold)
  temporary pan · `⌘/Ctrl +/-/0` zoom in/out/fit — wired through a shared viewport-actions module so
  the View menu and the keyboard stay in sync; the shortcuts modal now lists the real shortcuts. Fixes
  a long-standing dead `⇧⌘Z` redo (Shift makes the key uppercase), and hardens Space hold-to-pan against
  window-blur/mid-hold edge cases; `⌘Backspace` no longer deletes a control.
- **Contextual help.** A "?" button on the complex panels (Variations, Relay teams, Event Audit, Map
  Settings, GPS Calibrate) opens a short summary with a "Learn more" link that deep-links into the
  Getting Started guide.

## 0.30.0 — 2026-08-13
- **Always-visible language switcher.** A globe button (🌐 EN) in the top bar opens the app
  languages by native name — one click to switch, and crucially to switch *back* from any
  language. Fixes app language being buried three levels deep (View → Preferences → select),
  every step labelled in a language you might not read.
- **Truthful keyboard-shortcuts help.** The shortcuts modal now lists only shortcuts that are
  actually wired up (arrow-key pan, undo/redo, delete, `G` = place at GPS, `?`) and drops eight
  that never existed; zoom/pan are documented as mouse/touch gestures.
- **Expanded Getting Started** with sections for variations & relays, GPS placement, special
  items, and the event audit. **What's New** now opens the releases index (no more version-tag 404s).
- **Engineering.** New loader/PDF/IOF regression harnesses (OMAP & OCAD fidelity, PDF
  content-stream inspection, IOF round-trip; +113 tests), a green CI gate with the map fixtures
  committed, branch protection on `main`, and testing-strategy docs.

## 0.29.0 — 2026-08-12
- **E10 loop fairness.** Loop-length-imbalance **audit** (warns when butterfly/phi loops differ too
  much in length) and **cross-team first-loop spreading** in the relay scrambler (a deliberate
  improvement over PurplePen — spreads the mass-start first loop across teams).

## 0.28.0 — 2026-08-11
- **Relay fixed branch→leg pinning** (E10 Phase 3b). Force specific legs onto a branch via an inline
  matrix; per-leg fairness; pins remap on course duplicate and survive round-trip.

## 0.27.0 — 2026-08-11
- **Relay team assignment** (E10 Phase 3). N teams × L legs anti-following scrambler ported from
  PurplePen; IOF XML `TeamCourseAssignment` + team×leg PDF export.

## 0.26.0–0.26.5 — 2026-08-10 … 2026-08-11
- **0.26.0** — Butterfly/phi loops + IOF `CourseFamily` grouping (E10 Phase 2).
- **0.26.1** — Loop authoring UX (click-map-to-place + filtered picker).
- **0.26.2** — Per-loop / branch length readout in the Variations panel.
- **0.26.3** — Code-vs-sequence hint in the Variations panel.
- **0.26.4** — PDF map title no longer overflows/clips.
- **0.26.5** — OMAP & GPX exports enumerate fork/loop variations.

## 0.25.0 — 2026-08-10
- **Course forks / gaffling** — variations auto-enumerated with per-variation map/description/IOF
  export (E10 Phase 1).

## 0.20.0–0.24.2 — 2026-08-08 … 2026-08-10
- **0.20.0** — Print-quality OCAD/OMAP export. **0.20.1–0.20.2** — vector export fixes (bent legs,
  gapped circles).
- **0.21.0–0.21.1** — Crisp **true-vector** map export (OCAD/OMAP embedded as vectors via the
  in-house SVG→pdf-lib walker).
- **0.22.0** — OMAP course-overprint export + true IOF colour-order in the vector PDF path.
- **0.23.0** — Correct title/border colour defaults + unified overprint item-scaling.
- **0.24.0** — Roboto / Roboto Condensed control-description typography (PDF + screen).
- **0.24.1** — Description box respects its placed position. **0.24.2** — correct all-courses print
  framing on PurplePen import.

## 0.16.0–0.19.0 — 2026-03-22 … 2026-03-23
- **0.16.0** — OMAP text rendering + PurplePen research.
- **0.17.0** — OMAP renderer + course visibility. **0.17.1** — visibility polish.
- **0.18.0** — Course parts (map exchange / flip) + PDF fixes.
- **0.19.0** — Auto description boxes + multi-page PDF export.

## 0.13.0–0.15.3 — 2026-03-21 … 2026-03-22
- **0.13.0** — GPS-based control placement (georef, proj4, calibration, auto-follow). **0.13.1** — GPS
  polish + documentation audit.
- **0.14.0** — PurplePen `.ppen` import.
- **0.15.0** — Course visibility & OMAP fixes. **0.15.1–0.15.3** — follow-up patch fixes.

## 0.10.0–0.12.1 — 2026-03-20 … 2026-03-21
- **0.10.0** — Mobile & tablet support (responsive UI, touch interactions).
- **0.11.0** — Print quality & event validation/audit.
- **0.12.0** — Leg bend points & leg gaps (all high-priority gaps complete). **0.12.1** — touch leg
  bend & gap markers.

## 0.9.0 — 2026-03-20

First pre-release. Core orienteering course setting features complete.

### Map Support
- Load raster images (PNG, JPEG, GIF, TIFF, BMP), PDF, OCAD (.ocd), and OpenOrienteering Mapper (.omap, .xmap)
- Map scale and DPI calibration
- Pan, zoom, and fit-to-window navigation

### Course Design
- Multi-course management with shared controls
- Control placement, drag-to-reposition, delete
- Start triangle, finish circles, crossing points, map exchange symbols
- Score course support with point values
- Rubber-band preview line when adding controls
- Click on a leg to insert a new control

### IOF Control Descriptions
- Interactive 8-column IOF description sheet with symbol picker
- 22 IOF description languages
- Description box overlay on the map

### Export
- PDF course maps: single course, all courses (one PDF), batch (separate files)
- PDF description sheets
- IOF XML v3 import and export
- PNG and JPEG image export

### Print Settings
- Page size (A4, A3, Letter), orientation, margins
- Per-course print scale and page orientation overrides
- Print boundary overlay
- Overprint appearance customization (circle diameter, line width, number size)

### Special Items
- Text, lines, rectangles with color and line width editing
- IOF symbols: out of bounds, dangerous area, water, first aid, forbidden route
- Context-aware format toolbar for all item types

### General
- 8 UI languages (English, French, German, Spanish, Finnish, Italian, Swedish, Japanese)
- Undo/redo with keyboard shortcuts
- Save/load .overprint event format
- In-app help: keyboard shortcuts modal, getting started guide
- Deployed at overprint.com.au
