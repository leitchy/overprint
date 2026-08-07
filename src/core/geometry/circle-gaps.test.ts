import { describe, it, expect } from 'vitest';
import {
  normDeg,
  simplifyGaps,
  visibleArcs,
  addGap,
  removeGapAt,
  moveGapEndpoint,
  canvasPointToStoredDeg,
  anglePointCanvas,
} from './circle-gaps';

describe('normDeg', () => {
  it('normalises to [0, 360)', () => {
    expect(normDeg(370)).toBe(10);
    expect(normDeg(-10)).toBe(350);
    expect(normDeg(0)).toBe(0);
  });
});

describe('visibleArcs', () => {
  it('returns a full circle when there are no gaps', () => {
    expect(visibleArcs(undefined)).toEqual([{ startDeg: 0, sweepDeg: 360 }]);
    expect(visibleArcs([])).toEqual([{ startDeg: 0, sweepDeg: 360 }]);
  });

  it('produces the complement of a single gap', () => {
    const arcs = visibleArcs([{ startDeg: 90, endDeg: 120 }]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.startDeg).toBeCloseTo(120);
    expect(arcs[0]!.sweepDeg).toBeCloseTo(330);
  });

  it('handles a gap that wraps across 0°', () => {
    const arcs = visibleArcs([{ startDeg: 350, endDeg: 10 }]); // 20° gap over 0
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.startDeg).toBeCloseTo(10);
    expect(arcs[0]!.sweepDeg).toBeCloseTo(340);
  });

  it('produces two arcs for two separate gaps', () => {
    const arcs = visibleArcs([
      { startDeg: 90, endDeg: 120 },
      { startDeg: 200, endDeg: 240 },
    ]);
    expect(arcs).toHaveLength(2);
    const total = arcs.reduce((s, a) => s + a.sweepDeg, 0);
    expect(total).toBeCloseTo(360 - 30 - 40);
  });

  it('merges overlapping gaps into one', () => {
    const arcs = visibleArcs([
      { startDeg: 90, endDeg: 130 },
      { startDeg: 110, endDeg: 150 }, // overlaps
    ]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.startDeg).toBeCloseTo(150);
    expect(arcs[0]!.sweepDeg).toBeCloseTo(300); // 360 - 60
  });

  it('merges two gaps that overlap across 0°', () => {
    const arcs = visibleArcs([
      { startDeg: 350, endDeg: 10 }, // [350, 370]
      { startDeg: 5, endDeg: 15 }, // [5, 15] — overlaps the wrap
    ]);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.startDeg).toBeCloseTo(15);
    expect(arcs[0]!.sweepDeg).toBeCloseTo(335); // gap covers 350→15 = 25°
  });
});

describe('simplifyGaps', () => {
  it('drops degenerate (zero-width) gaps', () => {
    expect(simplifyGaps([{ startDeg: 40, endDeg: 40 }])).toEqual([]);
  });

  it('normalises angles into [0, 360)', () => {
    const [g] = simplifyGaps([{ startDeg: -30, endDeg: 30 }]);
    expect(g!.startDeg).toBeCloseTo(330);
    expect(g!.endDeg).toBeCloseTo(30);
  });
});

describe('addGap', () => {
  it('adds a gap centred on the click angle', () => {
    const [g] = addGap(undefined, 90, 30);
    expect(g!.startDeg).toBeCloseTo(75);
    expect(g!.endDeg).toBeCloseTo(105);
  });
});

describe('removeGapAt', () => {
  it('removes the gap containing the angle', () => {
    const gaps = [
      { startDeg: 75, endDeg: 105 },
      { startDeg: 200, endDeg: 240 },
    ];
    expect(removeGapAt(gaps, 90)).toEqual([{ startDeg: 200, endDeg: 240 }]);
  });

  it('leaves gaps untouched when the angle is outside all of them', () => {
    const gaps = [{ startDeg: 75, endDeg: 105 }];
    expect(removeGapAt(gaps, 300)).toEqual(gaps);
  });
});

describe('moveGapEndpoint', () => {
  it('moves the start endpoint', () => {
    const [g] = moveGapEndpoint([{ startDeg: 75, endDeg: 105 }], 0, 'start', 60);
    expect(g!.startDeg).toBeCloseTo(60);
    expect(g!.endDeg).toBeCloseTo(105);
  });
});

describe('angle ↔ canvas point', () => {
  it('round-trips through canvas coords (y-up storage)', () => {
    for (const deg of [0, 45, 90, 180, 270, 315]) {
      const p = anglePointCanvas(deg, 10);
      expect(canvasPointToStoredDeg(p.x, p.y)).toBeCloseTo(deg);
    }
  });

  it('places 90° at the top of the circle (canvas y negative)', () => {
    const p = anglePointCanvas(90, 10);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10); // y-up 90° → canvas up
  });
});
