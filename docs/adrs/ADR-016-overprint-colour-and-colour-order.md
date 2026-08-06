# ADR-016: Overprint Purple Colour and Colour-Order Rendering

## Status

**Accepted** for the colour + solid-blend decision (implemented on screen 2026-08, pending
commit); **Proposed** for the colour-order layering and CMYK-PDF phases (planned). Supersedes
the earlier informal "multiply blend" approach.

## Context

Overprint rendered the purple course overprint as an **RGB `multiply` blend** on screen and as
**opaque RGB purple** in PDF, using an off-spec pink `#C850A0` ("Pantone 814 approximation").
Cited research against the IOF standards and the PurplePen source (see
`docs/reference/standards-conformance.md` and the vault `overprint-standard` page) established:

- The course purple is a **solid, consistent 100% colour** — **CMYK 35/85/0/0** or PMS "Purple"
  (ISOM 2017 Appendix 1 §4). The IOF publishes **no RGB** (print-only standard).
- Map detail shows through by **colour/draw ORDER, not blending** (ISOM §3.7: course symbols
  *"shall not mask out map detail of at least black, brown and blue 100%"*). The mechanism
  (Appendix 1 §5) is to place the purple in the colour order **below black/brown/blue 100%** so
  those colours draw over it; the purple **does** cover area screens/fills. There are **two
  purples** — *upper* (above black; forbidden/priority symbols) and *lower* (below; circles,
  lines, numbers, start, finish).
- IOF **explicitly dis-recommends** blend/transparency simulation. PurplePen offers three modes:
  `None` (opaque), `Blend` (**Darken**, its raster fallback — *not* RGB multiply), and
  `UpperLowerPurple` (**colour-order layering**, its *recommended default* on OCAD maps).
- RGB **multiply** is a *rougher* approximation than Darken: it matches over pure black/white
  but **over-darkens/tints** mid-tone map colours (the muddy navy-over-water, brown-over-green
  we observed) — and it is a `mix-blend-mode`, which fails on **WebKit/Safari** against the
  CSS-transformed DOM-SVG layer (see [ADR-015](ADR-015-live-dom-svg-map-layer.md)).

## Decision

1. **Colour:** `OVERPRINT_PURPLE = '#BB29BB'` (sRGB of Pantone Purple C ≈ CMYK 35/85/0/0),
   single-sourced across screen, PDF, and special-item defaults. Replaces the pinker `#C850A0`.
2. **On-screen blend:** render the overprint as **solid** (normal blend), not multiply. Solid,
   consistent purple matches the standard's colour intent and PurplePen's `Layer` output, avoids
   the mid-tone muddying, and — being blend-free — **removes the Safari blocker** for the DOM-SVG
   display path.
3. **Colour-order (the faithful mechanism) — phased:**
   - *Now:* solid purple on top of the flat map (acceptable; control circles/triangles are
     hollow so the feature shows in the centre; only solid legs/fills mask what they cross).
   - *Phase 1 (raster targets):* optional **Darken** approximation toggle (PurplePen's `Blend`),
     for screen + rasterised PDF, so black/dark map detail shows through. NOTE: Darken is a
     blend mode → keep it OFF on Safari (falls back to solid).
   - *Phase 2 (vector targets):* **true colour-order layering** — for OCAD/OMAP via the DOM-SVG
     layer ([ADR-015](ADR-015-live-dom-svg-map-layer.md)) and for PDF via vector export: draw
     solid purple, then re-draw the map's **black/brown/blue-100%** linework above it, tagging
     each course symbol upper/lower per the spec. This is the standard-correct, blend-free
     endpoint and matches PurplePen's recommended `UpperLowerPurple` mode.
4. **PDF:** emit the overprint in **DeviceCMYK 35/85/0/0** (pdf-lib `cmyk()`); interim overprint
   effect via a `/Multiply`(or `/Darken`) ExtGState on the overprint layer, toggleable, until
   Phase 2 colour-order lands.

## Consequences

- Screen overprint is now solid, consistent, IOF-aligned purple; PDF matches (single constant).
- The Safari/WebKit blend bug that blocked DOM-SVG (#3) no longer applies to the solid path.
- Faithful "map shows through" is deferred to colour-order layering (Phase 2), which is the
  correct long-term architecture and dovetails with the DOM-SVG vector display and vector PDF
  export. Until then, hollow symbols already reveal the feature; solid legs/fills mask crossings.
- Dimension corrections (line width 0.35 mm, finish 6.0/4.0 mm, per-`mapStandard` sizing) are
  tracked separately in `docs/reference/standards-conformance.md` Workstream A.

## References
- `docs/reference/standards-conformance.md` (full plan + dimension table + colour order)
- Vault: `overprint-standard` (cited research + archived IOF PDFs)
- [ADR-015](ADR-015-live-dom-svg-map-layer.md) (DOM-SVG display; Safari blend finding)
- ISOM 2017 Appendix 1 §4–5; ISOM 2017-2 §3.7; IOF Printing & Colour Definitions Rev 4 §6
