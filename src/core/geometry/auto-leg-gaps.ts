/**
 * Automatic leg-cutting (PurplePen `AutoCutLegs`).
 *
 * Computes — at render time, never stored — small gaps to cut in each connecting
 * leg where it passes through ANOTHER control's circle, or crosses an earlier leg,
 * so the course reads cleanly (ISOM §3.7). Non-destructive: the returned gaps are
 * merged with the user's manual `legGaps` only for rendering.
 */
import type { CourseControlType, LegGap, MapPoint } from '@/core/models/types';
import { buildLegPath } from './leg-path';

export interface AutoGapControl {
  position: MapPoint;
  type: CourseControlType;
  /** Bend points on the OUTGOING leg from this control (as stored on CourseControl). */
  bendPoints?: MapPoint[];
}

/** Nearest approach of a point to a polyline: min distance + distance-along-path of that point. */
function nearestApproach(path: MapPoint[], c: MapPoint): { dist: number; along: number } {
  let bestSq = Infinity;
  let bestAlong = 0;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const dSq = (c.x - projX) ** 2 + (c.y - projY) ** 2;
    if (dSq < bestSq) {
      bestSq = dSq;
      bestAlong = acc + t * segLen;
    }
    acc += segLen;
  }
  return { dist: Math.sqrt(bestSq), along: bestAlong };
}

/** Intersection distance-along-path A of two segments, or null if they don't cross (open interval). */
function segmentIntersectionAlong(
  a1: MapPoint, a2: MapPoint, b1: MapPoint, b2: MapPoint, accA: number,
): number | null {
  const rx = a2.x - a1.x, ry = a2.y - a1.y;
  const sx = b2.x - b1.x, sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const qpx = b1.x - a1.x, qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const eps = 1e-4;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return accA + t * Math.hypot(rx, ry);
}

/** Cumulative segment start-distances for a path (length = path.length). */
function cumulative(path: MapPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y));
  return cum;
}

/**
 * Auto-cut gaps for every leg of a course. `radiusOf`/`offsetOf` map a control type
 * to its shape outer radius and its leg-shortening offset (both in the same pixel or
 * point space as the geometry). Returns per-control-index gaps (leg i connects
 * controls[i-1]→controls[i]); index 0 is always undefined.
 */
export function computeCourseAutoLegGaps(
  controls: AutoGapControl[],
  radiusOf: (type: CourseControlType) => number,
  offsetOf: (type: CourseControlType) => number,
  lineWidth: number,
  gapSize: number,
  minEndpointDist: number,
): (LegGap[] | undefined)[] {
  const n = controls.length;
  const paths: (MapPoint[] | null)[] = [null];
  const lengths: number[] = [0];
  for (let i = 1; i < n; i++) {
    const path = buildLegPath(
      controls[i - 1]!.position, controls[i]!.position,
      controls[i - 1]!.bendPoints,
      offsetOf(controls[i - 1]!.type), offsetOf(controls[i]!.type),
    );
    paths[i] = path;
    lengths[i] = path ? cumulative(path).at(-1)! : 0;
  }

  const result: (LegGap[] | undefined)[] = [undefined];
  for (let i = 1; i < n; i++) {
    const path = paths[i];
    if (!path) { result[i] = undefined; continue; }
    const len = lengths[i]!;
    const gaps: LegGap[] = [];

    // (a) leg vs OTHER control circles (exclude this leg's own two endpoints)
    for (let c = 0; c < n; c++) {
      if (c === i - 1 || c === i) continue;
      const R = radiusOf(controls[c]!.type) + lineWidth * 2;
      const { dist, along } = nearestApproach(path, controls[c]!.position);
      if (dist >= R) continue;
      if (along <= minEndpointDist || along >= len - minEndpointDist) continue;
      const half = Math.sqrt(Math.max(0, R * R - dist * dist)) + gapSize / 2;
      gaps.push({ startDist: along - half, endDist: along + half });
    }

    // (b) leg vs EARLIER legs (cut only the later leg — this one)
    const cum = cumulative(path);
    for (let j = 1; j < i; j++) {
      const other = paths[j];
      if (!other) continue;
      for (let s = 1; s < path.length; s++) {
        for (let t = 1; t < other.length; t++) {
          const along = segmentIntersectionAlong(path[s - 1]!, path[s]!, other[t - 1]!, other[t]!, cum[s - 1]!);
          if (along === null) continue;
          if (along <= minEndpointDist || along >= len - minEndpointDist) continue;
          gaps.push({ startDist: along - gapSize / 2, endDist: along + gapSize / 2 });
        }
      }
    }

    result[i] = gaps.length ? gaps : undefined;
  }
  return result;
}
