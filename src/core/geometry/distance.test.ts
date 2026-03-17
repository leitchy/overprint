import { describe, it, expect } from 'vitest';
import { pixelDistance, pixelsToMetres, mapDistanceMetres } from './distance';

describe('pixelDistance', () => {
  it('returns 0 for same point', () => {
    expect(pixelDistance({ x: 50, y: 50 }, { x: 50, y: 50 })).toBe(0);
  });

  it('calculates horizontal distance', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(100);
  });

  it('calculates vertical distance', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(100);
  });

  it('calculates diagonal distance (3-4-5 triangle)', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is commutative', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 50, y: 80 };
    expect(pixelDistance(a, b)).toBe(pixelDistance(b, a));
  });
});

describe('pixelsToMetres', () => {
  it('converts correctly at 150 DPI, 1:10000 scale', () => {
    // 150 pixels at 150 DPI = 1 inch = 25.4mm on map
    // At 1:10000: 25.4mm * 10000 / 1000 = 254 metres
    const metres = pixelsToMetres(150, 10000, 150);
    expect(metres).toBeCloseTo(254, 0);
  });

  it('converts correctly at 200 DPI, 1:15000 scale', () => {
    // 200 pixels at 200 DPI = 1 inch = 25.4mm on map
    // At 1:15000: 25.4mm * 15000 / 1000 = 381 metres
    const metres = pixelsToMetres(200, 15000, 200);
    expect(metres).toBeCloseTo(381, 0);
  });

  it('returns 0 for 0 pixels', () => {
    expect(pixelsToMetres(0, 10000, 150)).toBe(0);
  });

  it('scales linearly with pixel count', () => {
    const single = pixelsToMetres(100, 10000, 150);
    const double = pixelsToMetres(200, 10000, 150);
    expect(double).toBeCloseTo(single * 2, 5);
  });
});

describe('mapDistanceMetres', () => {
  it('calculates distance between two points', () => {
    // 300 pixels apart at 150 DPI, 1:10000
    // 300px / 150dpi * 25.4 = 50.8mm on map
    // 50.8mm * 10000 / 1000 = 508 metres
    const metres = mapDistanceMetres(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      10000,
      150,
    );
    expect(metres).toBeCloseTo(508, 0);
  });

  it('returns 0 for same point', () => {
    expect(
      mapDistanceMetres({ x: 50, y: 50 }, { x: 50, y: 50 }, 10000, 150),
    ).toBe(0);
  });
});
