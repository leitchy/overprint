/**
 * Shared constants for the Overprint overprint layer.
 * All consumers must import from here — never define these inline.
 */

/**
 * IOF course-overprint purple. ISOM 2017 Appendix 1 §4 defines it as CMYK 35/85/0/0
 * or PMS "Purple"; the IOF gives no official RGB (print-only standard). #BB29BB is the
 * sRGB of Pantone Purple C — the named spot colour — replacing the earlier pinker
 * "Pantone 814" approximation. Exact on-screen sRGB is a rendering choice; see the
 * overprint-standard research notes.
 */
export const OVERPRINT_PURPLE = '#BB29BB';

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

/**
 * Control-number sizing: the IOF spec (ISOM 2017-2 §3.7) gives 4.0mm as the DIGIT
 * (cap) height, not the font Em size. A font's cap height is ≈0.72 of its Em, so
 * fontSize = digitHeight / 0.72 ≈ digitHeight × 1.39 (matches PurplePen's 5.57mm Em
 * for a 4.0mm digit). Numbers are non-bold per spec. */
export const NUMBER_DIGIT_HEIGHT_TO_EM = 1.39;

/** Common map scale presets (denominator of the ratio, e.g. 10000 = 1:10000) */
export const SCALE_PRESETS = [4000, 5000, 7500, 10000, 15000] as const;

import type { MapStandard } from './types';

/**
 * IOF course-overprint dimensions, in mm at the reference scale, keyed by map
 * standard (ISOM 2017-2 §3.7 at 1:15000; ISSprOM 2019-2 §4.7 at 1:4000). Circle and
 * finish diameters are centre-to-centre of the stroke. See
 * docs/reference/standards-conformance.md §1 for the full cited table.
 *
 * `controlCircleDiameter`, `lineWidth` and `numberDigitHeight` are the per-standard
 * DEFAULTS for the corresponding (user-editable) EventSettings fields; the other
 * dimensions are fixed by the standard and taken from here directly.
 */
export interface OverprintStandardDims {
  startTriangleSide: number;
  finishOuterDiameter: number;
  finishInnerDiameter: number;
  circleGap: number;
  crossingPointArm: number;
  controlCircleDiameter: number;
  lineWidth: number;
  numberDigitHeight: number;
}

export const OVERPRINT_DIMS: Record<MapStandard, OverprintStandardDims> = {
  ISOM2017: {
    startTriangleSide: 6.0,
    finishOuterDiameter: 6.0,
    finishInnerDiameter: 4.0,
    circleGap: 0.3,
    crossingPointArm: 3.0,
    controlCircleDiameter: 5.0,
    lineWidth: 0.35,
    numberDigitHeight: 4.0,
  },
  ISSprOM2019: {
    startTriangleSide: 7.0,
    finishOuterDiameter: 7.0,
    finishInnerDiameter: 5.0,
    circleGap: 0.3,
    crossingPointArm: 3.0,
    controlCircleDiameter: 6.0,
    lineWidth: 0.35,
    numberDigitHeight: 4.0,
  },
};

/** Resolve the overprint dimension table for a standard (ISOM fallback). */
export function overprintDims(standard: MapStandard): OverprintStandardDims {
  return OVERPRINT_DIMS[standard] ?? OVERPRINT_DIMS.ISOM2017;
}
