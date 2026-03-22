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

interface OmapColor {
  r: number; // 0–255
  g: number;
  b: number;
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
}

interface OmapSymbol {
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

interface OmapCoord {
  x: number;
  y: number;
  /** Coordinate flags bitmask (CurveStart=1, ClosePoint=2, HolePoint=16, etc.) */
  flags: number;
}

interface OmapObject {
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

interface LoadOmapResult {
  image: HTMLImageElement;
  width: number;
  height: number;
  scale: number | null;
  dpi: number;
  georef: GeoReference | null;
  viewBox: { x: number; y: number; width: number; height: number };
  renderScale: number;
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
      // Values are floats 0.0–1.0, convert to 0–255
      colors.set(i, {
        r: Math.round(parseFloat(rgbEl.getAttribute('r') ?? '0') * 255),
        g: Math.round(parseFloat(rgbEl.getAttribute('g') ?? '0') * 255),
        b: Math.round(parseFloat(rgbEl.getAttribute('b') ?? '0') * 255),
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
        const innerRadius = numAttr(pointSym, 'inner_radius', 0);
        const innerColor = numAttr(pointSym, 'inner_color', -1);
        const outerWidth = numAttr(pointSym, 'outer_width', 0);
        const outerColor = numAttr(pointSym, 'outer_color', -1);
        colorIndex = innerColor;

        // Parse glyph elements
        const glyphElements: OmapGlyphElement[] = [];
        for (const elemEl of qAll(pointSym, 'element')) {
          const subSymEl = q(elemEl, 'symbol');
          if (!subSymEl) continue;
          const subType = numAttr(subSymEl, 'type', 0);

          // Extract color and lineWidth from sub-symbol
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
            // Nested point sub-symbol
            const ps = q(subSymEl, 'point_symbol');
            if (ps) {
              elemColor = numAttr(ps, 'inner_color', -1);
              if (elemColor < 0) elemColor = numAttr(ps, 'outer_color', -1);
              elemLineWidth = numAttr(ps, 'outer_width', 0);
            }
          }

          // Extract element's object coords
          const objEl = q(elemEl, 'object');
          if (!objEl) continue;
          const objType = numAttr(objEl, 'type', 0);
          const coordsEl = q(objEl, 'coords');
          const elemCoords: OmapCoord[] = [];
          if (coordsEl) {
            const coordText = coordsEl.textContent ?? '';
            for (const seg of coordText.split(';')) {
              const trimmed = seg.trim();
              if (!trimmed) continue;
              const p = trimmed.split(/\s+/);
              if (p.length >= 2) {
                const ex = Number(p[0]);
                const ey = Number(p[1]);
                const ef = p.length >= 3 ? (Number(p[2]) || 0) : 0;
                if (Number.isFinite(ex) && Number.isFinite(ey)) {
                  elemCoords.push({ x: ex, y: ey, flags: ef });
                }
              }
            }
          }

          glyphElements.push({
            symType: subType,
            color: elemColor,
            lineWidth: elemLineWidth,
            coords: elemCoords,
            objType,
          });

          // Use first element's color as fallback for the symbol's colorIndex
          if (colorIndex < 0 && elemColor >= 0) colorIndex = elemColor;
        }

        // Store the full glyph definition (even for simple dots — innerRadius > 0)
        pointGlyph = {
          innerRadius,
          innerColor,
          outerWidth,
          outerColor,
          elements: glyphElements,
        };
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
      // Combined symbol — extract first line and first area sub-symbol
      for (const sub of qAll(el, 'symbol')) {
        const subType = numAttr(sub, 'type', 0);
        if (subType === 2 && colorIndex < 0) {
          const lineSym = q(sub, 'line_symbol');
          if (lineSym) {
            colorIndex = numAttr(lineSym, 'color', -1);
            lineWidth = numAttr(lineSym, 'line_width', 150);
          }
        }
        if (subType === 4 && fillColorIndex < 0) {
          const areaSym = q(sub, 'area_symbol');
          if (areaSym) fillColorIndex = numAttr(areaSym, 'color', -1);
        }
      }
    }

    symbols.set(id, {
      id, type, colorIndex, lineWidth, fillColorIndex, fontSize, hidden, patterns,
      fontFamily: textFontFamily, fontBold: textFontBold, fontItalic: textFontItalic,
      lineSpacing: textLineSpacing, pointGlyph,
    });
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
  if (defs.length > 0) {
    parts.push('<defs>');
    parts.push(...defs);
    parts.push('</defs>');
  }

  // White background
  parts.push(`<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="white"/>`);

  // Render objects — areas first (back), then lines, then points, then text (front)
  const areas: OmapObject[] = [];
  const lines: OmapObject[] = [];
  const points: OmapObject[] = [];
  const texts: OmapObject[] = [];

  for (const obj of objects) {
    const sym = symbols.get(obj.symbolId);
    if (!sym || sym.hidden) continue;

    if (obj.type === 0) points.push(obj);
    else if (obj.type === 4) texts.push(obj);
    else if (obj.type === 1) {
      // Distinguish line vs area by symbol type
      if (sym.type === 4 || sym.fillColorIndex >= 0) areas.push(obj);
      else lines.push(obj);
    }
  }

