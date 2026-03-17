import type { MapPoint } from '@/core/models/types';

/**
 * Euclidean distance between two points in pixels.
 */
export function pixelDistance(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert a pixel distance to real-world metres using map scale and DPI.
 *
 * Formula:
 *   pixelDistance → mm on map (via DPI) → metres on ground (via scale)
 *   mapDistanceMm = pixels / dpi * 25.4
 *   realDistanceM = mapDistanceMm * scale / 1000
 */
export function pixelsToMetres(
  pixels: number,
  scale: number,
  dpi: number,
): number {
  const mapDistanceMm = (pixels / dpi) * 25.4;
  return (mapDistanceMm * scale) / 1000;
}

/**
 * Real-world distance in metres between two map points.
 */
export function mapDistanceMetres(
  a: MapPoint,
  b: MapPoint,
  scale: number,
  dpi: number,
): number {
  return pixelsToMetres(pixelDistance(a, b), scale, dpi);
}
