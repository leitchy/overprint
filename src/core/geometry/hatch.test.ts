import { describe, it, expect } from 'vitest';
import { hatchSegments, crossHatchSegments, pointInPolygon } from './hatch';
import type { MapPoint } from '@/core/models/types';

const square: MapPoint[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
];

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
    expect(pointInPolygon(-5, 50, square)).toBe(false);
  });
});

describe('hatchSegments', () => {
  it('produces clipped segments across a square', () => {
    const segs = hatchSegments(square, 20, 45);
    expect(segs.length).toBeGreaterThan(0);
    // every segment endpoint lies within (or on) the square bounds
    for (const s of segs) {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(100.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeLessThanOrEqual(100.01);
      }
    }
  });

  it('returns nothing for degenerate input', () => {
    expect(hatchSegments([{ x: 0, y: 0 }, { x: 1, y: 1 }], 10, 45)).toEqual([]);
    expect(hatchSegments(square, 0, 45)).toEqual([]);
  });

  it('spacing controls line count (denser = more lines)', () => {
    const sparse = hatchSegments(square, 40, 45).length;
    const dense = hatchSegments(square, 10, 45).length;
    expect(dense).toBeGreaterThan(sparse);
  });
});

describe('crossHatchSegments', () => {
  it('combines 45° and 135° hatching', () => {
    const single = hatchSegments(square, 20, 45).length;
    const cross = crossHatchSegments(square, 20).length;
    expect(cross).toBeGreaterThan(single);
  });

  it('clips to a concave (L-shaped) polygon', () => {
    const lShape: MapPoint[] = [
      { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 30 },
      { x: 30, y: 30 }, { x: 30, y: 60 }, { x: 0, y: 60 },
    ];
    const segs = crossHatchSegments(lShape, 15);
    expect(segs.length).toBeGreaterThan(0);
    // midpoints must be inside the L
    for (const s of segs) {
      expect(pointInPolygon((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, lShape)).toBe(true);
    }
  });
});
