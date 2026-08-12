/**
 * OpenOrienteering Mapper (.omap / .xmap) loader.
 *
 * Both formats are plain XML (same schema). .omap uses condensed single-line
 * formatting; .xmap uses pretty-printed indentation.
 *
 * Approach: parse XML → extract colors, symbols, objects → build SVG string
 * → rasterize to HTMLImageElement via Blob URL.
 *
 * Rendering supports: bezier curves (coordinate flags), area hatching/dot
 * patterns (SVG <pattern>), point symbol glyphs (circles, lines, areas),
 * text with font/alignment, and combined symbols.
 *
 * Coordinates are in 1/1000mm on paper with Y-down (Qt convention, origin top-left).
 * Both OMAP and SVG use Y-down, so no Y negation is needed.
 * RGB color values are floats 0.0–1.0 in the XML.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OmapColor {
  r: number; // 0–255
  g: number;
  b: number;
  /** CMYK fractions 0–1 from the colour definition (when present). Used to
   *  classify 100% black/brown/blue inks for IOF colour-order tagging (D2). */
  cmyk?: CmykFractions;
  /** Colour name from the map file (e.g. "Black", "Brown 50%"). */
  name?: string;
}

/** Point symbol glyph element (sub-shape within a point symbol) */
interface OmapGlyphElement {
  /** Sub-symbol type: 1=point, 2=line, 4=area */
  symType: number;
  color: number;
  lineWidth: number;
  /** Coords relative to the point's origin */
  coords: OmapCoord[];
  /** Object type: 0=point, 1=path */
  objType: number;
}

/** Point symbol glyph definition */
interface OmapPointGlyph {
  innerRadius: number;
  innerColor: number;
  outerWidth: number;
  outerColor: number;
  elements: OmapGlyphElement[];
}

/** Area pattern definition (hatching or dot grid) */
interface OmapPatternDef {
  /** 1=hatching (parallel lines), 2=point pattern (repeating dot/glyph) */
  type: 1 | 2;
  /** Angle in radians */
  angle: number;
  /** Row spacing in 1/1000mm */
  lineSpacing: number;
  /** Row offset in 1/1000mm */
  lineOffset: number;
  /** Hatch line width in 1/1000mm (type 1 only) */
  lineWidth: number;
  /** Color index (type 1) or inner_color of nested point symbol (type 2) */
  color: number;
  /** Column spacing for point patterns (type 2 only) */
  pointDistance?: number;
  /** Nested point symbol inner_radius (type 2 only) */
  dotRadius?: number;
  /** Along-row stagger offset for point patterns (type 2) — non-zero → brick/hex layout */
  offsetAlong?: number;
}

export interface OmapSymbol {
  id: number;
  /** 1=point, 2=line, 4=area, 8=text, 16=combined */
  type: number;
  colorIndex: number;
  lineWidth: number; // in 1/1000mm
  /** For combined symbols: optional fill color index */
  fillColorIndex: number;
  /** For text symbols: font size in 1/1000mm */
  fontSize: number;
  /** Whether this symbol is hidden */
  hidden: boolean;
  /** Combined symbol (type 16): referenced part symbol IDs, resolved in a second pass */
  partIds?: number[];
  /** Line dash pattern as an SVG stroke-dasharray (OMAP units), if the line is dashed */
  dashArray?: string;
  /** Line border (double-line edge): a stroke drawn on both sides of the core line */
  border?: { color: number; width: number; shift: number };
  /** Along-line glyph slots (nested point symbols stamped along the path) */
  midSymbol?: OmapPointGlyph;
  startSymbol?: OmapPointGlyph;
  endSymbol?: OmapPointGlyph;
  /** Along-line placement (all in 1/1000 mm / counts) */
  segmentLength?: number;
  endLength?: number;
  midSymbolsPerSpot?: number;
  midSymbolDistance?: number;
  minMidSymbolCount?: number;
  minMidSymbolCountClosed?: number;
  showAtLeastOneSymbol?: boolean;
  /** Area pattern definitions (hatching, dot patterns) */
  patterns: OmapPatternDef[];
  /** Text symbol: font family name (e.g., "Arial", "Calibri") */
  fontFamily?: string;
  /** Text symbol: bold flag */
  fontBold?: boolean;
  /** Text symbol: italic flag */
  fontItalic?: boolean;
  /** Text symbol: line spacing multiplier (e.g., 1.0) */
  lineSpacing?: number;
  /** Point symbol glyph definition */
  pointGlyph?: OmapPointGlyph;
}

// OMAP coordinate flag bitmask constants (from OpenOrienteering Mapper format spec)
const COORD_CURVE_START = 1 << 0;  // 1  — next two coords are bezier control points
const COORD_CLOSE_POINT = 1 << 1;  // 2  — close the current sub-path
const COORD_HOLE_POINT  = 1 << 4;  // 16 — last coord of sub-path; next starts a hole

export interface OmapCoord {
  x: number;
  y: number;
  /** Coordinate flags bitmask (CurveStart=1, ClosePoint=2, HolePoint=16, etc.) */
  flags: number;
}

export interface OmapObject {
  /** 0=point, 1=path, 4=text */
  type: number;
  symbolId: number;
  coords: OmapCoord[];
  text?: string;
  /** Text horizontal alignment: 0=left, 1=center, 2=right */
  hAlign?: number;
  /** Text vertical alignment: 0=top, 1=middle, 2=baseline */
  vAlign?: number;
  /** Object rotation in radians (for point symbols) */
  rotation?: number;
}

import type { GeoReference } from '@/core/models/types';
import { BASE_RASTER_LONG_SIDE } from './raster-config';
import { rasterizeSvgToImage } from './rasterize-svg';
import { INK_ATTR, INK_UPPER, isUpperInk, type CmykFractions } from './ink-classification';

interface LoadOmapResult {
  image: HTMLImageElement;
  width: number;
  height: number;
  scale: number | null;
  dpi: number;
  georef: GeoReference | null;
  viewBox: { x: number; y: number; width: number; height: number };
  renderScale: number;
  /** Sized-less SVG string (viewBox only) for adaptive re-rasterization on zoom. */
  svg: string;
}

// ---------------------------------------------------------------------------
// XML helpers (namespace-aware)
// ---------------------------------------------------------------------------

const NS = 'http://openorienteering.org/apps/mapper/xml/v2';

/** Query element by local name, trying namespaced then bare. */
function q(parent: Element | Document, localName: string): Element | null {
  return parent.getElementsByTagNameNS(NS, localName)[0]
    ?? parent.getElementsByTagName(localName)[0]
    ?? null;
}

/** Query all elements by local name. */
function qAll(parent: Element | Document, localName: string): Element[] {
  const nsResult = parent.getElementsByTagNameNS(NS, localName);
  if (nsResult.length > 0) return Array.from(nsResult);
  return Array.from(parent.getElementsByTagName(localName));
}

