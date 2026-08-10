# Overprint — Standards Conformance Plan (ISOM / ISSprOM / IOF + PurplePen parity)

Status: **living plan**, compiled 2026-08-06 from four cited research passes (course-symbol
dimensions, control descriptions, PurplePen feature parity, export/data-interchange). Every
requirement here traces to a primary source; every "current" state was read from the repo.
This supersedes the stale `docs/research/purplepen-gap-analysis.md` and
`docs/plans/purplepen-parity-tasks.md` (both pre-v0.16, ~10 items now out of date).

Primary sources (cached PDFs available; see bibliography): IOF **ISOM 2017-2 Rev 6 (Jan 2024)**
§3.7; **ISSprOM 2019-2 Rev 6** §4.7; **IOF Map Specifications – Printing & Colour Definitions
Rev 4 (2024)**; **IOF Control Descriptions 2018/2024**; **IOF XML v3 (IOF.xsd)**; PurplePen
source (`github.com/petergolde/PurplePen`) + change summary.

---

## 0. The single most important correction

Overprint's purple was modelled as an **RGB `multiply` blend** — that is **not** how the
standard or PurplePen works. Per **ISOM 2017 Appendix 1 §5** and **§3.7**: the course purple is
a **solid, consistent colour** (CMYK **35/85/0/0** / PMS "Purple"; there is **no** IOF RGB), and
map detail shows through by **colour/draw ORDER** — the purple sits in the colour table **below
black, brown and blue 100%** (those draw over it), while covering area screens/fills. IOF
*"does not recommend more advanced methods"* (transparency/blend). See [ADR-016](../adrs/ADR-016-overprint-colour-and-colour-order.md).

Already done (2026-08, uncommitted pending review): screen overprint switched multiply→**solid**
`#BB29BB` (PMS Purple sRGB); PDF/special-item purples single-sourced to the same constant.
Bonus: solid (no blend mode) removes the WebKit/Safari blocker for the DOM-SVG path ([ADR-015](../adrs/ADR-015-live-dom-svg-map-layer.md)).

---

## 1. Authoritative dimension table (build the renderer from this)

All dimensions are **mm at the reference scale** — ISOM **1:15 000**, ISSprOM **1:4 000** — then
scaled: ISOM ×1.5 @1:10 000, ×3.0 @1:5 000; ISSprOM ×1.33 @1:3 000 [ISOM §3.7 / ISSprOM §4.7].
Circle/finish diameters are **centre-to-centre of the stroke** (PurplePen stores outside dia:
5.0 CC = 5.35 outside at 0.35 line).

| Symbol | ISOM (1:15000) | ISSprOM (1:4000) | Line | Colour layer |
|---|---|---|---|---|
| 701 Start triangle (side) | **6.0** | **7.0** | 0.35 | lower |
| 703 Control circle (ø CC) | **5.0** | **6.0** | 0.35 | lower |
| 704 Control number (digit height) | **4.0**, Arial **non-bold**, N-up | 4.0 | — | lower (ISOM) / **upper** + optional white outline 0.1–0.15 (sprint) |
| 705 Course/connecting line | — | — | 0.35 | lower |
| 706 Finish (two ø CC) | **4.0 & 6.0** | **5.0 & 7.0** | 0.35 | lower |
| 702 Map issue point (bar) | 2.5 × 0.6 | 2.5 × 0.6 | — | upper |
| 707 Marked route (dash/gap) | 2.0 / 0.5 | 2.0 / 0.5 | 0.35 | upper |
| 708 OOB boundary (solid) | — | — | **0.7** / **1.0** (sprint) | lower |
| 709 OOB area (45° hatch) | hatch line 0.25, spacing 1.2 CC; bound 0.2 | hatch 0.2; bound 0.4 | — | upper |
| 710 Crossing point | two **outward-curving** lines, gap 0.6, min len 3.0 | 710.1 width 0.5, gap 1.0, overall 4.5; 710.2 section: parallel 0.35, gap 1.5 | — | lower / (710.2 upper) |
| 711 OOB/forbidden route (line of ✗) | cross 3.0, spacing 4.0–6.0 CC, min 2 | (not in ISSprOM) | 0.35 | upper |
| 712 First aid (plus) | 4.0 × 4.0 | (not in ISSprOM) | 1.33 | lower |
| 713 Refreshment (**cup**) | 3.5 × 3.5, bottom 2.1 | (not in ISSprOM) | 0.4 | lower |
| 714 Temporary construction (sprint) | (n/a) | plan-shape area, outline 0.1, fill purple 50% | 0.1 | — |
| 715 Continuing point after exchange | triangle-in-circle ø **5.0** | ø **6.0** | 0.35 | lower |
| Purple | CMYK 35/85/0/0 / PMS "Purple" | same | — | — |

