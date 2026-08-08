/**
 * Raster resolution policy for vector map sources (OCAD / OMAP / PDF).
 *
 * Maps are flattened to a bitmap for display on the Konva canvas. The *base*
 * long side is what we rasterize once at load time (fast, low memory). When the
 * user zooms in, `use-adaptive-map-raster` re-rasterizes the same map at a higher
 * pixel density up to the *max* long side, so detail stays crisp instead of the
 * base bitmap being upscaled into a blur.
 *
 * The max is device-aware: desktop browsers tolerate large canvases/images, but
 * iOS Safari caps total canvas area at ~16.7M px (≈4096×4096) and low-memory
 * devices decode large bitmaps poorly. Exceeding those limits yields a blank map,
 * so we stay conservative on touch / small-memory hardware.
 */

/** Long side (px) of the bitmap produced at load time. Safe on all platforms. */
export const BASE_RASTER_LONG_SIDE = 4000;

/**
 * Target print resolution (dpi) for re-rasterising a vector map (OCAD/OMAP SVG)
 * into an exported PDF. The display bitmap is a screen-density raster; embedding
 * it directly caps print quality well below what the vector source can produce.
 * Re-rasterising at this density (subject to the device long-side cap) restores
 * near-print detail. 600 dpi is the practical ceiling for orienteering print.
 */
export const PRINT_TARGET_DPI = 600;

/**
 * Compute the long side (px) at which to re-rasterise a vector map for PDF export.
 *
 * The embedded raster must be dense enough that, once the map is scaled from its
 * native `mapScale` to the `printScale` on paper, it still resolves at ~`targetDpi`.
 * A map printed enlarged (printScale < mapScale) needs proportionally more pixels.
 *
 * The result is:
 *  - never below the logical long side (never throw away base detail), and
 *  - never above `cap` (the device-safe canvas/image ceiling).
 *
 * @param logicalLongSide  Long side (px) of the map in control-coordinate space.
 * @param nativeDpi        Effective dpi of the map at its own `mapScale`.
 * @param mapScale         Map scale denominator (e.g. 10000 for 1:10000).
 * @param printScale       Smallest print-scale denominator being exported.
 * @param cap              Device long-side cap (see `maxRasterLongSide`).
 */
export function printRasterLongSide(
  logicalLongSide: number,
  nativeDpi: number,
  mapScale: number,
  printScale: number,
  cap: number,
  targetDpi: number = PRINT_TARGET_DPI,
): number {
  if (logicalLongSide <= 0) return 0;
  let needed = logicalLongSide;
  if (nativeDpi > 0 && mapScale > 0 && printScale > 0) {
    const factor = (targetDpi / nativeDpi) * (mapScale / printScale);
    needed = logicalLongSide * factor;
  }
  return Math.round(Math.min(Math.max(needed, logicalLongSide), cap));
}

/**
 * Maximum long side (px) the adaptive re-rasterizer may target for this device.
 * Returns a conservative value on iOS / coarse-pointer / low-memory hardware.
 */
export function maxRasterLongSide(): number {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return BASE_RASTER_LONG_SIDE;
  }

  const ua = navigator.userAgent ?? '';
  // iPadOS 13+ reports as "MacIntel" with touch points — detect via maxTouchPoints.
  const isIOS =
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 4096; // iOS Safari canvas-area ceiling

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (coarse) return 6144;

  // navigator.deviceMemory is Chromium-only; treat <=4 GB as constrained.
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem <= 4) return 6144;

  return 8192;
}
