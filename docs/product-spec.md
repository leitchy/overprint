# Overprint — Product Specification

## Vision

A free, web-based orienteering course setting tool that runs on any device with a modern browser. Inspired by PurplePen, built for the web.

## Target Users

1. **Club-level course setters** — the most common user. Setting courses for local/regional events. Currently forced to use Windows (PurplePen) or pay for Condes. Many are on Mac or want to work from a tablet in the field.
2. **Event organisers** — need to review and approve courses. Currently must have PurplePen installed.
3. **Newcomers** — people learning to set courses who want zero-friction access.

## User Stories (MVP)

### Map Loading
- As a course setter, I want to load a map image (PNG/JPEG) so I can start placing controls
- As a course setter, I want to load a PDF map so I can use my existing map files
- As a course setter, I want to set the map scale so course lengths are calculated correctly
- As a course setter, I want to pan and zoom the map smoothly, including on touch devices

### Course Design
- As a course setter, I want to create a new course with a name
- As a course setter, I want to place a start triangle on the map
- As a course setter, I want to place controls on the map by clicking/tapping
- As a course setter, I want controls to be automatically numbered and coded (>30)
- As a course setter, I want to place a finish (double circle) on the map
- As a course setter, I want to see connecting lines (legs) drawn between controls automatically
- As a course setter, I want to drag controls to reposition them
- As a course setter, I want to delete a control from a course
- As a course setter, I want to insert a control between two existing controls
- As a course setter, I want to see the total course length updated in real time

### Control Descriptions
- As a course setter, I want to set the IOF control description for each control using a visual picker
- As a course setter, I want to see a rendered control description sheet alongside the map
- As a course setter, I want the description sheet to follow the IOF 2024 standard layout (8 columns)

### File Operations
- As a course setter, I want to save my event to a file so I can continue later
- As a course setter, I want to load a previously saved event file
- As a course setter, I want to export the course as a PDF with purple overprint on the map
- As a course setter, I want to export the control description sheet as a PDF

## Feature Phases

### Phase 0 — Foundation
**Goal**: Get a working canvas with a map and interactive controls.

- [ ] Project scaffolding (Vite + React + TypeScript + Tailwind)
- [ ] Map loading: raster images (PNG, JPEG)
- [ ] Map loading: PDF (first page, rasterised to canvas)
- [ ] Canvas: pan and zoom (mouse wheel, trackpad, touch pinch)
- [ ] Canvas: display map at correct aspect ratio
- [ ] Map scale configuration (user enters scale, e.g. 1:10000)
- [ ] Data model: Event, Course, Control, Leg

### Phase 1 — Core Course Setting
**Goal**: Place controls, see courses, get descriptions.

- [ ] Map loading: OCAD files via ocad2geojson (see ADR-010)
- [ ] Control placement: click to add control at map position
- [ ] Start triangle rendering
- [ ] Finish circle rendering (double circle, IOF spec)
- [ ] Connecting legs between consecutive controls
- [ ] Control code assignment (auto-incrementing from 31)
- [ ] Control number display on map (course sequence number)
- [ ] Drag to reposition controls
- [ ] Delete control
- [ ] Insert control between existing controls
- [ ] Reorder controls within a course
- [ ] Course length calculation (using map scale + pixel distance)
- [ ] Undo/redo (minimum 50 levels)

### Phase 2 — Control Descriptions
**Goal**: IOF-standard description sheets.

- [ ] IOF 2024 control description symbol set (SVG icons)
- [ ] Description editor: click column to set symbol for each control
- [ ] 8-column description sheet renderer
- [ ] Auto-generated textual descriptions (English first)
- [ ] Description sheet: display alongside map or as overlay

### Phase 3 — Import/Export
**Goal**: Interoperate with the orienteering ecosystem.

- [ ] Save/load event as Overprint JSON format
- [ ] Export IOF XML v3 (course data for electronic punching systems)
- [ ] Export PDF: map with purple course overprint
- [ ] Export PDF: control description sheets
- [ ] Export PNG/JPEG of course map
- [ ] Import IOF XML v3 (load courses from other software)

### Phase 4 — Multi-Course & Advanced
**Goal**: Handle real-world event complexity.

- [ ] Multiple courses per event
- [ ] Course list panel: switch between courses
- [ ] Shared controls across courses (same code, synced descriptions)
- [ ] All-controls map view
- [ ] Score/rogaine courses (unordered, with point values)
- [ ] Map exchange (butterfly loops, map swap points)
- [ ] Relay variations / gaffling (basic)
- [ ] Competitor load calculation per control/leg

### Phase 5 — Map Format Support
**Goal**: Native orienteering map file support beyond OCAD.

- [ ] OpenOrienteering Mapper (.omap) file loading — XML format, render map layers to canvas
- [ ] OpenOrienteering Mapper (.xmap) support
- [ ] Map layer visibility toggles

### Phase 6 — Polish & Community
**Goal**: Production-ready for the orienteering community.

- [ ] Localisation / i18n (at minimum: English, French, German, Swedish, Norwegian)
- [ ] Textual control descriptions in multiple languages
- [ ] Touch-optimised UI for tablets
- [ ] Keyboard shortcuts
- [ ] Print-specific layout and DPI handling
- [ ] Purple Pen .ppen file import (XML-based format)
- [ ] Event audit / course validation checks
- [ ] GPX export of control locations
- [ ] Customise course appearance (circle size, line width, number size)
- [ ] Dark mode

## Non-Goals (for now)

- Real-time collaboration (too complex for a side project)
- User accounts / cloud storage (keep it file-based and local)
- Map drawing / editing (use OOM or OCAD for that)
- Results / timing integration
- Native mobile app (the web app should be good enough on mobile browsers)

## Design Principles

1. **Map first** — the map canvas dominates the UI. Everything else is secondary.
2. **Direct manipulation** — click to place, drag to move, click to describe. No modal dialogs for basic operations.
3. **Instant feedback** — course length updates live, descriptions render in real time, no explicit "refresh".
4. **Offline-capable** — once loaded, the app should work without a network connection (PWA).
5. **File-based** — no accounts, no cloud. You own your files. Save to disk, share however you want.
6. **Respect the standards** — IOF 2024 control descriptions, IOF XML v3, correct purple overprint rendering.

## Success Metrics

For a side project, "success" is:
- Can load a real orienteering map and set a course on it
- A course setter at a local event can use it instead of PurplePen for a simple event
- At least one person who isn't Jim uses it and finds it useful