**Colour order** (Printing Defs Rev 4 §6): **upper purple** (above black) = 702, 707, 709, 711
(+ sprint 704, 710.2, 714); **lower purple** (below black/brown/blue 100%, above area colours) =
701, 703, 704(ISOM), 705, 706, 708, 710.1, 712, 713.

---

## 2. Workstream A — Overprint rendering fidelity (highest correctness value)

Current state read from `src/core/geometry/overprint-dimensions.ts`, `constants.ts`,
`defaults.ts`, `src/components/course/*`, `src/core/export/pdf-overprint-renderer.ts`.

| # | Gap (confirmed) | Fix | Effort |
|---|---|---|---|
| A1 | **Line width 0.2 mm** (`defaults.ts:27`) — spec is **0.35 mm** | Change default; migrate existing `.overprint` files (bump on load) | S |
| A2 | **Finish circles 5.0/3.5 mm** (`constants.ts:46-47`) — spec **6.0/4.0** (ISOM), **7.0/5.0** (sprint). Current values look like old ISOM-2000/punch-card | Correct + per-standard table | S |
| A3 | **`mapStandard` stored but never read** — ISSprOM events render with ISOM dims (circle 5.0 vs 6.0, triangle 6.0 vs 7.0, finish wrong) | Key `IOF_OVERPRINT_MM` by `settings.mapStandard`; wire into `overprintPixelDimensions` + PDF renderer; expose in print settings | M |
| A4 | **Control number**: 4.0 mm used directly as font size → digit ≈2.9 mm (~30% small); **bold** (spec non-bold); halo inconsistent (screen 2px always, PDF none) | digit-height→Em factor (~1.39, per PP 5.57/4.0); drop bold; optional mm-width white outline in BOTH targets | S |
| A5 | **Crossing point drawn as ✗** (`crossing-point.tsx`) — the ✗ is the *forbidden-route* motif. Spec 710 = gap flanked by two outward-curving lines, oriented along the crossed feature | Redraw as curved bracket pair, rotatable; sprint 710.1 dims | M |
| A6 | **No circle gaps** — spec 703/705: omit sections to reveal detail. Only number-gap constant exists | Arc-gap model per control (angle pairs, cf. PP `CircleGap.cs`) + drag UI | M |
| A7 | **No auto leg-cut** where legs cross other circles/legs (PP `AutoCutLegs`, 3.5 mm) — only own-leg shortening + manual gaps today | Chord-cut where legs intersect other circles/legs | M |
| A8 | **Item scaling: screen ≠ PDF** when printScale≠mapScale (screen ≈ RelativeToMap, PDF ≈ absolute) | One shared sizing model; add PP-style `None / RelativeToMap / RelativeTo15000` (ISOM 150%/300% rule) | M |
| A9 | **715 map-exchange** rendered as inverted start triangle (non-standard) | Triangle-in-circle per 2024 Rev 6 | M |

## 3. Workstream B — Course symbol coverage (special items in mm, not fixed px)

Special-item symbols are fixed **20 px / 12 pt**, not mm and not scale-aware
(`special-items-layer.tsx`, `pdf-course-map.ts`).

| # | Gap | Fix | Effort |
|---|---|---|---|
| B1 | **707 marked route** missing (only solid generic line) | Dashed line style 2.0/0.5 mm | M |
| B2 | **708 OOB boundary** missing | Line preset 0.7/1.0 mm | S–M |
| B3 | **709 OOB area** is a fixed-px placeholder, not a drawable polygon with 45° hatch | Polygon tool + hatch at spec mm + 3 boundary variants | L |
| B4 | **711 forbidden route** is a single fixed-px ✗ | Polyline decorated with 3.0 mm crosses @4–6 mm | M |
| B5 | **712 first aid / 713 refreshment** wrong units; 713 uses a *water* glyph not a **cup** | Re-dimension to mm; correct cup path | S |
| B6 | **702 map issue point** missing | Point symbol w/ rotation | S |
| B7 | Non-standard "dangerous area" glyph presented as an IOF symbol | Remove or map to 709-style area | S |

## 4. Workstream C — Control descriptions (IOF CD 2018/2024)

Read from `src/components/descriptions/*`, `src/core/descriptions/*`, `src/core/export/pdf-description-sheet.ts`, `pdf-course-map.ts` (DescRow box), `svg-control-descriptions@2.1.0`.