/** Read a numeric attribute, defaulting to fallback. */
function numAttr(el: Element, attr: string, fallback = 0): number {
  const val = el.getAttribute(attr);
  if (val === null) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build an SVG `stroke-dasharray` (in OMAP units, matching path coordinates) from a
 * `<line_symbol>`'s dash attributes. Returns undefined for solid lines.
 *
 * Grouped dashes (`dashes_in_group` > 1) produce `dash igb dash igb … dash break`,
 * i.e. N dashes separated by in-group breaks, then the larger between-group break.
 */
function parseDashArray(lineSym: Element): string | undefined {
  if (lineSym.getAttribute('dashed') !== 'true') return undefined;
  const dashLen = numAttr(lineSym, 'dash_length', 0);
  const breakLen = numAttr(lineSym, 'break_length', 0);
  if (dashLen <= 0 || breakLen <= 0) return undefined;
  const group = Math.max(1, numAttr(lineSym, 'dashes_in_group', 1));
  if (group <= 1) return `${dashLen} ${breakLen}`;
  const inGroupBreak = numAttr(lineSym, 'in_group_break_length', breakLen);
  const arr: number[] = [];
  for (let i = 0; i < group; i++) {
    arr.push(dashLen);
    arr.push(i < group - 1 ? inGroupBreak : breakLen);
  }
  return arr.join(' ');
}

/**
 * Parse the first `<border>` of a `<line_symbol>` (double-line edge). Returns
 * undefined when the line has no border. Rendered via the paint-order trick: a
 * wide stroke in the border colour drawn UNDER the core stroke, so the border
 * colour shows as an edge band on both sides.
 */
function parseBorder(lineSym: Element): { color: number; width: number; shift: number } | undefined {
  const borders = q(lineSym, 'borders');
  if (!borders) return undefined;
  const b = q(borders, 'border');
  if (!b) return undefined;
  const width = numAttr(b, 'width', 0);
  if (width <= 0) return undefined;
  return { color: numAttr(b, 'color', -1), width, shift: numAttr(b, 'shift', 0) };
}

/** Parse a `;`-separated "x y [flags]" coord string into OmapCoords. */
function parseCoordText(text: string): OmapCoord[] {
  const out: OmapCoord[] = [];
  for (const seg of text.split(';')) {
    const t = seg.trim();
    if (!t) continue;
    const p = t.split(/\s+/);
    if (p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    const f = p.length >= 3 ? (Number(p[2]) || 0) : 0;
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, flags: f });
  }
  return out;
}

/**
 * Parse a `<point_symbol>` element into a glyph definition (inner/outer dot + a
 * list of sub-element shapes). Shared by top-level point symbols AND the nested
 * point symbols used as along-line glyph slots (mid/start/end/dash symbols),
 * whose XML has the identical structure.
 */
function parsePointGlyph(pointSym: Element): OmapPointGlyph {
  const innerRadius = numAttr(pointSym, 'inner_radius', 0);
  const innerColor = numAttr(pointSym, 'inner_color', -1);
  const outerWidth = numAttr(pointSym, 'outer_width', 0);
  const outerColor = numAttr(pointSym, 'outer_color', -1);

  const elements: OmapGlyphElement[] = [];
  for (const elemEl of qAll(pointSym, 'element')) {
    const subSymEl = q(elemEl, 'symbol');
    if (!subSymEl) continue;
    const subType = numAttr(subSymEl, 'type', 0);

    let elemColor = -1;
    let elemLineWidth = 0;
    if (subType === 2) {
      const ls = q(subSymEl, 'line_symbol');
      if (ls) {
        elemColor = numAttr(ls, 'color', -1);
        elemLineWidth = numAttr(ls, 'line_width', 150);
      }
    } else if (subType === 4) {
      const as = q(subSymEl, 'area_symbol');
      if (as) elemColor = numAttr(as, 'inner_color', -1);
    } else if (subType === 1) {
      const ps = q(subSymEl, 'point_symbol');
      if (ps) {
        elemColor = numAttr(ps, 'inner_color', -1);
        if (elemColor < 0) elemColor = numAttr(ps, 'outer_color', -1);
        elemLineWidth = numAttr(ps, 'outer_width', 0);
      }
    }

    const objEl = q(elemEl, 'object');
    if (!objEl) continue;
    const objType = numAttr(objEl, 'type', 0);
    const coordsEl = q(objEl, 'coords');
    const elemCoords = coordsEl ? parseCoordText(coordsEl.textContent ?? '') : [];

    elements.push({ symType: subType, color: elemColor, lineWidth: elemLineWidth, coords: elemCoords, objType });
  }

  return { innerRadius, innerColor, outerWidth, outerColor, elements };
}

/**
 * Parse an along-line glyph slot (`mid_symbol`/`start_symbol`/`end_symbol`/
 * `dash_symbol`) of a `<line_symbol>`. Returns undefined for an absent or empty
 * slot. Navigation is strictly slot → its `point_symbol` (document-order first),
 * so the glyph's own nested line/area sub-symbols are never picked up by mistake.
 */
function parseSlotGlyph(lineSym: Element, slot: string): OmapPointGlyph | undefined {
  const slotEl = q(lineSym, slot);
  if (!slotEl) return undefined;
  const ps = q(slotEl, 'point_symbol');
  if (!ps) return undefined;
  const g = parsePointGlyph(ps);
  if (g.elements.length === 0 && g.innerRadius <= 0) return undefined;
  return g;
}

// ---------------------------------------------------------------------------
// Extraction functions
// ---------------------------------------------------------------------------

function extractScale(doc: Document): number | null {
  const geo = q(doc, 'georeferencing');
  if (!geo) return null;
  const scale = numAttr(geo, 'scale', 0);
  return scale >= 100 && scale < 1_000_000 ? scale : null;
}

/**
 * Extract full georeferencing data from <georeferencing> element.
 *
 * OMAP stores:
 *   <georeferencing scale="15000" grivation="1.5">
 *     <projected_crs id="UTM zone 55S">
 *       <spec language="PROJ.4">+proj=utm +zone=55 +south ...</spec>
 *       <ref_point x="689345.67" y="6077123.45"/>
 *     </projected_crs>
 *   </georeferencing>
 *
 * The `id` attribute is a human label, NOT an EPSG code — we use the PROJ.4 string.
 * Grivation is in degrees → convert to radians.
 */
function extractGeoRef(
  doc: Document,
  scale: number | null,
  renderScale: number,
  vbMinX: number,
  vbMinY: number,
  vbHeight: number,
): GeoReference | null {
  if (!scale) return null;

  const geo = q(doc, 'georeferencing');
  if (!geo) return null;

  const grivationDeg = numAttr(geo, 'grivation', 0);

  // Find projected_crs element (may be namespaced or bare)
  const projCrs = q(geo, 'projected_crs');
  if (!projCrs) return null;

  // Extract PROJ.4 string from <spec language="PROJ.4">
  const specEl = q(projCrs, 'spec');
  if (!specEl) return null;
  const projString = specEl.textContent?.trim();
  if (!projString) return null;

  // Extract reference point (easting/northing in projected CRS metres)
  const refPoint = q(projCrs, 'ref_point');
  const easting = refPoint ? numAttr(refPoint, 'x', 0) : 0;
  const northing = refPoint ? numAttr(refPoint, 'y', 0) : 0;

  return {
    projDef: projString,
    easting,
    northing,
    scale,
    grivation: (grivationDeg * Math.PI) / 180,
    source: 'omap',
    paperUnit: 'thousandths-mm',
    viewBoxOrigin: { x: vbMinX, y: vbMinY },
    viewBoxHeight: vbHeight,
    renderScale,
  };
}

