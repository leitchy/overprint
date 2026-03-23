/**
 * PurplePen .ppen file parser.
 *
 * Parses a PurplePen XML file (<course-scribe-event>) and returns a full
 * OverprintEvent suitable for loading into the event store.
 *
 * Coordinate system: PurplePen stores positions in mm from the OCAD/map origin
 * (Y-up). For OCAD/OMAP maps, the rendered image has a viewBox offset from
 * this origin, so we need the georef data to correctly place controls.
 *
 * When importing without a loaded map (mapHeightPx === 0), the caller should
 * pass dpi=25.4 to store 1mm=1px with no Y-flip, and set
 * mapFile.pendingCoordinateTransform=true for deferred re-projection.
 */
import type {
  Control,
  ControlDescription,
  Course,
  CourseControl,
  CourseControlType,
  CourseSettings,
  DescriptionStandard,
  MapFile,
  MapPoint,
  MapStandard,
  OverprintEvent,
  SpecialItem,
} from '@/core/models/types';
import { createEvent } from '@/core/models/defaults';
import {
  generateControlId,
  generateCourseId,
  generateSpecialItemId,
} from '@/utils/id';
import type { ControlId, CourseId } from '@/utils/id';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PpenWarning {
  type: 'broken-link' | 'cycle' | 'unknown-description' | 'missing-control' | 'unsupported-feature';
  message: string;
}

export interface PpenImportResult {
  event: OverprintEvent;
  /** Referenced map filename the user should load (from <map> element). */
  mapFileName: string | null;
  warnings: PpenWarning[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PpenCourseControlNode {
  id: string;
  controlRef: string;    // references <control id="...">
  nextId: string | null;
  points?: number;       // score course points
  /** map-exchange attribute on <course-control> (overrides control kind) */
  isExchange?: boolean;
  /** map-flip attribute on <course-control> (exchange variant) */
  isFlip?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mmToPx(mmValue: number, dpi: number): number {
  return (mmValue / 25.4) * dpi;
}

/** Convert PurplePen CMYK colour string "C,M,Y,K" (0-1 each) to hex. */
function cmykToHex(cmykStr: string): string {
  const parts = cmykStr.split(',').map(Number);
  const c = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const y = parts[2] ?? 0;
  const k = parts[3] ?? 0;
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** ViewBox rendering parameters for OCAD/OMAP maps. */
export interface ViewBoxParams {
  viewBox: { x: number; y: number; width: number; height: number };
  renderScale: number;
  /** Coordinate unit divisor: 100 for OCAD (1/100mm), 1000 for OMAP (1/1000mm). */
  mmToUnits: number;
}

/**
 * Convert a PurplePen mm coordinate to pixel coordinates.
 *
 * For OCAD/OMAP maps (with viewBox data): PurplePen coordinates are in mm
 * from the OCAD origin (Y-up). The rendered image uses an SVG viewBox with
 * a Y-flip via translate. The correct conversion is:
 *   px_x = (xMm * 100 - viewBox.x) * renderScale
 *   px_y = (viewBox.y + viewBox.height - yMm * 100) * renderScale
 *
 * For raster/PDF maps (no viewBox): simple mm→pixel conversion with Y-flip.
 *
 * For identity-mm mode (no map loaded, dpi=25.4, mapHeightPx=0): store mm as-is.
 */
function convertPoint(
  xMm: number,
  yMm: number,
  dpi: number,
  mapHeightPx: number,
  vb?: ViewBoxParams,
): MapPoint {
  // OCAD/OMAP: use viewBox-aware conversion
  if (vb && vb.renderScale > 0) {
    const u = vb.mmToUnits; // 100 for OCAD (1/100mm), 1000 for OMAP (1/1000mm)
    const xPx = (xMm * u - vb.viewBox.x) * vb.renderScale;
    // Y conversion differs by SVG structure:
    // - OCAD (ocad2geojson): uses <g translate(0, T)> where T = 2*vb.y + vb.height,
    //   so pixel Y = (vb.y + vb.height - yMm * U) * renderScale
    // - OMAP (our SVG builder): negates Y directly, no transform,
    //   so pixel Y = (-yMm * U - vb.y) * renderScale
    const yPx = u === 1000
      ? (-yMm * u - vb.viewBox.y) * vb.renderScale              // OMAP: direct negation
      : (vb.viewBox.y + vb.viewBox.height - yMm * u) * vb.renderScale; // OCAD: translate-based
    return { x: xPx, y: yPx };
  }

  // Raster/PDF or identity-mm mode
  const xPx = mmToPx(xMm, dpi);
  const yPx = mapHeightPx > 0
    ? mapHeightPx - mmToPx(yMm, dpi)
    : mmToPx(yMm, dpi);
  return { x: xPx, y: yPx };
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getFloatAttr(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) ?? '0') || 0;
}

function getChild(parent: Element, tagName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child && child.tagName === tagName) {
      return child;
    }
  }
  return null;
}

function getChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child && child.tagName === tagName) {
      result.push(child);
    }
  }
  return result;
}

