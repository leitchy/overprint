import type { EventSettings } from '@/core/models/types';
import { IOF_OVERPRINT_MM } from '@/core/models/constants';

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

/**
 * Convert map image pixels back to millimetres at the map's print DPI.
 */
export function mapPixelsToMm(px: number, dpi: number): number {
  return (px * 25.4) / dpi;
}

export interface OverprintPixelDimensions {
  circleRadius: number;
  lineWidth: number;
  numberSize: number;
  startTriangleSide: number;
  finishOuterRadius: number;
  finishInnerRadius: number;
  circleGap: number;
  /** Half-length of each crossing-point arm (total arm = 6mm, half = 3mm). */
  crossingPointArm: number;
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
    startTriangleSide: mmToMapPixels(IOF_OVERPRINT_MM.startTriangleSide, dpi),
    finishOuterRadius: mmToMapPixels(IOF_OVERPRINT_MM.finishOuterDiameter / 2, dpi),
    finishInnerRadius: mmToMapPixels(IOF_OVERPRINT_MM.finishInnerDiameter / 2, dpi),
    circleGap: mmToMapPixels(IOF_OVERPRINT_MM.circleGap, dpi),
    crossingPointArm: mmToMapPixels(IOF_OVERPRINT_MM.crossingPointArm, dpi),
  };
}
