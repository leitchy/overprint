import type { Control, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { mapDistanceMetres } from './distance';

/**
 * Calculate total course length in metres by summing leg distances.
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

    total += mapDistanceMetres(
      prevControl.position,
      currControl.position,
      scale,
      dpi,
    );
  }

  return total;
}
