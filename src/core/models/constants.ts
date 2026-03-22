/**
 * Shared constants for the Overprint overprint layer.
 * All consumers must import from here — never define these inline.
 */

/** IOF overprint purple — Pantone 814 approximation */
export const OVERPRINT_PURPLE = '#C850A0';

/** Non-current control colour for All Controls view — pink/magenta */
export const NON_CURRENT_COLOR = '#E8A0D0';

/**
 * Distinct colours for background courses — converted from PurplePen's
 * CMYK extra course palette (Appearance.cs NormalCourseAppearance).
 * Each visible background course cycles through these.
 */
export const COURSE_COLORS = [
  '#FF4D00', // Orange       (C=0.00 M=0.70 Y=1.00 K=0.00)
  '#A6BF00', // Olive-green  (C=0.00 M=0.25 Y=1.00 K=0.35)
  '#4073FF', // Blue         (C=0.75 M=0.55 Y=0.00 K=0.00)
  '#00FF80', // Cyan-green   (C=1.00 M=0.00 Y=0.50 K=0.00)
  '#806600', // Dark yellow  (C=0.00 M=0.00 Y=1.00 K=0.50)
  '#568060', // Teal         (C=0.45 M=0.00 Y=0.40 K=0.40)
  '#BF4830', // Red          (C=0.00 M=0.65 Y=0.60 K=0.25)
  '#2660BF', // Purple-blue  (C=0.80 M=0.25 Y=0.00 K=0.25)
  '#D93870', // Magenta      (C=0.15 M=0.80 Y=0.45 K=0.15)
  '#7340D9', // Purple       (C=0.55 M=0.75 Y=0.15 K=0.00)
] as const;

/** Screen line width multiplier — IOF print spec is too thin at screen DPI.
 *  PurplePen also renders thicker on screen. PDF export does NOT use this. */
export const SCREEN_LINE_MULTIPLIER = 2;

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
