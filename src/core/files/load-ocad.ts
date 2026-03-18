// ocad2geojson uses Node.js Buffer internally — polyfill for browser
import { Buffer } from 'buffer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = Buffer;
}

interface LoadOcadResult {
  image: HTMLImageElement;
  width: number;
  height: number;
  scale: number | null; // Map scale extracted from OCAD metadata
  dpi: number;          // Effective DPI of the rendered image
  arrayBuffer: ArrayBuffer;
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

  // Parse viewBox to get OCAD coordinate dimensions
  const viewBox = svgEl.getAttribute('viewBox')?.split(/[\s,]+/);
  let svgWidth = 0;
  let svgHeight = 0;

  if (viewBox && viewBox.length === 4) {
    svgWidth = parseFloat(viewBox[2]!);
    svgHeight = parseFloat(viewBox[3]!);
  }

  // OCAD coordinates are in 1/100mm — these can be huge numbers.
  // Scale to a reasonable pixel size for rendering (target ~4000px on longest side
  // for good quality without hitting canvas limits).
  const TARGET_LONG_SIDE = 4000;
  const longestSide = Math.max(svgWidth, svgHeight);
  const renderScale = longestSide > 0 ? TARGET_LONG_SIDE / longestSide : 1;
  const pixelWidth = Math.round(svgWidth * renderScale);
  const pixelHeight = Math.round(svgHeight * renderScale);

  // Set explicit pixel dimensions on SVG (required for <img> rasterization)
  svgEl.setAttribute('width', String(pixelWidth));
  svgEl.setAttribute('height', String(pixelHeight));

  // Inject rectangle symbol objects as SVG polygons.
  // ocad2geojson ignores rectangle symbols entirely (RectangleSymbolType = 7),
  // so we render them ourselves. Each rectangle object has 4 coordinates
  // forming the corners and a `col` index referencing ocadFile.colors.
  injectRectangleObjects(svgEl, ocadFile);

  // Fix text rendering: SVG loaded via <img> blob URL cannot resolve external
  // fonts. Replace specific font-family declarations with generic fallbacks so
  // text elements are visible (correct position/size, slightly different face).
  let svgStr = new XMLSerializer().serializeToString(svgEl);
  svgStr = svgStr.replace(/font-family="[^"]*"/g, 'font-family="sans-serif"');

  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to render OCAD SVG: ${file.name}`));
    img.src = url;
  });

  URL.revokeObjectURL(url);

  // Extract map scale from OCAD parameter strings
  const scale = extractMapScale(ocadFile);

  // Compute effective DPI of the rendered image.
  // OCAD viewBox is in 1/100mm. We scaled to pixelWidth pixels.
  // DPI = pixels / inches = pixels / (mm / 25.4) = pixels * 25.4 / mm
  const svgWidthMm = svgWidth / 100;  // Convert 1/100mm to mm
  const dpi = svgWidthMm > 0 ? (pixelWidth * 25.4) / svgWidthMm : 150;

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    scale,
    dpi,
    arrayBuffer,
  };
}

// OCAD rectangle object type constant (matches ocad2geojson object-types.js)
const RECTANGLE_OBJECT_TYPE = 7;

/**
 * Inject rectangle symbol objects (objType 7) into the SVG element as polygons.
 *
 * ocad2geojson skips rectangle symbols during SVG generation, so these objects —
 * which define layout boxes like the title block and SPORTident control boxes —
 * are absent from the rendered output. We reconstruct them from the raw object
 * data: 4 coordinates in OCAD 1/100mm space, a color index, and an optional
 * rotation angle (in tenths of a degree, already reflected in the coordinate
 * positions since OCAD stores pre-rotated corner points).
 *
 * The ocad-to-svg.js coordinate transform applies `translate(0, bounds[1]+bounds[3])`
 * and negates Y (i.e. SVG y = −ocad_y). We match that here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectRectangleObjects(svgEl: SVGElement, ocadFile: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rectObjects: any[] = (ocadFile.objects as any[]).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o: any) => o.objType === RECTANGLE_OBJECT_TYPE
  );

  if (rectObjects.length === 0) return;

  const bounds: [number, number, number, number] = ocadFile.getBounds();
  const translateY = bounds[1] + bounds[3];

  const svgNS = 'http://www.w3.org/2000/svg';
  // Append rectangles inside the same <g> that ocadToSvg uses, or directly
  // onto the SVG root if the group isn't found.
  const targetGroup = svgEl.querySelector('g') ?? svgEl;

  for (const obj of rectObjects) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coords: any[] = obj.coordinates;
    if (!coords || coords.length < 3) continue;

    const color = ocadFile.colors[obj.col];
    const fillRgb: string = color?.rgb ?? 'none';

    // Build the SVG polygon points string.
    // Y is negated and offset by the same translateY used by ocadToSvg's group transform.
    const points = coords
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => `${c[0]},${-(c[1]) + translateY}`)
      .join(' ');

    const polygon = document.createElementNS(svgNS, 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', fillRgb);
    polygon.setAttribute('stroke', fillRgb);
    polygon.setAttribute('stroke-width', '0');
    polygon.setAttribute('data-sym', String(obj.sym));

    targetGroup.appendChild(polygon);
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
