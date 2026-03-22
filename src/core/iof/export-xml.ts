/**
 * IOF XML Data Standard v3.0 export.
 *
 * Produces a CourseData XML document from an OverprintEvent.
 * Returns a raw XML string — the caller is responsible for saving.
 */
import type { Control, Course, CourseControl, OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { mapDistanceMetres } from '@/core/geometry/distance';
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
 * Convert a map-image pixel X coordinate to mm in IOF ground space.
 *
 * IOF MapPosition uses mm measured from the bottom-left corner of the map
 * (Y increases upward). We store positions as pixels from the top-left
 * (Y increases downward), so the Y axis must be flipped.
 */
function pxToMm(pixels: number, dpi: number): number {
  return (pixels / dpi) * 25.4;
}

function yFlipMm(yPx: number, mapHeightPx: number, dpi: number): number {
  return pxToMm(mapHeightPx - yPx, dpi);
}

// ---------------------------------------------------------------------------
// Control-ID helpers
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

function controlTypeString(type: ControlType): string {
  switch (type) {
    case 'start':
      return 'Start';
    case 'finish':
      return 'Finish';
    case 'crossingPoint':
      return 'CrossingPoint';
    case 'mapExchange':
    case 'mapFlip':
      return 'MapExchange';
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
  mapHeightPx: number,
  dpi: number,
): string {
  const iofId = escapeXml(controlIofId(ctrl, type));
  const typeStr = controlTypeString(type);
  const xMm = pxToMm(ctrl.position.x, dpi).toFixed(3);
  const yMm = yFlipMm(ctrl.position.y, mapHeightPx, dpi).toFixed(3);

  return [
    `    <Control>`,
    `      <Id>${iofId}</Id>`,
    `      <Type>${typeStr}</Type>`,
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
  const lines: string[] = [
    `    <Course>`,
    `      <Name>${escapeXml(course.name)}</Name>`,
  ];

  // CourseControl sequence
  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const ctrl = controls[cc.controlId];
    if (!ctrl) continue;

    const iofId = escapeXml(controlIofId(ctrl, cc.type));
    const seqTag = `        <Control>`;
    const refTag = `          <ControlId>${iofId}</ControlId>`;

    // Score value (score courses only)
    let scoreLine = '';
    if (cc.score != null) {
      scoreLine = `          <Score>${cc.score}</Score>`;
    }

    // Leg length to next control (skip for score courses — no ordered legs)
    let legLine = '';
    if (course.courseType !== 'score') {
      const next = course.controls[i + 1];
      if (next) {
        const nextCtrl = controls[next.controlId];
        if (nextCtrl) {
          const legM = mapDistanceMetres(ctrl.position, nextCtrl.position, scale, dpi);
          legLine = `          <LegLength>${legM.toFixed(0)}</LegLength>`;
        }
      }
    }

    lines.push(seqTag);
    lines.push(refTag);
    if (scoreLine) lines.push(scoreLine);
    if (legLine) lines.push(legLine);
    lines.push(`        </Control>`);
  }

  lines.push(`    </Course>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Serialise an OverprintEvent to an IOF XML v3 string.
 *
 * mapHeightPx is required only for the Y-axis flip; if the event has no
 * mapFile the caller must still supply it (pass 0 if unknown — positions
 * will be wrong but the document will still be valid XML).
 */
export function exportIofXml(event: OverprintEvent): string {
  const dpi = event.mapFile?.dpi ?? 96;
  const scale = event.mapFile?.scale ?? 15000;

  // We need the map height to flip the Y axis.  We derive an approximate
  // value from the control positions when no image height is known.
  let mapHeightPx = 0;
  for (const ctrl of Object.values(event.controls)) {
    if (ctrl.position.y > mapHeightPx) mapHeightPx = ctrl.position.y;
  }

  const createTime = new Date().toISOString();

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
        seen.set(iofId, buildControlElement(ctrl, cc.type, mapHeightPx, dpi));
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
    controlElements,
    courseElements,
    `  </RaceCourseData>`,
    `</CourseData>`,
  ].join('\n');
}
