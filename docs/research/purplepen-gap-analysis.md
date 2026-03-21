# PurplePen vs Overprint — Gap Analysis

> **Last updated**: 2026-03-21. The master backlog for PurplePen parity work is now maintained in `docs/plans/purplepen-parity-tasks.md`.

Feature-by-feature comparison. Status reflects Overprint's current implementation against PurplePen 3.5.x.

**Legend**: done = implemented, partial = partially implemented, gap = not implemented, n/a = not applicable to web

---

## 1. Map File Support

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Raster images (PNG, JPEG, TIFF, GIF) | yes | yes | done | BMP not supported (rare, low priority) |
| PDF maps | yes | yes | done | PP preserves vectors in export; Overprint rasterises to canvas |
| OCAD files (v6-12) | yes | yes | done | Via ocad2geojson; PP has full binary parser |
| OpenOrienteering Mapper (.omap/.xmap) | yes | yes | done | |
| OCAD encrypted files | yes | no | gap | Rare in practice |
| BMP images | yes | no | gap | Trivial to add, very low priority |

### PDF vector preservation

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| PDF map embedded as vector in PDF export | yes | yes | done | v0.12.0 — PDF pages embedded as vectors in export via pdf-lib |

---

## 2. Core Course Design

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Click to place controls | yes | yes | done | |
| Drag to move controls | yes | yes | done | |
| Delete controls | yes | yes | done | |
| Auto control code assignment (31+) | yes | yes | done | Overprint also skips ambiguous codes |
| Start triangle | yes | yes | done | |
| Finish double circle | yes | yes | done | |
| Automatic leg drawing | yes | yes | done | |
| Control number display | yes | yes | done | |
| Insert control between existing | yes | yes | done | |
| Reorder controls | yes | yes | done | Drag-and-drop in course panel |
| Course length calculation (live) | yes | yes | done | |
| Climb value | yes | yes | done | Manual entry; PP also manual |
| Shared controls across courses | yes | yes | done | |
| All-controls view | yes | yes | done | |
| Duplicate course | yes | yes | done | v0.12.0 |
| Bulk code renumbering | yes | no | gap | PP can renumber all codes at once |
| Leg bend modification | yes | yes | done | v0.12.0 — touch and mouse bend interaction |
| Leg gap modification | yes | yes | done | v0.12.0 — hidden segment with gap boundary markers |

---

## 3. Course Types

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Linear courses | yes | yes | done | |
| Score/rogaine courses | yes | yes | done | Toggle, point values, sorted descriptions |
| Crossing points | yes | yes | done | X symbol, type cycling |
| Map exchange points | yes | yes | done | Inverted triangle, type cycling |
| Relay variations / gaffling | yes | no | gap | Forks, loops, butterfly exchanges |
| Relay team assignment (fairness) | yes | no | gap | Auto-assigns variations to teams |
| Map exchange multi-page output | yes | partial | partial | Overprint has multi-page PDF but not map-exchange-aware splitting |

---

## 4. Control Descriptions

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| IOF 2024 standard (8-column) | yes | yes | done | |
| IOF 2018 standard | yes | yes | done | |
| IOF 2004/2000 standard | yes | no | gap | Legacy, very low priority |
| Interactive symbol picker | yes | yes | done | |
| Symbolic descriptions | yes | yes | done | |
| Textual descriptions | yes | yes | done | |
| Combined (symbols + text) | yes | yes | done | |
| Description languages | 18 | 22 | done | Overprint has more languages |
| Draggable sequence numbers | yes | yes | done | |
| Description sheet as PDF | yes | yes | done | |
| Multi-column description layout | yes | no | gap | PP can render descriptions in 2+ columns |

---