function extractColors(doc: Document): Map<number, OmapColor> {
  const colors = new Map<number, OmapColor>();
  const colorsEl = q(doc, 'colors');
  if (!colorsEl) return colors;

  const colorEls = qAll(colorsEl, 'color');
  for (let i = 0; i < colorEls.length; i++) {
    const el = colorEls[i]!;
    const rgbEl = q(el, 'rgb');
    if (rgbEl) {
      // CMYK fractions live as c/m/y/k attributes on <color> (Mapper v9);
      // fall back to a <cmyk c m y k> child for older exports. Retained for
      // IOF colour-order ink classification (D2) — not for rendering.
      const cmykSource = el.hasAttribute('k') ? el : q(el, 'cmyk');
      let cmyk: CmykFractions | undefined;
      if (cmykSource?.hasAttribute('k')) {
        cmyk = [
          numAttr(cmykSource, 'c', 0),
          numAttr(cmykSource, 'm', 0),
          numAttr(cmykSource, 'y', 0),
          numAttr(cmykSource, 'k', 0),
        ];
      }
      // Values are floats 0.0–1.0, convert to 0–255
      colors.set(i, {
        r: Math.round(parseFloat(rgbEl.getAttribute('r') ?? '0') * 255),
        g: Math.round(parseFloat(rgbEl.getAttribute('g') ?? '0') * 255),
        b: Math.round(parseFloat(rgbEl.getAttribute('b') ?? '0') * 255),
        cmyk,
        name: el.getAttribute('name') ?? undefined,
      });
    }
  }
  return colors;
}

function extractSymbols(doc: Document): Map<number, OmapSymbol> {
  const symbols = new Map<number, OmapSymbol>();

  // First <barrier> element contains map data (second is undo history)
  const barriers = qAll(doc, 'barrier');
  if (barriers.length === 0) return symbols;
  const barrier = barriers[0]!;

  const symbolsEl = q(barrier, 'symbols');
  if (!symbolsEl) return symbols;

  for (const el of qAll(symbolsEl, 'symbol')) {
    const id = numAttr(el, 'id', -1);
    const type = numAttr(el, 'type', 0);
    const hidden = el.getAttribute('hidden') === 'true';

    let colorIndex = -1; // -1 = not set, resolved to black in SVG builder
    let lineWidth = 150; // reasonable default
    let fillColorIndex = -1;
    let fontSize = 4000;
    let dashArray: string | undefined;
    let border: { color: number; width: number; shift: number } | undefined;
    let midSymbol: OmapPointGlyph | undefined;
    let startSymbol: OmapPointGlyph | undefined;
    let endSymbol: OmapPointGlyph | undefined;
    let segmentLength: number | undefined;
    let endLength: number | undefined;
    let midSymbolsPerSpot: number | undefined;
    let midSymbolDistance: number | undefined;
    let minMidSymbolCount: number | undefined;
    let minMidSymbolCountClosed: number | undefined;
    let showAtLeastOneSymbol: boolean | undefined;
    let partIds: number[] | undefined;
    const patterns: OmapPatternDef[] = [];
    let pointGlyph: OmapPointGlyph | undefined;
    let textFontFamily: string | undefined;
    let textFontBold = false;
    let textFontItalic = false;
    let textLineSpacing = 1;

    if (type === 2) {
      // Line symbol
      const lineSym = q(el, 'line_symbol');
      if (lineSym) {
        colorIndex = numAttr(lineSym, 'color', -1);
        lineWidth = numAttr(lineSym, 'line_width', 150);
        dashArray = parseDashArray(lineSym);
        border = parseBorder(lineSym);
        // Along-line glyph slots + placement (non-dashed lines on real maps)
        midSymbol = parseSlotGlyph(lineSym, 'mid_symbol');
        startSymbol = parseSlotGlyph(lineSym, 'start_symbol');
        endSymbol = parseSlotGlyph(lineSym, 'end_symbol');
        if (midSymbol || startSymbol || endSymbol) {
          segmentLength = numAttr(lineSym, 'segment_length', 0);
          endLength = numAttr(lineSym, 'end_length', 0);
          midSymbolsPerSpot = numAttr(lineSym, 'mid_symbols_per_spot', 1);
          midSymbolDistance = numAttr(lineSym, 'mid_symbol_distance', 0);
          minMidSymbolCount = numAttr(lineSym, 'minimum_mid_symbol_count', 0);
          minMidSymbolCountClosed = numAttr(lineSym, 'minimum_mid_symbol_count_when_closed', 0);
          showAtLeastOneSymbol = lineSym.getAttribute('show_at_least_one_symbol') === 'true';
        }
      }
    } else if (type === 4) {
      // Area symbol — solid fill from inner_color, patterns from <pattern> elements
      const areaSym = q(el, 'area_symbol');
      if (areaSym) {
        colorIndex = numAttr(areaSym, 'inner_color', -1);

        // Parse pattern definitions
        for (const patEl of qAll(areaSym, 'pattern')) {
          const patType = numAttr(patEl, 'type', 0);
          if (patType === 1) {
            // Hatching: parallel lines at angle
            patterns.push({
              type: 1,
              angle: parseFloat(patEl.getAttribute('angle') ?? '0'),
              lineSpacing: numAttr(patEl, 'line_spacing', 500),
              lineOffset: numAttr(patEl, 'line_offset', 0),
              lineWidth: numAttr(patEl, 'line_width', 100),
              color: numAttr(patEl, 'color', -1),
            });
          } else if (patType === 2) {
            // Point pattern: repeating dot/glyph in grid
            // Extract the nested point symbol's inner_radius and inner_color
            const nestedPointSym = q(patEl, 'point_symbol');
            const dotColor = nestedPointSym ? numAttr(nestedPointSym, 'inner_color', -1) : -1;
            const dotRadius = nestedPointSym ? numAttr(nestedPointSym, 'inner_radius', 90) : 90;
            patterns.push({
              type: 2,
              angle: parseFloat(patEl.getAttribute('angle') ?? '0'),
              lineSpacing: numAttr(patEl, 'line_spacing', 500),
              lineOffset: numAttr(patEl, 'line_offset', 0),
              lineWidth: 0,
              color: dotColor,
              pointDistance: numAttr(patEl, 'point_distance', 500),
              dotRadius,
              offsetAlong: numAttr(patEl, 'offset_along_line', 0),
            });
          }
        }

        // If no solid fill and no patterns parsed, try pattern color as fallback
        if (colorIndex < 0 && patterns.length === 0) {
          const patternEl = q(areaSym, 'pattern');
          if (patternEl) {
            colorIndex = numAttr(patternEl, 'color', -1);
          }
        }
        if (colorIndex < 0 && patterns.length === 0) {
          colorIndex = numAttr(areaSym, 'color', -1);
        }
      }
    } else if (type === 1) {
      // Point symbol — parse full glyph definition
      const pointSym = q(el, 'point_symbol');
      if (pointSym) {
        pointGlyph = parsePointGlyph(pointSym);
        colorIndex = pointGlyph.innerColor;
        // Fall back to the first coloured element (matches prior behaviour)
        if (colorIndex < 0) {
          for (const elem of pointGlyph.elements) {
            if (elem.color >= 0) { colorIndex = elem.color; break; }
          }
        }
      }
    } else if (type === 8) {
      // Text symbol
      const textSym = q(el, 'text_symbol');
      if (textSym) {
        const textEl = q(textSym, 'text');
        if (textEl) {
          colorIndex = numAttr(textEl, 'color', -1);
          textLineSpacing = numAttr(textEl, 'line_spacing', 1);
        }
        const fontEl = q(textSym, 'font');
        if (fontEl) {
          fontSize = numAttr(fontEl, 'size', 4000);
          textFontFamily = fontEl.getAttribute('family') ?? undefined;
          textFontBold = fontEl.getAttribute('bold') === 'true';
          textFontItalic = fontEl.getAttribute('italic') === 'true';
        }
      }
    } else if (type === 16) {
      // Combined symbol — parts reference other symbols by ID
      // (<combined_symbol><part symbol="N"/>…</combined_symbol>). Referenced symbols
      // may appear anywhere in the list, so resolve colours in a second pass below.
      const combined = q(el, 'combined_symbol');
      if (combined) {
        const ids: number[] = [];
        for (const part of qAll(combined, 'part')) {
          const pid = numAttr(part, 'symbol', -1);
          if (pid >= 0) ids.push(pid);
        }
        if (ids.length > 0) partIds = ids;
      }
      if (!partIds) {
        // Legacy fallback: inline nested <symbol> children (older OOM exports)
        for (const sub of qAll(el, 'symbol')) {
          const subType = numAttr(sub, 'type', 0);
          if (subType === 2 && colorIndex < 0) {
            const lineSym = q(sub, 'line_symbol');
            if (lineSym) {
              colorIndex = numAttr(lineSym, 'color', -1);
              lineWidth = numAttr(lineSym, 'line_width', 150);
              dashArray = parseDashArray(lineSym);
              border = parseBorder(lineSym);
            }
          }
          if (subType === 4 && fillColorIndex < 0) {
            const areaSym = q(sub, 'area_symbol');
            if (areaSym) fillColorIndex = numAttr(areaSym, 'color', -1);
          }
        }
      }
    }

    symbols.set(id, {
      id, type, colorIndex, lineWidth, fillColorIndex, fontSize, hidden, patterns,
      partIds, dashArray, border,
      midSymbol, startSymbol, endSymbol,
      segmentLength, endLength, midSymbolsPerSpot, midSymbolDistance,
      minMidSymbolCount, minMidSymbolCountClosed, showAtLeastOneSymbol,
      fontFamily: textFontFamily, fontBold: textFontBold, fontItalic: textFontItalic,
      lineSpacing: textLineSpacing, pointGlyph,
    });
  }

  // Second pass: resolve combined-symbol part references now that every symbol
  // (including private helper symbols) is in the map. A combined symbol takes its
  // fill (+ patterns) from the first referenced area part and its stroke (+ dash)
  // from the first referenced line part, so the existing area/border emit works.
  for (const sym of symbols.values()) {
    if (sym.type !== 16 || !sym.partIds?.length) continue;
    for (const pid of sym.partIds) {
      const part = symbols.get(pid);
      if (!part) continue;
      if (part.type === 4 && sym.fillColorIndex < 0) {
        sym.fillColorIndex = part.colorIndex;
        if (part.patterns.length > 0 && sym.patterns.length === 0) {
          sym.patterns = part.patterns;
        }
      } else if (part.type === 2 && sym.colorIndex < 0) {
        sym.colorIndex = part.colorIndex;
        sym.lineWidth = part.lineWidth;
        sym.dashArray = part.dashArray;
        sym.border = part.border;
        sym.midSymbol = part.midSymbol;
        sym.startSymbol = part.startSymbol;
        sym.endSymbol = part.endSymbol;
        sym.segmentLength = part.segmentLength;
        sym.endLength = part.endLength;
        sym.midSymbolsPerSpot = part.midSymbolsPerSpot;
        sym.midSymbolDistance = part.midSymbolDistance;
        sym.minMidSymbolCount = part.minMidSymbolCount;
        sym.minMidSymbolCountClosed = part.minMidSymbolCountClosed;
        sym.showAtLeastOneSymbol = part.showAtLeastOneSymbol;
      } else if (part.type === 1 && sym.colorIndex < 0) {
        sym.colorIndex = part.colorIndex;
      }
    }
  }

  return symbols;
}

