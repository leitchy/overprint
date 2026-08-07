/**
 * Control-circle gaps (PurplePen `CircleGap`).
 *
 * A gap is an arc REMOVED from a control circle so an underlying map feature shows
 * through (ISOM 2017-2 §3.7). Gaps are stored on the shared `Control` as
 * `{ startDeg, endDeg }` in degrees, CCW from the +X axis, y-up — matching
 * PurplePen's convention so a future `.ppen` `<gaps>` import is a direct port.
 *
 * This module is pure geometry (no React/Konva) so it can be unit-tested and shared
 * by the on-screen renderer and the PDF exporter, which must never drift.
 */
import type { CircleGap } from '@/core/models/types';

const EPS = 1e-6;

/** Normalise an angle to [0, 360). */
export function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** A visible (drawn) arc of a control circle: CCW from startDeg through sweepDeg. */
export interface VisibleArc {
  startDeg: number;
  sweepDeg: number;
}

interface Interval {
  start: number; // [0, 360)
  sweep: number; // (0, 360], may run past 360 after wrap-merge
}

/** Merge gaps into sorted, non-overlapping circular intervals (wrap-around aware). */
function mergeIntervals(gaps: CircleGap[] | undefined): Interval[] {
  if (!gaps || gaps.length === 0) return [];
  const ivs: Interval[] = gaps
    .map((g) => ({ start: normDeg(g.startDeg), sweep: normDeg(g.endDeg - g.startDeg) }))
    // sweep 0 means an empty (degenerate) gap — drop it
    .filter((g) => g.sweep > EPS)
    .sort((a, b) => a.start - b.start);
  if (ivs.length === 0) return [];

  const merged: Interval[] = [{ ...ivs[0]! }];
  for (let i = 1; i < ivs.length; i++) {
    const last = merged[merged.length - 1]!;
    const lastEnd = last.start + last.sweep;
    const iv = ivs[i]!;
    if (iv.start <= lastEnd + EPS) {
      last.sweep = Math.max(lastEnd, iv.start + iv.sweep) - last.start;
    } else {
      merged.push({ ...iv });
    }
  }

  // Wrap-around: the last interval may extend past 360 and overlap the first ones.
  while (merged.length > 1) {
    const last = merged[merged.length - 1]!;
    const overhang = last.start + last.sweep - 360; // covers [0, overhang]
    const first = merged[0]!;
    if (overhang < first.start - EPS) break;
    // Fold `first` into `last` (which wraps through 0).
    last.sweep = Math.max(last.start + last.sweep, 360 + first.start + first.sweep) - last.start;
    merged.shift();
  }
  return merged;
}

/**
 * Normalise a gap list: drop empty gaps, sort, and merge overlaps (including
 * wrap-around). Returns gaps with both angles in [0, 360).
 */
export function simplifyGaps(gaps: CircleGap[] | undefined): CircleGap[] {
  return mergeIntervals(gaps).map((iv) => ({
    startDeg: normDeg(iv.start),
    endDeg: normDeg(iv.start + iv.sweep),
  }));
}

/**
 * Visible arcs of a control circle given its gaps. No gaps → one full circle.
 * Fully-gapped (≥360° removed) → no arcs.
 */
export function visibleArcs(gaps: CircleGap[] | undefined): VisibleArc[] {
  const merged = mergeIntervals(gaps);
  if (merged.length === 0) return [{ startDeg: 0, sweepDeg: 360 }];
  const totalGap = merged.reduce((s, g) => s + Math.min(g.sweep, 360), 0);
  if (totalGap >= 360 - EPS) return [];

  const arcs: VisibleArc[] = [];
  const n = merged.length;
  for (let i = 0; i < n; i++) {
    const curEnd = merged[i]!.start + merged[i]!.sweep;
    const nextStart = merged[(i + 1) % n]!.start + (i === n - 1 ? 360 : 0);
    const sweep = normDeg(nextStart - curEnd);
    if (sweep > EPS) arcs.push({ startDeg: normDeg(curEnd), sweepDeg: sweep });
  }
  return arcs;
}

/** Add a gap of `widthDeg` centred on `angleDeg`, then simplify. */
export function addGap(gaps: CircleGap[] | undefined, angleDeg: number, widthDeg: number): CircleGap[] {
  const half = widthDeg / 2;
  const next: CircleGap[] = [...(gaps ?? []), { startDeg: angleDeg - half, endDeg: angleDeg + half }];
  return simplifyGaps(next);
}

/** Whether `angleDeg` lies inside gap `g` (CCW start→end, wrap-aware). */
function angleInGap(angleDeg: number, g: CircleGap): boolean {
  const a = normDeg(angleDeg - g.startDeg);
  const sweep = normDeg(g.endDeg - g.startDeg);
  return a <= sweep + EPS;
}

/** Remove whichever gap contains `angleDeg` (if any). */
export function removeGapAt(gaps: CircleGap[] | undefined, angleDeg: number): CircleGap[] {
  const simplified = simplifyGaps(gaps);
  const idx = simplified.findIndex((g) => angleInGap(angleDeg, g));
  if (idx < 0) return simplified;
  return simplified.filter((_, i) => i !== idx);
}

/** Move one endpoint ('start' or 'end') of gap `index` to `newAngleDeg`, then simplify. */
export function moveGapEndpoint(
  gaps: CircleGap[] | undefined,
  index: number,
  end: 'start' | 'end',
  newAngleDeg: number,
): CircleGap[] {
  const list = [...(gaps ?? [])];
  if (index < 0 || index >= list.length) return simplifyGaps(list);
  const g = { ...list[index]! };
  if (end === 'start') g.startDeg = normDeg(newAngleDeg);
  else g.endDeg = normDeg(newAngleDeg);
  // Guard against the endpoint crossing past the other (collapsing the gap): if the
  // resulting sweep is ~0 or ~360, keep a minimal sliver so the gap survives the drag.
  if (normDeg(g.endDeg - g.startDeg) < EPS) return simplifyGaps(list.filter((_, i) => i !== index));
  list[index] = g;
  return simplifyGaps(list);
}

/** Convert a stored (y-up, CCW) angle in degrees to canvas radians (y-down). */
export function storedDegToCanvasRad(deg: number): number {
  return (-deg * Math.PI) / 180;
}

/** Point on a circle of `radius` at a stored angle, in canvas coords (y-down). */
export function anglePointCanvas(deg: number, radius: number): { x: number; y: number } {
  const r = storedDegToCanvasRad(deg);
  return { x: radius * Math.cos(r), y: radius * Math.sin(r) };
}

/** Stored angle (deg, y-up CCW) of a canvas-space point relative to the circle centre. */
export function canvasPointToStoredDeg(x: number, y: number): number {
  return normDeg((Math.atan2(-y, x) * 180) / Math.PI);
}

/** Draggable endpoint handles for each gap, positioned on the circumference. */
export interface GapHandle {
  gapIndex: number;
  end: 'start' | 'end';
  angleDeg: number;
  x: number;
  y: number;
}

export function gapHandles(gaps: CircleGap[] | undefined, radius: number): GapHandle[] {
  const simplified = simplifyGaps(gaps);
  const handles: GapHandle[] = [];
  simplified.forEach((g, gapIndex) => {
    const s = anglePointCanvas(g.startDeg, radius);
    const e = anglePointCanvas(g.endDeg, radius);
    handles.push({ gapIndex, end: 'start', angleDeg: g.startDeg, x: s.x, y: s.y });
    handles.push({ gapIndex, end: 'end', angleDeg: g.endDeg, x: e.x, y: e.y });
  });
  return handles;
}