## 5. Special Items / Map Annotations

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Text objects | yes | yes | done | Inline editing, font/size/bold/italic/colour |
| Lines | yes | yes | done | |
| Rectangles | yes | yes | done | |
| Out of bounds area | yes | yes | done | Hatched square symbol |
| Dangerous area | yes | yes | done | Triangle with ! |
| Water location | yes | yes | done | |
| First aid | yes | yes | done | |
| Forbidden route | yes | yes | done | |
| Custom images (embed on map) | yes | no | gap | PP can place arbitrary images |
| Boundary line (course boundary) | yes | no | gap | PP has a dedicated boundary special item |
| Per-course visibility | yes | yes | done | |

---

## 6. Print & PDF Export

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Single course PDF | yes | yes | done | |
| All courses in one PDF | yes | yes | done | Multi-page |
| Batch export (each course separate PDF) | yes | yes | done | Directory picker or auto-download |
| Course-centred layout | yes | yes | done | |
| Title and scale bar | yes | yes | done | |
| Print scale (per course) | yes | yes | done | |
| Page size selection | yes | yes | done | A4, A3, Letter, custom |
| Page orientation (per course) | yes | yes | done | |
| Margins configuration | yes | yes | done | |
| Print area bounding box (per course) | yes | yes | done | |
| Multi-page tiling (large courses) | yes | yes | done | 15mm overlap |
| PNG/JPEG export | yes | yes | done | |
| IOF XML v3 export | yes | yes | done | |
| IOF XML v3 import | yes | yes | done | |
| IOF XML v2 export | yes | no | gap | Legacy format, low priority |
| OCAD export (write back to .ocd) | yes | no | gap | PP can export overprint into OCAD files |
| OOM export (write back to .omap) | yes | no | gap | PP can export to OOM format |
| GPX export | yes | no | gap | Control locations as waypoints |
| KML export | yes | no | gap | For GIS tools |
| RouteGadget export | yes | no | gap | For online route analysis |
| CMYK colour space in PDF | yes | no | gap | For professional print shops |
| Overprint blending (purple + map) | yes | no | gap | Dark map features show through purple |
| PDF vector preservation (PDF maps) | yes | yes | done | v0.12.0 — see section 1 |
| Master punch card generation | yes | no | gap | For pin-punch card validation |
| Per-variation PDF export | yes | no | gap | Requires relay/gaffling support |

---

## 7. Appearance Customisation

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Control circle size | yes | yes | done | Event-level setting |
| Line width | yes | yes | done | Event-level setting |
| Number/sequence size | yes | yes | done | Event-level setting |
| IOF standard selection (ISOM/ISSprOM) | yes | yes | done | |
| Overprint effect (blending) | yes | no | gap | |
| Custom line appearance per item | yes | no | gap | PP allows per-item line weight/colour |
| Control number font choice | yes | no | gap | PP offers Arial/Roboto |
| Per-course appearance overrides | yes | no | gap | Overprint has event-level only |

---

## 8. Analysis & Validation

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Course length | yes | yes | done | |
| Leg lengths | yes | yes | done | |
| Climb (manual entry) | yes | yes | done | |
| Event audit / validation report | yes | yes | done | v0.11.0 — checks for common course setting errors |
| Competitor load analysis | yes | no | gap | Visitors per control/leg |
| All controls cross-reference | yes | no | gap | Which courses use which controls |
| Leg length report | yes | no | gap | Summary of all leg lengths across event |

---

## 9. UI & Platform

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Windows desktop | yes | n/a | n/a | PP is Windows-only |
| Cross-platform (Mac, Linux, tablet) | no | yes | **advantage** | Overprint's primary value proposition |
| No install required | no | yes | **advantage** | Runs in browser |
| Touch support | no | yes | **advantage** | Pan/zoom/pinch on touch devices |
| Undo/redo | 100 levels | 100 levels | done | |
| Keyboard shortcuts | yes | yes | done | |
| UI languages | 13+ | 8 | gap | PP has Polish, Hungarian, Bulgarian, Romanian, Estonian, Finnish |
| Context menus | yes | no | gap | PP has right-click menus |
| Dark mode | no | no | — | Neither has it |
| HiDPI display support | yes | yes | done | Canvas renders at device pixel ratio |
| Offline capability (PWA) | n/a | no | gap | Product spec mentions PWA as a goal |