function extractObjects(doc: Document): OmapObject[] {
  const objects: OmapObject[] = [];

  const barriers = qAll(doc, 'barrier');
  if (barriers.length === 0) return objects;
  const barrier = barriers[0]!;

  const partsEl = q(barrier, 'parts');
  if (!partsEl) return objects;

  for (const partEl of qAll(partsEl, 'part')) {
    const objectsEl = q(partEl, 'objects');
    if (!objectsEl) continue;

    for (const objEl of qAll(objectsEl, 'object')) {
      const type = numAttr(objEl, 'type', -1);
      const symbolId = numAttr(objEl, 'symbol', -1);
      if (type < 0 || symbolId < 0) continue;

      const coordsEl = q(objEl, 'coords');
      if (!coordsEl) continue;

      const coords: OmapCoord[] = [];
      const coordEls = qAll(coordsEl, 'coord');
      if (coordEls.length > 0) {
        // Element format: <coord x="..." y="..." flags="..."/>
        for (const coordEl of coordEls) {
          coords.push({
            x: numAttr(coordEl, 'x', 0),
            y: numAttr(coordEl, 'y', 0), // OMAP and SVG both use Y-down
            flags: numAttr(coordEl, 'flags', 0),
          });
        }
      } else {
        // Inline text format: "x y [flags];x y [flags];..."
        // Used in condensed .omap files (OOM v9+)
        const text = coordsEl.textContent ?? '';
        if (text) {
          for (const segment of text.split(';')) {
            const trimmed = segment.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
              const x = Number(parts[0]);
              const y = Number(parts[1]);
              const flags = parts.length >= 3 ? (Number(parts[2]) || 0) : 0;
              if (Number.isFinite(x) && Number.isFinite(y)) {
                coords.push({ x, y, flags });
              }
            }
          }
        }
      }

      if (coords.length === 0) continue;

      let text: string | undefined;
      let hAlign: number | undefined;
      let vAlign: number | undefined;
      let rotation: number | undefined;
      if (type === 4) {
        const textEl = q(objEl, 'text');
        if (textEl) text = textEl.textContent ?? undefined;
        hAlign = numAttr(objEl, 'h_align', 0);
        vAlign = numAttr(objEl, 'v_align', 0);
      }
      if (type === 0) {
        // Point objects may have rotation (in radians)
        const rotAttr = objEl.getAttribute('rotation');
        if (rotAttr) rotation = parseFloat(rotAttr);
      }

      objects.push({ type, symbolId, coords, text, hAlign, vAlign, rotation });
    }
  }

  return objects;
}

// ---------------------------------------------------------------------------
// SVG builder (string concatenation for performance)
// ---------------------------------------------------------------------------

function colorStr(colors: Map<number, OmapColor>, index: number): string {
  if (index < 0) return 'rgb(0,0,0)'; // Unset color → black
  const c = colors.get(index);
  if (!c) return 'rgb(0,0,0)'; // Unknown color → black
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** Measure text width in pixels using an offscreen canvas context.
 *  Uses the same fallback font that the SVG data URL will use,
 *  so the measured width matches the rendered width exactly. */
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(
  text: string,
  fontFamily: string,
  fontSize: number,       // in OMAP units (1/1000mm)
  fontWeight: string,
  fontStyle: string,
  renderScale: number,    // pixels per OMAP unit
): number {
  const pixelSize = fontSize * renderScale;
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!_measureCtx) return 0;
  _measureCtx.font = `${fontStyle} ${fontWeight} ${pixelSize}px ${fontFamily}`;
  return _measureCtx.measureText(text).width;
}

