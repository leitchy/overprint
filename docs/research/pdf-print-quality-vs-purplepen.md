# PDF print quality vs PurplePen — review, fixes, and follow-ups

_2026-08-14. Overnight review of why our exported course-map PDFs looked worse than
PurplePen's. Reference PDFs: `tests/fixtures/Tate/Test PP.pdf` (PP, Radford all-controls),
`~/Downloads/Mt Taylor Twilight - Long.pdf` and `~/Downloads/Radford - Course 1.pdf` (ours,
pre-fix)._

A three-agent team dug through our PDF export code, our colour-order model, and the PurplePen
source (`petergolde/PurplePen`). Findings and the fixes applied below. **All fixes are on
`develop`, uncommitted** — they change print output, so eyeball a fresh export before releasing.

## The three issues (all PDF-only, as Jim noted)

1. **Control numbers had no white halo → unreadable over busy map.**
   Our on-screen renderer draws a white halo (`control-shape.tsx`, `stroke="#FFFFFF"`), but the
   PDF path (`pdf-overprint-renderer.ts`) drew numbers fill-only. PurplePen draws a white
   *framing* stroke behind the glyphs (`CourseObject.cs:1137`) — optional in PP (default off),
   but clearly enabled in Tate's events.

2. **Circles/lines too thin and faint.** Two causes:
   - No **minimum line width** — `lineWidth = 0.35mm × k`, and when printing at a scale smaller
     than the map (`k < 1`) it shrank to hairline. (0.35mm itself is the ISOM spec; PP uses it too.)
   - The **Multiply blend** over the whole overprint muddied/darkened the purple over busy areas,
     so circles read faint. PP draws the locating symbols solid on top.

3. **Brown contours drew OVER our circles.** Our "true colour-order" (ADR-016) tags brown as an
   *upper ink* and redraws it **above** the purple; control circles were in the *lower* pass, so
   brown crossed them. PurplePen's default (`Blend`) never re-stamps brown over the locating
   symbols — circles sit on top. Our model was stricter than PP and applied the show-through rule
   even to the thin circle ring (where "show-through" is meaningless).

## Fixes applied (all in `src/core/export/`)

Reworked the overprint into a **legs / symbols phase split** (`pdf-overprint-renderer.ts`,
`OverprintPart`), and reordered the passes in `pdf-course-map.ts` (`drawOverprintPasses`):

- **Legs** (705) draw first, blended (Multiply on the raster path / solid on the vector path),
  **below** the map's redrawn upper inks — so contours/streams still show through a solid purple
  leg (the real intent of ISOM §3.7).
