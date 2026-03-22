/**
 * OpenOrienteering Mapper (.omap / .xmap) loader.
 *
 * Both formats are plain XML (same schema). .omap uses condensed single-line
 * formatting; .xmap uses pretty-printed indentation.
 *
 * Approach: parse XML → extract colors, symbols, objects → build SVG string
 * → rasterize to HTMLImageElement. Rendering is simplified (solid fills/strokes
 * with correct colors) — not full ISOM symbol rendering. Good enough for
 * course setting.
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
  /** Area uses pattern fill (no solid inner_color) — render semi-transparent */
  patternFill: boolean;
  /** Text symbol: font family name (e.g., "Arial", "Calibri") */
  fontFamily?: string;
  /** Text symbol: bold flag */
  fontBold?: boolean;
  /** Text symbol: italic flag */
  fontItalic?: boolean;
  /** Text symbol: line spacing multiplier (e.g., 1.0) */
  lineSpacing?: number;
}

interface OmapCoord {
  x: number;
  y: number;
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
    let patternFill = false;
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
      // Area symbol — uses inner_color for solid fill.
      // Pattern-only symbols (inner_color=-1) use <pattern color="N"> for hatching;
      // we use the pattern's line color as a semi-transparent fill approximation.
      const areaSym = q(el, 'area_symbol');
      if (areaSym) {
        colorIndex = numAttr(areaSym, 'inner_color', -1);
        if (colorIndex < 0) {
          // Try pattern color as fallback — render semi-transparent
          const patternEl = q(areaSym, 'pattern');
          if (patternEl) {
            colorIndex = numAttr(patternEl, 'color', -1);
            patternFill = true;
          }
        }
        if (colorIndex < 0) colorIndex = numAttr(areaSym, 'color', -1);
      }
    } else if (type === 1) {
      // Point symbol — inner_color may be -1, check element sub-symbols for color
      const pointSym = q(el, 'point_symbol');
      if (pointSym) {
        colorIndex = numAttr(pointSym, 'inner_color', -1);
        // If inner_color is -1, find color from first element's sub-symbol
        if (colorIndex < 0) {
          for (const elemSym of qAll(el, 'line_symbol')) {
            const c = numAttr(elemSym, 'color', -1);
            if (c >= 0) { colorIndex = c; break; }
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
      id, type, colorIndex, lineWidth, fillColorIndex, fontSize, hidden, patternFill,
      fontFamily: textFontFamily, fontBold: textFontBold, fontItalic: textFontItalic,
      lineSpacing: textLineSpacing,
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
        // Element format: <coord x="..." y="..."/>
        for (const coordEl of coordEls) {
          coords.push({
            x: numAttr(coordEl, 'x', 0),
            y: numAttr(coordEl, 'y', 0), // OMAP and SVG both use Y-down
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
              if (Number.isFinite(x) && Number.isFinite(y)) {
                coords.push({ x, y }); // OMAP and SVG both use Y-down
              }
            }
          }
        }
      }

      if (coords.length === 0) continue;

      let text: string | undefined;
      let hAlign: number | undefined;
      let vAlign: number | undefined;
      if (type === 4) {
        const textEl = q(objEl, 'text');
        if (textEl) text = textEl.textContent ?? undefined;
        hAlign = numAttr(objEl, 'h_align', 0);
        vAlign = numAttr(objEl, 'v_align', 0);
      }

      objects.push({ type, symbolId, coords, text, hAlign, vAlign });
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
    const fill = colorStr(colors, sym.type === 4 ? sym.colorIndex : sym.fillColorIndex);
    const d = coordsToPath(obj.coords, true);
    const opacity = sym.patternFill ? ' opacity="0.35"' : '';
    const stroke = sym.type === 16 ? ` stroke="${colorStr(colors, sym.colorIndex)}" stroke-width="${sym.lineWidth}"` : '';
    parts.push(`<path d="${d}" fill="${fill}"${opacity}${stroke}/>`);
  }

  // Lines
  for (const obj of lines) {
    const sym = symbols.get(obj.symbolId)!;
    const stroke = colorStr(colors, sym.colorIndex);
    const sw = Math.max(sym.lineWidth, 50); // minimum visible width
    const d = coordsToPath(obj.coords, false);
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Points
  for (const obj of points) {
    const sym = symbols.get(obj.symbolId)!;
    const fill = colorStr(colors, sym.colorIndex);
    const c = obj.coords[0]!;
    parts.push(`<circle cx="${c.x}" cy="${c.y}" r="80" fill="${fill}"/>`);
  }

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

    // Alignment from object
    const anchor = obj.hAlign === 1 ? 'middle' : obj.hAlign === 2 ? 'end' : 'start';
    const baseline = obj.vAlign === 2 ? 'auto' : obj.vAlign === 1 ? 'central' : 'hanging';

    const lines = escaped.split('\n').filter(l => l.trim() !== '');
    const lineHeight = sym.lineSpacing ?? 1;
    const attrs = `fill="${fill}" font-family="${fontFamily}" font-size="${sym.fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${anchor}" dominant-baseline="${baseline}"`;

    if (lines.length <= 1) {
      parts.push(`<text x="${c.x}" y="${c.y}" ${attrs}>${lines[0] ?? ''}</text>`);
    } else {
      parts.push(`<text x="${c.x}" y="${c.y}" ${attrs}>`);
      for (let i = 0; i < lines.length; i++) {
        const dy = i === 0 ? '0' : `${lineHeight}em`;
        parts.push(`<tspan x="${c.x}" dy="${dy}">${lines[i]}</tspan>`);
      }
      parts.push('</text>');
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function coordsToPath(coords: OmapCoord[], close: boolean): string {
  if (coords.length === 0) return '';
  let d = `M${coords[0]!.x} ${coords[0]!.y}`;
  for (let i = 1; i < coords.length; i++) {
    d += ` L${coords[i]!.x} ${coords[i]!.y}`;
  }
  if (close) d += ' Z';
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

  // Rasterize via data URL (same approach as OCAD loader)
  const svgBase64 = btoa(unescape(encodeURIComponent(sizedSvg)));
  const url = `data:image/svg+xml;base64,${svgBase64}`;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to render .omap SVG: ${file.name}`));
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
