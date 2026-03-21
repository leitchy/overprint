import type { Control, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
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
