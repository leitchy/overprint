import type { MapPoint } from '@/core/models/types';
import type { LegGap } from '@/core/models/types';
import { pixelDistance } from './distance';

/**
 * Build the full polyline path for a leg, applying endpoint offsets to the
 * first and last segments (to leave a gap between the leg and the control shapes).
 *
 * Returns null if the first or last segment is shorter than its offset.
 */
export function buildLegPath(
  from: MapPoint,
  to: MapPoint,
  bendPoints?: MapPoint[],
  fromOffset = 0,
  toOffset = 0,
): MapPoint[] | null {
  // Full point sequence: from, ...bends, to
  const allPoints: MapPoint[] = [from, ...(bendPoints ?? []), to];

  if (allPoints.length < 2) return null;

  // Shorten first segment
  const first = allPoints[0]!;
  const second = allPoints[1]!;
  const firstDist = pixelDistance(first, second);
  if (firstDist <= fromOffset) return null;
  const firstUnit = { x: (second.x - first.x) / firstDist, y: (second.y - first.y) / firstDist };
  const shortenedFirst = { x: first.x + firstUnit.x * fromOffset, y: first.y + firstUnit.y * fromOffset };

  // Shorten last segment
  const last = allPoints[allPoints.length - 1]!;
  const secondLast = allPoints[allPoints.length - 2]!;
  const lastDist = pixelDistance(secondLast, last);
  if (lastDist <= toOffset) return null;
  const lastUnit = { x: (secondLast.x - last.x) / lastDist, y: (secondLast.y - last.y) / lastDist };
  const shortenedLast = { x: last.x + lastUnit.x * toOffset, y: last.y + lastUnit.y * toOffset };

  // Build the final path
  return [
    shortenedFirst,
    ...allPoints.slice(1, -1),
    shortenedLast,
  ];
}

/**
 * Calculate the total length of a polyline path.
 */
export function polylineLength(points: MapPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += pixelDistance(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Find the point at a given absolute distance along a polyline.
 */
export function pointAtDistance(path: MapPoint[], dist: number): MapPoint {
  let remaining = dist;
  for (let i = 1; i < path.length; i++) {
    const segLen = pixelDistance(path[i - 1]!, path[i]!);
    if (remaining <= segLen || i === path.length - 1) {
      const t = segLen > 0 ? remaining / segLen : 0;
      return {
        x: path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * t,
        y: path[i - 1]!.y + (path[i]!.y - path[i - 1]!.y) * t,
      };
    }
    remaining -= segLen;
  }
  return path[path.length - 1]!;
}

/**
 * Split a polyline at gap positions into visible sub-paths.
 * Gaps are defined by absolute distances along the polyline.
 */
export function splitPathByGaps(path: MapPoint[], gaps: LegGap[]): MapPoint[][] {
  if (gaps.length === 0) return [path];

  const totalLen = polylineLength(path);
  // Sort gaps by startDist and clamp to path length
  const sorted = [...gaps]
    .map((g) => ({
      startDist: Math.max(0, Math.min(g.startDist, totalLen)),
      endDist: Math.max(0, Math.min(g.endDist, totalLen)),
    }))
    .sort((a, b) => a.startDist - b.startDist);

  const subPaths: MapPoint[][] = [];
  let currentStart = 0;

  for (const gap of sorted) {
    if (gap.startDist > currentStart) {
      // Visible segment from currentStart to gap.startDist
      subPaths.push(extractSubPath(path, currentStart, gap.startDist));
    }
    currentStart = gap.endDist;
  }

  // Final segment after last gap
  if (currentStart < totalLen) {
    subPaths.push(extractSubPath(path, currentStart, totalLen));
  }

  return subPaths;
}

/**
 * Extract a sub-path from startDist to endDist along a polyline.
 */
function extractSubPath(path: MapPoint[], startDist: number, endDist: number): MapPoint[] {
  const result: MapPoint[] = [pointAtDistance(path, startDist)];

  // Add intermediate polyline vertices that fall within the range
  let cumDist = 0;
  for (let i = 1; i < path.length; i++) {
    cumDist += pixelDistance(path[i - 1]!, path[i]!);
    if (cumDist > startDist && cumDist < endDist) {
      result.push(path[i]!);
    }
  }

  result.push(pointAtDistance(path, endDist));
  return result;
}

/**
 * Find the index of the segment nearest to a given point.
 * Returns the index i such that the segment path[i]→path[i+1] is closest.
 */
export function nearestSegmentIndex(path: MapPoint[], point: MapPoint): number {
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDistanceSq(point, path[i]!, path[i + 1]!);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/** Squared distance from a point to a line segment. */
function pointToSegmentDistanceSq(p: MapPoint, a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return ex * ex + ey * ey;
}
