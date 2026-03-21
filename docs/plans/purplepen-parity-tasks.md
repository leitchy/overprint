# Overprint — Master Task List

Prioritised backlog derived from [PurplePen gap analysis](../research/purplepen-gap-analysis.md), GPS feature work, and ongoing development sessions.

**Effort**: S (hours), M (1-2 days), L (3-5 days), XL (1-2 weeks)
**Value**: 1 (nice-to-have) → 5 (critical for real-world use)
**Status**: done / not started / in progress

Last updated: 2026-03-21

---

## Completed

| # | Task | Version | Notes |
|---|---|---|---|
| 1 | Duplicate course | v0.12.0 | |
| 6 | PDF vector preservation | v0.12.0 | Re-embed original PDF pages in export |
| 7 | Overprint blending (screen) | v0.12.0 | CSS multiply blend on course layer |
| 9 | Leg bend points | v0.12.0 | Draggable bend points on legs |
| 10 | Leg gap (hidden segment) | v0.12.0 | Gap boundary markers |
| 11 | Event audit / validation | v0.11.0 | Missing descriptions, duplicate codes, short/long legs, etc. |
| — | GPS-based control placement | v0.13.0 | Full 7-phase implementation: georef extraction, proj4 transforms, GPS UI, calibration, auto-follow, wake lock |
| — | Score course support | v0.12.0 | Toggle, point values, no legs, sorted descriptions |
| — | Crossing points / map exchange symbols | v0.12.0 | X and inverted triangle, type cycling |
| — | Multi-page PDF export | v0.12.0 | All courses in one PDF, per-course page orientation |
| — | Batch PDF export | v0.12.0 | Each course as separate PDF |
| — | Save with embedded map | v0.13.0 | Self-contained .overprint files with base64 map image |
| — | 8 UI languages + 22 IOF description languages | v0.10.0 | en, fr, de, es, fi, it, sv, ja |

---

## Quick Wins

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 2 | Auto-save (localStorage) | S | 4 | not started | Periodic save, restore on reload, prevents data loss |
| 3 | Bulk control code renumbering | S | 3 | not started | Renumber all codes sequentially from a starting value |
| 4 | Context menus (right-click) | M | 3 | not started | Control: edit/delete/insert. Canvas: add control. Course panel: duplicate/delete |
| 5 | GPX export | S | 3 | not started | Export control positions as waypoints. Easier now with georef support |
| 13 | All controls cross-reference report | S | 3 | not started | Table showing which courses use which controls |
| 14 | Leg length report | S | 2 | not started | Summary table of all leg lengths across the event |

---

## Core Quality

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 8 | Overprint blending (PDF/CMYK) | XL | 4 | not started | CMYK overprint in exported PDFs — requires pdf-lib colour space work |
| 24 | CMYK colour space in PDF | L | 2 | not started | Professional print shop support. Depends on #8 |

---

## GPS Enhancements

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 35 | GPS coordinates in IOF XML export | S | 3 | not started | Save WGS84 coords in `<MapPosition>` — allows import into other software with correct georef |
| 36 | Compass heading arrow on GPS dot | S | 2 | not started | Use `GeolocationCoordinates.heading` to show direction of travel |

---

## Appearance & UI

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 26 | Per-item line appearance | M | 2 | not started | Override line weight/colour on individual items |
| 27 | Control number font choice | S | 1 | not started | Font selection for control numbers on map |
| 28 | Per-course appearance overrides | M | 2 | not started | Override circle size, line weight per course |
| 31 | Dark mode | M | 2 | not started | Theme toggle — canvas + UI |
| 37 | Map auto-dim manual control | S | 3 | not started | Checkbox + slider in appearance UI to dim map behind overprint |

---

## Description Sheet Enhancements

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 15 | Multi-column description layout | M | 3 | not started | 2 or 3 columns to save paper for large courses |

---

## Special Items & Annotations

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 16 | Custom image placement | M | 2 | not started | Sponsor logos, event info on canvas |
| 17 | Boundary line special item | S | 2 | not started | Dedicated course boundary marking tool |

---

## Validation & Analysis

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 12 | Competitor load analysis | M | 3 | not started | Count expected visitors per control/leg. Table or heat-map |
| 38 | Special item properties panel | M | 3 | not started | Edit font, colour, size, course assignment for selected items |

---

## File Format & Interop

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 18 | PurplePen .ppen import | L | 4 | not started | Parse PP's XML format — migration path for existing users |
| 19 | IOF XML v2 export | S | 2 | not started | Legacy format for older electronic punching systems |
| 20 | OCAD export (write .ocd) | XL | 2 | not started | Write overprint back into OCAD files — complex binary format |
| 21 | OOM export (write .omap) | L | 2 | not started | Write overprint into OOM XML format |
| 22 | KML export | S | 1 | not started | Control locations as KML placemarks |
| 23 | RouteGadget export | M | 1 | not started | Map image + control data for online analysis |

---

## Print & Export Enhancements

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 25 | Master punch card generation | M | 1 | not started | Pin-punch card validation sheet — declining usage |

---

## UI & Platform

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 29 | Additional UI languages | S per lang | 3 | not started | Polish, Hungarian, Bulgarian, Romanian, Estonian |
| 30 | PWA / offline mode | M | 3 | not started | Service worker for offline use in the field |
| 39 | User documentation | M | 3 | not started | Getting started guide, feature walkthroughs |

---

## Advanced Course Types

| # | Task | Effort | Value | Status | Notes |
|---|---|---|---|---|---|
| 32 | Relay variations / gaffling | XL | 2 | not started | Fork/loop data model, variation enumeration |
| 33 | Relay team assignment | L | 2 | not started | Fair distribution of variations across teams. Depends on #32 |
| 34 | Map exchange multi-page awareness | M | 3 | not started | Split PDF output at map exchange points |

---

## Suggested Next Priorities

Highest value items not yet done, ordered by value/effort ratio:

1. **#2 Auto-save** — S effort, value 4. Prevents data loss, essential for field use
2. **#5 GPX export** — S effort, value 3. Trivial now with georef pipeline
3. **#3 Bulk code renumbering** — S effort, value 3
4. **#13 All controls cross-reference** — S effort, value 3
5. **#37 Map auto-dim** — S effort, value 3
6. **#18 PurplePen .ppen import** — L effort, value 4. Key for user adoption
7. **#30 PWA / offline mode** — M effort, value 3. Critical for field use alongside GPS
8. **#4 Context menus** — M effort, value 3
9. **#8 CMYK overprint (PDF)** — XL effort, value 4. Biggest remaining print quality gap
