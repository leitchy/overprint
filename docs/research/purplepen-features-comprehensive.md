# PurplePen Complete Feature List

Comprehensive research of PurplePen orienteering course setting software, current as of 2025.

## Overview

PurplePen is a free, open-source course design application for orienteering. It enables course setters to design courses visually on maps, generate IOF-standard control description sheets, calculate course statistics, and export production-ready files for printing and electronic punching systems.

---

## 1. Map File Format Support

### Input (Supported Map Formats)
- **OCAD files** (versions 6–12)
  - Full support for all OCAD 10 symbol and object features
  - OCAD 12 format support (v2.6.0 added this)
  - Can read and import OCAD maps directly
- **OpenOrienteering Mapper** (.omap, .xmap)
- **PDF maps** (direct import)
- **Raster/bitmap images** (JPG, GIF, PNG, TIFF, BMP)

### Output (Export Formats)
- **PDF** (maps with course overprints, description sheets)
  - Multi-page PDF export (all courses in one file)
  - Per-course page orientation
  - Configurable margins and print scale
- **PNG/JPEG images** (course maps and description sheets)
- **OCAD files** (export back to OCAD for final printing)
- **OpenOrienteering Mapper files** (export to OOM format)
- **IOF XML** (versions 2 and 3)
- **GPX files** (waypoint format for GPS devices)
- **RouteGadget format** (single-step creation; note: exports are not automatically georeferenced)
- **KML files** (for GIS/mapping software)

---

## 2. Core Course Design Features

### Control Placement & Editing
- Click-to-place controls on the map
- Drag to move controls
- Delete controls
- Automatic control code assignment and renumbering
- Bulk code changes (change all control codes at once or individually)
- Control code validation and error checking

### Control Types & Symbols
- **Start symbol** (triangle)
- **Finish symbol** (double circle)
- **Numbered controls** (code ≥ 30 for regular courses)
- **Special item symbols** for map exchanges and variations:
  - Map exchange marker (X)
  - Inverted triangle (for map flip/butterfly exchanges)
  - Type cycling (easy switching between control types)

### Leg Management
- Automatic leg drawing between consecutive controls
- Leg visualization on canvas
- Leg length calculation
- **Bend modification** (optional bend in a leg)
- **Gap modification** (optional gap in a leg)

### Shared Controls Across Courses
- Controls can be reused across multiple courses in an event
- Shared controls display in background layers
- Click-to-reuse existing controls
- Automatic synchronization of codes and descriptions across courses

### Course Management
- Create, rename, delete courses
- Duplicate existing courses
- Reorder courses
- Switch between courses (active course view)
- Multi-course event support (one event = multiple courses)
- Custom course length specification
- Per-course paper size and print area settings

---

## 3. Course Types & Variations

### Standard Linear Courses
- Traditional point-to-point courses (controls in fixed sequence)
- Leg-based structure (start → control 1 → control 2 → ... → finish)

### Score Courses
- Toggle score course mode per course
- Assign point values to individual controls (e.g., 10 pt, 20 pt, 30 pt)
- Point values entered in IOF column H
- Special visualization for score-course numbering
- No mandatory leg sequence (competitors choose which controls to visit)

### Course Variations & Relays
- Add forks and loops to create course variations
- **Loops** (competitor returns to one control multiple times, runs loops in any order)
- **Butterfly exchanges** (two-loop variation creating 4 course variants: ABCD, ABDC, BACD, BADC)
- **Relay team assignment** (fairness mode: randomly assigns variations to team members ensuring all teams run same legs while minimizing following risk)
- Multi-part courses with map exchanges

### Map Exchanges & Flips
- **Map exchange at a control** (separate maps for different legs)
- **Map flip/butterfly** (two loops exchanged between teams)
- Specialized symbols for marking exchange points
- Separate or combined map/description print options

---

## 4. Control Description Sheets

### IOF Standard Support
- **IOF 2000 standard** (older format)
- **IOF 2018 standard** (current)
- **IOF 2024 standard** (latest, backwards-compatible with 2018)
- Conform to ISOM 2017-2 overprint dimensions
  - Control circle: 5.0 mm
  - Start triangle: 6.0 mm side
  - Finish: 5.0 mm / 3.5 mm

### Column Support (IOF 8-Column Grid)
- **Column A**: Sequence number (derived from course order)
- **Column B**: Control code (e.g., 31, 32)
- **Column C**: Which of similar features (e.g., "northern")
- **Column D**: Feature (the control feature symbol — required)
- **Column E**: Appearance / detail
- **Column F**: Dimensions / combinations
- **Column G**: Location of flag (e.g., "north side")
- **Column H**: Other information (e.g., point values for score courses)

