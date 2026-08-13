/**
 * Pure polyline math behind every drawn leg (on-screen + every PDF export): endpoint
 * offsets, gap splitting, distance sampling, gap merging. Previously zero coverage — an
 * off-by-one here visibly breaks every course map, so this locks the invariants.
 */
import { describe, it, expect } from 'vitest';
import {
  buildLegPath,
  polylineLength,
  pointAtDistance,
  mergeGaps,
  splitPathByGaps,
  nearestSegmentIndex,
  pointToSegmentDistanceSq,
} from './leg-path';
import type { MapPoint, LegGap } from '@/core/models/types';

const p = (x: number, y: number): MapPoint => ({ x, y });
const gap = (startDist: number, endDist: number): LegGap => ({ startDist, endDist });
/** Straight horizontal path of `len` px from the origin (single segment). */
const straight = (len: number): MapPoint[] => [p(0, 0), p(len, 0)];

describe('polylineLength', () => {
  it('is 0 for empty or single-point paths', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([p(5, 5)])).toBe(0);
  });

  it('sums segment lengths (3-4-5 then straight)', () => {
    expect(polylineLength([p(0, 0), p(3, 4)])).toBeCloseTo(5, 9);
    expect(polylineLength([p(0, 0), p(3, 4), p(3, 4 + 10)])).toBeCloseTo(15, 9);
  });
});

describe('pointAtDistance', () => {
  const path = [p(0, 0), p(100, 0), p(100, 100)]; // total 200

  it('returns the first point at distance 0 and the last at total length', () => {
    expect(pointAtDistance(path, 0)).toEqual(p(0, 0));
    expect(pointAtDistance(path, 200)).toEqual(p(100, 100));
  });

  it('interpolates within and across segments', () => {
    expect(pointAtDistance(path, 50)).toEqual(p(50, 0)); // mid first segment
    expect(pointAtDistance(path, 150)).toEqual(p(100, 50)); // mid second segment
  });

  it('EXTRAPOLATES past the end along the last segment (callers pre-clamp dist to [0,total])', () => {
    // Not a clamp: on the final segment t = remaining/segLen is unbounded. Benign because
    // splitPathByGaps/extractSubPath always clamp dist into range before calling. Locked so a
    // future "why isn't this clamped?" change is a conscious decision, not an accident.
    expect(pointAtDistance(path, 400)).toEqual(p(100, 300)); // 200 past end → t=3 on vertical seg
  });

  it('handles a zero-length segment without NaN', () => {
    const dup = [p(0, 0), p(0, 0), p(10, 0)];
    const at = pointAtDistance(dup, 5);
    expect(Number.isFinite(at.x)).toBe(true);
    expect(Number.isFinite(at.y)).toBe(true);
  });
});

describe('buildLegPath', () => {
  it('shortens the first and last segments by their offsets', () => {
    const path = buildLegPath(p(0, 0), p(100, 0), undefined, 10, 20)!;
    expect(path).not.toBeNull();
    expect(path[0]).toEqual(p(10, 0)); // moved in by fromOffset
    expect(path[path.length - 1]).toEqual(p(80, 0)); // moved in by toOffset
    expect(polylineLength(path)).toBeCloseTo(70, 9); // 100 − 10 − 20
  });

  it('keeps interior bend points untouched', () => {
    const path = buildLegPath(p(0, 0), p(100, 0), [p(50, 50)], 10, 10)!;
    expect(path).toContainEqual(p(50, 50));
    expect(path).toHaveLength(3);
  });

  it('returns null when a first/last segment is shorter than its offset', () => {
    expect(buildLegPath(p(0, 0), p(5, 0), undefined, 10, 0)).toBeNull();
    expect(buildLegPath(p(0, 0), p(5, 0), undefined, 0, 10)).toBeNull();
  });

  it('with zero offsets returns the from→(bends)→to sequence unchanged', () => {
    expect(buildLegPath(p(0, 0), p(100, 0))).toEqual([p(0, 0), p(100, 0)]);
  });
});

