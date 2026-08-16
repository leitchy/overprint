/**
 * IOF colour-order ink classification (D2 — true colour-order).
 *
 * Per ISOM 2017 Appendix 1 §5 / IOF Printing & Colour Definitions Rev 4 §6, the
 * LOWER course purple sits below the map's **black, brown and blue 100%**
 * colours — those inks redraw ABOVE the purple — while area screens/tints stay
 * underneath it. The map loaders tag SVG elements painted in such an ink with
 * `data-ink="upper"` ({@link INK_ATTR}/{@link INK_UPPER}); the vector PDF
 * exporter re-renders exactly those elements above the lower purple layer.
 *
 * Classification is a heuristic approximation from the colour-table CMYK
 * values (fractions 0–1), cross-checked against the colour name:
 *
 * - black 100%: k ≥ 0.9 and c,m,y ≤ 0.1              (e.g. 0/0/0/100)
 * - blue  100%: c ≥ 0.8, m ≤ 0.5, y ≤ 0.25, k ≤ 0.25 (ISOM blue ≈ 87/18/0/0)
 * - brown 100%: y ≥ 0.6, 0.35 ≤ m ≤ 0.9, c ≤ 0.4, k ≤ 0.5
 *               (ISOM brown ≈ 0/56/100/18; ISSprOM ≈ 34/61/100/28)
 *
 * The brown m-floor of 0.35 deliberately excludes green (m≈0), olive (m≈0.28)
 * and yellow (m≈0.27). A percentage below 100 in the colour NAME (e.g.
 * "Black 50%", "Brown 30%") vetoes the tag even when the CMYK would pass.
 * When unsure we do NOT tag: leaving a true upper ink under the purple is a
 * far smaller error than punching an area screen through it.
 */

/** SVG attribute used to tag elements drawn in an upper (above-purple) ink. */
export const INK_ATTR = 'data-ink';

/** Attribute value marking an upper-ink element. */
export const INK_UPPER = 'upper';

/** CMYK tuple, all components as fractions 0–1. */
export type CmykFractions = readonly [c: number, m: number, y: number, k: number];

/** True when the colour name declares a tint below 100% (e.g. "Black 50%"). */
function nameIndicatesTint(name: string | undefined): boolean {
  if (!name) return false;
  const matches = name.match(/(\d+(?:\.\d+)?)\s*%/g);
  if (!matches) return false;
  return matches.some((m) => parseFloat(m) < 100);
}

/**
 * Classify a map colour as an "upper" ink — 100% black, brown or blue — that
 * must redraw above the lower course purple. Conservative: returns false for
 * screens/tints, other hues, and anything ambiguous.
 */
export function isUpperInk(cmyk: CmykFractions, name?: string): boolean {
  const [c, m, y, k] = cmyk;
  if (![c, m, y, k].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return false;
  if (nameIndicatesTint(name)) return false;

  const isBlack = k >= 0.9 && c <= 0.1 && m <= 0.1 && y <= 0.1;
  const isBlue = c >= 0.8 && m <= 0.5 && y <= 0.25 && k <= 0.25;
  const isBrown = y >= 0.6 && m >= 0.35 && m <= 0.9 && c <= 0.4 && k <= 0.5;

  return isBlack || isBlue || isBrown;
}

// ---------------------------------------------------------------------------
// Map colour grouping (screen dimming — map-layer-toggles feature)
// ---------------------------------------------------------------------------

/**
 * ISOM colour groups a course setter can dim on screen to declutter a busy map.
 * Deliberately NO 'black' group — black carries paths/cliffs/buildings/fences/
 * north-lines (the skeleton you navigate and hang legs on), so it's never a
 * useful "dim everything" toggle. Everything uncategorised is `'other'` and
 * stays full-strength.
 */
export type MapColourGroup = 'brown' | 'blue' | 'green' | 'yellow' | 'other';

/** The dimmable groups, in display order (excludes 'other'). */
export const DIMMABLE_MAP_GROUPS = ['brown', 'blue', 'green', 'yellow'] as const;

/** Name keywords per group (lower-cased substring match), tint words ignored. */
const GROUP_NAME_KEYWORDS: Record<Exclude<MapColourGroup, 'other'>, readonly string[]> = {
  brown: ['brown', 'contour', 'braun', 'marron', 'bruin'],
  blue: ['blue', 'water', 'marsh', 'lake', 'bleu', 'blau', 'acqua'],
  green: ['green', 'veg', 'olive', 'undergrowth', 'forest', 'vert', 'grün', 'gruen'],
  yellow: ['yellow', 'open', 'rough', 'jaune', 'gelb', 'giallo'],
};

/** Classify by colour NAME first (the mapper's own declared colour), or null. */
function groupFromName(name: string | undefined): MapColourGroup | null {
  if (!name) return null;
  const n = name.toLowerCase();
  // Brown before yellow: "brown"/"contour" names shouldn't be caught by a
  // stray "open" etc. (checked in group order — brown, blue, green, yellow).
  for (const group of DIMMABLE_MAP_GROUPS) {
    if (GROUP_NAME_KEYWORDS[group].some((kw) => n.includes(kw))) return group;
  }
  return null;
}

/** Classify by CMYK fractions (0–1). Brown is tested before yellow. */
function groupFromCmyk(cmyk: CmykFractions): MapColourGroup {
  const [c, m, y, k] = cmyk;
  if (![c, m, y, k].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return 'other';
  const isBlue = c >= 0.5 && m <= 0.6 && y <= 0.3;
  const isBrown = y >= 0.5 && m >= 0.3 && m <= 0.9 && c <= 0.4 && k <= 0.6;
  const isGreen = c >= 0.4 && y >= 0.4 && m <= 0.4;
  const isYellow = y >= 0.5 && c <= 0.25 && k <= 0.15 && m <= 0.6;
  if (isBrown) return 'brown';   // before yellow: brown = yellow + magenta + K
  if (isGreen) return 'green';
  if (isBlue) return 'blue';
  if (isYellow) return 'yellow';
  return 'other';
}

/** Naive RGB (0–255) → CMYK fractions — last-resort for pre-CMYK OMAP colours. */
function rgbToCmykApprox(r: number, g: number, b: number): CmykFractions {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const k = 1 - Math.max(rf, gf, bf);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - rf - k) / (1 - k), (1 - gf - k) / (1 - k), (1 - bf - k) / (1 - k), k];
}

/**
 * Classify a map colour into a dimmable {@link MapColourGroup} for the screen
 * layer-dimming feature. Name first (the colour table's own label survives even
 * when CMYK is absent), CMYK heuristic next, naive RGB→CMYK as a last resort.
 * Returns `'other'` (full strength, never dimmed) when nothing matches — so a
 * misclassification only ever leaves a colour visible, never wrongly dims it.
 */
export function mapColourGroup(
  name: string | undefined,
  cmyk: CmykFractions | undefined,
  rgb?: { r: number; g: number; b: number },
): MapColourGroup {
  const byName = groupFromName(name);
  if (byName) return byName;
  if (cmyk) return groupFromCmyk(cmyk);
  if (rgb) return groupFromCmyk(rgbToCmykApprox(rgb.r, rgb.g, rgb.b));
  return 'other';
}
