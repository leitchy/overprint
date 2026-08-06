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
