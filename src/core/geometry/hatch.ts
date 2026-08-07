/**
 * Cross-hatch fill geometry for area symbols (out-of-bounds / dangerous area).
 *
 * Produces the individual hatch line segments clipped to a polygon, so both the
 * canvas and PDF renderers can draw the exact same fill without depending on
 * their own clipping primitives. PurplePen fills OOB areas with 45° + 135°
 * hatching (see CourseObject.cs OOBCourseObj).
 */
import type { MapPoint } from '@/core/models/types';

export interface HatchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y;
    const xj = poly[j]!.x, yj = poly[j]!.y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Parameter t in [0,1] along A→B where it crosses edge C→D, or null. */
function segIntersectParam(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number | null {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const qpx = cx - ax, qpy = cy - ay;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

/**
 * Hatch line segments filling `poly` at `angleDeg`, `spacing` apart, clipped to
 * the polygon interior (handles concave polygons).
 */
export function hatchSegments(poly: MapPoint[], spacing: number, angleDeg: number): HatchSegment[] {
  if (poly.length < 3 || spacing <= 0) return [];
  const a = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(a), dirY = Math.sin(a); // line direction
  const nX = -dirY, nY = dirX;                  // normal to the lines

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let minProj = Infinity, maxProj = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    const proj = p.x * nX + p.y * nY;
    minProj = Math.min(minProj, proj); maxProj = Math.max(maxProj, proj);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const cProj = cx * nX + cy * nY;
  const half = Math.hypot(maxX - minX, maxY - minY) + 1; // long enough to span the bbox

  const segs: HatchSegment[] = [];
  const start = Math.ceil(minProj / spacing) * spacing;
  for (let o = start; o <= maxProj; o += spacing) {
    const shift = o - cProj;
    const bx = cx + nX * shift, by = cy + nY * shift;
    const ax1 = bx - dirX * half, ay1 = by - dirY * half;
    const ax2 = bx + dirX * half, ay2 = by + dirY * half;

    const ts: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!, p2 = poly[(i + 1) % poly.length]!;
      const t = segIntersectParam(ax1, ay1, ax2, ay2, p1.x, p1.y, p2.x, p2.y);
      if (t !== null) ts.push(t);
    }
    ts.sort((u, v) => u - v);
    // Dedupe near-equal crossings (a line through a vertex hits both edges at the
    // same t) so the in/out pairing parity stays correct on concave polygons.
    const deduped: number[] = [];
    for (const t of ts) {
      if (deduped.length === 0 || Math.abs(t - deduped[deduped.length - 1]!) > 1e-6) deduped.push(t);
    }
    ts.length = 0;
    ts.push(...deduped);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]!, t1 = ts[i + 1]!;
      const mt = (t0 + t1) / 2;
      const mx = ax1 + (ax2 - ax1) * mt, my = ay1 + (ay2 - ay1) * mt;
      if (pointInPolygon(mx, my, poly)) {
        segs.push({
          x1: ax1 + (ax2 - ax1) * t0, y1: ay1 + (ay2 - ay1) * t0,
          x2: ax1 + (ax2 - ax1) * t1, y2: ay1 + (ay2 - ay1) * t1,
        });
      }
    }
  }
  return segs;
}

/** Cross-hatch (45° + 135°) segments — the OOB / dangerous-area fill. */
export function crossHatchSegments(poly: MapPoint[], spacing: number): HatchSegment[] {
  return [...hatchSegments(poly, spacing, 45), ...hatchSegments(poly, spacing, 135)];
}
