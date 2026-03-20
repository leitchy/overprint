/** Control codes that look ambiguous when printed upside-down — skip these during auto-assignment. */
export const AMBIGUOUS_CODES = new Set([68, 69, 86, 89, 96, 98, 160, 180, 190]);

/** Pairs of codes that can be confused with each other when rotated. */
export const AMBIGUOUS_PAIRS: Record<number, number> = {
  68: 89, 89: 68,
  86: 98, 98: 86,
  69: 96, 96: 69,
  160: 190, 190: 160,
};

/** 180 is self-ambiguous — looks the same when rotated 180 degrees. */
export const SELF_AMBIGUOUS_CODES = new Set([180]);
