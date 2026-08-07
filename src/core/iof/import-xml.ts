/**
 * IOF XML Data Standard v3.0 import.
 *
 * Parses a `CourseData` document and returns Control[] and Course[] ready to load
 * into the OverprintEvent model. Accepts real-world IOF v3 files (PurplePen,
 * Condes, etc.) — `<Control type="…">` with a nested `<CourseControl type="…">
 * <Control>id</Control>` — and stays back-compatible with the legacy dialect
 * Overprint used to emit (`<Type>` child; `<Control><ControlId>` course refs).
 */
import type { Control, Course, CourseControl, CourseControlType } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { asControlId, generateControlId, generateCourseId } from '@/utils/id';
import { IOF_XML_NS } from './xml-constants';

// ---------------------------------------------------------------------------
// Parse result
// ---------------------------------------------------------------------------

export interface IofImportResult {
  controls: Control[];
  courses: Course[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mm(value: string | null): number {
  return value ? parseFloat(value) : 0;
}

function mmToPx(mmValue: number, dpi: number): number {
  return (mmValue / 25.4) * dpi;
}

function getTextNS(parent: Element, ns: string, tag: string): string {
  return parent.getElementsByTagNameNS(ns, tag)[0]?.textContent?.trim() ?? '';
}

/** Direct element children of `parent` with the given local name and namespace. */
function directChildren(parent: Element, ns: string, localName: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (n): n is Element =>
      n.nodeType === Node.ELEMENT_NODE &&
      (n as Element).localName === localName &&
      (n as Element).namespaceURI === ns,
  ) as Element[];
}

/** Map an IOF control-type token (attribute or legacy child) to our type. */
function mapControlType(iofType: string): CourseControlType {
  switch (iofType) {
    case 'Start':
      return 'start';
    case 'Finish':
      return 'finish';
    case 'CrossingPoint':
      return 'crossingPoint';
    case 'MapExchange':
      return 'mapExchange';
    default:
      return 'control';
  }
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Parse an IOF XML v3 string into Control[] and Course[].
 *
 * @param xmlString  - The raw XML document string
 * @param dpi        - Map image DPI (used to convert mm positions to pixels)
 * @param _mapHeightPx - Deprecated/unused. Positions are top-left / Y-down mm
 *   (the exact inverse of the exporter), so no map height is needed. Kept for
 *   call-site compatibility.
 */
export function importIofXml(
  xmlString: string,
  dpi: number,
  _mapHeightPx?: number,
): IofImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new Error(
      `IOF XML parse error: ${parseErrors[0]?.textContent ?? 'unknown error'}`,
    );
  }

  const ns = IOF_XML_NS;

  const raceCourseData = doc.getElementsByTagNameNS(ns, 'RaceCourseData')[0];
  if (!raceCourseData) {
    return { controls: [], courses: [] };
  }

  // ---------------------------------------------------------------------------
  // Global <Control> definitions (direct children of <RaceCourseData>)
  // ---------------------------------------------------------------------------
  const controlByIofId = new Map<string, Control>();
  const controlTypeByIofId = new Map<string, string>();

  for (const el of directChildren(raceCourseData, ns, 'Control')) {
    const iofId = getTextNS(el, ns, 'Id');
    if (!iofId) continue;
    // Real v3: type is an attribute; legacy Overprint: a <Type> child element.
    const typeStr = el.getAttribute('type') || getTextNS(el, ns, 'Type');
    const mapPosEl = el.getElementsByTagNameNS(ns, 'MapPosition')[0];

    const xMm = mm(mapPosEl?.getAttribute('x') ?? null);
    const yMm = mm(mapPosEl?.getAttribute('y') ?? null);
    const xPx = mmToPx(xMm, dpi);
    const yPx = mmToPx(yMm, dpi);

    // Derive a numeric code; synthesise codes for Start/Finish.
    let code: number;
    if (typeStr === 'Start') {
      code = 1;
    } else if (typeStr === 'Finish') {
      code = 2;
    } else {
      const parsed = parseInt(iofId, 10);
      code = isNaN(parsed) ? 0 : parsed;
    }

    controlByIofId.set(iofId, {
      id: generateControlId(),
      code,
      position: { x: xPx, y: yPx },
      description: { columnD: '' },
    });
    controlTypeByIofId.set(iofId, typeStr);
  }

  // ---------------------------------------------------------------------------
  // Courses
  // ---------------------------------------------------------------------------
  const courses: Course[] = [];

  for (const courseEl of directChildren(raceCourseData, ns, 'Course')) {
    const name = getTextNS(courseEl, ns, 'Name');

    // Real v3 uses <CourseControl>; the legacy dialect used bare <Control>.
    let ccEls = directChildren(courseEl, ns, 'CourseControl');
    const legacy = ccEls.length === 0;
    if (legacy) ccEls = directChildren(courseEl, ns, 'Control');

    const courseControls: CourseControl[] = [];
    let hasScore = false;

    for (let i = 0; i < ccEls.length; i++) {
      const ccEl = ccEls[i]!;

      // Control reference: real v3 nests <Control>id</Control> (first wins for
      // fork variations); legacy used a <ControlId> child.
      const refId = legacy
        ? getTextNS(ccEl, ns, 'ControlId')
        : (directChildren(ccEl, ns, 'Control')[0]?.textContent?.trim() ?? '');
      const ctrl = controlByIofId.get(refId);
      if (!ctrl) continue;

      // Type: prefer the CourseControl @type, then the control definition's type,
      // then fall back to sequence position (first = start, last = finish).
      const ccTypeAttr = ccEl.getAttribute('type') ?? '';
      const defType = controlTypeByIofId.get(refId) ?? '';
      let type: CourseControlType;
      if (ccTypeAttr) {
        type = mapControlType(ccTypeAttr);
      } else if (defType) {
        type = mapControlType(defType);
      } else if (i === 0) {
        type = 'start';
      } else if (i === ccEls.length - 1) {
        type = 'finish';
      } else {
        type = 'control';
      }

      const scoreStr = getTextNS(ccEl, ns, 'Score');
      const parsedScore = scoreStr ? parseInt(scoreStr, 10) : NaN;
      const score = Number.isNaN(parsedScore) ? undefined : parsedScore;
      if (score !== undefined) hasScore = true;

      courseControls.push({ controlId: ctrl.id as ControlId, type, score });
    }

    courses.push({
      id: generateCourseId(),
      name: name || 'Imported Course',
      courseType: hasScore ? 'score' : 'normal',
      controls: courseControls,
      settings: {},
    });
  }

  // ---------------------------------------------------------------------------
  // Return only controls referenced by at least one course
  // ---------------------------------------------------------------------------
  const usedControlIds = new Set<ControlId>();
  for (const course of courses) {
    for (const cc of course.controls) usedControlIds.add(cc.controlId);
  }
  const controls = Array.from(controlByIofId.values()).filter((c) =>
    usedControlIds.has(c.id),
  );

  return { controls, courses };
}

// Re-export asControlId so callers can cast imported IDs without importing id.ts
export { asControlId };
