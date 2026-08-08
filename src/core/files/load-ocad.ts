// ocad2geojson uses Node.js Buffer internally — polyfill for browser
import { Buffer } from 'buffer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = Buffer;
}

import type { GeoReference } from '@/core/models/types';
import { BASE_RASTER_LONG_SIDE } from './raster-config';
import { rasterizeSvgToImage } from './rasterize-svg';
import { INK_ATTR, INK_UPPER, isUpperInk, type CmykFractions } from './ink-classification';

interface LoadOcadResult {
  image: HTMLImageElement;
  width: number;
  height: number;
  scale: number | null; // Map scale extracted from OCAD metadata
  dpi: number;          // Effective DPI of the rendered image
  arrayBuffer: ArrayBuffer;
  georef: GeoReference | null;
  viewBox: { x: number; y: number; width: number; height: number };
  renderScale: number;
  /** Sized-less SVG string (viewBox only) for adaptive re-rasterization on zoom. */
  svg: string;
}

export async function loadOcadMap(file: File): Promise<LoadOcadResult> {
  // Lazy import to avoid loading ocad2geojson at module evaluation
  const ocad2geojson = await import('ocad2geojson');

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ocadFile = await ocad2geojson.readOcad(buffer);

  // Generate SVG from OCAD data
  const svgResult = ocad2geojson.ocadToSvg(ocadFile, {});

  // ocadToSvg can return Text | SVGElement — we need the SVGElement
  if (!(svgResult instanceof SVGElement)) {
    throw new Error('OCAD SVG rendering failed: unexpected output type');
  }

  const svgEl = svgResult;

  // Parse viewBox to get OCAD coordinate dimensions (all 4 values)
  const viewBox = svgEl.getAttribute('viewBox')?.split(/[\s,]+/);
  let svgMinX = 0;
  let svgMinY = 0;
  let svgWidth = 0;
  let svgHeight = 0;

  if (viewBox && viewBox.length === 4) {
    svgMinX = parseFloat(viewBox[0]!);
    svgMinY = parseFloat(viewBox[1]!);
    svgWidth = parseFloat(viewBox[2]!);
    svgHeight = parseFloat(viewBox[3]!);
  }

  // OCAD coordinates are in 1/100mm — these can be huge numbers.
  // Scale to a reasonable pixel size for the base render (longest side ~4000px);
  // the adaptive re-rasterizer produces sharper bitmaps on zoom from the same SVG.
  const longestSide = Math.max(svgWidth, svgHeight);
  const renderScale = longestSide > 0 ? BASE_RASTER_LONG_SIDE / longestSide : 1;
  const pixelWidth = Math.round(svgWidth * renderScale);
  const pixelHeight = Math.round(svgHeight * renderScale);

  // Inject rectangle symbol objects as SVG polygons.
  // ocad2geojson ignores rectangle symbols entirely (RectangleSymbolType = 7),
  // so we render them as filled polygons. Note: rectangle SYMBOL DEFINITIONS
  // (which may contain title text, logos, borders) are not available — only
  // the bounding box and fill color are rendered.
  injectRectangleObjects(svgEl, ocadFile);

  // Tag elements painted in 100% black/brown/blue so the vector PDF exporter
  // can redraw them above the lower course purple (IOF colour order, D2).
  tagUpperInkElements(svgEl, ocadFile);

  // Fix text rendering:
  // SVG loaded via <img> or data URL cannot resolve system fonts.
  // Replace specific font-family declarations with generic fallbacks so
  // text elements are visible (correct position/size, slightly different face).
  // The serialized SVG carries a viewBox but no width/height, so the same string
  // can be re-rasterized at any resolution by the adaptive renderer.
  let svgStr = new XMLSerializer().serializeToString(svgEl);
  svgStr = svgStr.replace(/font-family="[^"]*"/g, 'font-family="sans-serif"');

  // Base render — data URL gives better SVG text rendering than blob URL.
  const image = await rasterizeSvgToImage(svgStr, pixelWidth, pixelHeight, 'data-url');

  // Extract map scale from OCAD parameter strings
  const scale = extractMapScale(ocadFile);

  // Compute effective DPI of the rendered image.
  // OCAD viewBox is in 1/100mm. We scaled to pixelWidth pixels.
  // DPI = pixels / inches = pixels / (mm / 25.4) = pixels * 25.4 / mm
  const svgWidthMm = svgWidth / 100;  // Convert 1/100mm to mm
  const dpi = svgWidthMm > 0 ? (pixelWidth * 25.4) / svgWidthMm : 150;

  // Extract georeferencing from OCAD CRS metadata
  const georef = extractGeoRef(ocadFile, scale, renderScale, svgMinX, svgMinY, svgHeight);

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    scale,
    dpi,
    arrayBuffer,
    georef,
    viewBox: { x: svgMinX, y: svgMinY, width: svgWidth, height: svgHeight },
    renderScale,
    svg: svgStr,
  };
}

