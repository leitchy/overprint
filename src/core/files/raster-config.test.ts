import { describe, it, expect } from 'vitest';
import { printRasterLongSide, PRINT_TARGET_DPI, BASE_RASTER_LONG_SIDE } from './raster-config';

describe('printRasterLongSide', () => {
  const CAP = 8192;

  it('scales up a low-dpi vector map toward the print-DPI target', () => {
    // A 4000px map at native 150 dpi, printed at the same scale, needs 4× the
    // pixels to reach 600 dpi — but that is clamped to the device cap.
    const long = printRasterLongSide(4000, 150, 10000, 10000, CAP);
    expect(long).toBe(CAP); // 4000 * (600/150) = 16000 → capped at 8192
  });

  it('reaches the exact target when below the cap', () => {
    // 2000px map, native 300 dpi, same print scale → 600/300 = 2× → 4000px.
    const long = printRasterLongSide(2000, 300, 10000, 10000, CAP);
    expect(long).toBe(4000);
  });

  it('needs more pixels when printed enlarged (printScale < mapScale)', () => {
    // Printing 1:10000 map at 1:5000 doubles the paper size → double the pixels.
    // 2000 * (600/300) * (10000/5000) = 8000, under the 8192 cap.
    const long = printRasterLongSide(2000, 300, 10000, 5000, CAP);
    expect(long).toBe(8000);
  });

  it('needs fewer pixels when printed reduced but never below the logical size', () => {
    // Printing 1:10000 map at 1:15000 shrinks it; needed < logical → floor at logical.
    const long = printRasterLongSide(6000, 600, 10000, 15000, CAP);
    // 6000 * (600/600) * (10000/15000) = 4000 < 6000 → floored to 6000
    expect(long).toBe(6000);
  });

  it('never exceeds the device cap', () => {
    const long = printRasterLongSide(BASE_RASTER_LONG_SIDE, 96, 10000, 4000, 4096);
    expect(long).toBeLessThanOrEqual(4096);
    expect(long).toBe(4096);
  });

  it('falls back to the logical long side when metadata is missing', () => {
    expect(printRasterLongSide(4000, 0, 10000, 10000, CAP)).toBe(4000);
    expect(printRasterLongSide(4000, 150, 0, 10000, CAP)).toBe(4000);
    expect(printRasterLongSide(4000, 150, 10000, 0, CAP)).toBe(4000);
  });

  it('returns 0 for a non-positive logical size', () => {
    expect(printRasterLongSide(0, 150, 10000, 10000, CAP)).toBe(0);
  });

  it('uses PRINT_TARGET_DPI as the default target', () => {
    // native dpi == PRINT_TARGET_DPI, same scale → factor 1 → logical size.
    expect(printRasterLongSide(5000, PRINT_TARGET_DPI, 10000, 10000, CAP)).toBe(5000);
  });
});
