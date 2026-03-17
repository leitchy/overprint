/**
 * Shared constants for the Overprint overprint layer.
 * All consumers must import from here — never define these inline.
 */

/** IOF overprint purple — Pantone 814 approximation */
export const OVERPRINT_PURPLE = '#CD59A4';

/** Screen line width multiplier — IOF print spec is too thin at screen DPI.
 *  PurplePen also renders thicker on screen. PDF export does NOT use this. */
export const SCREEN_LINE_MULTIPLIER = 3;

/** Common map scale presets (denominator of the ratio, e.g. 10000 = 1:10000) */
export const SCALE_PRESETS = [4000, 5000, 7500, 10000, 15000] as const;

/** IOF overprint dimensions in mm (ISOM 2017-2 / IOF Control Description 2024) */
export const IOF_OVERPRINT_MM = {
  startTriangleSide: 6.0,
  finishOuterDiameter: 5.0,
  finishInnerDiameter: 3.5,
  circleGap: 0.3,
  crossingPointArm: 3.0,
} as const;