// OCAD rectangle object type constant (matches ocad2geojson object-types.js)
const RECTANGLE_OBJECT_TYPE = 7;

/**
 * Inject rectangle symbol objects (objType 7) into the SVG element as polygons.
 *
 * ocad2geojson skips rectangle symbols during SVG generation. These objects
 * define layout boxes (borders, colored backgrounds). We render them as
 * filled polygons using their 4 corner coordinates and color index.
 *
 * Note: the SYMBOL DEFINITION for rectangle symbols (which in OCAD can contain
 * text, images, and complex rendering) is not parsed by ocad2geojson. We can
 * only render the fill/border — embedded content like map titles, logos, and
 * branding text within rectangle symbols will not appear.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectRectangleObjects(svgEl: SVGElement, ocadFile: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rectObjects: any[] = (ocadFile.objects as any[]).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any) => o.objType === RECTANGLE_OBJECT_TYPE
  );

  if (rectObjects.length === 0) return;

  const svgNS = 'http://www.w3.org/2000/svg';
  // Append into the same <g> that ocadToSvg uses (which has the coordinate transform)
  const targetGroup = svgEl.querySelector('g') ?? svgEl;

  for (const obj of rectObjects) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coords: any[] = obj.coordinates;
    if (!coords || coords.length < 3) continue;

    const color = ocadFile.colors[obj.col];
    const strokeRgb: string = color?.rgb ?? 'none';

    // Coordinates are in OCAD space. The <g> group already has a transform
    // (translate + Y-negate) applied by ocadToSvg, so we use raw OCAD coords
    // with negated Y (same convention as other elements in the group).
    const points = coords
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => `${c[0]},${-c[1]}`)
      .join(' ');

    // Render as stroke-only (border) — OCAD rectangle symbols are frames,
    // not filled areas. Filling them covers the map content underneath.
    const polygon = document.createElementNS(svgNS, 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', strokeRgb);
    polygon.setAttribute('stroke-width', '30');

    targetGroup.appendChild(polygon);
  }
}

/** Resolve a paint property on an OCAD SVG element: inline `style` first
 *  (ocad2geojson packs paint there), then the presentation attribute. */
function ocadPaintProp(el: Element, name: string): string | undefined {
  const style = el.getAttribute('style');
  if (style) {
    for (const decl of style.split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      if (decl.slice(0, idx).trim() === name) {
        const v = decl.slice(idx + 1).trim();
        if (v !== '') return v;
      }
    }
  }
  const attr = el.getAttribute(name);
  return attr !== null && attr !== '' ? attr : undefined;
}

const OCAD_TAGGABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'text']);

