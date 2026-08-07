/**
 * Shared IOF control-description row model + builder.
 *
 * A single source of truth for the ordered rows of a description sheet, consumed
 * by every renderer (course-map PDF auto-box, standalone sheet PDF, on-canvas
 * box) so they can't drift. Renderers differ only in how they PAINT a row; the
 * row list and the length/climb formatting live here.
 */
import type { Control, Course, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { calculateCourseLength } from '@/core/geometry/course-length';

/** One row of a description sheet. Renderers switch on `kind` to paint it. */
export type DescRow =
  | { kind: 'header'; text: string; fontSize: number }
  | { kind: 'splitInfo'; sections: string[] }
  | { kind: 'directive'; leftSymbol: string; distanceText: string }
  | { kind: 'control'; cc: CourseControl; seqNumber: number | null };

export interface BuildDescRowsOptions {
  /** Title shown on the first header row (event or course name as appropriate). */
  eventName: string;
  /** Map/print scale denominator (for leg-distance directives). */
  scale: number;
  /** Map DPI for pixel→metre conversion (default 96). */
  dpi?: number;
  /** All-controls sheet: no per-course length, sequence numbers suppressed. */
  isAllControls?: boolean;
  /** Multi-part label appended to the course name in the split-info row. */
  partLabel?: string;
  /** Font size for the top header row (secondary title is one smaller). */
  headerFontSize: number;
}

/** Course length formatted as "4.3 km" (one decimal). */
export function formatLengthKm(lengthM: number): string {
  return `${(lengthM / 1000).toFixed(1)} km`;
}

/** Climb formatted as "75 m" rounded to the nearest 5 m, or '' when absent/negative. */
export function formatClimb(climbValue: number | undefined): string {
  return climbValue !== undefined && climbValue >= 0
    ? `${Math.round(climbValue / 5) * 5} m`
    : '';
}

/**
 * Build the header + body row lists for a course. Header rows are the title(s),
 * the split-info row (name / length / climb) and the start directive; body rows
 * are the controls interleaved with map-exchange directives and the finish
 * directive.
 */
export function buildDescRows(
  course: Course,
  controls: Record<ControlId, Control>,
  opts: BuildDescRowsOptions,
): { headerRows: DescRow[]; bodyRows: DescRow[] } {
  const { eventName, scale, isAllControls = false, partLabel, headerFontSize } = opts;
  const dpi = opts.dpi ?? 96;
  const courseLabel = partLabel ? `${course.name} ${partLabel}` : course.name;

  // Straight-line leg distance in metres, rounded to the nearest 10 m.
  function distBetween(idx1: number, idx2: number): number {
    const c1 = controls[course.controls[idx1]?.controlId as ControlId];
    const c2 = controls[course.controls[idx2]?.controlId as ControlId];
    if (!c1 || !c2) return 0;
    const dx = c2.position.x - c1.position.x;
    const dy = c2.position.y - c1.position.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    const metres = (distPx / dpi) * 25.4 * (scale / 1000);
    return Math.round(metres / 10) * 10;
  }

  const headerRows: DescRow[] = [];
  headerRows.push({ kind: 'header', text: eventName, fontSize: headerFontSize });

  const secondaryTitle = course.settings.secondaryTitle;
  if (secondaryTitle && !isAllControls) {
    headerRows.push({ kind: 'header', text: secondaryTitle, fontSize: headerFontSize - 1 });
  }

  if (isAllControls) {
    const numNormal = course.controls.filter(
      (cc) => cc.type !== 'start' && cc.type !== 'finish',
    ).length;
    headerRows.push({ kind: 'splitInfo', sections: ['All controls', `${numNormal} controls`] });
  } else {
    const lengthM = calculateCourseLength(course.controls, controls, scale, dpi);
    const climbText = formatClimb(course.climb ?? course.settings.climb);
    const sections = climbText
      ? [courseLabel, formatLengthKm(lengthM), climbText]
      : [courseLabel, formatLengthKm(lengthM)];
    headerRows.push({ kind: 'splitInfo', sections });
  }

  // Start directive (distance from the start to the first real control).
  const startIdx = course.controls.findIndex((cc) => cc.type === 'start');
  if (startIdx >= 0) {
    const firstCtrlIdx = course.controls.findIndex(
      (cc, i) => i > startIdx && cc.type !== 'start' && cc.type !== 'crossingPoint',
    );
    const startDist = firstCtrlIdx > startIdx ? distBetween(startIdx, firstCtrlIdx) : 0;
    headerRows.push({ kind: 'directive', leftSymbol: 'start', distanceText: startDist > 0 ? `${startDist} m` : '' });
  }

  // Body rows: controls, with a map-exchange directive after each exchange.
  const bodyRows: DescRow[] = [];
  let seqNumber = 0;
  for (const cc of course.controls) {
    const isStart = cc.type === 'start';
    const isFinish = cc.type === 'finish';
    const isExchange = cc.type === 'mapExchange' || cc.type === 'mapFlip';

    let seq: number | null = null;
    if (!isStart && !isFinish && !isAllControls) {
      seqNumber++;
      seq = seqNumber;
    }
    bodyRows.push({ kind: 'control', cc, seqNumber: seq });
    if (isExchange) {
      bodyRows.push({ kind: 'directive', leftSymbol: 'exchange', distanceText: '' });
    }
  }

  // Finish directive (distance from the last real control to the finish).
  const finishIdx = course.controls.findIndex((cc) => cc.type === 'finish');
  if (finishIdx >= 0) {
    const lastCtrlIdx =
      course.controls.length - 1 -
      [...course.controls].reverse().findIndex(
        (cc) => cc.type !== 'finish' && cc.type !== 'crossingPoint',
      );
    const finishDist = finishIdx > lastCtrlIdx && lastCtrlIdx >= 0 ? distBetween(lastCtrlIdx, finishIdx) : 0;
    bodyRows.push({ kind: 'directive', leftSymbol: 'finish', distanceText: finishDist > 0 ? `${finishDist} m` : '' });
  }

  return { headerRows, bodyRows };
}
