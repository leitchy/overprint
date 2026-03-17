# IOF Standards Reference

Quick reference for the IOF standards relevant to Overprint. These are the "source of truth" documents that govern how orienteering course data is structured and displayed.

## IOF Control Description Standard 2024

**Source**: https://orienteering.sport/iof/rules/control-descriptions/

The 2024 standard supersedes the 2018 version. Key points:

### Description Sheet Layout (8 Columns)

| Column | Content | Notes |
|--------|---------|-------|
| A | Sequence number | Order of control on the course (1, 2, 3...) |
| B | Control code | Unique code for the control (>30) |
| C | Which of similar features | "North", "Upper", "Middle" etc. |
| D | Control feature | The map feature (knoll, re-entrant, etc.) — **required** |
| E | Appearance | Further detail (overgrown, ruined, etc.) |
| F | Dimensions / combinations | Size, crossing, junction, bend |
| G | Location of flag | Position relative to feature (NW corner, foot, etc.) |
| H | Other information | First aid, refreshments, radio control, etc. |

### Special Rows
- **Header row**: Event name / course name / course length / climb
- **Start row**: Start symbol + any start description
- **Finish row**: Finish symbol
- **Between controls**: Special instructions (follow marked route, map exchange, etc.)

### Changes from 2018
- Now covers both ISOM and ISSprOM (forest and sprint)
- New symbol: Railway (column D)
- New symbol: Map Flip (column H special instructions)
- Description sheet should be printed in black
- Clarifications on use of Copse, Building, Top/Beneath symbols

### Symbol Set
The IOF publishes a complete set of description symbols. Each is a small graphic that goes in the appropriate column. We need SVG versions of all symbols for rendering in the browser.

**Symbol categories in Column D (control features)**:
- Landforms: terrace, spur, re-entrant, earth bank, quarry, earth wall, etc.
- Rock features: cliff, boulder, boulder field, stony ground, etc.
- Water features: lake, pond, waterhole, stream, ditch, marsh, etc.
- Vegetation: open land, semi-open land, forest corner, copse, thicket, etc.
- Man-made: road, track, path, wall, fence, crossing point, building, etc.
- Special: specific for sprint/urban

**Total symbols**: ~80+ individual symbols across all columns.

## IOF XML Data Standard v3

**Source**: https://orienteering.sport/iof/it/iof-xml/

XML format for exchanging course data between software systems (course setters, event software, electronic punching).

### Key Elements for Course Export

```xml
<CourseData>
  <Event>
    <Name>My Orienteering Event</Name>
  </Event>
  <RaceCourseData>
    <Course>
      <Name>Course 1</Name>
      <Length>4200</Length>        <!-- metres -->
      <Climb>120</Climb>          <!-- metres -->
      <CourseControl type="Start">
        <Control>S1</Control>
      </CourseControl>
      <CourseControl type="Control">
        <Control>31</Control>
        <LegLength>350</LegLength>
      </CourseControl>
      <!-- ... more controls ... -->
      <CourseControl type="Finish">
        <Control>F1</Control>
      </CourseControl>
    </Course>
    <Control>
      <Id>31</Id>
      <MapPosition x="450.2" y="312.7"/>  <!-- mm on map from origin -->
      <!-- Optional: geo position -->
      <Position lat="-35.1234" lng="149.5678"/>
    </Control>
  </RaceCourseData>
</CourseData>
```

### What We Need to Export
- Event metadata (name, date)
- Course definitions (name, length, climb, ordered controls)
- Control definitions (code, map position, optional geo position)
- Leg lengths between controls

### What We Need to Import
- Control positions from other software
- Course structure (which controls in what order)
- Control codes

## Map Standards Reference

### ISOM 2017-2 (International Specification for Orienteering Maps)
- Standard scale: 1:15000 (long distance) or 1:10000 (middle/relay)
- Defines all map symbols, colours, and their meanings
- The "column D" control description features cross-reference to ISOM symbol numbers

### ISSprOM 2019-2 (Sprint Orienteering Maps)
- Standard scale: 1:4000
- Additional urban/sprint-specific symbols
- Different overprint specifications for sprint

### Overprint Specifications (from IOF Printing Standards)
- **Purple colour**: Pantone 814 (or closest process match)
- **Screen colour approximation**: Various clubs use different RGB values. Common choices:
  - `#CD59A4` (PurplePen default)
  - `#B040B0`
  - `#FF00FF` (pure magenta — too bright, not recommended)
- **Line width**: 0.35mm at print scale
- **Control circle diameter**: 6.0mm outer at print scale (ISOM); 5.0mm (ISSprOM)
- **Start triangle**: 7.0mm side at print scale
- **Finish circles**: Outer 7.0mm, inner 5.0mm diameter; line width 0.35mm
- **Control numbers**: 4.0mm height at print scale
- **Gap in circle at leg junction**: ~0.3mm gap where legs enter/exit the circle

## PurplePen File Format (.ppen)

PurplePen saves events as XML. If we want import support later, the format is straightforward:

```xml
<course-scribe-event>
  <map kind="PDF" scale="10000" ...>
    <absolute-path>path/to/map.pdf</absolute-path>
  </map>
  <control id="1" kind="start" ...>
    <location x="123.4" y="567.8"/>
  </control>
  <control id="2" kind="normal" code="31" ...>
    <location x="234.5" y="678.9"/>
    <description box="D" iof-2004-ref="1.3"/>
    <description box="G" iof-2004-ref="11.1"/>
  </control>
  <course id="1" kind="normal" order="1">
    <name>Long</name>
    <first course-control="101"/>
  </course>
  <course-control id="101" control="1">
    <next course-control="102"/>
  </course-control>
  <!-- Linked list of course controls -->
</course-scribe-event>
```

Key observations:
- Controls are defined globally with (x, y) positions in mm from map origin
- Course controls form a linked list (each has a `next` pointer)
- Descriptions reference IOF symbol IDs
- Map reference is by file path (map file is external)

## Useful Resources

- IOF Rules & Standards: https://orienteering.sport/iof/rules/
- IOF Control Descriptions 2024 PDF: https://orienteering.sport/iof/rules/control-descriptions/
- IOF XML Standard: https://orienteering.sport/iof/it/iof-xml/
- Maprunner IOF symbol reference: https://www.maprunner.co.uk/iof-control-descriptions/
- PurplePen source (GitHub): https://github.com/petergolde/PurplePen
- OpenOrienteering Mapper: https://www.openorienteering.org/apps/mapper/
- OCAD file format (reverse-engineered docs in OOM source): https://github.com/OpenOrienteering/mapper