  // Areas
  for (const obj of areas) {
    const sym = symbols.get(obj.symbolId)!;
    const d = coordsToPath(obj.coords, true);

    // Solid fill (if inner_color is set)
    const solidColor = sym.type === 4 ? sym.colorIndex : sym.fillColorIndex;
    if (solidColor >= 0) {
      parts.push(`<path d="${d}" fill="${colorStr(colors, solidColor)}" fill-rule="evenodd"/>`);
    }

    // Pattern fill layers
    for (let pi = 0; pi < sym.patterns.length; pi++) {
      const patId = `pat-${sym.id}-${pi}`;
      parts.push(`<path d="${d}" fill="url(#${patId})" fill-rule="evenodd"/>`);
    }

    // If no solid fill and no patterns, use colorIndex as fallback (pattern-only symbols
    // that we couldn't parse fall through here)
    if (solidColor < 0 && sym.patterns.length === 0 && sym.colorIndex >= 0) {
      parts.push(`<path d="${d}" fill="${colorStr(colors, sym.colorIndex)}" fill-rule="evenodd" opacity="0.35"/>`);
    }

    // Combined symbols: render border as separate path on top
    if (sym.type === 16 && sym.colorIndex >= 0 && sym.lineWidth > 0) {
      parts.push(`<path d="${d}" fill="none" stroke="${colorStr(colors, sym.colorIndex)}" stroke-width="${sym.lineWidth}" stroke-linejoin="round"/>`);
    }
  }

  // Lines
  for (const obj of lines) {
    const sym = symbols.get(obj.symbolId)!;
    const stroke = colorStr(colors, sym.colorIndex);
    const sw = Math.max(sym.lineWidth, 50); // minimum visible width
    const d = coordsToPath(obj.coords, false);
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Points — render using glyph definitions when available
  for (const obj of points) {
    const sym = symbols.get(obj.symbolId)!;
    const c = obj.coords[0]!;
    const glyph = sym.pointGlyph;

    if (!glyph) {
      // Fallback for symbols without glyph data
      const fill = colorStr(colors, sym.colorIndex);
      parts.push(`<circle cx="${c.x}" cy="${c.y}" r="80" fill="${fill}"/>`);
      continue;
    }

    // Build rotation transform (OMAP stores rotation in radians)
    const rotDeg = obj.rotation ? (obj.rotation * 180) / Math.PI : 0;
    const transform = rotDeg !== 0
      ? `translate(${c.x},${c.y}) rotate(${rotDeg})`
      : `translate(${c.x},${c.y})`;

    if (glyph.elements.length > 0) {
      // Complex glyph: render sub-elements in a translated group
      parts.push(`<g transform="${transform}">`);
      for (const elem of glyph.elements) {
        const elemFill = colorStr(colors, elem.color);
        if (elem.symType === 1 && elem.objType === 0 && elem.coords.length > 0) {
          // Nested point sub-symbol (e.g., ring) at relative position
          const ep = elem.coords[0]!;
          if (glyph.innerRadius > 0 && glyph.innerColor >= 0) {
            parts.push(`<circle cx="${ep.x}" cy="${ep.y}" r="${glyph.innerRadius}" fill="${colorStr(colors, glyph.innerColor)}"/>`);
          }
          if (elem.lineWidth > 0) {
            parts.push(`<circle cx="${ep.x}" cy="${ep.y}" r="${glyph.innerRadius || 360}" fill="none" stroke="${elemFill}" stroke-width="${elem.lineWidth}"/>`);
          }
        } else if (elem.symType === 2 && elem.coords.length >= 2) {
          // Line sub-symbol: render as path
          const d = coordsToPath(elem.coords, false);
          const sw = Math.max(elem.lineWidth, 50);
          parts.push(`<path d="${d}" fill="none" stroke="${elemFill}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
        } else if (elem.symType === 4 && elem.coords.length >= 3) {
          // Area sub-symbol: render as filled path
          const d = coordsToPath(elem.coords, true);
          parts.push(`<path d="${d}" fill="${elemFill}" fill-rule="evenodd"/>`);
        }
      }
      parts.push('</g>');
    } else {
      // Simple point: dot or ring based on inner/outer properties
      if (glyph.innerColor >= 0 && glyph.innerRadius > 0) {
        // Filled dot
        parts.push(`<circle cx="${c.x}" cy="${c.y}" r="${glyph.innerRadius}" fill="${colorStr(colors, glyph.innerColor)}"/>`);
      }
      if (glyph.outerColor >= 0 && glyph.outerWidth > 0) {
        // Ring (circle outline)
        parts.push(`<circle cx="${c.x}" cy="${c.y}" r="${glyph.innerRadius}" fill="none" stroke="${colorStr(colors, glyph.outerColor)}" stroke-width="${glyph.outerWidth}"/>`);
      }
      // If neither inner nor outer, fallback
      if (glyph.innerColor < 0 && glyph.outerColor < 0) {
        const fill = colorStr(colors, sym.colorIndex);
        parts.push(`<circle cx="${c.x}" cy="${c.y}" r="80" fill="${fill}"/>`);
      }
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
      `fill="${fill}" font-family="${fontFamily}" font-size="${sym.fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${anchor}" dominant-baseline="${baseline}"`;

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
export { coordsToPath as _coordsToPath };

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
// Main loader
// ---------------------------------------------------------------------------

const TARGET_LONG_SIDE = 4000;

export async function loadOmapMap(file: File): Promise<LoadOmapResult> {
  const xmlString = await file.text();

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

  // Extract data
  const scale = extractScale(doc);
  const colors = extractColors(doc);
  const symbols = extractSymbols(doc);
  const objects = extractObjects(doc);

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
  const renderScale = longestSide > 0 ? TARGET_LONG_SIDE / longestSide : 1;
  const pixelWidth = Math.round(svgWidth * renderScale);
  const pixelHeight = Math.round(svgHeight * renderScale);

  // Inject explicit pixel dimensions into SVG
  const sizedSvg = svgString.replace(
    '<svg ',
    `<svg width="${pixelWidth}" height="${pixelHeight}" `,
  );

  // Rasterize via Blob URL (avoids Safari's ~2MB data URL limit for <img>)
  const blob = new Blob([sizedSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to render .omap SVG: ${file.name}`)); };
    img.src = url;
  });

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
  };
}
