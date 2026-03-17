import type { EventSettings } from '@/core/models/types';

/**
 * Convert IOF print-scale millimetres to map image pixels.
 *
 * The overprint layer lives inside the Konva Stage with the same transform
 * as the map image, so dimensions in map-image pixels are automatically
 * scaled to screen by Konva's zoom.
 */
export function mmToMapPixels(mm: number, dpi: number): number {
  return (mm * dpi) / 25.4;
}

export interface OverprintPixelDimensions {
  circleRadius: number;
  lineWidth: number;
  numberSize: number;
  startTriangleSide: number;
  finishOuterRadius: number;
  finishInnerRadius: number;
  circleGap: number;
}

/**
 * Compute all overprint shape dimensions in map-image pixels.
 */
export function overprintPixelDimensions(
  settings: EventSettings,
  dpi: number,
): OverprintPixelDimensions {
  return {
    circleRadius: mmToMapPixels(settings.controlCircleDiameter / 2, dpi),
    lineWidth: mmToMapPixels(settings.lineWidth, dpi),
    numberSize: mmToMapPixels(settings.numberSize, dpi),
    startTriangleSide: mmToMapPixels(6.0, dpi),           // ISOM 2017-2: 6mm side
    finishOuterRadius: mmToMapPixels(5.0 / 2, dpi),       // ISOM 2017-2: 5mm outer diameter
    finishInnerRadius: mmToMapPixels(3.5 / 2, dpi),       // ISOM 2017-2: 3.5mm inner diameter
    circleGap: mmToMapPixels(0.3, dpi),                    // IOF spec: ~0.3mm gap
  };
}
