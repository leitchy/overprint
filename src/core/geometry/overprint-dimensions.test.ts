import { describe, it, expect } from 'vitest';
import {
  mmToMapPixels,
  overprintPixelDimensions,
  overprintSizeMultiplier,
  eventOverprintSizeMultiplier,
} from './overprint-dimensions';
import { DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';
import type { EventSettings } from '@/core/models/types';

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

    // Line width: 0.35 * 150/25.4 = 2.07 (ISOM 2017-2 §3.7)
    expect(dims.lineWidth).toBeCloseTo(2.07, 1);

    // Number size: 4 * 150/25.4 = 23.62
    expect(dims.numberSize).toBeCloseTo(23.62, 1);

    // Start triangle side: 6 * 150/25.4 = 35.43 (ISOM 2017-2)
    expect(dims.startTriangleSide).toBeCloseTo(35.43, 1);

    // Finish outer radius: 6/2 * 150/25.4 = 17.72 (ISOM 2017-2: ø6.0mm CC)
    expect(dims.finishOuterRadius).toBeCloseTo(17.72, 1);

    // Finish inner radius: 4/2 * 150/25.4 = 11.81 (ISOM 2017-2: ø4.0mm CC)
    expect(dims.finishInnerRadius).toBeCloseTo(11.81, 1);

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

describe('overprintSizeMultiplier (paper space)', () => {
  it('is 1 for none and relativeToMap at equal scales', () => {
    expect(overprintSizeMultiplier('none', 10000, 10000, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeToMap', 10000, 10000, 15000)).toBe(1);
  });

  it('relativeToMap doubles when printed at half the scale denominator (2x enlargement)', () => {
    expect(overprintSizeMultiplier('relativeToMap', 10000, 5000, 15000)).toBe(2);
  });

  it('none is always 1 regardless of scales', () => {
    expect(overprintSizeMultiplier('none', 15000, 5000, 15000)).toBe(1);
    expect(overprintSizeMultiplier('none', 4000, 12000, 4000)).toBe(1);
  });

  it('relativeTo15000: ISOM ref 15000 → 1.5 at 1:10000, 3.0 at 1:5000', () => {
    expect(overprintSizeMultiplier('relativeTo15000', 15000, 10000, 15000)).toBeCloseTo(1.5);
    expect(overprintSizeMultiplier('relativeTo15000', 15000, 5000, 15000)).toBeCloseTo(3.0);
  });

  it('relativeTo15000: sprint ref 4000 → 2.0 at 1:2000', () => {
    expect(overprintSizeMultiplier('relativeTo15000', 4000, 2000, 4000)).toBeCloseTo(2.0);
  });

  it('falls back to 1 for non-finite or non-positive scales', () => {
    expect(overprintSizeMultiplier('relativeToMap', NaN, 10000, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeToMap', 10000, 0, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeToMap', -10000, 10000, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeToMap', 10000, Infinity, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeTo15000', 10000, 10000, 0)).toBe(1);
    expect(overprintSizeMultiplier('relativeTo15000', 10000, NaN, 15000)).toBe(1);
    expect(overprintSizeMultiplier('relativeToMap', undefined, undefined, undefined)).toBe(1);
  });
});

describe('eventOverprintSizeMultiplier', () => {
  it('defaults to relativeToMap when itemScaling is unset', () => {
    const settings: EventSettings = { ...DEFAULT_EVENT_SETTINGS };
    delete settings.itemScaling;
    expect(eventOverprintSizeMultiplier(settings, 10000, 5000)).toBe(2);
  });

  it('uses the sprint reference scale (4000) for ISSprOM2019', () => {
    const settings: EventSettings = {
      ...DEFAULT_EVENT_SETTINGS,
      mapStandard: 'ISSprOM2019',
      itemScaling: 'relativeTo15000',
    };
    expect(eventOverprintSizeMultiplier(settings, 4000, 2000)).toBeCloseTo(2.0);
  });

  it('is 1 when scales are omitted (backward compatible)', () => {
    expect(eventOverprintSizeMultiplier(DEFAULT_EVENT_SETTINGS)).toBe(1);
  });
});

describe('overprintPixelDimensions item scaling (map-pixel space)', () => {
  const DIM_KEYS = [
    'circleRadius', 'lineWidth', 'numberSize', 'startTriangleSide',
    'finishOuterRadius', 'finishInnerRadius', 'circleGap', 'crossingPointArm',
    'autoLegGap', 'autoLegGapMinEnd',
  ] as const;

  it('REGRESSION: default (relativeToMap) at printScale == mapScale equals the pre-change values', () => {
    const before = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);
    const after = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150, 15000, 15000);
    for (const key of DIM_KEYS) {
      expect(after[key], key).toBe(before[key]);
    }
  });

  it('relativeToMap is scale-invariant on screen (map-pixel space already scales with the map)', () => {
    // Symbols keep a fixed size RELATIVE TO MAP FEATURES under relativeToMap —
    // on paper both the map and symbols enlarge by mapScale/printScale together.
    const base = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);
    const enlarged = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150, 10000, 5000);
    for (const key of DIM_KEYS) {
      expect(enlarged[key], key).toBeCloseTo(base[key], 10);
    }
  });

  it("'none' shrinks screen symbols by printScale/mapScale (fixed mm on the enlarged page)", () => {
    const settings: EventSettings = { ...DEFAULT_EVENT_SETTINGS, itemScaling: 'none' };
    const base = overprintPixelDimensions(settings, 150);
    const dims = overprintPixelDimensions(settings, 150, 10000, 5000);
    // 2x enlargement: a fixed-mm circle covers half as many map pixels.
    expect(dims.circleRadius).toBeCloseTo(base.circleRadius * 0.5, 10);
    expect(dims.lineWidth).toBeCloseTo(base.lineWidth * 0.5, 10);
    expect(dims.autoLegGap).toBeCloseTo(base.autoLegGap * 0.5, 10);
  });

  it("'relativeTo15000' scales screen symbols by referenceScale/mapScale (fixed ground size)", () => {
    const settings: EventSettings = { ...DEFAULT_EVENT_SETTINGS, itemScaling: 'relativeTo15000' };
    const base = overprintPixelDimensions(settings, 150);
    // Map at 1:7500 (ref 15000): symbols cover 2x the map mm to keep ground size.
    // Independent of printScale (10000 here) on screen.
    const dims = overprintPixelDimensions(settings, 150, 7500, 10000);
    expect(dims.circleRadius).toBeCloseTo(base.circleRadius * 2, 10);
    expect(dims.startTriangleSide).toBeCloseTo(base.startTriangleSide * 2, 10);
  });

  it('omitted scales are a no-op (multiplier 1) for every mode', () => {
    const defaults = overprintPixelDimensions(DEFAULT_EVENT_SETTINGS, 150);
    for (const mode of ['none', 'relativeToMap', 'relativeTo15000'] as const) {
      const settings: EventSettings = { ...DEFAULT_EVENT_SETTINGS, itemScaling: mode };
      const dims = overprintPixelDimensions(settings, 150);
      for (const key of DIM_KEYS) {
        expect(dims[key], `${mode}.${key}`).toBe(defaults[key]);
      }
    }
  });

  it('screen and PDF agree: screen px × paper-projection = mm × paper multiplier', () => {
    // For every mode: projecting the screen map-pixel size onto the printed page
    // (px × 25.4/dpi × mapScale/printScale) must equal the PDF's mm × paper multiplier.
    const dpi = 150;
    const mapScale = 15000;
    const printScale = 10000;
    for (const mode of ['none', 'relativeToMap', 'relativeTo15000'] as const) {
      const settings: EventSettings = { ...DEFAULT_EVENT_SETTINGS, itemScaling: mode };
      const dims = overprintPixelDimensions(settings, dpi, mapScale, printScale);
      const paperMult = eventOverprintSizeMultiplier(settings, mapScale, printScale);
      const screenOnPaperMm = dims.circleRadius * (25.4 / dpi) * (mapScale / printScale);
      const pdfMm = (settings.controlCircleDiameter / 2) * paperMult;
      expect(screenOnPaperMm, mode).toBeCloseTo(pdfMm, 10);
    }
  });
});
