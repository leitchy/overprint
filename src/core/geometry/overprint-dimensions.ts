import type { EventSettings, ItemScaling } from '@/core/models/types';
import { overprintDims, overprintReferenceScale } from '@/core/models/constants';

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

/** True when a scale denominator is usable in a ratio. */
function isValidScale(scale: number | undefined): scale is number {
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0;
}

/**
 * Overprint symbol size multiplier in PAPER space (PurplePen ItemScaling).
 *
 * Multiplies the IOF mm dimensions as printed on the page:
 * - 'none'            → 1 — symbols are a fixed mm size on the printed page.
 * - 'relativeToMap'   → mapScale / printScale — symbols scale with the map
 *   enlargement (1 when printScale == mapScale).
 * - 'relativeTo15000' → referenceScale / printScale — symbols keep a fixed
 *   GROUND size, as if printed at the standard's reference scale
 *   (1:15000 ISOM, 1:4000 ISSprOM).
 *
 * Any non-finite or non-positive scale involved in the ratio falls back to 1.
 * The PDF exporter applies this directly to its mm→points conversions.
 */
export function overprintSizeMultiplier(
  mode: ItemScaling,
  mapScale: number | undefined,
  printScale: number | undefined,
  referenceScale: number | undefined,
): number {
  switch (mode) {
    case 'relativeToMap':
      return isValidScale(mapScale) && isValidScale(printScale)
        ? mapScale / printScale
        : 1;
    case 'relativeTo15000':
      return isValidScale(referenceScale) && isValidScale(printScale)
        ? referenceScale / printScale
        : 1;
    case 'none':
    default:
      return 1;
  }
}

/**
 * Resolve the PAPER-space size multiplier for an event's settings.
 * The reference scale comes from the map standard (15000 ISOM / 4000 ISSprOM).
 * Omitted scales → 1 (backward compatible no-op).
 */
export function eventOverprintSizeMultiplier(
  settings: EventSettings,
  mapScale?: number,
  printScale?: number,
): number {
  return overprintSizeMultiplier(
    settings.itemScaling ?? 'relativeToMap',
    mapScale,
    printScale,
    overprintReferenceScale(settings.mapStandard),
  );
}

/**
 * Overprint symbol size multiplier in MAP-PIXEL space (the Konva canvas).
 *
 * The screen draws symbols in map-image pixels, a base that is intrinsically
 * "relative to map" — a fixed map-pixel size already scales 1:1 with map
 * enlargement on paper. So the map-space multiplier is the paper-space
 * multiplier with the relativeToMap factor divided out (PurplePen's
 * courseObjRatio): none → printScale/mapScale, relativeToMap → 1,
 * relativeTo15000 → referenceScale/mapScale.
 */
function mapSpaceSizeMultiplier(
  settings: EventSettings,
  mapScale?: number,
  printScale?: number,
): number {
  const paper = eventOverprintSizeMultiplier(settings, mapScale, printScale);
  const relToMap = overprintSizeMultiplier('relativeToMap', mapScale, printScale, undefined);
  return paper / relToMap;
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
  /** Auto leg-cut gap size (PurplePen 3.5mm) in map pixels. */
  autoLegGap: number;
  /** Minimum distance from a leg end within which an auto-cut is suppressed (0.5mm). */
  autoLegGapMinEnd: number;
}

/**
 * Compute all overprint shape dimensions in map-image pixels.
 *
 * When `mapScale` and `printScale` are given, the item-scaling mode
 * (`settings.itemScaling`, default 'relativeToMap') is applied so the screen
 * matches the printed output. Omitted scales → multiplier 1, which is
 * identical to the pre-A8 behaviour (and to 'relativeToMap' at any scale,
 * since map-pixel space already scales with the map).
 */
export function overprintPixelDimensions(
  settings: EventSettings,
  dpi: number,
  mapScale?: number,
  printScale?: number,
): OverprintPixelDimensions {
  // Fixed-by-standard dimensions come from the per-standard table; circle/line/
  // number are user-editable EventSettings (whose defaults also come from the table).
  const std = overprintDims(settings.mapStandard);
  const k = mapSpaceSizeMultiplier(settings, mapScale, printScale);
  const px = (mm: number): number => mmToMapPixels(mm, dpi) * k;
  return {
    circleRadius: px(settings.controlCircleDiameter / 2),
    lineWidth: px(settings.lineWidth),
    numberSize: px(settings.numberSize),
    startTriangleSide: px(std.startTriangleSide),
    finishOuterRadius: px(std.finishOuterDiameter / 2),
    finishInnerRadius: px(std.finishInnerDiameter / 2),
    circleGap: px(std.circleGap),
    crossingPointArm: px(std.crossingPointArm),
    autoLegGap: px(3.5),
    autoLegGapMinEnd: px(0.5),
  };
}
