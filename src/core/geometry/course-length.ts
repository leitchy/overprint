import type { Control, Course, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { enumerateVariations } from '@/core/models/variation-enumerator';
import { mapDistanceMetres, pixelsToMetres } from './distance';
import { polylineLength } from './leg-path';

/**
 * Calculate total course length in metres by summing leg distances.
 * For bent legs, follows the polyline path through bend points.
 */
export function calculateCourseLength(
  courseControls: CourseControl[],
  controls: Record<ControlId, Control>,
  scale: number,
  dpi: number,
): number {
  let total = 0;

  for (let i = 1; i < courseControls.length; i++) {
    const prev = courseControls[i - 1];
    const curr = courseControls[i];
    if (!prev || !curr) continue;

    const prevControl = controls[prev.controlId];
    const currControl = controls[curr.controlId];
    if (!prevControl || !currControl) continue;

    if (prev.bendPoints && prev.bendPoints.length > 0) {
      // Bent leg: sum polyline path through bend points
      const pathPoints = [prevControl.position, ...prev.bendPoints, currControl.position];
      total += pixelsToMetres(polylineLength(pathPoints), scale, dpi);
    } else {
      // Straight leg: direct distance
      total += mapDistanceMetres(prevControl.position, currControl.position, scale, dpi);
    }
  }

  return total;
}

/**
 * Min/max course length (metres) across a course's enumerated fork variations.
 *
 * A course without forks yields a single variation, so `minM === maxM ===
 * calculateCourseLength(course.controls, …)`. Intended for UI display
 * ("2.4–2.7 km") — exporters compute per-variation lengths directly.
 */
export function courseLengthRange(
  course: Course,
  controls: Record<ControlId, Control>,
  scale: number,
  dpi: number,
): { minM: number; maxM: number } {
  let minM = Infinity;
  let maxM = -Infinity;
  for (const v of enumerateVariations(course).variations) {
    const len = calculateCourseLength(v.controls, controls, scale, dpi);
    if (len < minM) minM = len;
    if (len > maxM) maxM = len;
  }
  // enumerateVariations always returns ≥1 variation; guard anyway.
  return Number.isFinite(minM) ? { minM, maxM } : { minM: 0, maxM: 0 };
}