function getTextContent(parent: Element, tagName: string): string {
  return getChild(parent, tagName)?.textContent?.trim() ?? '';
}

/** Walk a course-control linked list from firstId. */
function walkCourseControls(
  firstId: string,
  nodeMap: Map<string, PpenCourseControlNode>,
  maxNodes = 10000,
): { chain: PpenCourseControlNode[]; warnings: PpenWarning[] } {
  const chain: PpenCourseControlNode[] = [];
  const warnings: PpenWarning[] = [];
  const visited = new Set<string>();
  let currentId: string | null = firstId;

  while (currentId !== null && chain.length < maxNodes) {
    if (visited.has(currentId)) {
      warnings.push({
        type: 'cycle',
        message: `Cycle detected in course-control linked list at node ${currentId}`,
      });
      break;
    }
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) {
      warnings.push({
        type: 'broken-link',
        message: `Course-control node ${currentId} not found`,
      });
      break;
    }

    chain.push(node);
    currentId = node.nextId;
  }

  return { chain, warnings };
}

function mapPpenKindToMapType(kind: string): MapFile['type'] {
  switch (kind.toUpperCase()) {
    case 'OCAD': return 'ocad';
    case 'PDF': return 'pdf';
    default: return 'raster';
  }
}

function mapDescriptionKind(value: string | null): CourseSettings['descriptionAppearance'] {
  switch (value) {
    case 'symbols': return 'symbols';
    case 'text': return 'text';
    case 'symbols-and-text': return 'symbolsAndText';
    default: return undefined;
  }
}

