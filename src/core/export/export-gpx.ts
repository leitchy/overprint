/**
 * GPX 1.1 waypoint export.
 *
 * Emits one `<wpt>` per unique control (using its WGS84 position) so a setter can
 * load the controls onto a GPS unit or phone for field-checking. Requires the map
 * to be georeferenced — returns null when no georef is available.
 */
import type { Control, CourseControl, OverprintEvent } from '@/core/models/types';
import { mapPixelsToGps } from '@/core/geometry/geo-transform';
import { forEachCourseControl } from '@/core/models/course-controls';

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type ControlType = CourseControl['type'];

/** Waypoint name for a control: real code, or Start/Finish for the special types. */
function waypointName(ctrl: Control, type: ControlType): string {
  if (type === 'start') return 'Start';
  if (type === 'finish') return 'Finish';
  return String(ctrl.code);
}

function gpxTypeName(type: ControlType): string {
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

/**
 * Serialise an event's controls to a GPX 1.1 document, or null if the map has no
 * georeferencing (GPX requires WGS84 coordinates).
 */
export function exportGpx(event: OverprintEvent): string | null {
  const georef = event.mapFile?.georef;
  if (!georef) return null;

  // Unique controls across all courses, keyed by control id (first type wins).
  // Walk trunk AND fork/loop branch controls, so a control that lives only inside a
  // branch or butterfly loop still gets a waypoint. Prefer a non-'control' type if
  // one occurrence carries it (start/finish are only ever on the trunk).
  const seen = new Map<string, { ctrl: Control; type: ControlType }>();
  for (const course of event.courses) {
    forEachCourseControl(course, (cc) => {
      const ctrl = event.controls[cc.controlId];
      if (!ctrl) return;
      const existing = seen.get(String(ctrl.id));
      if (!existing) {
        seen.set(String(ctrl.id), { ctrl, type: cc.type });
      } else if (existing.type === 'control' && cc.type !== 'control') {
        existing.type = cc.type;
      }
    });
  }

  const waypoints: string[] = [];
  for (const { ctrl, type } of seen.values()) {
    const gps = mapPixelsToGps(ctrl.position, georef);
    if (!gps) continue;
    waypoints.push(
      [
        `  <wpt lat="${gps.lat.toFixed(6)}" lon="${gps.lon.toFixed(6)}">`,
        `    <name>${escapeXml(waypointName(ctrl, type))}</name>`,
        `    <type>${gpxTypeName(type)}</type>`,
        `  </wpt>`,
      ].join('\n'),
    );
  }

  if (waypoints.length === 0) return null;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Overprint" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata>`,
    `    <name>${escapeXml(event.name)}</name>`,
    `  </metadata>`,
    ...waypoints,
    `</gpx>`,
  ].join('\n');
}