### Description Format Options
- **Symbolic descriptions** (IOF pictogram symbols only)
- **Textual descriptions** (English, Norwegian, and other languages)
- **Combined descriptions** (both symbols and text)
- Automatic text generation for descriptions

### Multi-Language Support (18 Languages)
Description text auto-generation in: English, Norwegian, French, German, Swedish, Spanish, Finnish, and others (18 total languages).

### Interactive Description Editing
- View course and descriptions simultaneously
- Click on description to set correct description for each control
- Edit descriptions manually if needed
- Symbol picker for selecting terrain feature descriptions
- Draggable control sequence numbers
- Real-time description updates

---

## 5. Appearance & Customization

### Overprint Color & Blending
- **Standard purple overprint**: Pantone 814 approximation (`#CD59A4` / `rgb(205, 89, 164)`)
- **Overprint effect option**: "Use overprint effect for colors marked overprint" (off by default)
- **Color blending**: "Blend purple with underlying map colors"
  - Dark and black map objects show through purple overprint
  - Works in on-screen display, printing, and PDF export
- Overprinting works for both OCAD and OpenOrienteering Mapper formats

### Line Appearance Customization
- **Line weight/width** customization (Item → Change Line Appearance)
- **Line color** selection
- Per-line customization of appearance
- **Control circle size** adjustment
- **Start triangle size** adjustment

### Font & Text Customization
- Add custom text objects via Add Special Item → Text
- Font selection (Arial, Roboto as defaults)
- **Text color** selection
- **Font size** adjustment
- **Text placeholder** syntax (use "*" to mark position)
- Custom text placement via drag-and-drop

### Control Number Appearance
- Font choice for control numbers (Arial or Roboto)
- Size adjustment
- Custom positioning

### Event-Level Appearance Settings
- Event → Customize Course Appearance (global settings)
- Event → Customize Appearance (overprint effect toggle)

---

## 6. Print & Export Settings

### Page & Print Area Configuration
- **Page size selection** (A4, A3, Letter, etc.)
- **Orientation** (Portrait, Landscape)
- **Per-course paper sizes** (different courses can have different page sizes)
- **Print margins** configuration
- **Automatic print area detection** (auto-fits map to page)
- **Manual print area adjustment** (red box editor for precise control)
- **Print area locking** to page size (simplifies area setup)

### Print Area Management
- View/hide print area with View → Show Print Area
- Set print area for all courses via File → Set Print Area → All Courses
- Set print area for single course
- Course-specific print areas

### Print Scale
- **Custom print scale** per course (independent from map scale)
- **Print preview** before exporting
- Scale bar inclusion in PDF exports
- Correct scale calculation for OCAD import

### Course Centering
- **Course-centered printing** (map centered on course/controls)
- Auto-crop whitespace

### Special Print Features
- **Master punch cards** generation (for pin-punch control card validation)
- **All controls map** view/print (one comprehensive control display per course)

---

## 7. Advanced Features

### Course Analysis & Reporting

#### Automated Calculations
- **Course length calculation** (automatic)
- **Leg length calculation** (each individual leg)
- **Climb calculation** (cumulative elevation per leg)
- **Competitor load analysis** (how many competitors visit each control or run each leg)

#### Available Reports
- Course summary reports
- Leg analysis reports
- **Event audit report** (checks event for potential problems/inconsistencies)
- **All controls cross-reference** (which courses use which controls)
- **Leg length report** (all leg lengths in event)
- Competitive analysis (load on controls and legs)

### Data Validation & Audit
- **Event audit functionality** (identifies potential event problems)
- Shared control synchronization checking
- Code validation
- Leg integrity checking
- Description completeness checking

### Undo/Redo
- **100 levels of undo/redo** (extensive edit history)
- Full edit stack preservation
- Navigate through editing history

### Keyboard Shortcuts
- Standard keyboard shortcuts for core functions
- Undo/Redo keyboard shortcuts
- Menu items display associated shortcuts

### GPS & Mobile Integration
- **GPX export** for GPS devices (v2.4.0+)
- Download control locations to mobile GPS device
- Waypoint format standard (GPS-compatible)

### RouteGadget Integration
- **Single-step creation** of RouteGadget-compatible files (v1.1.0+)
- Export map images and control data
- Note: Exports are not automatically georeferenced; manual positioning required

### Additional Map Elements
- **Custom text objects** (Add Special Item → Text)
- **Images** (embed images on map)
- **Lines and shapes** (draw custom graphics)
- **Out of bounds areas** marking
- All elements support color and style customization

---

## 8. File Management

### File Formats Supported
- **.ppen** (native PurplePen format for save/load)
- Import/export to multiple orienteering standard formats
- Save/load event definitions