- The map's black/brown/blue-100% linework redraws (vector path only).
- **Symbols** — control circle, start, finish, crossing, map-exchange, **and the numbers** — draw
  last, **opaque** (no overprint flag, no Multiply) and **on top of the brown**. Fixes #3, and
  makes circles vivid (fixes the faint part of #2).
- **Number halo** (`drawHaloedText`): eight white offset copies + purple fill, drawn in the opaque
  symbols pass so the white actually knocks out (under the OP flag or Multiply, white paints
  nothing — this is why the halo has to live in the opaque pass). Fixes #1. **Default ON.**
- **Minimum line width** floor at the spec 0.35mm (`Math.max(spec, spec × k)`) so reduced print
  scales no longer hairline. Fixes the rest of #2.

Verified by exporting the sample (OCAD → vector colour-order path) via Playwright and viewing the
PDF: numbers now carry a clear white halo and read over busy terrain; circles are solid on top.
Unit coverage updated: `pdf-overprint-renderer.test.ts` (phase split + halo white-fill + opaque
symbols ExtGState) and `pdf-course-map.test.ts` (legs below / numbers above the upper-ink redraw).
Full suite green (762), typecheck + build clean.

### PurplePen reference values confirmed (for future tuning)
- Line thickness 0.35mm all standards; circle centre-line Ø 5.0mm (ISOM 2017; PP stores 5.35 outer
  and strokes centred on 5.0), finish 6.35/4.35, start radius 3.46, number digit 4.0mm, code 3.0mm,
  number-to-circle gap 1.825mm, crossing radius 2.5mm. Purple CMYK 0.35/0.85/0/0 (= our #BB29BB). ✓
- PP halo is an opt-in white rounded framing behind glyphs; forces the number to "upper purple".
- PP default blend = `Blend` (whole overprint on top, CMYK darken); `UpperLowerPurple` colour-order
  is advanced/opt-in and **downgraded to Blend for bitmap/PDF maps**. Our always-on colour-order was
  more aggressive than PP.

## NOT done — follow-ups for review

- **Title overflow/clipping (separate bug, looks bad).** In our PDFs the big map title
  ("Mt Taylor North" / "Radford College") overflows behind the description box / clips off the top
  of the page. This is in the title/description-box **layout** (`pdf-course-map.ts` / `pdf-page-layout.ts`),
  not the overprint — worth a dedicated pass. Likely a font-size/position that isn't clamped to the
  page + a description-box placement that can overlap the title.
- **Raster-map path not visually verified.** The code path is analogous (legs blended, symbols
  opaque+haloed on top) but I only eyeballed the OCAD/vector export. Export a PNG/PDF-source map to
  confirm.
- **Make the halo a setting** (width + on/off), matching PP's `numberOutlineWidth`. Shipped ON by
  default per Jim's request; a Course-Appearance control would be the tidy follow-up (ties into the
  Phase 7 "course appearance customisation" item).
- **Number anti-overlap placement.** PP nudges each number off its default 30° angle to avoid
  colliding with legs/other numbers (`CourseFormatter.GetTextLocation`). We place at a fixed offset.
  A future legibility win.
- **Reconsider the Multiply default for legs.** Now only legs use it; PP's `Blend` is a CMYK darken,
  our RGB Multiply is an approximation. Fine for now.

## Round 3 — fit-to-page (2026-08-14)

The Radford "All Courses" A4 export still looked messy because a wide 1:3000 map **tiles into 4
zoomed pages** (huge baked-in map title, oversized description box). A3 fit the whole map on one page
and looked great → the fix is to **fit each page to one sheet** like PurplePen.

**Implemented (3-agent investigation + Fable review of the scale-model plan):**
- **Fit-to-page** (`pdf-page-layout.ts` `computeMultiPageViewports`, new `fitToPage` param + PageSetup
  field, default ON): when the print area doesn't fit at the requested scale, shrink the scale so it
  fits one sheet instead of tiling. **Closed-form** (subtract the fixed paper padding from the
  printable area, not scale-dependent padding from the extent — avoids re-tiling), **shrink-only**
  (never enlarges), **rounded up to the next 50** (kills float-epsilon re-tiling + nicer scale), with
  finite/positive guards and a ×4 sanity cap. Returns `effectivePrintScale`; the callers use it for
  overprint **symbol sizing** so symbols scale with the shrunk map. UI: "Fit map to page" checkbox in
  Print Settings.
- **Description-box width cap** so the 47-control all-controls box (or an imported .ppen cell/column
  override) can never exceed the printable width.

**Verified** by exporting the real `Radford.ppen`+`.omap` "All Courses" on A4: the whole map now fits
ONE page per course/all-controls (was 4 tiled pages), title proportional and inside the border,
description box fits, codes 3mm + halos — essentially matching the PurplePen reference. 765 unit tests
+ typecheck + build green.

**Fable review caught (folded in):** the desc-box `scale` is *ground-distance* math (leg/course
lengths), NOT a label/scale-bar — so fit-to-page must NOT thread the fitted scale there (it doesn't;
distances stay on map scale). Padding circularity would have re-tiled (fixed via closed form). Float
epsilon at the fit boundary (fixed via round-up).

**Known follow-ups (not blocking):**
- The map's **baked "Scale: 1:3000" text** and title are part of the .omap and don't update when
  fit-to-page shrinks to e.g. 1:3300 — surfacing the effective scale (and a warning when the fit
  ratio is large) is a nice-to-have (Fable #6).
- **Pre-existing latent bug** (Fable #1): the auto description box passes `scale: eventSettings.printScale,
  dpi: 96` to `buildDescRows` for distances, where other callers correctly pass `mapFile.scale,
  mapFile.dpi` — course lengths can be wrong when printScale≠mapScale or map dpi≠96. Separate fix.
- Title tuning, raster-path visual check, halo-as-a-setting, PP-style number anti-overlap placement.

## Round 4 — CMYK colour fidelity (2026-08-14)

**Root cause (confirmed by 3 agents incl. PP source):** PurplePen's muted print look = it emits **true DeviceCMYK** PDFs by default (`PdfGraphicsTarget.cs:183` → `XColor.FromCmyk`); the viewer/printer's CMYK profile mutes it. PP does NOT lighten the map (MapIntensity=1.0 for PDF). **We discard the CMYK** at both loaders (parsed only for ink-classification) and emit vivid DeviceRGB. The CMYK is already available: `.omap` `OmapColor.cmyk`, `.ocd` `ocadFile.colors[].cmyk`. Our overprint purple is already DeviceCMYK. **Decision: emit DeviceCMYK** (matches PP exactly, no ICC/SWOP LUT needed; screen stays sRGB).

### DONE + verified — `.ppen` furniture (notes/text/rects) → DeviceCMYK
- `SpecialItemBase.colorCmyk?: [c,m,y,k]` (types.ts); import preserves it (`parseCmyk` in import-ppen.ts, set on text/line/rectangle); `renderSpecialItems` emits `cmyk(...)` when present (pdf-course-map.ts). Editor mutations clear `colorCmyk` (event-store.updateSpecialItem) so a user's new sRGB wins. Save/load + reproject round-trip it for free (plain array). Verified: Radford notes now emit DeviceCMYK `1 1 0 0` (30×) — identical to PurplePen, so they match PP in any given viewer.

### DONE + verified — the MAP layer → DeviceCMYK
Shipped (uncommitted on `develop`, 2026-08-14). Each map colour's CMYK is threaded to
the exporter via **`data-cmyk-fill` / `data-cmyk-stroke`** attributes alongside the
existing `fill="rgb()"` (screen untouched — the browser ignores the unknown attrs);
`svg-to-pdf` emits DeviceCMYK `cmyk()` when present, else falls back to the rgb string.

- **svg-to-pdf.ts**: `cmykAttr` reader + `resolvePaintColor` (CMYK wins, but only after the
  `none`/`transparent`/`url()` short-circuit); `InheritedPaint` now carries `fillCmyk`/`strokeCmyk`,
  **source-paired** — a child that re-sets its own `fill` never inherits an ancestor's CMYK.
  Threaded through every colour sink: `resolvePaint`/`paintShape`, `tileChildPrimitive`, the
  `hLine` pattern fast path, `renderText`, `inheritPaint`, `renderLine`, and the root paint.
- **load-omap.ts**: `cmykAttr(colors, index, which)` companion to `colorStr`, emitted at all sites
  — area/line strokes+fills, pattern hatch/dot defs (incl. staggered), `renderGlyph` point symbols,
  fallback dots, text. Older exports without `<color … k>` stay RGB.
- **load-ocad.ts**: `tagUpperInkElements` now also builds an `rgb→cmyk` map (0–100 → fractions) and
  stamps source-paired `data-cmyk-*` on each element's own paint; an rgb string that two different
  CMYK colours round to is dropped (stays RGB — the SVG carries no colour index to disambiguate).

**Verified end-to-end** by exporting the real sample OCAD map and `Radford College.omap` through the
actual browser pipeline (loader → `renderSvgToScratchPdf` → inflate content stream):
- sample OCAD: **7319 DeviceCMYK fills + 1329 CMYK strokes, 0 DeviceRGB** (`rg`/`RG`) — full coverage.
- Radford OMAP: 16958 CMYK fills + 2254 CMYK strokes; the only residual `rg` is the white paper rect
  and `0 0 0 rg` from colour-table entries with no CMYK / unset indices (documented divergence).
Unit tests added: `svg-to-pdf.test.ts` (8: fill/stroke `k`/`K`, none+CMYK→no-paint, source-pairing
both directions, pattern-tile CMYK, text CMYK, malformed→RGB), `load-ocad.test.ts` (3: stamping,
source-pairing, collision-drop), `load-omap.test.ts` (1: paired emission + white rect stays RGB);
18 OMAP fidelity snapshots regenerated (purely additive attrs). Full suite green (777), typecheck +
build clean.

**Still open**: the **OMAP title text-size** fix (renders ~1.3× too big — em vs cap-height) was
NOT bundled — it's orthogonal to CMYK, affects screen + PDF, and wants its own visual check. And the
raster-fallback path stays RGB (canvas can't do CMYK) — documented: vector = muted, raster = saturated.

### The plan as coded — Fable-flagged musts (all folded in):
1. **Cover ALL colour sinks**, not just `paintShape`/`resolvePaint` (svg-to-pdf.ts:721/763): also `tileChildPrimitive` (569-607, the yellow/green area screens PP mutes most), the `hLine` fast path (634-640), and `renderText` (996-998). Miss any → half-muted map (worse than now).
2. **Inheritance**: extend `InheritedPaint` to carry `cmykFill/cmykStroke`, **source-paired** — an element with its own `fill` but no own `data-cmyk-fill` must NOT use an ancestor's cmyk. Read data-cmyk via `getAttribute` (attr only), and make it win BEFORE `parseColor`'s white/black short-circuit; preserve `none`/`transparent → null`.
3. **Two attrs** (`-fill` + `-stroke`) since fill/stroke can differ (`B`/`B*` ops).
4. **OCAD**: build `rgbString → cmyk` in the same walk as `tagUpperInkElements` (load-ocad.ts:208-243), normalising whitespace like :215/:220; if one rgb key maps to two different CMYKs (round collisions), **drop the key** (stay RGB) — colour index isn't on the SVG.
5. **OMAP**: `cmykAttr()` companion to `colorStr` at ALL emit sites — 888/899/905/921/923/981/1023(text) + pattern defs 812/826-846 + **`renderGlyph` 1305-1328 (point symbols)**. `OmapColor.cmyk` is optional (older exports lack it → stay RGB; count/log).
6. White = table `cmyk 0,0,0,0` flows through (knockout, fine); the synthetic paper rect can stay RGB. Opacity (`ca/CA` ExtGState) is orthogonal — CMYK doesn't break it. Raster-fallback path stays RGB (canvas can't do CMYK) — documented divergence: vector = muted, raster fallback = saturated.
- Also bundle the **OMAP title text size** fix (renders ~1.3× too big — em vs cap-height; `load-omap.ts:1023` / `svg-to-pdf.ts renderText`).

This is a ~20-site change through the core map renderer — do it as a focused pass with OMAP+OCAD screen+PDF verification, not a rushed one.
