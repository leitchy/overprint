import type { CourseControlType } from '@/core/models/types';

/**
 * Compute the radial offset from a control's centre to the outer edge of its
 * overprint shape, including the gap and half the line width.
 *
 * Used to shorten leg lines so they stop cleanly outside the shape boundary.
 *
 * @param type             The overprint shape type for this control.
 * @param circleRadius     Pixel radius of a regular control circle.
 * @param startTriangleSide Pixel side length of the start/map-exchange triangle.
 * @param finishOuterRadius Pixel outer radius of the finish double circle.
 * @param crossingPointArm  Pixel half-arm length of the crossing-point X.
 * @param circleGap        Pixel gap between shape edge and leg line end.
 * @param lineWidth        Pixel stroke width of the leg line.
 */
export function computeShapeOffset(
  type: CourseControlType,
  circleRadius: number,
  startTriangleSide: number,
  finishOuterRadius: number,
  crossingPointArm: number,
  circleGap: number,
  lineWidth: number,
): number {
  switch (type) {
    case 'start':
    case 'mapExchange':
    case 'mapFlip':
      // Triangle circumradius = side / sqrt(3)
      return startTriangleSide / Math.sqrt(3) + circleGap + lineWidth / 2;
    case 'finish':
      return finishOuterRadius + circleGap + lineWidth / 2;
    case 'crossingPoint':
      return crossingPointArm + circleGap + lineWidth / 2;
    default:
      return circleRadius + circleGap + lineWidth / 2;
  }
}
