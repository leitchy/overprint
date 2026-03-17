import type { MapPoint } from '@/core/models/types';

/**
 * Shorten a line segment so it doesn't enter the shapes at each end.
 * Returns the adjusted start and end points.
 *
 * @param from - Center of the "from" control
 * @param to - Center of the "to" control
 * @param fromOffset - Radius (+ gap) to offset from the start point
 * @param toOffset - Radius (+ gap) to offset from the end point
 */
export function shortenedLeg(
  from: MapPoint,
  to: MapPoint,
  fromOffset: number,
  toOffset: number,
): [MapPoint, MapPoint] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // If controls are too close, don't draw a leg
  if (dist <= fromOffset + toOffset) return null;

  const ux = dx / dist;
  const uy = dy / dist;

  return [
    { x: from.x + ux * fromOffset, y: from.y + uy * fromOffset },
    { x: to.x - ux * toOffset, y: to.y - uy * toOffset },
  ];
}