function mapLabelKind(value: string | null): CourseSettings['labelMode'] {
  switch (value) {
    case 'sequence': return 'sequence';
    case 'code': return 'code';
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

export function importPpen(
  xmlString: string,
  dpi: number,
  mapHeightPx: number,
  viewBox?: ViewBoxParams,
): PpenImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const warnings: PpenWarning[] = [];

  // Check for parse errors
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new Error(
      `PurplePen XML parse error: ${parseErrors[0]?.textContent ?? 'unknown error'}`,
    );
  }

  const root = doc.documentElement;
  if (root.tagName !== 'course-scribe-event') {
    throw new Error(`Not a PurplePen file: expected <course-scribe-event>, got <${root.tagName}>`);
  }

  // -----------------------------------------------------------------------
  // 1. Event metadata
  // -----------------------------------------------------------------------

  const eventEl = getChild(root, 'event');
  if (!eventEl) {
    throw new Error('PurplePen file missing <event> element');
  }

  const eventTitle = getTextContent(eventEl, 'title') || 'Imported Event';

  const mapEl = getChild(eventEl, 'map');
  const mapKind = mapEl ? (getAttr(mapEl, 'kind') ?? '') : '';
  const mapScale = mapEl ? (parseFloat(getAttr(mapEl, 'scale') ?? '15000') || 15000) : 15000;
  const mapFileName = mapEl?.textContent?.trim() ?? null;

  const standardsEl = getChild(eventEl, 'standards');
  const mapStandardRaw = standardsEl ? (getAttr(standardsEl, 'map') ?? '2017') : '2017';
  const descStandardRaw = standardsEl ? (getAttr(standardsEl, 'description') ?? '2018') : '2018';

  const mapStandard: MapStandard = mapStandardRaw.includes('2019') ? 'ISSprOM2019' : 'ISOM2017';
  const descriptionStandard: DescriptionStandard = descStandardRaw >= '2024' ? '2024' : '2018';

  const allControlsEl = getChild(eventEl, 'all-controls');
  const eventPrintScale = allControlsEl
    ? (parseFloat(getAttr(allControlsEl, 'print-scale') ?? String(mapScale)) || mapScale)
    : mapScale;

  const descriptionsEl = getChild(eventEl, 'descriptions');
  const descLang = descriptionsEl ? (getAttr(descriptionsEl, 'lang') ?? 'en') : 'en';
  // Convert BCP 47 with region (e.g. "en-GB") to base language
  const language = descLang.split('-')[0] || 'en';

  // -----------------------------------------------------------------------
  // 2. Parse controls
  // -----------------------------------------------------------------------

  const controlEls = getChildren(root, 'control');
  /** Map from ppen control id → { control, kind } */
  const controlMap = new Map<string, { control: Control; kind: string }>();

  for (const el of controlEls) {
    const ppenId = getAttr(el, 'id') ?? '';
    const kind = getAttr(el, 'kind') ?? 'normal';

    const locEl = getChild(el, 'location');
    if (!locEl) continue;
    const xMm = getFloatAttr(locEl, 'x');
    const yMm = getFloatAttr(locEl, 'y');
    const position = convertPoint(xMm, yMm, dpi, mapHeightPx, viewBox);

    // Control code: start/finish don't have codes in .ppen
    let code: number;
    if (kind === 'start') {
      code = 1;
    } else if (kind === 'finish') {
      code = 2;
    } else {
      code = parseInt(getTextContent(el, 'code'), 10) || 0;
    }

    // Parse description columns
    const description: ControlDescription = { columnD: '' };
    const descEls = getChildren(el, 'description');
    for (const descEl of descEls) {
      const box = getAttr(descEl, 'box');
      const ref = getAttr(descEl, 'iof-2004-ref') ?? '';
      if (!box || !ref) continue;

      if (box === 'all') {
        // Full-row symbols (e.g. finish symbol 14.3) → columnH
        description.columnH = ref;
      } else {
        const col = box.toUpperCase();
        switch (col) {
          case 'C': description.columnC = ref; break;
          case 'D': description.columnD = ref; break;
          case 'E': description.columnE = ref; break;
          case 'F': description.columnF = ref; break;
          case 'G': description.columnG = ref; break;
          case 'H': description.columnH = ref; break;
        }
      }
    }

    controlMap.set(ppenId, {
      control: {
        id: generateControlId(),
        code,
        position,
        description,
      },
      kind,
    });
  }

  // -----------------------------------------------------------------------
  // 3. Parse course-control linked list nodes
  // -----------------------------------------------------------------------

  const courseControlEls = getChildren(root, 'course-control');
  const ccNodeMap = new Map<string, PpenCourseControlNode>();

  for (const el of courseControlEls) {
    const id = getAttr(el, 'id') ?? '';
    const controlRef = getAttr(el, 'control') ?? '';
    const nextEl = getChild(el, 'next');
    const nextId = nextEl ? (getAttr(nextEl, 'course-control') ?? null) : null;
    const pointsStr = getAttr(el, 'points');
    const points = pointsStr ? (parseInt(pointsStr, 10) || undefined) : undefined;
    const isExchange = getAttr(el, 'map-exchange') === 'true' || undefined;
    const isFlip = getAttr(el, 'map-flip') === 'true' || undefined;

    ccNodeMap.set(id, { id, controlRef, nextId, points, isExchange, isFlip });
  }

  // -----------------------------------------------------------------------
  // 4. Parse courses and walk linked lists
  // -----------------------------------------------------------------------

  const courseEls = getChildren(root, 'course');
  const courses: Course[] = [];
  /** Map from ppen course id → generated CourseId (for special object course assignments) */
  const courseIdMap = new Map<string, CourseId>();

  for (const courseEl of courseEls) {
    const ppenCourseId = getAttr(courseEl, 'id') ?? '';
    const courseKind = getAttr(courseEl, 'kind') ?? 'normal';

    // Skip "all controls" pseudo-course
    if (courseKind === 'all controls') continue;

    const courseName = getTextContent(courseEl, 'name') || 'Unnamed Course';

    const firstEl = getChild(courseEl, 'first');
    const firstCcId = firstEl ? (getAttr(firstEl, 'course-control') ?? '') : '';

    // Walk the linked list
    const { chain, warnings: walkWarnings } = walkCourseControls(firstCcId, ccNodeMap);
    warnings.push(...walkWarnings);

    // Build CourseControl array
    const courseControls: CourseControl[] = [];
    let hasScore = false;

    for (const node of chain) {
      const entry = controlMap.get(node.controlRef);

      if (!entry) {
        warnings.push({
          type: 'missing-control',
          message: `Course "${courseName}": control ${node.controlRef} not found`,
        });
        continue;
      }

      let type: CourseControlType;
      if (entry.kind === 'start') {
        type = 'start';
      } else if (entry.kind === 'finish') {
        type = 'finish';
      } else if (entry.kind === 'crossing-point') {
        type = 'crossingPoint';
      } else if (entry.kind === 'map-exchange') {
        type = 'mapExchange';
      } else {
        type = 'control';
      }

      // course-control level map-exchange/map-flip overrides control kind
      // (a normal control can be marked as an exchange at the course level)
      if (node.isExchange) {
        type = node.isFlip ? 'mapFlip' : 'mapExchange';
      }

      const cc: CourseControl = {
        controlId: entry.control.id,
        type,
      };

      if (node.points !== undefined) {
        cc.score = node.points;
        hasScore = true;
      }

      courseControls.push(cc);
    }

    // Course settings
    const optionsEl = getChild(courseEl, 'options');
    const labelsEl = getChild(courseEl, 'labels');
    const printAreaEl = getChild(courseEl, 'print-area');

    const settings: CourseSettings = {};
    if (optionsEl) {
      const ps = getAttr(optionsEl, 'print-scale');
      if (ps) settings.printScale = parseFloat(ps) || undefined;
      settings.descriptionAppearance = mapDescriptionKind(getAttr(optionsEl, 'description-kind'));
    }
    if (labelsEl) {
      settings.labelMode = mapLabelKind(getAttr(labelsEl, 'label-kind'));
    }
    if (printAreaEl) {
      const left = getFloatAttr(printAreaEl, 'left');
      const top = getFloatAttr(printAreaEl, 'top');
      const right = getFloatAttr(printAreaEl, 'right');
      const bottom = getFloatAttr(printAreaEl, 'bottom');
      const topLeft = convertPoint(left, top, dpi, mapHeightPx, viewBox);
      const bottomRight = convertPoint(right, bottom, dpi, mapHeightPx, viewBox);
      settings.printArea = {
        minX: Math.min(topLeft.x, bottomRight.x),
        minY: Math.min(topLeft.y, bottomRight.y),
        maxX: Math.max(topLeft.x, bottomRight.x),
        maxY: Math.max(topLeft.y, bottomRight.y),
      };

      // Parse page orientation from print-area
      const isLandscape = getAttr(printAreaEl, 'page-landscape') === 'true';
      if (isLandscape) {
        settings.pageSetup = { ...settings.pageSetup, orientation: 'landscape' };
      }
    }

    const courseId = generateCourseId();
    courseIdMap.set(ppenCourseId, courseId);

    courses.push({
      id: courseId,
      name: courseName,
      courseType: (courseKind === 'score' || hasScore) ? 'score' : 'normal',
      controls: courseControls,
      settings,
    });
  }

  // -----------------------------------------------------------------------
  // 5. Parse legs for bend points
  // -----------------------------------------------------------------------

  const legEls = getChildren(root, 'leg');
  for (const legEl of legEls) {
    const startControlRef = getAttr(legEl, 'start-control') ?? '';
    const endControlRef = getAttr(legEl, 'end-control') ?? '';

    const bendsEl = getChild(legEl, 'bends');
    if (!bendsEl) continue;

    const bendLocations = getChildren(bendsEl, 'location');
    if (bendLocations.length === 0) continue;

    const bendPoints: MapPoint[] = bendLocations.map(loc => {
      const xMm = getFloatAttr(loc, 'x');
      const yMm = getFloatAttr(loc, 'y');
      return convertPoint(xMm, yMm, dpi, mapHeightPx, viewBox);
    });

    // Find the control IDs for the ppen control refs
    const startEntry = controlMap.get(startControlRef);
    const endEntry = controlMap.get(endControlRef);
    if (!startEntry || !endEntry) continue;

    // Attach bend points to all matching course-controls across all courses
    for (const course of courses) {
      for (let i = 0; i < course.controls.length - 1; i++) {
        const cc = course.controls[i];
        const ccNext = course.controls[i + 1];
        if (
          cc && ccNext &&
          cc.controlId === startEntry.control.id &&
          ccNext.controlId === endEntry.control.id
        ) {
          cc.bendPoints = [...bendPoints];
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 6. Parse special objects
  // -----------------------------------------------------------------------

  const specialObjectEls = getChildren(root, 'special-object');
  const specialItems: SpecialItem[] = [];

  for (const soEl of specialObjectEls) {
    const kind = getAttr(soEl, 'kind') ?? '';
    const locations = getChildren(soEl, 'location');

    const loc0 = locations[0];
    if (!loc0) continue;

    const pos1 = convertPoint(getFloatAttr(loc0, 'x'), getFloatAttr(loc0, 'y'), dpi, mapHeightPx, viewBox);

    // Parse course assignments
    const coursesEl = getChild(soEl, 'courses');
    const courseIds: CourseId[] = [];
    if (coursesEl) {
      for (const cEl of getChildren(coursesEl, 'course')) {
        const ppenCId = getAttr(cEl, 'course') ?? '';
        const mappedId = courseIdMap.get(ppenCId);
        if (mappedId) courseIds.push(mappedId);
      }
    }

    const baseProps = {
      id: generateSpecialItemId(),
      position: pos1,
      courseIds: courseIds.length > 0 ? courseIds : undefined,
    };

    const loc1 = locations[1]; // Second location (for two-point items)

    switch (kind) {
      case 'descriptions': {
        if (loc1) {
          const pos2 = convertPoint(getFloatAttr(loc1, 'x'), getFloatAttr(loc1, 'y'), dpi, mapHeightPx, viewBox);
          specialItems.push({ ...baseProps, type: 'descriptionBox', endPosition: pos2 });
        }
        break;
      }
      case 'text': {
        const text = getTextContent(soEl, 'text') || getAttr(soEl, 'text') || '';
        // Derive font size from bounding box height (two locations).
        // Store raw mm value — converted to pixels during re-projection or
        // immediately if map is loaded. Use mmToPx with the current DPI.
        let fontSize = 14; // fallback px
        if (loc1) {
          const boxHeightMm = Math.abs(getFloatAttr(loc1, 'y') - getFloatAttr(loc0, 'y'));
          // In identity-mm mode (dpi=25.4), this stores mm directly.
          // In real mode, converts to pixels immediately.
          fontSize = Math.max(mmToPx(boxHeightMm, dpi), 4);
        }
        // Parse font properties
        const fontEl = getChild(soEl, 'font');
        const isBold = fontEl ? getAttr(fontEl, 'bold') === 'true' : false;
        const isItalic = fontEl ? getAttr(fontEl, 'italic') === 'true' : false;
        // Parse CMYK appearance colour
        const appearEl = getChild(soEl, 'appearance');
        const colorStr = appearEl ? getAttr(appearEl, 'color') : null;
        const itemColor = colorStr ? cmykToHex(colorStr) : undefined;
        specialItems.push({
          ...baseProps,
          type: 'text',
          text,
          fontSize,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
          color: itemColor,
        });
        break;
      }
      case 'line':
      case 'boundary': {
        // boundary = course boundary marker (short line segment at map edge)
        if (loc1) {
          const pos2 = convertPoint(getFloatAttr(loc1, 'x'), getFloatAttr(loc1, 'y'), dpi, mapHeightPx, viewBox);
          specialItems.push({ ...baseProps, type: 'line', endPosition: pos2 });
        }
        break;
      }
      case 'rectangle': {
        if (loc1) {
          const pos2 = convertPoint(getFloatAttr(loc1, 'x'), getFloatAttr(loc1, 'y'), dpi, mapHeightPx, viewBox);
          specialItems.push({ ...baseProps, type: 'rectangle', endPosition: pos2 });
        }
        break;
      }
      case 'out-of-bounds':
        specialItems.push({ ...baseProps, type: 'outOfBounds' });
        break;
      case 'dangerous-area':
        specialItems.push({ ...baseProps, type: 'dangerousArea' });
        break;
      case 'water-location':
        specialItems.push({ ...baseProps, type: 'waterLocation' });
        break;
      case 'first-aid':
        specialItems.push({ ...baseProps, type: 'firstAid' });
        break;
      case 'forbidden-route':
        specialItems.push({ ...baseProps, type: 'forbiddenRoute' });
        break;
      case 'image': {
        if (loc1) {
          const pos2 = convertPoint(getFloatAttr(loc1, 'x'), getFloatAttr(loc1, 'y'), dpi, mapHeightPx, viewBox);
          const imageDataEl = getChild(soEl, 'image-data');
          const format = imageDataEl ? (getAttr(imageDataEl, 'format') ?? 'png') : 'png';
          const base64 = imageDataEl?.textContent?.trim() ?? '';
          if (base64) {
            const imageDataUrl = `data:image/${format};base64,${base64}`;
            const fileName = getTextContent(soEl, 'text') || undefined;
            specialItems.push({ ...baseProps, type: 'image', endPosition: pos2, imageDataUrl, fileName });
          }
        }
        break;
      }
      default:
        warnings.push({
          type: 'unsupported-feature',
          message: `Unknown special object kind: "${kind}"`,
        });
        break;
    }
  }

  // -----------------------------------------------------------------------
  // 7. Assemble OverprintEvent
  // -----------------------------------------------------------------------

  const event = createEvent(eventTitle, language);

  event.mapFile = {
    name: mapFileName ?? '',
    type: mapPpenKindToMapType(mapKind),
    scale: mapScale,
    dpi,
  };

  event.settings.printScale = eventPrintScale;
  event.settings.descriptionStandard = descriptionStandard;
  event.settings.mapStandard = mapStandard;

  // If all courses specify landscape, set it at the event level
  if (courses.length > 0 && courses.every((c) => c.settings.pageSetup?.orientation === 'landscape')) {
    event.settings.pageSetup = { ...event.settings.pageSetup, orientation: 'landscape' };
  }

  // Build controls record
  const controls: Record<string, Control> = {};
  for (const { control } of controlMap.values()) {
    controls[control.id] = control;
  }
  event.controls = controls as Record<ControlId, Control>;

  event.courses = courses;
  event.specialItems = specialItems;

  return { event, mapFileName, warnings };
}
