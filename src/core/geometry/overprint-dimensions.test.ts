import { describe, it, expect } from 'vitest';
import { mmToMapPixels, overprintPixelDimensions } from './overprint-dimensions';
import { DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';

describe('mmToMapPixels', () => {
  it('converts 6mm at 150 DPI', () => {
    // 6 * 150 / 25.4 = 35.433
    expect(mmToMapPixels(6, 150)).toBeCloseTo(35.43, 1);
  });

  it('converts 6mm at 200 DPI', () => {
    // 6 * 200 / 25.4 = 47.244
    expect(mmToMapPixels(6, 200)).toBeCloseTo(47.24, 1);
  });

  it('converts 0.35mm at 150 DPI', () => {
    // 0.35 * 150 / 25.4 = 2.067
    expect(mmToMapPixels(0.35, 150)).toBeCloseTo(2.07, 1);
  });

  it('returns 0 for 0mm', () => {
    expect(mmToMapPixels(0, 150)).toBe(0);
  });
});

describe('overprintPixelDimensions', () => {
  it('computes correct dimensions at 150 DPI with default settings', () => {
    const dims = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);

    // Circle radius: 5/2 * 150/25.4 = 14.76
    expect(dims.circleRadius).toBeCloseTo(14.76, 1);

    // Line width: 0.2 * 150/25.4 = 1.18
    expect(dims.lineWidth).toBeCloseTo(1.18, 1);

    // Number size: 4 * 150/25.4 = 23.62
    expect(dims.numberSize).toBeCloseTo(23.62, 1);

    // Start triangle side: 6 * 150/25.4 = 35.43 (ISOM 2017-2)
    expect(dims.startTriangleSide).toBeCloseTo(35.43, 1);

    // Finish outer radius: 5/2 * 150/25.4 = 14.76 (ISOM 2017-2)
    expect(dims.finishOuterRadius).toBeCloseTo(14.76, 1);

    // Finish inner radius: 3.5/2 * 150/25.4 = 10.33 (ISOM 2017-2)
    expect(dims.finishInnerRadius).toBeCloseTo(10.33, 1);

    // Circle gap: 0.3 * 150/25.4 = 1.77
    expect(dims.circleGap).toBeCloseTo(1.77, 1);
  });

  it('scales proportionally with DPI', () => {
    const dims150 = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);
    const dims300 = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 300);

    expect(dims300.circleRadius).toBeCloseTo(dims150.circleRadius * 2, 1);
    expect(dims300.lineWidth).toBeCloseTo(dims150.lineWidth * 2, 1);
  });
});