describe('mergeGaps', () => {
  it('passes through 0 or 1 gaps', () => {
    expect(mergeGaps([])).toEqual([]);
    expect(mergeGaps([gap(10, 20)])).toEqual([gap(10, 20)]);
  });

  it('merges overlapping and adjacent gaps, keeps disjoint ones, and sorts', () => {
    const merged = mergeGaps([gap(30, 40), gap(10, 25), gap(20, 35)]);
    expect(merged).toEqual([gap(10, 40)]); // 10-25, 20-35, 30-40 all chain → 10-40
    expect(mergeGaps([gap(0, 10), gap(50, 60)])).toEqual([gap(0, 10), gap(50, 60)]);
  });

  it('absorbs a fully-contained gap', () => {
    expect(mergeGaps([gap(0, 100), gap(20, 30)])).toEqual([gap(0, 100)]);
  });

  it('output is always sorted and non-overlapping (property over crafted sets)', () => {
    const sets: LegGap[][] = [
      [gap(5, 10), gap(4, 6), gap(9, 12)],
      [gap(100, 200), gap(0, 50), gap(150, 175), gap(40, 60)],
      [gap(10, 10), gap(10, 20)],
    ];
    for (const s of sets) {
      const m = mergeGaps(s);
      for (let i = 1; i < m.length; i++) {
        expect(m[i]!.startDist).toBeGreaterThan(m[i - 1]!.endDist); // strictly disjoint + sorted
      }
    }
  });
});

describe('splitPathByGaps', () => {
  it('returns the whole path when there are no gaps', () => {
    const path = straight(100);
    expect(splitPathByGaps(path, [])).toEqual([path]);
  });

  it('splits a straight path into visible segments around one middle gap', () => {
    const subs = splitPathByGaps(straight(100), [gap(40, 60)]);
    expect(subs).toHaveLength(2);
    expect(subs[0]).toEqual([p(0, 0), p(40, 0)]);
    expect(subs[1]).toEqual([p(60, 0), p(100, 0)]);
  });

  it('clamps out-of-range gaps to the path length', () => {
    const subs = splitPathByGaps(straight(100), [gap(-50, 30)]);
    expect(subs).toHaveLength(1); // gap starts at 0 → only the tail remains
    expect(subs[0]![0]).toEqual(p(30, 0));
  });

  it('preserves interior vertices inside a visible segment', () => {
    const path = [p(0, 0), p(50, 0), p(100, 0)]; // vertex at 50
    const subs = splitPathByGaps(path, [gap(70, 90)]);
    expect(subs[0]).toContainEqual(p(50, 0)); // the mid vertex survives in the visible head
  });

  it('INVARIANT: visible length + (merged) gap length ≈ total length', () => {
    const path = [p(0, 0), p(100, 0), p(100, 100)]; // total 200
    const rawGaps = [gap(20, 40), gap(35, 50), gap(120, 140)]; // overlapping → merge first
    const merged = mergeGaps(rawGaps);
    const gapLen = merged.reduce((s, g) => s + (Math.min(g.endDist, 200) - Math.max(g.startDist, 0)), 0);
    const visible = splitPathByGaps(path, merged).reduce((s, sub) => s + polylineLength(sub), 0);
    expect(visible + gapLen).toBeCloseTo(200, 6);
  });
});

describe('nearestSegmentIndex / pointToSegmentDistanceSq', () => {
  const path = [p(0, 0), p(100, 0), p(100, 100)];

  it('finds the segment closest to a point', () => {
    expect(nearestSegmentIndex(path, p(50, 5))).toBe(0); // near first (horizontal) segment
    expect(nearestSegmentIndex(path, p(95, 50))).toBe(1); // near second (vertical) segment
  });

  it('distance is 0 for a point on the segment; positive off it', () => {
    expect(pointToSegmentDistanceSq(p(50, 0), p(0, 0), p(100, 0))).toBeCloseTo(0, 9);
    expect(pointToSegmentDistanceSq(p(50, 10), p(0, 0), p(100, 0))).toBeCloseTo(100, 9); // 10²
  });

  it('handles a degenerate (zero-length) segment', () => {
    expect(pointToSegmentDistanceSq(p(3, 4), p(0, 0), p(0, 0))).toBeCloseTo(25, 9); // 3-4-5
  });
});
