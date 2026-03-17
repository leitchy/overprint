/**
 * IOF XML Data Standard v3.0 import.
 *
 * Parses a CourseData XML string and returns Control[] and Course[] suitable
 * for loading into the OverprintEvent model.
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

function yFlipPx(yMm: number, mapHeightPx: number, dpi: number): number {
  // IOF Y increases upward from bottom-left; our Y increases downward from top-left
  const yFromBottom = mmToPx(yMm, dpi);
  return mapHeightPx - yFromBottom;
}

function getTextNS(parent: Element, ns: string, tag: string): string {
  return parent.getElementsByTagNameNS(ns, tag)[0]?.textContent?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Parse an IOF XML v3 string into Control[] and Course[].
 *
 * @param xmlString  - The raw XML document string
 * @param dpi        - Map image DPI (used to convert mm positions to pixels)
 * @param mapHeightPx - Map image height in pixels (needed for Y-axis flip)
 */
export function importIofXml(
  xmlString: string,
  dpi: number,
  mapHeightPx: number,
): IofImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Check for parse errors
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new Error(
      `IOF XML parse error: ${parseErrors[0]?.textContent ?? 'unknown error'}`,
    );
  }

  const ns = IOF_XML_NS;

  // ---------------------------------------------------------------------------
  // Parse global Control definitions
  // ---------------------------------------------------------------------------

  // Map from IOF control ID string → Control (to share across courses)
  const controlByIofId = new Map<string, Control>();

  const raceCourseDataEls = doc.getElementsByTagNameNS(ns, 'RaceCourseData');
  const raceCourseData = raceCourseDataEls[0];
  if (!raceCourseData) {
    return { controls: [], courses: [] };
  }

  // Global <Control> elements are direct children of <RaceCourseData>
  const controlEls = Array.from(raceCourseData.childNodes).filter(
    (n): n is Element =>
      n.nodeType === Node.ELEMENT_NODE &&
      (n as Element).localName === 'Control' &&
      (n as Element).namespaceURI === ns,
  ) as Element[];

  for (const el of controlEls) {
    const iofId = getTextNS(el, ns, 'Id');
    const typeStr = getTextNS(el, ns, 'Type');
    const mapPosEl = el.getElementsByTagNameNS(ns, 'MapPosition')[0];

    const xMm = mm(mapPosEl?.getAttribute('x') ?? null);
    const yMm = mm(mapPosEl?.getAttribute('y') ?? null);

    const xPx = mmToPx(xMm, dpi);
    const yPx = yFlipPx(yMm, mapHeightPx, dpi);

    // Derive a numeric code: synthesise codes for Start/Finish
    let code: number;
    if (typeStr === 'Start') {
      code = 1;
    } else if (typeStr === 'Finish') {
      code = 2;
    } else {
      const parsed = parseInt(iofId, 10);
      code = isNaN(parsed) ? 0 : parsed;
    }

    const control: Control = {
      id: generateControlId(),
      code,
      position: { x: xPx, y: yPx },
      description: { columnD: '' },
    };

    controlByIofId.set(iofId, control);
  }

  // ---------------------------------------------------------------------------
  // Parse Course elements
  // ---------------------------------------------------------------------------

  const courseEls = Array.from(raceCourseData.childNodes).filter(
    (n): n is Element =>
      n.nodeType === Node.ELEMENT_NODE &&
      (n as Element).localName === 'Course' &&
      (n as Element).namespaceURI === ns,
  ) as Element[];

  const courses: Course[] = [];

  for (const courseEl of courseEls) {
    const name = getTextNS(courseEl, ns, 'Name');

    // Course-level <Control> elements (sequence references)
    const courseControlEls = Array.from(courseEl.childNodes).filter(
      (n): n is Element =>
        n.nodeType === Node.ELEMENT_NODE &&
        (n as Element).localName === 'Control' &&
        (n as Element).namespaceURI === ns,
    ) as Element[];

    const courseControls: CourseControl[] = [];
    let seqIndex = 0;

    for (const ccEl of courseControlEls) {
      const refId = getTextNS(ccEl, ns, 'ControlId');
      const ctrl = controlByIofId.get(refId);
      if (!ctrl) continue;

      let type: CourseControlType;
      if (seqIndex === 0) {
        type = 'start';
      } else if (seqIndex === courseControlEls.length - 1) {
        type = 'finish';
      } else {
        type = 'control';
      }

      courseControls.push({ controlId: ctrl.id as ControlId, type });
      seqIndex++;
    }

    courses.push({
      id: generateCourseId(),
      name: name || 'Imported Course',
      courseType: 'normal',
      controls: courseControls,
      settings: {},
    });
  }

  // ---------------------------------------------------------------------------
  // Build final control list
  // ---------------------------------------------------------------------------

  // Only include controls that are actually referenced by at least one course
  const usedControlIds = new Set<ControlId>();
  for (const course of courses) {
    for (const cc of course.controls) {
      usedControlIds.add(cc.controlId);
    }
  }

  // Remap with stable IDs
  const controls = Array.from(controlByIofId.values()).filter((c) =>
    usedControlIds.has(c.id),
  );

  return { controls, courses };
}

// Re-export asControlId so callers can cast imported IDs without importing id.ts
export { asControlId };