---

## 10. File Management

| Feature | PP | Overprint | Status | Notes |
|---|---|---|---|---|
| Native save/load format | .ppen | .overprint | done | Different formats |
| PurplePen .ppen import | n/a | no | gap | Migration path from PP |
| Auto-save | yes | no | gap | PP auto-saves; Overprint requires manual save |
| File System Access API (Cmd+S) | n/a | yes | **advantage** | Chromium browsers get native save dialog |
| Drag-and-drop file loading | yes | yes | done | |

---

## Summary: Key Gaps by Priority

### High Priority (core workflow gaps)

| Gap | Impact | Effort |
|---|---|---|
| ~~PDF vector preservation in export~~ | ~~Print quality for PDF-source maps~~ | done v0.12.0 |
| Overprint blending | Print realism — purple obscures dark map features | High — CMYK compositing in PDF |
| ~~Event audit / validation~~ | ~~Catches mistakes before printing~~ | done v0.11.0 |
| ~~Duplicate course~~ | ~~Common workflow (create variant from existing)~~ | done v0.12.0 |
| ~~Leg bend/gap~~ | ~~Required for courses through complex terrain~~ | done v0.12.0 |

### Medium Priority (power user features)

| Gap | Impact | Effort |
|---|---|---|
| Competitor load analysis | Expected by experienced setters | Medium |
| Multi-column description layout | Saves paper for large events | Low-Medium |
| Context menus (right-click) | Faster workflow | Low |
| Auto-save | Prevents data loss | Low |
| Bulk code renumbering | Convenience for large events | Low |
| Custom images on map | Sponsor logos, event info | Medium |
| Additional UI languages | Broader international adoption | Low (translation effort) |
| PurplePen .ppen import | Migration from PP | Medium — XML parsing |
| PWA / offline mode | Field use without connectivity | Low-Medium |
| GPX export | GPS device integration | Low |

### Low Priority (niche / advanced)

| Gap | Impact | Effort |
|---|---|---|
| Relay variations / gaffling | Complex events only | Very High |
| Relay team assignment | Requires gaffling first | High |
| OCAD/OOM export | Power users who go back to mapping software | High |
| KML / RouteGadget export | Niche integrations | Low-Medium |
| CMYK colour space | Professional print shops | Medium |
| IOF XML v2 | Legacy systems only | Low |
| Master punch cards | Pin-punch events (declining usage) | Medium |
| Per-item appearance customisation | Fine-grained control | Medium |
| IOF 2004 standard | Obsolete | Very Low |
| Boundary line special item | Rare use case | Low |
| OCAD encrypted files | Rare | Low |

---

## Overprint Advantages (features PP lacks)

| Feature | Notes |
|---|---|
| Cross-platform | Mac, Linux, tablets, phones — PP is Windows-only |
| No installation | Runs in any modern browser |
| Touch/mobile support | Pinch zoom, touch pan — PP has no touch support |
| Modern UI | Clean React UI vs dated WinForms |
| File System Access API | Native save dialogs in Chromium |
| 22 IOF description languages | PP has 18 |
| Score course toggle | Easy on/off per course |
| Open web standards | No vendor lock-in, easy to extend |

---

## Recommendations

1. ~~**PDF vector preservation**~~ — done in v0.12.0
2. ~~**Duplicate course**~~ — done in v0.12.0. **Auto-save** remains a quick win for daily workflow
3. ~~**Event audit**~~ — done in v0.11.0
4. **Overprint blending** is visually important but technically complex — defer until CMYK pipeline is designed
5. **Relay/gaffling** is the largest feature gap but serves a niche audience — defer to later phases
6. **.ppen import** would ease migration and could drive adoption from existing PP users