/**
 * Tag SVG elements whose paint is a 100% black/brown/blue map ink with
 * `data-ink="upper"` (see ink-classification.ts). The vector PDF exporter
 * re-renders exactly those elements ABOVE the lower course purple so the
 * printed stack follows the IOF colour order (ISOM App. 1 §5).
 *
 * ocad2geojson colours carry `cmyk` (0–100 per component) + `name`; we build
 * an `rgb(r, g, b)` → upper lookup from that table, then walk the tree with
 * fill/stroke inheritance. An element is tagged only when at least one of its
 * effective paints is an upper ink and NO effective paint is a non-upper
 * colour (pattern fills and screens keep the element under the purple).
 * Conservative by design: when unsure, don't tag.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tagUpperInkElements(svgEl: SVGElement, ocadFile: any): void {
  const upperRgb = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const color of (ocadFile.colors ?? []) as any[]) {
    if (!color || !Array.isArray(color.cmyk) || color.cmyk.length !== 4) continue;
    const cmyk = color.cmyk.map((v: number) => Number(v) / 100) as unknown as CmykFractions;
    if (isUpperInk(cmyk, typeof color.name === 'string' ? color.name : undefined)) {
      upperRgb.add(String(color.rgb).replace(/\s+/g, '').toLowerCase());
    }
  }
  if (upperRgb.size === 0) return;

  const normalize = (v: string) => v.replace(/\s+/g, '').toLowerCase();
  const isNoPaint = (v: string | null): boolean =>
    v === null || v === '' || normalize(v) === 'none' || normalize(v) === 'transparent';
  const isUpper = (v: string | null): boolean => v !== null && upperRgb.has(normalize(v));

  // Root paint context matches svg-to-pdf: SVG initial fill is black, but the
  // OCAD root overrides it (fill="transparent"); stroke's initial value is none.
  const walk = (el: Element, inhFill: string | null, inhStroke: string | null): void => {
    const fill = ocadPaintProp(el, 'fill') ?? inhFill;
    const stroke = ocadPaintProp(el, 'stroke') ?? inhStroke;

    if (OCAD_TAGGABLE.has(el.tagName.toLowerCase())) {
      const fillOk = isNoPaint(fill) || isUpper(fill);
      const strokeOk = isNoPaint(stroke) || isUpper(stroke);
      const anyUpper = isUpper(fill) || isUpper(stroke);
      if (anyUpper && fillOk && strokeOk) el.setAttribute(INK_ATTR, INK_UPPER);
    }
    for (const child of Array.from(el.children)) walk(child, fill, stroke);
  };

  const rootFill = ocadPaintProp(svgEl, 'fill') ?? 'black';
  const rootStroke = ocadPaintProp(svgEl, 'stroke') ?? null;
  for (const child of Array.from(svgEl.children)) walk(child, rootFill, rootStroke);
}

/** @internal Exported for testing */
export { tagUpperInkElements as _tagUpperInkElements };

/**
 * Extract georeferencing data from OCAD CRS metadata.
 *
 * Uses ocadFile.getCrs() which returns { code, easting, northing, grivation, ... }.
 * code=0 means no CRS → returns null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeoRef(
  ocadFile: any,
  scale: number | null,
  renderScale: number,
  svgMinX: number,
  svgMinY: number,
  svgHeight: number,
): GeoReference | null {
  try {
    if (!scale) return null;

    const crs = ocadFile.getCrs?.();
    if (!crs || crs.code === 0) return null;

    return {
      projDef: crs.code,
      easting: crs.easting ?? 0,
      northing: crs.northing ?? 0,
      scale,
      // OCAD grivation is in degrees — convert to radians
      grivation: ((crs.grivation ?? 0) * Math.PI) / 180,
      source: 'ocad',
      paperUnit: 'hundredths-mm',
      viewBoxOrigin: { x: svgMinX, y: svgMinY },
      viewBoxHeight: svgHeight,
      renderScale,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMapScale(ocadFile: any): number | null {
  try {
    const params = ocadFile.parameterStrings;
    if (!params) return null;

    // OCAD parameter string 1039 is ScalePar — contains the map scale in 'm' field.
    // Do NOT scan all parameter strings: other params (e.g. symbol definitions in
    // param 9) also have 'm' fields that are symbol sizes, not map scales.
    const scalePar = params[1039] as Array<Record<string, string>> | undefined;
    if (Array.isArray(scalePar)) {
      for (const entry of scalePar) {
        if (entry && typeof entry === 'object' && 'm' in entry) {
          const scaleValue = Number(entry['m']);
          if (scaleValue >= 1000 && scaleValue < 1_000_000) {
            return scaleValue;
          }
        }
      }
    }
  } catch {
    // Scale extraction is best-effort
  }
  return null;
}
