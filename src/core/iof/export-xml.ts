/**
 * IOF XML Data Standard v3.0 export.
 *
 * Produces a schema-valid `CourseData` document (namespace
 * http://www.orienteering.org/datastandard/3.0) from an OverprintEvent.
 * Returns a raw XML string — the caller is responsible for saving.
 *
 * Conformance notes (vs. the IOF v3 schema):
 * - A map-control definition is `<Control type="Control|Start|Finish|CrossingPoint">`
 *   with the type as an ATTRIBUTE and `<Id>` + `<MapPosition>` children.
 * - A course references controls via `<CourseControl type="..."><Control>id</Control>…`.
 * - `LegLength` is the length of the leg leading INTO a control (from the previous
 *   one), so it sits on the destination CourseControl; the start carries none.
 * - `RaceCourseData` child order is Map, then all Controls, then all Courses.
 */
import type { Control, Course, CourseControl, OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { mapDistanceMetres } from '@/core/geometry/distance';
import { calculateCourseLength } from '@/core/geometry/course-length';
import { IOF_XML_NS, IOF_XML_VERSION } from './xml-constants';

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/**
 * Escape characters that are invalid in XML text content and attributes.
 * The ampersand MUST be replaced first to avoid double-escaping.
 */
function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert a map-image pixel coordinate to mm.
 *
 * IOF `MapPosition` documents x as units right of, and y as units below, the
 * reference — i.e. a top-left origin with Y increasing downward. Our internal
 * storage is already top-left / Y-down pixels, so both axes convert directly
 * with no flip (this also matches PurplePen, keeping interop lossless). The
 * importer applies the exact inverse.
 */
function pxToMm(pixels: number, dpi: number): number {
  return (pixels / dpi) * 25.4;
}

// ---------------------------------------------------------------------------
// Control-ID / type helpers
// ---------------------------------------------------------------------------

type ControlType = CourseControl['type'];

function controlIofId(ctrl: Control, type: ControlType): string {
  switch (type) {
    case 'start':
      return 'S1';
    case 'finish':
      return 'F1';
    default:
      return String(ctrl.code);
  }
}

/**
 * IOF `ControlType` enum value for the `type` attribute. The enum is
 * {Control, Start, Finish, CrossingPoint, EndOfMarkedRoute}; map exchange/flip
 * have no schema representation, so they fall back to Control.
 */
function controlTypeAttr(type: ControlType): string {
  switch (type) {
    case 'start':
      return 'Start';
    case 'finish':
      return 'Finish';
    case 'crossingPoint':
      return 'CrossingPoint';
    default:
      return 'Control';
  }
}

// ---------------------------------------------------------------------------
// Fragment builders
// ---------------------------------------------------------------------------

function buildControlElement(
  ctrl: Control,
  type: ControlType,
  dpi: number,
): string {
  const iofId = escapeXml(controlIofId(ctrl, type));
  const typeAttr = controlTypeAttr(type);
  const xMm = pxToMm(ctrl.position.x, dpi).toFixed(3);
  const yMm = pxToMm(ctrl.position.y, dpi).toFixed(3);

  return [
    `    <Control type="${typeAttr}">`,
    `      <Id>${iofId}</Id>`,
    `      <MapPosition x="${xMm}" y="${yMm}" unit="mm"/>`,
    `    </Control>`,
  ].join('\n');
}

function buildCourseElement(
  course: Course,
  controls: Record<ControlId, Control>,
  dpi: number,
  scale: number,
): string {
  const isScore = course.courseType === 'score';

  const lines: string[] = [
    `    <Course>`,
    `      <Name>${escapeXml(course.name)}</Name>`,
  ];
  // Length is the sum of ordered legs — meaningless for score courses, so omit it there.
  if (!isScore) {
    const lengthM = calculateCourseLength(course.controls, controls, scale, dpi);
    lines.push(`      <Length>${lengthM.toFixed(0)}</Length>`);
  }
  if (course.climb != null) {
    lines.push(`      <Climb>${course.climb.toFixed(0)}</Climb>`);
  }

  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const ctrl = controls[cc.controlId];
    if (!ctrl) continue;

    const iofId = escapeXml(controlIofId(ctrl, cc.type));
    lines.push(`      <CourseControl type="${controlTypeAttr(cc.type)}">`);
    lines.push(`        <Control>${iofId}</Control>`);

    // LegLength: the leg leading INTO this control from the previous one.
    // Ordered courses only; the first control (no predecessor) carries none.
    if (!isScore && i > 0) {
      const prev = course.controls[i - 1];
      const prevCtrl = prev ? controls[prev.controlId] : undefined;
      if (prevCtrl) {
        const legM = mapDistanceMetres(prevCtrl.position, ctrl.position, scale, dpi);
        lines.push(`        <LegLength>${legM.toFixed(0)}</LegLength>`);
      }
    }

    // Score value (score courses only)
    if (cc.score != null) {
      lines.push(`        <Score>${cc.score}</Score>`);
    }

    lines.push(`      </CourseControl>`);
  }

  lines.push(`    </Course>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Serialise an OverprintEvent to an IOF XML v3 `CourseData` string.
 */
export function exportIofXml(event: OverprintEvent): string {
  const dpi = event.mapFile?.dpi ?? 96;
  const scale = event.mapFile?.scale ?? 15000;

  const createTime = new Date().toISOString();

  // Map extent (mm) from the control bounding box — the <Map> corners are
  // required by the schema when a <Map> is emitted. Top-left origin, Y-down.
  let maxXpx = 0;
  let maxYpx = 0;
  for (const ctrl of Object.values(event.controls)) {
    if (ctrl.position.x > maxXpx) maxXpx = ctrl.position.x;
    if (ctrl.position.y > maxYpx) maxYpx = ctrl.position.y;
  }
  const brXmm = pxToMm(maxXpx, dpi).toFixed(3);
  const brYmm = pxToMm(maxYpx, dpi).toFixed(3);

  // --- Collect unique (control, type) pairs across all courses ---
  // IOF requires one <Control> element per unique ID in RaceCourseData.
  // Start/Finish get synthetic IDs (S1/F1) so we key on the iofId string.
  const seen = new Map<string, string>(); // iofId → element string
  for (const course of event.courses) {
    for (const cc of course.controls) {
      const ctrl = event.controls[cc.controlId];
      if (!ctrl) continue;
      const iofId = controlIofId(ctrl, cc.type);
      if (!seen.has(iofId)) {
        seen.set(iofId, buildControlElement(ctrl, cc.type, dpi));
      }
    }
  }

  const controlElements = Array.from(seen.values()).join('\n');
  const courseElements = event.courses
    .map((c) => buildCourseElement(c, event.controls, dpi, scale))
    .join('\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<CourseData xmlns="${IOF_XML_NS}" iofVersion="${IOF_XML_VERSION}" createTime="${createTime}" creator="Overprint">`,
    `  <Event>`,
    `    <Name>${escapeXml(event.name)}</Name>`,
    `  </Event>`,
    `  <RaceCourseData>`,
    `    <Map>`,
    `      <Scale>${scale}</Scale>`,
    `      <MapPositionTopLeft x="0" y="0" unit="mm"/>`,
    `      <MapPositionBottomRight x="${brXmm}" y="${brYmm}" unit="mm"/>`,
    `    </Map>`,
    controlElements,
    courseElements,
    `  </RaceCourseData>`,
    `</CourseData>`,
  ].join('\n');
}