| # | Gap | Fix | Effort |
|---|---|---|---|
| C1 | **Column F holds a symbol ID only** — cannot express dimensions ("2.5", "8 x 4"); PP dimension text **dropped on `.ppen` import** | Add `columnFText` (symbol\|text) to model, picker, all 3 renderers, ppen import/export | M |
| C2 | **Crossing points render as ordinary numbered rows** (consume a sequence number) | Emit directive DescRows (13.3/13.4 SVGs, no seq); add marked-route rows (13.1/13.2) | M |
| C3 | **Finish row** hard-coded; can't express 14.1 taped / 14.2 funnel / 14.3 navigate; **start row** lacks the triangle in column A | Finish-type setting + start triangle SVG (package already ships them) | S–M |
| C4 | **No thick rule line every 3rd row / special-row borders**; box can shrink below the 5 mm minimum | Thick-line pass; floor at 5 mm | S |
| C5 | **Three renderers diverge** (km/climb rounding, headers) — sheet PDF shows raw "4300 m", canvas adds non-spec letter row | Extract the DescRow builder into one shared module; unify | M |
| C6 | **Standalone sheet PDF has no pagination** — long courses draw off-page; continuation columns lack repeated header | Paginate; repeat course/length row | M |
| C7 | Text-description mode renders symbol *names in the grid*, not sentence rows; sheet export ignores appearance | Text mode → single wide cell per row; thread appearance into sheet export | M |
| C8 | Fonts: Helvetica/sans-serif vs PP's Roboto/Roboto Condensed (see ADR-014) | Embed Roboto subsets, per-element sizing | M |
| C9 | Missing H-symbol 12.3 radio/TV (not in the package); exchange/flip use hand-drawn arrows not 13.5/15.6 SVGs | Add symbol; swap to bundled SVGs | S |

## 5. Workstream D — Export, print & data interchange

| # | Gap | Fix | Effort |
|---|---|---|---|
| D1 | **PDF purple mismatch** (was hardcoded old `#C850A0`) | **DONE** — single-sourced to `OVERPRINT_PURPLE` | ✓ |
| D2 | **PDF is opaque RGB purple on top** — no CMYK, no colour-order/overprint → purple obscures black/brown/blue in print (what App.1 exists to prevent) | Emit DeviceCMYK 35/85/0/0 (pdf-lib `cmyk()`); interim: Darken ExtGState on overprint layer (toggle, default on). True colour-order = draw map black/brown/blue 100% above purple — rides on the vector-PDF pipeline | M → L |
| D3 | **IOF XML v3 export is NOT schema-valid**: uses `<Control><ControlId>` inside `<Course>` (schema wants `<CourseControl type><Control>code</Control>`); `<Type>` child (should be `type` attribute); `LegLength` off-by-one (spec = from *previous* control); missing `Map`, `Course/Length`, `Climb`, geo `Position` | Rewrite exporter to schema shape; add Map/Length/Climb; emit geo Position when calibrated | M |
| D4 | **IOF XML import can't read real v3** (PurplePen/Condes files import as empty courses — parser only reads Overprint's own dialect) | Rewrite importer to accept real v3 (keep back-compat); add IOF example + a PP-generated file as fixtures; validate exporter vs IOF.xsd in CI | M |
| D5 | OCAD/OMAP PDF export capped at 4096 px (below ~200 dpi on A3) though loaders retain full SVG | **DONE (true vector).** Phase 1 of the vector-PDF pipeline: OCAD/OMAP maps are embedded as **true PDF vectors** — `svg-to-pdf.ts` walks the retained SVG and emits raw pdf-lib path operators (even-odd fills, SVG fill/stroke inheritance, `<g>` transforms, hatch/dot `<pattern>` reconstruction, text) into a scratch page that `generateCoursePdf` `embedPdf`s and draws via the existing `drawEmbeddedPdfPage`. `validateSvgForVector` gates the vocabulary; anything unsupported falls back to the print-DPI raster embed. Verified by rasterising real `.ocd` fixtures (full colour, correct patterns). Earlier print-DPI raster (`printRasterLongSide`) remains the fallback | ✓ |
| D6 | No OCAD/OMAP course export (PP writes .ocd/.omap for print-shop/mapper merge) | **.omap/.xmap first** (XML we already parse); native .ocd binary — defer (cf. ADR-009/010) | L |
| D7 | GPX export + geo positions absent though the georef/proj4 pipeline exists | GPX waypoints; geo Position in XML — near-free field-checking win | S |

## 6. Workstream E — Functional PurplePen parity (course-setter workflow)

Top-value gaps for a practising setter (full table in the vault brief `standards-conformance-plan`):

