import { describe, it, expect } from 'vitest';
import { computeCourseAutoLegGaps, type AutoGapControl } from './auto-leg-gaps';
import { mergeGaps } from './leg-path';
import type { CourseControlType } from '@/core/models/types';

const radius = () => 50;
const offset = () => 60;

describe('computeCourseAutoLegGaps', () => {
  it('cuts a leg that passes through another control circle', () => {
    // Leg A→C is straight and horizontal; control B sits on it → the leg is cut around B.
    const controls: AutoGapControl[] = [
      { position: { x: 0, y: 500 }, type: 'start' as CourseControlType },   // A (idx 0)
      { position: { x: 1000, y: 500 }, type: 'control' as CourseControlType }, // C (idx 1)
      { position: { x: 500, y: 500 }, type: 'control' as CourseControlType },  // B (idx 2, on the A→C leg)
    ];
    const gaps = computeCourseAutoLegGaps(controls, radius, offset, 4, 20, 5);
    const legAC = gaps[1]; // A→C
    expect(legAC).toBeDefined();
    expect(legAC!.length).toBeGreaterThanOrEqual(1);
    // The gap should straddle the point nearest B (path start at x=60, B at x=500 → along≈440)
    const g = legAC![0]!;
    expect(g.startDist).toBeLessThan(440);
    expect(g.endDist).toBeGreaterThan(440);
  });

  it('does not cut a leg with no obstacles', () => {
    const controls: AutoGapControl[] = [
      { position: { x: 0, y: 0 }, type: 'start' as CourseControlType },
      { position: { x: 1000, y: 0 }, type: 'finish' as CourseControlType },
    ];
    const gaps = computeCourseAutoLegGaps(controls, radius, offset, 4, 20, 5);
    expect(gaps[1]).toBeUndefined();
  });
});

describe('mergeGaps', () => {
  it('merges overlapping/adjacent gaps', () => {
    const merged = mergeGaps([
      { startDist: 100, endDist: 200 },
      { startDist: 150, endDist: 250 }, // overlaps previous
      { startDist: 400, endDist: 450 }, // separate
    ]);
    expect(merged).toEqual([
      { startDist: 100, endDist: 250 },
      { startDist: 400, endDist: 450 },
    ]);
  });
});
