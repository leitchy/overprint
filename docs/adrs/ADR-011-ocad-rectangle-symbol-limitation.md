# ADR-011: OCAD Rectangle Symbol Rendering Limitation

## Status

Accepted — known limitation, documented for future work.

## Context

When loading OCAD files via `ocad2geojson`, certain map layout elements are missing from the rendered output. Specifically, OCAD "rectangle symbols" (symbol type 7) contain complex embedded content — titles, logos, branding text, borders with internal graphics — that the library does not render.

### What's Missing

Using `RedHill North JL13.ocd` as the reference case:

| Missing Element | OCAD Symbol | Type |
|---|---|---|
| "Red Hill North" (map title) | 710004/710005 | Text embedded in rectangle symbol definition |
| "Scale 1:10,000 Interval 5m" | 710004/710005 | Text embedded in rectangle symbol definition |
| "2019 Junior League Event 13" | 710004/710005 | Text embedded in rectangle symbol definition |
| "ORIENTEERING" + club logo | 920011 area | Image/text in symbol definition |
| R1/R2/R3 SPORTident boxes (with labels) | 979001 | Text/image in rectangle symbol definition |

### What IS Working

| Element | How It Works |
|---|---|
| Scale bar numbers (0-500) | OCAD text objects (objType 4/5) → SVG `<text>` |
| "Red Roo Maps" credit | OCAD text object → SVG `<text>` |
| "ACT" text | OCAD text object → SVG `<text>` |
| "Copyright Orienteering ACT" | OCAD text object → SVG `<text>` |
| SPORTident text | OCAD text objects → SVG `<text>` |
| Rectangle backgrounds (filled boxes) | Our workaround: inject SVG `<polygon>` elements |

## Root Cause Analysis

### How OCAD Stores Rectangle Symbols

OCAD's rectangle symbol type (type 7) is a compound structure:

1. **Object level** (`ocadFile.objects`, `objType: 7`): Stores 4 corner coordinates, a color index, and optional rotation angle. This defines WHERE the rectangle is and its background fill.

2. **Symbol definition level** (`ocadFile.symbols`): Stores HOW the rectangle renders — border style, internal text (font, size, content), embedded images, sub-symbol references. This is a complex binary structure.

### What ocad2geojson Does

- **Symbol parsing** (`symbol-index.js`): Returns `null` for `RectangleSymbolType` (type 7) with a console warning "Ignoring rectangle symbol". The symbol definition is never parsed.
- **Object rendering** (`ocad-to-svg.js`): Looks up each object's symbol by `symNum`. Since rectangle symbols aren't in the symbol index, the lookup fails and the object produces no SVG output.

### What We Workaround

In `src/core/files/load-ocad.ts`:
- `injectRectangleObjects()`: After `ocadToSvg` builds the SVG, we scan for `objType === 7` objects and create SVG `<polygon>` elements from their 4 corner coordinates with the correct fill color.
- Font replacement: All `font-family` attributes are replaced with `sans-serif` to ensure text renders when SVG is rasterised via `<img>` element.

### What We Cannot Workaround

The **symbol definition content** (text, images, borders) is in OCAD's binary format and is not exposed by ocad2geojson. To render these, we would need to:

1. Parse the binary symbol definition for type 7 symbols
2. Extract: border line style, corner radius, internal text (font, size, alignment, content), embedded images
3. Render each as SVG elements

## Decision

Accept the limitation for now. Document it clearly. Plan a future effort to either:

### Option A: Fork ocad2geojson and add rectangle symbol support

**Effort estimate**: Medium (2-3 days)

The library is at https://github.com/perliedman/ocad2geojson (v2.1.20, actively maintained by Per Liedman). The relevant files:

- `src/ocad-reader/symbol-types.js` — Symbol type constants. `RectangleSymbolType = 7` is defined but not handled.
- `src/ocad-reader/symbol-index.js` — Where rectangle symbols are skipped. Need to add a `RectangleSymbol` class that parses the binary definition.
- `src/ocad-to-svg.js` — Where symbol rendering to SVG happens. Need to add rectangle symbol rendering (border, internal text).
- OCAD binary format reference: https://www.ocad.com/wiki/ocad/en/index.php?title=OCAD_file_format

Key binary structures to parse (from OCAD format docs):
```
Rectangle Symbol:
  - LineWidth (2 bytes) — border line width
  - LineColor (2 bytes) — border color index
  - CornerRadius (2 bytes) — rounded corner radius
  - GridFlags (2 bytes) — grid/text layout flags
  - CellWidth (2 bytes)
  - CellHeight (2 bytes)
  - UnnumberedText (variable) — internal text content
  - NumberedText (variable) — numbered variant text
```

### Option B: Contribute upstream to ocad2geojson

Per Liedman is responsive. A well-crafted PR adding rectangle symbol support would likely be accepted. This is the preferred approach as it benefits the whole orienteering community.

### Option C: Render missing content as Overprint special items

Let users manually add the title, scale text, and logos as text/image special items in Overprint. This is a user-level workaround, not a code fix.

## Consequences

- Maps with rectangle symbol layout elements (titles, logos, branding boxes) will show as colored rectangles without their internal content
- This affects mainly the "presentation layer" of maps — the cartographic content (terrain, features) renders correctly
- Users can work around it by adding text annotations via Overprint's special items feature
- A future fork or upstream PR to ocad2geojson would resolve this completely

## Related

- ADR-010: OCAD support via ocad2geojson
- ocad2geojson GitHub: https://github.com/perliedman/ocad2geojson
- OCAD file format: https://www.ocad.com/wiki/ocad/en/index.php?title=OCAD_file_format
- PurplePen OCAD parser: https://github.com/petergolde/PurplePen (`src/MapModel/MapModel/OcadImport.cs`)