### Save & Load Workflow
- Save event with courses and controls to .overprint file
- Load previously saved events
- Auto-save capability (implied)

---

## 9. User Interface & Accessibility

### Visual Display
- **High-resolution display support** (HiDPI-ready)
- **Canvas-based map rendering** (full visual control)
- Real-time course overlay on map
- Print area visualization (toggle on/off)

### Multi-Language Support
- **UI languages**: English, French, German, Swedish, Spanish, Norwegian (Bokmål, Nynorsk), Finnish, Polish, Hungarian, Bulgarian, Romanian, Estonian, Japanese (13+ languages)
- **Description generation languages**: 18 languages for automatic terrain text
- Localization files available in repository (po format)

### Navigation & Editing
- Click-based control placement
- Drag-based control/element repositioning
- Pan and zoom (implied in canvas interaction)
- Context menus for quick actions
- Tree view or list view for course/control management

---

## 10. Standards Compliance

### IOF Standards
- **IOF Control Description Standard 2024** (and 2018, 2000)
- **IOF XML Data Standard v3** (and v2)
- **ISOM 2017-2** (overprint dimensions and symbols)
- **ISSprOM 2019-2** (sprint map symbol set)

### Export Compatibility
- Electronic scoring systems (IOF XML v2/v3)
- Event management software
- OCAD and OpenOrienteering Mapper tools
- GPS devices (GPX)
- RouteGadget analysis (with manual georeferencing)

---

## 11. Performance & Robustness

- **100 levels of undo/redo** (system stability with extensive edit history)
- OCAD file version compatibility (6–12)
- Handles maps of various resolutions and formats
- Cross-platform reliability (Windows primary, potential cross-platform C# support)

---

## 12. Developer & Community Features

### Open Source
- **License**: GNU GPL (free and open-source)
- **Repository**: GitHub (petergolde/PurplePen)
- **Primary Language**: C# (91.5% of codebase)
- Supporting languages: Inno Setup, PowerShell, Smalltalk, HTML, TypeScript
- **46 releases** and active development history (1,343+ commits)
- Community forks available

### Localization Infrastructure
- Localization files in gettext (`.po`) format
- Community translation support
- 13+ UI languages supported
- 18+ description generation languages

---

## Notable Features NOT in Initial Overprint Implementation

Based on comparison with Overprint's current status, PurplePen features that Overprint does not yet have:

1. **Event audit report** (comprehensive validation)
2. **Master punch card generation** (for pin-punch verification)
3. **GPS/GPX export** (waypoint download to mobile devices)
4. **RouteGadget export** (for online analysis platforms)
5. **Custom graphics/text/images** (Add Special Item for arbitrary elements)
6. **Relay team assignment fairness mode** (automated variation assignment)
7. **Leg modification** (bend, gap options)
8. **All controls map** (comprehensive control display)
9. **Per-course paper size** (different page dimensions per course)
10. **100 levels of undo/redo** (Overprint uses zundo, typically fewer levels)
11. **Detailed competitor load analysis** (count visitors per control/leg)
12. **Full OCAD 12 export support** (Overprint may not export back to OCAD)

---

## Research Sources

- [PurplePen Official Website](http://www.purple-pen.org/)
- [PurplePen GitHub Repository](https://github.com/petergolde/PurplePen)
- [Purple Pen Change Summary](https://purple-pen.org/change_summary.htm)
- [Orienteering Western Australia Manual](https://wa.orienteering.asn.au/about-us/technical-guidelines-v1/65-course-planning/1075-purple-pen)
- [Orienteering Queensland User Guide](https://oq.orienteering.asn.au/file/documents/oq_purplepen.pdf)
- [South Australian Guide](https://www.sa.orienteering.asn.au/images/gfolder/about/guidelines_policy/EventManagement/14_Using_Purple_Pen_For_Course_Planning.pdf)
- [Devon Orienteering Guide](https://www.devonorienteering.co.uk/documents/training_for_officials/Purple%20Pen%20for%20Planners_(DVO).pdf)
- [NZ Introduction - OBOP](https://www.obop.org.nz/uploads/7/4/5/8/7458484/usingpurplepenv2.pdf)
- [South Downs Orienteers Guide](https://www.southdowns-orienteers.org.uk/documents/event-resources/Course-Planning-using-Purple-Pen-v2.pdf)

---

## Document Metadata

- **Research Date**: 2025-03-20
- **Scope**: Comprehensive feature list of PurplePen course setting software
- **Coverage**: Core features, advanced features, file formats, standards compliance, customization options
- **Reference Version**: PurplePen 3.5.3 (latest current version as of search results)