1. **Auto-save / crash recovery** (S) — a browser tab with no persistence between explicit saves is the most dangerous daily gap.
2. **Automatic control-number placement** (M) — 32-angle maximin vs legs/circles; removes the biggest per-course time sink. Algorithm already in backlog #42.
3. **Circle gaps + auto leg-cut** (M) — see A6/A7; print-correctness on nearly every map.
4. **Audit upgrades** (S) — controls <100 m apart with same Column-D feature; opposite-direction legs across courses; consecutive duplicates. Scaffolding exists in `event-audit.ts`.
5. **Move-all-controls** (M) — re-anchor when the base map is revised mid-planning; otherwise the event is rebuilt by hand.
6. **ISSprOM dimensions applied** (S) — see A3.
7. **White-out special item** (S) — mask stale map content; used at almost every event.
8. **Custom course-length override + text macros** `$(CourseName)/$(CourseLength)` (S).
9. **GPX + geo XML** (S) — see D7.
10. **Course variations / relay forks & loops** (XL) — **Phase 1 (forks/gaffling) DONE** (v0.25.0):
    fork model on `Course.variations`, pure `variation-enumerator.ts` expanding forks into linear
    variations reused by every consumer, variation-aware PDF/description/IOF/audit, and the fork
    editing UI + canvas preview. See [ADR-017](../adrs/ADR-017-course-variations-forks.md). Remaining:
    butterfly/phi **loops** (Phase 2, via the enumerator's generator seam + IOF fork XML round-trip)
    and **relay team assignment** (Phase 3).

---

## 7. Consolidated priority order (recommended)

> **Progress (2026-08):** Tiers 1 & 2 complete and deployed. Tier 3 substantially
> done — see status tags below. Remaining Tier 3 items (B2/B3/B4/B6/B7) need a
> per-symbol appearance decision or are large (B3 polygon tool).

**Tier 1 — correctness bugs (DONE, deployed):**
A1 line width, A2 finish diameters, A3 per-standard `mapStandard` table, A4 number size/weight,
D2 PDF overprint colour behaviour, C4 3rd-row lines. Fix docs (`iof-standards.md`).

**Tier 2 — high daily value (DONE, deployed):** E1 auto-save, E2 auto number placement,
A6/A7 circle gaps + auto leg-cut, E4 audit upgrades, C1 Column-F text, C2 crossing-point rows,
A5 crossing-point glyph.

**Tier 3 — interchange & coverage:**
- **DONE, deployed:** D3/D4 IOF XML v3 conformance, D7 GPX/geo, E5 move-all-controls,
  E7 white-out, B1 marked-route (dashed) line, B-core scale-aware (mm) special symbols,
  C6 sheet pagination, C5 renderer unification (course-map box + standalone sheet +
  on-canvas box all share `buildDescRows`; the React DOM editor panel deliberately stays
  a per-control editing grid).
- **Remaining (need a per-symbol appearance decision):** B2 out-of-bounds boundary line
  (≈ the existing solid line — low marginal value), B4 forbidden-route as a decorated line
  (point→line model change), B6 map-issue point (needs the glyph), B7 dangerous-area glyph
  cleanup (removes/remaps an existing symbol — judgement call), **B3 out-of-bounds polygon
  tool (large — new drawing tool + hatch fill).**

**Tier 4 — big/structural:** **DONE** — D5 true-vector base map, D2-true colour-order, D6 OMAP export,
A8 item-scaling, C8 Roboto fonts, **E10 course forks (Phase 1)**. **Remaining:** C7/C8 text-mode
fonts polish, E10 loops (Phase 2) + relay assignment (Phase 3),
[ADR-015](../adrs/ADR-015-live-dom-svg-map-layer.md) DOM-SVG on-screen display.

---

## 8. Corrections to existing project docs (some applied 2026-08)
- `CLAUDE.md` overprint-colour note → IOF PMS Purple / colour-order (**applied**).
- `docs/iof-standards.md` → sprint circle **6.0** (not 4.0), triangle **7.0** (not 5.0), finish
  **6.0/4.0** & **7.0/5.0** (not 5.0/3.5), purple = PMS "Purple"/CMYK 35-85-0-0 (not Pantone 814) (**applied**).
- `docs/research/purplepen-gap-analysis.md`, `docs/plans/purplepen-parity-tasks.md` → stale; this
  plan supersedes; annotate or archive.

## 9. Bibliography
- ISOM 2017-2 Rev 6 §3.7 — baoc.org/wiki (ISOM_2017-2_(Revision_6,_January_2024).pdf)
- ISSprOM 2019-2 Rev 6 §4.7 — baoc.org/wiki
- IOF Map Specs – Printing & Colour Definitions Rev 4 (2024) ch.4,6 — o-maps.spb.ru/rules/iof_printing_rev_4_2024_omaps.pdf
- IOF Control Descriptions 2018/2024 — orienteering.sport; baoc.org IOF_Control_Descriptions_2024.pdf
- IOF XML v3 — github.com/international-orienteering-federation/datastandard-v3 (IOF.xsd)
- PurplePen — github.com/petergolde/PurplePen; purple-pen.org/change_summary.htm
- Overprint overprint-colour research: vault `overprint-standard` (with archived spec PDFs)