function buildSvg(
  objects: OmapObject[],
  symbols: Map<number, OmapSymbol>,
  colors: Map<number, OmapColor>,
): string {
  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    for (const c of obj.coords) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }

  if (!Number.isFinite(minX)) {
    // No valid coordinates
    minX = 0; minY = 0; maxX = 1000; maxY = 1000;
  }

  // 5% padding
  const w = maxX - minX;
  const h = maxY - minY;
  const pad = Math.max(w, h) * 0.05;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = w + pad * 2;
  const vbH = h + pad * 2;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`);

  // Colour indices classified as upper inks (100% black/brown/blue — see
  // ink-classification.ts). Fragments drawn in these colours are tagged
  // data-ink="upper" so the vector PDF exporter can redraw them above the
  // lower course purple (IOF colour order, D2). Conservative: pattern fills
  // and point-glyph internals are never tagged.
  const upperInks = new Set<number>();
  for (const [idx, col] of colors) {
    if (col.cmyk && isUpperInk(col.cmyk, col.name)) upperInks.add(idx);
  }
  const inkAttr = (idx: number): string =>
    upperInks.has(idx) ? ` ${INK_ATTR}="${INK_UPPER}"` : '';

  // Generate <defs> with SVG pattern definitions for area hatching/dot fills
  const defs: string[] = [];
  for (const [symId, sym] of symbols) {
    for (let pi = 0; pi < sym.patterns.length; pi++) {
      const pat = sym.patterns[pi]!;
      const patId = `pat-${symId}-${pi}`;
      const angleDeg = (pat.angle * 180) / Math.PI;

      if (pat.type === 1) {
        // Hatching: parallel lines — tile is lineSpacing × lineSpacing, line centered
        const spacing = pat.lineSpacing;
        const lw = Math.max(pat.lineWidth, 50); // minimum visible width
        const stroke = colorStr(colors, pat.color);
        defs.push(
          `<pattern id="${patId}" patternUnits="userSpaceOnUse" `
          + `width="${spacing}" height="${spacing}" `
          + `patternTransform="rotate(${angleDeg}, 0, 0)">`
          + `<line x1="0" y1="${spacing / 2}" x2="${spacing}" y2="${spacing / 2}" `
          + `stroke="${stroke}" stroke-width="${lw}"/>`
          + `</pattern>`,
        );
      } else if (pat.type === 2) {
        // Point pattern: repeating dots in a grid
        const colSpacing = pat.pointDistance ?? pat.lineSpacing;
        const rowSpacing = pat.lineSpacing;
        const r = pat.dotRadius ?? 90;
        const fill = colorStr(colors, pat.color);
        // Staggered (brick) layout when the map offsets alternate rows — the tile
        // spans two rows: row 0 centred, row 1 shifted half a column (drawn as two
        // edge half-dots that tile into a full dot).
        const staggered = (pat.offsetAlong ?? 0) !== 0 || pat.lineOffset !== 0;
        if (staggered) {
          defs.push(
            `<pattern id="${patId}" patternUnits="userSpaceOnUse" `
            + `width="${colSpacing}" height="${rowSpacing * 2}" `
            + `patternTransform="rotate(${angleDeg}, 0, 0)">`
            + `<circle cx="${colSpacing / 2}" cy="${rowSpacing / 2}" r="${r}" fill="${fill}"/>`
            + `<circle cx="0" cy="${rowSpacing * 1.5}" r="${r}" fill="${fill}"/>`
            + `<circle cx="${colSpacing}" cy="${rowSpacing * 1.5}" r="${r}" fill="${fill}"/>`
            + `</pattern>`,
          );
        } else {
          defs.push(
            `<pattern id="${patId}" patternUnits="userSpaceOnUse" `
            + `width="${colSpacing}" height="${rowSpacing}" `
            + `patternTransform="rotate(${angleDeg}, 0, 0)">`
            + `<circle cx="${colSpacing / 2}" cy="${rowSpacing / 2}" r="${r}" fill="${fill}"/>`
            + `</pattern>`,
          );
        }
      }
    }
  }
  if (defs.length > 0) {
    parts.push('<defs>');
    parts.push(...defs);
    parts.push('</defs>');
  }

  // White background
  parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="white"/>`);

  // Render map features (areas + lines) ordered by COLOUR PRIORITY rather than a
  // fixed area→line order. OMAP colours are listed top-to-bottom (index 0 = highest
  // priority, drawn last / on top), so e.g. brown contours correctly pass beneath
  // black buildings and paths, and white knock-out colours cover what they should.
  // Points and text are drawn afterwards, always on top.
  const points: OmapObject[] = [];
  const texts: OmapObject[] = [];
  const mapFrags: { pri: number; svg: string }[] = [];
  // Lower colour index = higher priority = drawn later. Unset (-1) → near black.
  const priOf = (i: number) => (i >= 0 ? i : 4);

  for (const obj of objects) {
    const sym = symbols.get(obj.symbolId);
    if (!sym || sym.hidden) continue;

    if (obj.type === 0) { points.push(obj); continue; }
    if (obj.type === 4) { texts.push(obj); continue; }
    if (obj.type !== 1) continue;

    const isArea = sym.type === 4 || sym.fillColorIndex >= 0;
    if (isArea) {
      const d = coordsToPath(obj.coords, true);

      // Solid fill (if inner_color / combined fill is set)
      const solidColor = sym.type === 4 ? sym.colorIndex : sym.fillColorIndex;
      if (solidColor >= 0) {
        mapFrags.push({ pri: priOf(solidColor), svg: `<path d="${d}" fill="${colorStr(colors, solidColor)}" fill-rule="evenodd"${inkAttr(solidColor)}/>` });
      }

      // Pattern fill layers
      for (let pi = 0; pi < sym.patterns.length; pi++) {
        const patId = `pat-${sym.id}-${pi}`;
        mapFrags.push({ pri: priOf(sym.patterns[pi]!.color), svg: `<path d="${d}" fill="url(#${patId})" fill-rule="evenodd"/>` });
      }

      // Pattern-only symbols we couldn't fully parse: faint colour fallback
      if (solidColor < 0 && sym.patterns.length === 0 && sym.colorIndex >= 0) {
        mapFrags.push({ pri: priOf(sym.colorIndex), svg: `<path d="${d}" fill="${colorStr(colors, sym.colorIndex)}" fill-rule="evenodd" opacity="0.35"/>` });
      }

      // Combined symbols: border stroke on top of the fill (may be dashed)
      if (sym.type === 16 && sym.colorIndex >= 0 && sym.lineWidth > 0) {
        const dash = sym.dashArray ? ` stroke-dasharray="${sym.dashArray}"` : '';
        mapFrags.push({ pri: priOf(sym.colorIndex), svg: `<path d="${d}" fill="none" stroke="${colorStr(colors, sym.colorIndex)}" stroke-width="${sym.lineWidth}"${dash} stroke-linejoin="round"${inkAttr(sym.colorIndex)}/>` });
      }
    } else {
      const d = coordsToPath(obj.coords, false);
      const sw = Math.max(sym.lineWidth, 30);
      const pri = priOf(sym.colorIndex);

      // Core + border strokes — skipped for invisible helper lines (width 0),
      // but along-line glyphs below still render for glyph-only lines.
      if (sym.lineWidth > 0) {
        const dash = sym.dashArray ? ` stroke-dasharray="${sym.dashArray}"` : '';
        const cap = sym.dashArray ? 'butt' : 'round';
        // Double-line border: a wide stroke in the border colour drawn UNDER the
        // core (paint-order trick), emitted first so it stays underneath.
        if (sym.border) {
          const outer = sw + 2 * sym.border.shift + sym.border.width;
          mapFrags.push({ pri, svg: `<path d="${d}" fill="none" stroke="${colorStr(colors, sym.border.color)}" stroke-width="${outer}" stroke-linecap="round" stroke-linejoin="round"${inkAttr(sym.border.color)}/>` });
        }
        mapFrags.push({ pri, svg: `<path d="${d}" fill="none" stroke="${colorStr(colors, sym.colorIndex)}" stroke-width="${sw}"${dash} stroke-linecap="${cap}" stroke-linejoin="round"${inkAttr(sym.colorIndex)}/>` });
      }

      // Along-line glyphs: mid symbols repeated along each sub-path (walls, fences,
      // stair treads); start/end symbols at the path ends (e.g. north-line arrow).
      // Stamped at the glyph's own colour priority so black treads sort above the
      // brown stair band, etc.
      if (sym.midSymbol || sym.startSymbol || sym.endSymbol) {
        const subs = flattenCoords(obj.coords);
        if (sym.midSymbol) {
          const glyph = sym.midSymbol;
          const gpri = priOf(glyphMinColor(glyph));
          const perSpot = Math.max(1, sym.midSymbolsPerSpot ?? 1);
          const midDist = sym.midSymbolDistance ?? 0;
          for (const sp of subs) {
            for (const spotD of midSpots(sp, sym)) {
              for (let k = 0; k < perSpot; k++) {
                const at = sampleAt(sp, spotD + (k - (perSpot - 1) / 2) * midDist);
                const g = renderGlyph(glyph, colors, `translate(${at.x},${at.y}) rotate(${at.angleDeg})`);
                if (g) mapFrags.push({ pri: gpri, svg: g });
              }
            }
          }
        }
        if (sym.startSymbol && subs.length > 0) {
          const at = sampleAt(subs[0]!, 0);
          const g = renderGlyph(sym.startSymbol, colors, `translate(${at.x},${at.y}) rotate(${at.angleDeg})`);
          if (g) mapFrags.push({ pri: priOf(glyphMinColor(sym.startSymbol)), svg: g });
        }
        if (sym.endSymbol && subs.length > 0) {
          const sp = subs[subs.length - 1]!;
          const at = sampleAt(sp, sp.length);
          const g = renderGlyph(sym.endSymbol, colors, `translate(${at.x},${at.y}) rotate(${at.angleDeg})`);
          if (g) mapFrags.push({ pri: priOf(glyphMinColor(sym.endSymbol)), svg: g });
        }
      }
    }
  }

  // Draw bottom-to-top: highest priority NUMBER (lowest priority) first.
  mapFrags.sort((a, b) => b.pri - a.pri);
  for (const f of mapFrags) parts.push(f.svg);

  // Points — render using glyph definitions when available
  for (const obj of points) {
    const sym = symbols.get(obj.symbolId)!;
    const c = obj.coords[0]!;
    const glyph = sym.pointGlyph;
    // OMAP stores rotation in radians; SVG rotate() is CW in the Y-down frame, no sign flip.
    const rotDeg = obj.rotation ? (obj.rotation * 180) / Math.PI : 0;
    const transform = rotDeg !== 0
      ? `translate(${c.x},${c.y}) rotate(${rotDeg})`
      : `translate(${c.x},${c.y})`;
    const svg = glyph ? renderGlyph(glyph, colors, transform) : '';
    if (svg) {
      parts.push(svg);
    } else {
      // Fallback dot (glyphless symbol or a glyph that drew nothing)
      parts.push(`<circle cx="${c.x}" cy="${c.y}" r="80" fill="${colorStr(colors, sym.colorIndex)}"${inkAttr(sym.colorIndex)}/>`);
    }
  }

  // Compute renderScale for text measurement (same formula as the caller)
  const longestSide = Math.max(vbW, vbH);
  const svgRenderScale = longestSide > 0 ? 4000 / longestSide : 1;

  // Text
  for (const obj of texts) {
    if (!obj.text) continue;
    const sym = symbols.get(obj.symbolId)!;
    const fill = colorStr(colors, sym.colorIndex);
    const c = obj.coords[0]!;
    const escaped = obj.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Font properties from symbol
    const fontFamily = sym.fontFamily ? `'${sym.fontFamily}', sans-serif` : 'sans-serif';
    const fontWeight = sym.fontBold ? 'bold' : 'normal';
    const fontStyle = sym.fontItalic ? 'italic' : 'normal';

    // Vertical alignment
    const baseline = obj.vAlign === 2 ? 'auto' : obj.vAlign === 1 ? 'central' : 'hanging';

    const lines = escaped.split('\n').filter(l => l.trim() !== '');
    const lineHeight = sym.lineSpacing ?? 1;

    // For center/right alignment, pre-measure text and adjust X coordinate.
    // SVG text-anchor depends on the rendered font width, but data URL SVGs
    // can't access system fonts. By measuring with canvas (same fallback font)
    // and using text-anchor="start" with adjusted X, centering is exact.
    const needsAdjust = obj.hAlign === 1 || obj.hAlign === 2;

    const emitLine = (lineText: string, baseX: number): { x: number; anchor: string } => {
      if (!needsAdjust) return { x: baseX, anchor: 'start' };
      const measuredPx = measureTextWidth(lineText, fontFamily, sym.fontSize, fontWeight, fontStyle, svgRenderScale);
      const measuredUnits = measuredPx / svgRenderScale;
      if (obj.hAlign === 1) return { x: baseX - measuredUnits / 2, anchor: 'start' };
      return { x: baseX - measuredUnits, anchor: 'start' }; // right
    };

    const attrs = (anchor: string) =>
      `fill="${fill}" font-family="${fontFamily}" font-size="${sym.fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${anchor}" dominant-baseline="${baseline}"${inkAttr(sym.colorIndex)}`;

    if (lines.length <= 1) {
      const lineText = lines[0] ?? '';
      const adj = emitLine(lineText, c.x);
      parts.push(`<text x="${adj.x}" y="${c.y}" ${attrs(adj.anchor)}>${lineText}</text>`);
    } else {
      // For multi-line, adjust each line independently
      const firstAdj = emitLine(lines[0]!, c.x);
      parts.push(`<text x="${firstAdj.x}" y="${c.y}" ${attrs(firstAdj.anchor)}>`);
      for (let i = 0; i < lines.length; i++) {
        const adj = emitLine(lines[i]!, c.x);
        const dy = i === 0 ? '0' : `${lineHeight}em`;
        parts.push(`<tspan x="${adj.x}" dy="${dy}">${lines[i]}</tspan>`);
      }
      parts.push('</text>');
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** @internal Exported for testing */
export { coordsToPath as _coordsToPath, buildSvg as _buildSvg };

/**
 * Convert OMAP coordinates (with flags) to an SVG path string.
 *
 * Handles:
 * - CurveStart flag: coord[i] is on-curve start, coord[i+1]/[i+2] are bezier
 *   control points, coord[i+3] is on-curve endpoint → SVG cubic `C` command
 * - HolePoint flag: marks the LAST coord of the current sub-path. For closed
 *   paths (areas), emits `Z` to close, then `M` to start the hole sub-path.
 *   For open paths (lines), just `M` to start a new disconnected segment.
 * - ClosePoint flag: close the current sub-path with `Z`
 * - No flags: straight line `L` command
 */
function coordsToPath(coords: OmapCoord[], close: boolean): string {
  if (coords.length === 0) return '';

  let d = `M${coords[0]!.x} ${coords[0]!.y}`;
  let i = 1;

  while (i < coords.length) {
    const prev = coords[i - 1]!;

    // If the previous on-curve point has CurveStart, the next two coords are
    // bezier control points and the one after is the on-curve endpoint.
    if ((prev.flags & COORD_CURVE_START) && i + 2 <= coords.length) {
      const cp1 = coords[i]!;
      const cp2 = coords[i + 1]!;

      if (i + 2 < coords.length) {
        // Normal case: cp1, cp2, endpoint all available
        const end = coords[i + 2]!;
        d += ` C${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
        i += 3;

        // Handle flags on the endpoint
        if (end.flags & COORD_HOLE_POINT) {
          // HolePoint: end of sub-path. For areas, close with Z; for lines, just move.
          if (close) d += ' Z';
          if (i < coords.length) {
            d += ` M${coords[i]!.x} ${coords[i]!.y}`;
            i++;
          }
        } else if (end.flags & COORD_CLOSE_POINT) {
          d += ' Z';
        }
      } else {
        // Degenerate: only cp1 and cp2 remain, no endpoint — use cp2 as endpoint
        d += ` C${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${cp2.x} ${cp2.y}`;
        i += 2;
      }
    } else {
      // Straight line to current coord
      const c = coords[i]!;

      // HolePoint: this coord is the last of the current sub-path
      if (c.flags & COORD_HOLE_POINT) {
        d += ` L${c.x} ${c.y}`;
        if (close) d += ' Z';
        i++;
        // Start new sub-path at next coord
        if (i < coords.length) {
          d += ` M${coords[i]!.x} ${coords[i]!.y}`;
          i++;
        }
      } else if (c.flags & COORD_CLOSE_POINT) {
        d += ` L${c.x} ${c.y} Z`;
        i++;
      } else {
        d += ` L${c.x} ${c.y}`;
        i++;
      }
    }
  }

  // If caller wants closed path and last coord didn't already close
  if (close) {
    const last = coords[coords.length - 1]!;
    if (!(last.flags & COORD_CLOSE_POINT) && !(last.flags & COORD_HOLE_POINT)) {
      d += ' Z';
    }
  }

  return d;
}

// ---------------------------------------------------------------------------
// Along-line symbol stamping (mid/start/end glyphs)
// ---------------------------------------------------------------------------

/** A path sub-segment flattened to a polyline with cumulative arc lengths. */
interface FlatSubPath {
  pts: { x: number; y: number }[];
  cum: number[]; // cum[0] = 0, cum[k] = length up to pts[k]
  length: number;
  closed: boolean;
}

/** Flatten one cubic bezier to points (endpoint inclusive), appending via push. */
function flattenCubic(
  p0: { x: number; y: number },
  c1: OmapCoord, c2: OmapCoord, p1: OmapCoord,
  push: (x: number, y: number) => void,
): void {
  const approx =
    Math.hypot(c1.x - p0.x, c1.y - p0.y) +
    Math.hypot(c2.x - c1.x, c2.y - c1.y) +
    Math.hypot(p1.x - c2.x, p1.y - c2.y);
  const n = Math.min(24, Math.max(4, Math.ceil(approx / 300)));
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    const mt = 1 - t;
    const x = mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x;
    const y = mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y;
    push(x, y);
  }
}

/**
 * Flatten OMAP coords (straight + bezier segments, with hole/close flags) into
 * one or more polyline sub-paths with cumulative arc length. Mirrors the
 * `coordsToPath` state machine so stamp positions line up with the drawn stroke.
 * @internal
 */
function flattenCoords(coords: OmapCoord[]): FlatSubPath[] {
  const subs: FlatSubPath[] = [];
  if (coords.length === 0) return subs;

  let pts: { x: number; y: number }[] = [{ x: coords[0]!.x, y: coords[0]!.y }];
  let closed = false;
  const pushPt = (x: number, y: number) => {
    const last = pts[pts.length - 1]!;
    if (Math.hypot(x - last.x, y - last.y) > 1e-6) pts.push({ x, y });
  };
  const flush = () => {
    if (pts.length >= 2) {
      const cum = [0];
      let len = 0;
      for (let k = 1; k < pts.length; k++) {
        len += Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y);
        cum.push(len);
      }
      subs.push({ pts, cum, length: len, closed });
    }
    pts = [];
    closed = false;
  };
  const startNext = (idx: number): number => {
    if (idx < coords.length) { pts = [{ x: coords[idx]!.x, y: coords[idx]!.y }]; return idx + 1; }
    pts = [];
    return idx;
  };

  let i = 1;
  while (i < coords.length) {
    const prev = coords[i - 1]!;
    if ((prev.flags & COORD_CURVE_START) && i + 2 <= coords.length) {
      const cp1 = coords[i]!;
      const cp2 = coords[i + 1]!;
      const p0 = pts[pts.length - 1]!;
      if (i + 2 < coords.length) {
        const end = coords[i + 2]!;
        flattenCubic(p0, cp1, cp2, end, pushPt);
        i += 3;
        if (end.flags & COORD_HOLE_POINT) {
          if (end.flags & COORD_CLOSE_POINT) closed = true;
          flush();
          i = startNext(i);
        } else if (end.flags & COORD_CLOSE_POINT) {
          closed = true;
          flush();
          i = startNext(i);
        }
      } else {
        flattenCubic(p0, cp1, cp2, cp2, pushPt);
        i += 2;
      }
    } else {
      const c = coords[i]!;
      if (c.flags & COORD_HOLE_POINT) {
        pushPt(c.x, c.y);
        flush();
        i = startNext(i + 1);
      } else if (c.flags & COORD_CLOSE_POINT) {
        pushPt(c.x, c.y);
        closed = true;
        flush();
        i = startNext(i + 1);
      } else {
        pushPt(c.x, c.y);
        i++;
      }
    }
  }
  flush();
  return subs;
}

/** Position + tangent angle (deg, CW in Y-down) at arc length `d` along a sub-path. @internal */
function sampleAt(sp: FlatSubPath, d: number): { x: number; y: number; angleDeg: number } {
  const dd = Math.max(0, Math.min(d, sp.length));
  let i = 0;
  while (i < sp.cum.length - 2 && sp.cum[i + 1]! < dd) i++;
  const a = sp.pts[i]!;
  const b = sp.pts[i + 1]!;
  const segLen = sp.cum[i + 1]! - sp.cum[i]!;
  const t = segLen > 1e-9 ? (dd - sp.cum[i]!) / segLen : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

/**
 * Arc-length positions for mid-symbol spots along one sub-path, matching OOM's
 * even-spacing-with-end-margins behaviour (approximation; exact for non-dashed
 * lines). @internal
 */
function midSpots(sp: FlatSubPath, sym: OmapSymbol): number[] {
  const L = sp.length;
  if (L <= 0) return [];
  const s = sym.segmentLength && sym.segmentLength > 0 ? sym.segmentLength : L;
  const e = sym.endLength ?? 0;

  if (sp.closed) {
    const n = Math.max(Math.round(L / s), Math.max(1, sym.minMidSymbolCountClosed ?? 0));
    return Array.from({ length: n }, (_, i) => (i * L) / n);
  }

  const usable = L - 2 * e;
  if (usable <= 0) return sym.showAtLeastOneSymbol ? [L / 2] : [];

  const minCount = sym.minMidSymbolCount ?? 0;
  const n = Math.max(Math.round(usable / s), Math.max(1, minCount - 1));
  const spacing = usable / n;
  return Array.from({ length: n + 1 }, (_, i) => e + i * spacing);
}

/** Lowest colour index used by a glyph's drawable parts (its draw priority). */
function glyphMinColor(glyph: OmapPointGlyph): number {
  let m = -1;
  const consider = (ci: number) => { if (ci >= 0 && (m < 0 || ci < m)) m = ci; };
  consider(glyph.innerColor);
  consider(glyph.outerColor);
  for (const elem of glyph.elements) consider(elem.color);
  return m;
}

/**
 * Render a point glyph (inner/outer dot + sub-element shapes) at the origin,
 * wrapped in the given transform. Returns '' when nothing is drawable. Shared by
 * point objects and along-line stamps.
 */
function renderGlyph(glyph: OmapPointGlyph, colors: Map<number, OmapColor>, transform: string): string {
  const inner: string[] = [];
  if (glyph.elements.length > 0) {
    for (const elem of glyph.elements) {
      const elemFill = colorStr(colors, elem.color);
      if (elem.symType === 1 && elem.objType === 0 && elem.coords.length > 0) {
        const ep = elem.coords[0]!;
        if (glyph.innerRadius > 0 && glyph.innerColor >= 0) {
          inner.push(`<circle cx="${ep.x}" cy="${ep.y}" r="${glyph.innerRadius}" fill="${colorStr(colors, glyph.innerColor)}"/>`);
        }
        if (elem.lineWidth > 0) {
          inner.push(`<circle cx="${ep.x}" cy="${ep.y}" r="${glyph.innerRadius || 360}" fill="none" stroke="${elemFill}" stroke-width="${elem.lineWidth}"/>`);
        }
      } else if (elem.symType === 2 && elem.coords.length >= 2) {
        const d = coordsToPath(elem.coords, false);
        const sw = Math.max(elem.lineWidth, 50);
        inner.push(`<path d="${d}" fill="none" stroke="${elemFill}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else if (elem.symType === 4 && elem.coords.length >= 3) {
        const d = coordsToPath(elem.coords, true);
        inner.push(`<path d="${d}" fill="${elemFill}" fill-rule="evenodd"/>`);
      }
    }
  } else {
    if (glyph.innerColor >= 0 && glyph.innerRadius > 0) {
      inner.push(`<circle cx="0" cy="0" r="${glyph.innerRadius}" fill="${colorStr(colors, glyph.innerColor)}"/>`);
    }
    if (glyph.outerColor >= 0 && glyph.outerWidth > 0) {
      inner.push(`<circle cx="0" cy="0" r="${glyph.innerRadius}" fill="none" stroke="${colorStr(colors, glyph.outerColor)}" stroke-width="${glyph.outerWidth}"/>`);
    }
  }
  if (inner.length === 0) return '';
  return `<g transform="${transform}">${inner.join('')}</g>`;
}

/** @internal Exported for testing */
export { flattenCoords as _flattenCoords, sampleAt as _sampleAt, extractGeoRef as _extractGeoRef };

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/** Raw parse result of an OMAP/XMAP XML document (before SVG building). */
export interface ParsedOmap {
  doc: Document;
  scale: number | null;
  colors: Map<number, OmapColor>;
  symbols: Map<number, OmapSymbol>;
  objects: OmapObject[];
}

/**
 * Parse OMAP/XMAP XML text into raw colour/symbol/object structures.
 *
 * This is the pure parsing entry used by {@link loadOmapMap}; it is exported so
 * the .omap course exporter (export-omap.ts) can round-trip its output through
 * the real parsing path in tests.
 */
export function parseOmapXml(xmlString: string): ParsedOmap {
  // Reject legacy binary format (OOM v0.8 and older)
  if (xmlString.startsWith('OMAP')) {
    throw new Error(
      'Unsupported legacy OpenOrienteering Mapper format. '
      + 'Please open this file in OpenOrienteering Mapper v0.8 and re-save as the current format.',
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`Failed to parse .omap/.xmap file: ${parseError.textContent?.slice(0, 200)}`);
  }

  return {
    doc,
    scale: extractScale(doc),
    colors: extractColors(doc),
    symbols: extractSymbols(doc),
    objects: extractObjects(doc),
  };
}

export async function loadOmapMap(file: File): Promise<LoadOmapResult> {
  const xmlString = await file.text();

  const { doc, scale, colors, symbols, objects } = parseOmapXml(xmlString);

  if (objects.length === 0) {
    throw new Error('No map objects found in the .omap/.xmap file.');
  }

  // Build SVG
  const svgString = buildSvg(objects, symbols, colors);

  // Compute rasterization dimensions from SVG viewBox (capture all 4 values)
  const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
  let vbMinX = 0, vbMinY = 0, svgWidth = 1000, svgHeight = 1000;
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]!.split(/\s+/);
    vbMinX = parseFloat(parts[0]!);
    vbMinY = parseFloat(parts[1]!);
    svgWidth = parseFloat(parts[2]!);
    svgHeight = parseFloat(parts[3]!);
  }

  const longestSide = Math.max(svgWidth, svgHeight);
  const renderScale = longestSide > 0 ? BASE_RASTER_LONG_SIDE / longestSide : 1;
  const pixelWidth = Math.round(svgWidth * renderScale);
  const pixelHeight = Math.round(svgHeight * renderScale);

  // Base render via Blob URL (avoids Safari's ~2MB data-URL limit). The SVG string
  // has a viewBox but no width/height, so the adaptive renderer can re-rasterize it
  // at higher resolution when the user zooms in.
  const image = await rasterizeSvgToImage(svgString, pixelWidth, pixelHeight, 'blob');

  // Compute DPI: viewBox is in 1/1000mm → convert to mm → compute DPI
  const svgWidthMm = svgWidth / 1000;
  const dpi = svgWidthMm > 0 ? (pixelWidth * 25.4) / svgWidthMm : 150;

  // Extract georeferencing from OMAP XML
  const georef = extractGeoRef(doc, scale, renderScale, vbMinX, vbMinY, svgHeight);

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    scale,
    dpi,
    georef,
    viewBox: { x: vbMinX, y: vbMinY, width: svgWidth, height: svgHeight },
    renderScale,
    svg: svgString,
  };
}
