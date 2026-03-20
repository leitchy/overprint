import type { Control, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';

/**
 * Sort course controls by control code number.
 * Used for score courses where controls are displayed in code order
 * rather than sequence order.
 */
export function sortControlsByCode(
  courseControls: CourseControl[],
  controls: Record<ControlId, Control>,
): CourseControl[] {
  return [...courseControls].sort((a, b) => {
    const ca = controls[a.controlId];
    const cb = controls[b.controlId];
    return (ca?.code ?? 0) - (cb?.code ?? 0);
  });
}
