# PurplePen .ppen File Format Reference

Technical reference for the PurplePen `.ppen` XML format, derived from implementation work on the Overprint importer and analysis of real-world files. This document covers the format structure, coordinate system, and hard-won lessons from the coordinate conversion work.

**Source**: [PurplePen GitHub](https://github.com/petergolde/PurplePen) (C#/.NET), real `.ppen` files from ACT orienteering events.

---

## Format Overview

- **Extension**: `.ppen`
- **Encoding**: UTF-8 XML
- **Root element**: `<course-scribe-event>` (internal project name was "Course Scribe")
- **No schema version**: the format has no version attribute. Older files simply lack newer attributes. Parser must use defensive attribute reading with defaults.
- **No embedded maps**: map files are referenced by filename (and a Windows `absolute-path`), never embedded
- **No compression**: plain XML text

The format has been stable since PurplePen v1.x (~2008). New versions add attributes incrementally but never break backwards compatibility.

---

## Document Structure

```xml
<course-scribe-event>
  <event>        <!-- exactly one: event metadata -->
  <control>      <!-- 0..n: shared control pool -->
  <course>       <!-- 0..n: course definitions -->
  <course-control>  <!-- 0..n: linked-list nodes (flat, not nested) -->
  <leg>          <!-- 0..n: leg customisation (bends, flagging) -->
  <special-object>  <!-- 0..n: description boxes, text, lines, etc. -->
</course-scribe-event>
```

All elements are direct children of the root. Course-controls are NOT nested inside courses -- they form a flat pool of linked-list nodes referenced by courses.

---

## Element Reference

### `<event>`

One per file. Contains event-level metadata.

```xml
<event id="1">
  <title>Mt Taylor Twilight 18 Feb 26</title>
  <map kind="OCAD" scale="5000" ignore-missing-fonts="false"
       absolute-path="C:\Users\admin\Downloads\MtTaylor.ocd">MtTaylor.ocd</map>
  <standards map="2017" description="2018" />
  <all-controls print-scale="5000" description-kind="symbols" />
  <print-area automatic="true" restrict-to-page-size="true"
              left="-20.18" top="281.42" right="276.74" bottom="71.36"
              page-width="827" page-height="1169" page-margins="0"
              page-landscape="true" />
  <numbering start="101" disallow-invertible="false" />
  <punch-card rows="3" columns="8" left-to-right="true" top-to-bottom="false" />
  <course-appearance scale-sizes="RelativeToMap" scale-sizes-circle-gaps="true"
                     number-font="Roboto" auto-leg-gap-size="3.5"
                     blend-purple="true" blend-style="layer"
                     lower-purple-layer="10" />
  <descriptions lang="en-GB" color="black" />
  <ocad overprint-colors="false" />
</event>
```

| Child | Key Attributes | Notes |
|---|---|---|
| `<title>` | text content | Event name |
| `<map>` | `kind`, `scale`, `absolute-path` | `kind`: `OCAD`, `PDF`, `Bitmap`. Text content = relative filename. `absolute-path` is Windows-specific, ignore on import |
| `<standards>` | `map`, `description` | `map`: `2017` (ISOM) or `2019` (ISSprOM). `description`: `2018` or `2024` (IOF standard) |
| `<all-controls>` | `print-scale`, `description-kind` | Event-level defaults. `description-kind`: `symbols`, `text`, `symbols-and-text` |
| `<print-area>` | `left`, `top`, `right`, `bottom`, `page-*` | In mm. Defines the default print crop. `page-width`/`page-height` are in 1/100 inch (827 = A4 landscape width) |
| `<numbering>` | `start` | Starting control code for auto-numbering |
| `<course-appearance>` | many | `blend-purple`: screen blending. `auto-leg-gap-size`: mm. `number-font`: font name |
| `<descriptions>` | `lang`, `color` | `lang`: BCP 47 tag (e.g., `en-GB`). `color`: `purple` or `black` |

### `<control>`

Shared control pool. Each control has a unique integer `id` (NOT the control code).

```xml
<control id="3" kind="normal">
  <code>101</code>
  <location x="99.68" y="101.36" />
  <description box="D" iof-2004-ref="5.2" />
  <description box="E" iof-2004-ref="5.2" />
  <description box="F" iof-2004-ref="10.1" />
</control>
```

| Attribute/Child | Values | Notes |
|---|---|---|
| `id` | integer | Internal reference ID. Sparse, non-sequential (e.g., 1, 2, 3, 50, 8, ...) |
| `kind` | `start`, `finish`, `normal`, `crossing-point`, `map-exchange` | Start/finish have no `<code>` |
| `<code>` | integer text | The printed control number (e.g., 101). Absent for start/finish |
| `<location>` | `x`, `y` (floats) | **mm from the OCAD/map origin, Y-up**. See Coordinate System section |
| `<description>` | `box`, `iof-2004-ref` | 0..n per control. See Description Mapping section |

**Important**: The `id` attribute is NOT the control code. `<control id="50">` can have `<code>105</code>`. Course-controls reference by `id`, not `code`.

Controls may also have `<gaps>` and `<circle-gaps>` children (bitmask and angular ranges for where the control circle should have gaps to avoid obscuring map features). These are scale-specific and currently not imported.

### `<course>`

Course definition. References the first node in a linked list of course-controls.

```xml
<course id="1" kind="normal" order="1">
  <name>Moderate 1</name>
  <labels label-kind="sequence" />
  <first course-control="2" />
  <print-area automatic="true" left="-20.18" top="282.42"
              right="276.74" bottom="72.36" ... />
  <options print-scale="5000" hide-from-reports="false"
           description-kind="symbols" />
</course>
```

| Attribute/Child | Values | Notes |
|---|---|---|
| `kind` | `normal`, `score`, `all controls` | `all controls` is a PP UI pseudo-course -- skip on import |
| `order` | integer | Display order in PP's course list |
| `<first course-control>` | integer ref | Points to the first `<course-control>` node. This starts the linked list |
| `<labels>` | `label-kind`: `sequence`, `code` | How control numbers are displayed on the map |
| `<options>` | `print-scale`, `description-kind`, `hide-from-reports` | Per-course overrides |
| `<print-area>` | same as event-level | Per-course print crop |

### `<course-control>`

Linked-list nodes. **Flat, not nested** -- all are direct children of root.

```xml
<course-control id="10" control="1">
  <next course-control="11" />
</course-control>
<course-control id="11" control="3">
  <next course-control="12" />
</course-control>
<course-control id="12" control="4">
  <next course-control="13" />
</course-control>
<course-control id="13" control="2" />   <!-- no <next> = end of course -->
```

| Attribute/Child | Notes |
|---|---|
| `id` | Unique integer for this course-control node |
| `control` | References `<control id="...">` |
| `<next course-control>` | References the next `<course-control id="...">`. Absent on the final control |
| `points` | (attribute) Score value for score/rogaine courses |

**Key design pattern**: A single control (e.g., start, id=1) can appear in multiple courses via separate course-control nodes. Course A might have `<course-control id="10" control="1">` while Course B has `<course-control id="20" control="1">`. Each course gets its own linked-list chain, but they share the underlying control definitions.

**Defensive parsing required**:
- **Cycle detection**: malformed files can create circular `<next>` chains. Use a visited-set.
- **Broken links**: `<next course-control="999">` where 999 doesn't exist. Terminate the chain, warn.
- **Orphaned nodes**: course-control nodes not reachable from any course's `<first>`. Silently ignore.

### `<leg>`

Optional leg customisation. References control IDs (not course-control IDs).

```xml
<leg id="5" start-control="1" end-control="3">
  <bends>
    <location x="101.15" y="106.65" />
  </bends>
</leg>
<leg id="6" start-control="6" end-control="8">
  <flagging kind="all" />
</leg>
```

| Attribute/Child | Notes |
|---|---|
| `start-control`, `end-control` | Reference `<control id="...">` (NOT course-control IDs) |
| `<bends>` | Contains `<location>` elements -- intermediate waypoints for the leg line |
| `<flagging>` | `kind`: `all`, `begin`, `end`, `none` -- how the leg is marked in the terrain |

**Shared across courses**: A `<leg>` between controls 1 and 3 applies to ALL courses where those controls appear consecutively. Bend points must be copied to each matching course-control.

### `<special-object>`

Overlay objects positioned on the map.

```xml
<special-object id="1" kind="descriptions">
  <location x="185.56" y="226.74" />
  <location x="191.51" y="226.74" />
  <courses>
    <course course="4" />
  </courses>
</special-object>
```

| `kind` value | Overprint equivalent | Location count | Notes |
|---|---|---|---|
| `descriptions` | `descriptionBox` | 2 (top-left, top-right) | Description sheet overlay on map |
| `text` | `text` | 1 | Free text annotation |
| `line` | `line` | 2 (start, end) | Line segment |
| `rectangle` | `rectangle` | 2 (corners) | Rectangle outline |
| `out-of-bounds` | `outOfBounds` | 1+ | OOB area/polygon |
| `dangerous-area` | `dangerousArea` | 1 | Danger warning symbol |
| `water-location` | `waterLocation` | 1 | Water point symbol |
| `first-aid` | `firstAid` | 1 | First aid symbol |
| `forbidden-route` | `forbiddenRoute` | 1 | Forbidden route symbol |
| `image` | not supported | - | Custom image placement |
| `boundary` | not supported | - | Course boundary line |

`<courses>` child is optional. If absent, the object appears on all courses. If present, it lists which courses display it.

---

## Description Mapping

PurplePen stores IOF control descriptions using `iof-2004-ref` values, which are the IOF symbol IDs from the 2004 standard (still used in 2018/2024 standards -- the numbering didn't change).

```xml
<description box="D" iof-2004-ref="5.2" />
<description box="G" iof-2004-ref="11.1SE" />
<description box="all" iof-2004-ref="14.3" />
```

| `box` | Maps to | Usage |
|---|---|---|
| `C` | `ControlDescription.columnC` | "Which of similar features" |
| `D` | `ControlDescription.columnD` | Feature (the main control feature) |
| `E` | `ControlDescription.columnE` | Appearance / detail |
| `F` | `ControlDescription.columnF` | Dimensions / combinations |
| `G` | `ControlDescription.columnG` | Location of the flag |
| `H` | `ControlDescription.columnH` | Other information |
| `all` | `ControlDescription.columnH` | Full-row symbols (finish symbols like `14.3`) |

**The `iof-2004-ref` values are direct keys into the `svg-control-descriptions` npm package**. No mapping table is needed. All 183 symbols in the database are valid refs, including compass-suffixed variants: `11.1E`, `11.1SE`, `11.2W`, `11.8NW`, `0.1E`, etc.

---

## Coordinate System

This is the most important (and hardest) part of working with `.ppen` files.

### What PurplePen stores

All `<location>` coordinates are in **mm on the printed map**, measured from the **OCAD/map file origin**, with **Y increasing upward** (cartographic convention).

```
x="104.718857"   → 104.72mm from origin, rightward
y="115.118271"   → 115.12mm from origin, upward
```

For OCAD files, the origin is the OCAD file's coordinate origin (0, 0) in the OCAD internal coordinate system. PurplePen converts OCAD's 1/100mm units to mm.

**Important**: PurplePen sets `kind="OCAD"` in `<map>` for BOTH `.ocd` and `.omap` files. The actual file extension determines the coordinate unit: OCAD uses 1/100mm internally, OMAP uses 1/1000mm. The conversion formula needs to multiply by the correct factor (100 vs 1000).

### Converting to Overprint pixel coordinates

Overprint stores positions in pixels from the top-left of the map image (Y-down). The conversion depends on the map type.

#### OCAD/OMAP maps (viewBox conversion)

The OCAD loader (via ocad2geojson) renders the map as an SVG with:
- A `viewBox` defining the visible content bounds in OCAD coordinate units (1/100mm)
- A `<g transform="translate(0, T)">` that shifts Y-negated content into the viewBox
- A `renderScale` factor from SVG units to pixels

**The correct conversion formula** (verified with Mt Taylor OCAD 1:5000 and Radford College OMAP 1:3000):

```
px_x = (x_mm * U - viewBox.x) * renderScale
px_y = (viewBox.y + viewBox.height - y_mm * U) * renderScale
```

Where:
- `U` = unit multiplier: **100** for OCAD (1/100mm), **1000** for OMAP (1/1000mm)
- `x_mm * U` converts PurplePen mm to the map file's internal coordinate units
- `viewBox.x` is the SVG viewBox minX (left edge of rendered content)
- `viewBox.y + viewBox.height` is the SVG viewBox bottom edge (in SVG Y-down space, this is the maximum Y, which corresponds to the minimum OCAD Y after negation)
- `renderScale` = `pixelWidth / viewBox.width`

**Real-world values** (Mt Taylor North, 1:5000 OCAD):
```
viewBox: x=-1077  y=7731  width=27810  height=20004
<g transform="translate(0, 35466)">
renderScale: 0.1438
pixelSize: 4000 x 2877
dpi: 365.3
```

**Why the simple `mmToPx + Y-flip` formula doesn't work for OCAD maps**: it assumes the rendered image starts at (0, 0) in the OCAD coordinate space, but the SVG viewBox is cropped to the map content bounds with a non-zero origin offset. The viewBox origin can be thousands of units from (0, 0).

#### Raster/PDF maps

For raster and PDF maps, PurplePen coordinates are in mm from the bottom-left of the image:

```
px_x = (x_mm / 25.4) * dpi
px_y = mapHeightPx - (y_mm / 25.4) * dpi
```

#### No map loaded (deferred conversion)

When importing a .ppen without a map, store coordinates in identity-mm mode (dpi=25.4, 1mm=1px, no Y-flip). Set `mapFile.pendingCoordinateTransform = true`. When the map subsequently loads, re-project all coordinates using the correct formula for the map type.

### The `<g>` translate value

ocad2geojson's SVG structure:
```xml
<svg viewBox="-1077 7731 27810 20004">
  <g transform="translate(0, 35466)">
    <!-- content with negated Y: (x_ocad, -y_ocad) -->
  </g>
</svg>
```

The translate value `T` shifts the Y-negated content into the viewBox's visible area. Mathematically: `T = viewBox.y + y_max_ocad` where `y_max_ocad` is the highest OCAD Y coordinate. You don't need to parse `T` -- the viewBox values alone are sufficient for the conversion formula above.

---

## Features NOT in our sample but present in the format

These are documented for future work:

| Feature | Element/Attribute | Notes |
|---|---|---|
| Relay variations | `<variation>` on `<course-control>` | Fork/loop nodes in the linked list |
| Multiple starts | Multiple start controls per course | Staggered start locations |
| Number offsets | `<number-location>` on `<course-control>` | Custom control number positions (could map to `CourseControl.numberOffset`) |
| Leg gaps | Attribute on `<course-control>` or `<leg>` | Automatic leg gap computation |
| Custom images | `<special-object kind="image">` | Sponsor logos, event branding |
| Boundary lines | `<special-object kind="boundary">` | Course boundary markers |
| Climb data | `<course>` attribute | Total climb in metres |
| Print templates | `<print-area>` children | Printer-specific settings |

---

## ID System

All elements use integer IDs. These are:
- **Sparse**: IDs are not sequential (e.g., control IDs might be 1, 2, 3, 50, 8, 11, ...)
- **Stable**: IDs don't change when elements are reordered
- **Scoped**: control IDs and course-control IDs are in separate namespaces

On import, all PurplePen integer IDs are mapped to Overprint's branded UUID types (`ControlId`, `CourseId`, `SpecialItemId`) via the `generate*Id()` factories.

---

## Overprint Implementation

| File | Purpose |
|---|---|
| [src/core/ppen/import-ppen.ts](../../src/core/ppen/import-ppen.ts) | Pure XML parser. ~600 lines |
| [src/core/ppen/reproject-coordinates.ts](../../src/core/ppen/reproject-coordinates.ts) | Deferred mm-to-pixel re-projection |
| [src/core/ppen/import-ppen.test.ts](../../src/core/ppen/import-ppen.test.ts) | 41 tests with inline fixtures |
| [src/core/files/load-map-file.ts](../../src/core/files/load-map-file.ts) | `importPpenFile()` integration |
| [tests/fixtures/PP-examples/](../../tests/fixtures/PP-examples/) | Real .ppen test files |

### Writing a .ppen exporter (future)

Key things to get right:
1. Coordinates back to mm from pixels (reverse the viewBox formula)
2. Rebuild the linked-list structure (each course needs its own chain of course-control nodes)
3. Assign integer IDs to all elements (can be sequential)
4. `<map>` element with the correct `kind` and `scale` (but no embedded map data)
5. Description refs are just the IOF symbol IDs stored in `ControlDescription.column*` fields -- write them directly as `iof-2004-ref` attributes
6. Special objects need two `<location>` elements for description boxes, lines, rectangles
