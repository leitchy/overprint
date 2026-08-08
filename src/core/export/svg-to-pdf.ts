/**
 * SVG → true-vector PDF conversion for retained OCAD/OMAP base-map SVGs.
 *
 * The map loaders (load-ocad.ts via ocad2geojson, load-omap.ts via buildSvg)
 * retain a sized-less SVG string alongside the display raster. This module
 * converts that SVG into a single-page scratch PDFDocument built from RAW
 * pdf-lib content-stream operators — no rasterisation, no drawSvgPath — so
 * the exporter can `embedPdf()` the page into a course PDF and get a crisp
 * vector base map at any print scale.
 *
 * Design notes:
 * - The SVG vocabulary is the CLOSED set the two loaders emit (paths with
 *   absolute M/L/C/Z, basic shapes, text/tspan, line/dot `<pattern>` fills,
 *   translate/rotate/scale transforms). `validateSvgForVector` gates on that
 *   set; anything outside it means the caller must fall back to the raster
 *   path. Never extend the renderer without extending the validator.
 * - One base CTM flips SVG user space (y-down) to PDF page space (y-up):
 *   `cm(s, 0, 0, -s, -s·vbX, s·(vbY+vbH))`. Every element then emits its raw
 *   SVG coordinates, and nested `<g transform>` matrices compose verbatim
 *   (raw operators have no per-call flip to conjugate around). Text is the
 *   one exception — see `renderText`.
 * - jsdom-safe: only DOMParser + attribute reads. No getComputedStyle,
 *   getBBox, getCTM, or `.baseVal` (unimplemented in jsdom).
 */

import type { Color, PDFFont, PDFPage } from 'pdf-lib';
import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  LineCapStyle,
  LineJoinStyle,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  fill,
  stroke,
  clip,
  clipEvenOdd,
  endPath,
  setFillingColor,
  setStrokingColor,
  setLineWidth,
  setLineCap,
  setLineJoin,
  setDashPattern,
  setGraphicsState,
} from 'pdf-lib';

// ---------------------------------------------------------------------------
// Constants & public types
// ---------------------------------------------------------------------------

/** Hard cap on SVG element count — beyond this we always use the raster path. */
export const MAX_SVG_NODES = 100_000;

/**
 * Largest page-box side (in points) for the scratch page. The caller stretches
 * the embedded page to fit, so only the aspect ratio matters; keeping the box
 * under PDF's traditional 14400pt user-space ceiling avoids viewer quirks.
 */
const MAX_PAGE_SIDE = 14_000;

/** Safety cap on emitted pattern tile primitives per filled area. */
const MAX_PATTERN_TILES = 500_000;

/** Options for {@link renderSvgToScratchPdf}. */
export interface RenderSvgOptions {
  /**
   * When `'upper'`, render ONLY elements tagged `data-ink="upper"` by the map
   * loaders (100% black/brown/blue inks — see files/ink-classification.ts),
   * skipping everything else while still honouring inherited paint and group
   * transforms. Used for the IOF colour-order pass that redraws dark map
   * linework ABOVE the lower course purple (D2).
   */
  inkFilter?: 'upper';
}

export interface SvgVectorValidation {
  /** True when every node is inside the renderable vocabulary. */
  ok: boolean;
  /** Distinct offending tags / constructs (e.g. `image`, `path[d]`, `pattern`). */
  unsupportedTags: string[];
  /** Total element count encountered. */
  nodeCount: number;
}

/** A parsed absolute path command. M/L carry 2 args, C carries 6, Z carries 0. */
export interface PathCommand {
  op: 'M' | 'L' | 'C' | 'Z';
  args: number[];
}

/** SVG transform matrix as the 6-tuple [a, b, c, d, e, f]. */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * SVG paint properties inherited down the element tree. `fill` is always a
 * concrete value (SVG's initial value is `black`; OCAD roots override it with
 * `fill="transparent"`, which is why hardcoded per-shape defaults flood-fill
 * OCAD line paths black). `stroke`'s initial value is none (`null`).
 */
interface InheritedPaint {
  fill: string;
  stroke: string | null;
}

// ---------------------------------------------------------------------------
// Colour parsing
// ---------------------------------------------------------------------------

/**
 * Parse an SVG colour value into a pdf-lib RGB colour.
 *
 * Supports the forms the map loaders emit: `rgb(r,g,b)` (with or without
 * spaces), `#rgb`, `#rrggbb`, `white`, `black`. Returns `null` for `none`,
 * empty values, and anything unrecognised (callers treat null as "no paint").
 */
export function parseColor(value: string | null | undefined): Color | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'none' || v === 'transparent') return null;
  if (v === 'white') return rgb(1, 1, 1);
  if (v === 'black') return rgb(0, 0, 0);

  const rgbMatch = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if (rgbMatch) {
    return rgb(
      Math.min(255, Number(rgbMatch[1])) / 255,
      Math.min(255, Number(rgbMatch[2])) / 255,
      Math.min(255, Number(rgbMatch[3])) / 255,
    );
  }

  const hex6 = /^#([0-9a-f]{6})$/.exec(v);
  if (hex6) {
    const n = parseInt(hex6[1]!, 16);
    return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
  }

  const hex3 = /^#([0-9a-f]{3})$/.exec(v);
  if (hex3) {
    const [r, g, b] = hex3[1]!.split('').map((c) => parseInt(c + c, 16) / 255);
    return rgb(r!, g!, b!);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Path `d` parsing (absolute M/L/C/Z only)
// ---------------------------------------------------------------------------

const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;

/**
 * Parse a path `d` string restricted to absolute M/L/C/Z commands.
 *
 * Handles SVG implicit command repetition (extra coordinate pairs after M
 * become L; extra 6-tuples after C repeat C). Returns `null` when the string
 * contains any other command letter (arcs, relative commands, H/V, Q/S/T),
 * malformed numbers, or a wrong argument count — the validator relies on
 * this to reject out-of-vocabulary paths.
 */
export function parsePathD(d: string): PathCommand[] | null {
  const tokens = d
    .replace(/,/g, ' ')
    .replace(/([MLCZ])/g, ' $1 ')
    .trim()
    .split(/\s+/);
  if (tokens.length === 0) return [];

  const cmds: PathCommand[] = [];
  let i = 0;
  let current: 'M' | 'L' | 'C' | 'Z' | null = null;

  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (tok === 'M' || tok === 'L' || tok === 'C' || tok === 'Z') {
      current = tok;
      i++;
      if (current === 'Z') {
        cmds.push({ op: 'Z', args: [] });
        current = null;
        continue;
      }
    } else if (current === null || !NUMBER_RE.test(tok)) {
      // Unknown command letter (a/A/h/Q/…) or garbage token.
      return null;
    }

    if (current === null) continue;

    // Consume one argument group for the current command.
    const argCount = current === 'C' ? 6 : 2;
    const args: number[] = [];
    for (let k = 0; k < argCount; k++) {
      const t = tokens[i + k];
      if (t === undefined || !NUMBER_RE.test(t)) return null;
      args.push(Number(t));
    }
    i += argCount;

    cmds.push({ op: current, args });
    // Implicit repetition: coordinates after an M continue as L.
    if (current === 'M') current = 'L';
  }

  return cmds;
}

/** Convert parsed path commands to raw pdf-lib path-construction operators. */
function pathCommandsToOps(cmds: PathCommand[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const c of cmds) {
    switch (c.op) {
      case 'M':
        ops.push(moveTo(c.args[0]!, c.args[1]!));
        break;
      case 'L':
        ops.push(lineTo(c.args[0]!, c.args[1]!));
        break;
      case 'C':
        ops.push(appendBezierCurve(c.args[0]!, c.args[1]!, c.args[2]!, c.args[3]!, c.args[4]!, c.args[5]!));
        break;
      case 'Z':
        ops.push(closePath());
        break;
    }
  }
  return ops;
}

/** Bounding box of all coordinates in a parsed path (control points included). */
function pathBbox(cmds: PathCommand[]): Bbox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cmds) {
    for (let k = 0; k + 1 < c.args.length; k += 2) {
      const x = c.args[k]!;
      const y = c.args[k + 1]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// ---------------------------------------------------------------------------
// Transform parsing (translate / rotate / scale only)
// ---------------------------------------------------------------------------

function matMul(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/**
 * Parse an SVG `transform` (or `patternTransform`) list composed only of
 * translate/rotate/scale into a single matrix. Returns `null` when any other
 * function (matrix, skewX, skewY, …) or a malformed argument list appears.
 */
export function parseTransform(value: string | null | undefined): Matrix | null {
  if (!value || value.trim() === '') return IDENTITY;
  let m: Matrix = IDENTITY;
  const fnRe = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = fnRe.exec(value)) !== null) {
    consumed += match[0].length;
    const fn = match[1]!;
    const args = match[2]!.trim() === ''
      ? []
      : match[2]!.split(/[\s,]+/).map(Number);
    if (args.some((n) => !Number.isFinite(n))) return null;

    switch (fn) {
      case 'translate': {
        if (args.length < 1 || args.length > 2) return null;
        m = matMul(m, [1, 0, 0, 1, args[0]!, args[1] ?? 0]);
        break;
      }
      case 'scale': {
        if (args.length < 1 || args.length > 2) return null;
        m = matMul(m, [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0]);
        break;
      }
      case 'rotate': {
        if (args.length !== 1 && args.length !== 3) return null;
        const rad = (args[0]! * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length === 3) {
          const [, cx, cy] = args as [number, number, number];
          m = matMul(m, [1, 0, 0, 1, cx!, cy!]);
          m = matMul(m, rot);
          m = matMul(m, [1, 0, 0, 1, -cx!, -cy!]);
        } else {
          m = matMul(m, rot);
        }
        break;
      }
      default:
        return null;
    }
  }
  // Reject strings with content that isn't whitespace-separated fn(...) calls.
  const stripped = value.replace(fnRe, '').replace(/[\s,]/g, '');
  if (stripped !== '') return null;
  if (consumed === 0) return null;
  return m;
}

// ---------------------------------------------------------------------------
// Style resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a presentation property, preferring the inline `style` attribute
 * (OCAD/ocad2geojson packs everything there) and falling back to the
 * presentation attribute (OMAP buildSvg emits those). Empty string = unset.
 */
function styleProp(el: Element, name: string): string | undefined {
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

function numProp(el: Element, name: string): number | undefined {
  const v = styleProp(el, name);
  if (v === undefined) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const n = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SUPPORTED_TAGS = new Set([
  'svg', 'defs', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
  'polygon', 'polyline', 'text', 'tspan', 'pattern',
]);

/** Tile-primitive tags a `<pattern>` may contain and still be reconstructable. */
const TILEABLE_TAGS = new Set(['line', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'path']);

/**
 * True when a `<pattern>` is one we can reconstruct by tiling.
 *
 * OMAP patterns are single hatch `<line>`s or dot `<circle>`s; OCAD
 * (ocad2geojson) also emits `<rect>` hatch bars and up to three straight
 * `<path>` dashes per tile. Any child outside {@link TILEABLE_TAGS}, or a
 * `<path>` whose `d` doesn't parse as absolute M/L/C/Z, rejects. Degenerate
 * patterns (zero size or no children) are ACCEPTED — the renderer treats the
 * fill as a no-op rather than forcing the whole map to raster.
 */
function isReconstructablePattern(pattern: Element): boolean {
  const w = numAttr(pattern, 'width');
  const h = numAttr(pattern, 'height');
  const children = Array.from(pattern.children);
  if (w <= 0 || h <= 0 || children.length === 0) return true; // no-op fill
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!TILEABLE_TAGS.has(tag)) return false;
    if (tag === 'path') {
      const d = child.getAttribute('d');
      if (d === null || parsePathD(d) === null) return false;
    }
  }
  return true;
}

/**
 * Check whether an SVG string is entirely within the vector-renderable
 * vocabulary. `ok: false` means the caller must use the raster fallback.
 */
export function validateSvgForVector(svg: string): SvgVectorValidation {
  const bad = new Set<string>();
  let nodeCount = 0;

  // Cheap pre-parse bail-out: count element open tags in the raw string before
  // handing a potentially enormous document to DOMParser (jsdom in particular
  // degrades badly past ~10⁵ nodes, and a real map that big goes raster anyway).
  const roughCount = (svg.match(/<[A-Za-z]/g) ?? []).length;
  if (roughCount > MAX_SVG_NODES) {
    return { ok: false, unsupportedTags: [], nodeCount: roughCount };
  }

  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, unsupportedTags: ['parsererror'], nodeCount: 0 };
  }
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    return { ok: false, unsupportedTags: [root.tagName.toLowerCase()], nodeCount: 1 };
  }

  const patternIds = new Set<string>();
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    nodeCount++;
    const tag = el.tagName.toLowerCase();

    if (!SUPPORTED_TAGS.has(tag)) {
      bad.add(tag);
      continue; // don't recurse into unknown subtrees
    }

    if (tag === 'pattern') {
      const id = el.getAttribute('id');
      if (id) patternIds.add(id);
      if (!isReconstructablePattern(el)) bad.add('pattern');
      const pt = el.getAttribute('patternTransform');
      if (pt !== null && parseTransform(pt) === null) bad.add('pattern[patternTransform]');
      // Count tile children but don't re-validate them as top-level shapes.
      nodeCount += el.children.length;
      continue;
    }

    if (tag === 'path') {
      const d = el.getAttribute('d');
      if (d === null || parsePathD(d) === null) bad.add('path[d]');
    }

    const transform = el.getAttribute('transform');
    if (transform !== null && parseTransform(transform) === null) {
      bad.add(`${tag}[transform]`);
    }

    for (const child of Array.from(el.children)) stack.push(child);
  }

  // Every url(#id) fill must reference a pattern we saw.
  for (const el of Array.from(doc.querySelectorAll('[fill^="url("], [style*="url("]'))) {
    const fillVal = styleProp(el, 'fill');
    const ref = fillVal ? /^url\(#([^)]+)\)$/.exec(fillVal.trim()) : null;
    if (fillVal?.startsWith('url(') && (!ref || !patternIds.has(ref[1]!))) {
      bad.add('fill[url]');
    }
  }

  const ok = bad.size === 0 && nodeCount <= MAX_SVG_NODES;
  return { ok, unsupportedTags: Array.from(bad).sort(), nodeCount };
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/**
 * One drawable tile child, pre-lowered to the complete operator sequence that
 * paints it at tile-local coordinates (colour + stroke state + path
 * construction + paint operator). Tiling replays these ops per grid cell
 * under a translate CTM.
 */
interface TilePrimitive {
  ops: PDFOperator[];
  fillColor: Color | null;
  strokeColor: Color | null;
}

interface PatternDef {
  width: number;
  height: number;
  /** rotate(deg) from patternTransform, or 0. */
  rotateDeg: number;
  /** Ordered tile primitives; empty for degenerate patterns (no-op fill). */
  primitives: TilePrimitive[];
  /** Fast path: the single child is a horizontal hatch line at tile-local y. */
  hLine: { y: number; color: Color; width: number } | null;
}

/** Path-construction ops for one tile child, or null when it isn't drawable. */
function tileChildPathOps(child: Element, tag: string): PDFOperator[] | null {
  switch (tag) {
    case 'line':
      return [
        moveTo(numAttr(child, 'x1'), numAttr(child, 'y1')),
        lineTo(numAttr(child, 'x2'), numAttr(child, 'y2')),
      ];
    case 'circle': {
      const r = numAttr(child, 'r');
      return r > 0 ? ellipseOps(numAttr(child, 'cx'), numAttr(child, 'cy'), r, r) : null;
    }
    case 'ellipse': {
      const rx = numAttr(child, 'rx');
      const ry = numAttr(child, 'ry');
      return rx > 0 && ry > 0 ? ellipseOps(numAttr(child, 'cx'), numAttr(child, 'cy'), rx, ry) : null;
    }
    case 'rect': {
      const x = numAttr(child, 'x');
      const y = numAttr(child, 'y');
      const w = numAttr(child, 'width');
      const h = numAttr(child, 'height');
      if (w <= 0 || h <= 0) return null;
      return [moveTo(x, y), lineTo(x + w, y), lineTo(x + w, y + h), lineTo(x, y + h), closePath()];
    }
    case 'polygon':
    case 'polyline': {
      const pts = parsePoints(child);
      if (pts.length < 4) return null;
      const ops: PDFOperator[] = [moveTo(pts[0]!, pts[1]!)];
      for (let i = 2; i + 1 < pts.length; i += 2) ops.push(lineTo(pts[i]!, pts[i + 1]!));
      if (tag === 'polygon') ops.push(closePath());
      return ops;
    }
    case 'path': {
      const cmds = parsePathD(child.getAttribute('d') ?? '');
      return cmds && cmds.length > 0 ? pathCommandsToOps(cmds) : null;
    }
    default:
      return null;
  }
}

/**
 * Lower one `<pattern>` child to a {@link TilePrimitive}, resolving paint via
 * the same style-attr-first resolution as top-level elements — so OMAP
 * `<line stroke>` / `<circle fill>` tiles, OCAD `<rect fill>` hatch bars, and
 * OCAD `<path style="stroke:…">` dash tiles all work.
 *
 * Pattern content inherits paint from the pattern's ancestor chain, which for
 * loader output is the root `<svg>` — so OCAD dash `<path>` tiles with no own
 * fill correctly inherit the root's `fill="transparent"` (stroke-only) rather
 * than flooding each cell black.
 */
function tileChildPrimitive(child: Element, inherited: InheritedPaint): TilePrimitive | null {
  const tag = child.tagName.toLowerCase();
  const pathOps = tileChildPathOps(child, tag);
  if (!pathOps) return null;

  // A bare line has no fillable area; everything else inherits the fill.
  const fillColor = tag === 'line'
    ? null
    : parseColor(styleProp(child, 'fill') ?? inherited.fill);
  const strokeColor = parseColor(styleProp(child, 'stroke') ?? inherited.stroke ?? undefined);
  if (!fillColor && !strokeColor) return null;

  const ops: PDFOperator[] = [];
  if (fillColor) ops.push(setFillingColor(fillColor));
  if (strokeColor) {
    ops.push(setStrokingColor(strokeColor));
    ops.push(setLineWidth(numProp(child, 'stroke-width') ?? 1));
    const cap = styleProp(child, 'stroke-linecap');
    if (cap && LINE_CAPS[cap] !== undefined) ops.push(setLineCap(LINE_CAPS[cap]!));
    const join = styleProp(child, 'stroke-linejoin');
    if (join && LINE_JOINS[join] !== undefined) ops.push(setLineJoin(LINE_JOINS[join]!));
    const dash = styleProp(child, 'stroke-dasharray');
    if (dash && dash !== 'none') {
      const values = dash.split(/[\s,]+/).map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0);
      if (values.length > 0 && values.some((n) => n > 0)) ops.push(setDashPattern(values, 0));
    }
  }
  ops.push(...pathOps);

  const evenOdd = styleProp(child, 'fill-rule') === 'evenodd';
  if (fillColor && strokeColor) {
    ops.push(evenOdd ? FILL_EVEN_ODD_AND_STROKE() : FILL_NONZERO_AND_STROKE());
  } else if (fillColor) {
    ops.push(evenOdd ? FILL_EVEN_ODD() : fill());
  } else {
    ops.push(stroke());
  }

  return { ops, fillColor, strokeColor };
}

function collectPatterns(root: Element, rootPaint: InheritedPaint): Map<string, PatternDef> {
  const patterns = new Map<string, PatternDef>();
  for (const el of Array.from(root.querySelectorAll('pattern'))) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const width = numAttr(el, 'width');
    const height = numAttr(el, 'height');

    let rotateDeg = 0;
    const pt = el.getAttribute('patternTransform');
    if (pt) {
      const m = /rotate\(\s*(-?[\d.]+)/.exec(pt);
      if (m) rotateDeg = parseFloat(m[1]!);
    }

    const children = Array.from(el.children);
    const primitives: TilePrimitive[] = width > 0 && height > 0
      ? children
          .map((c) => tileChildPrimitive(c, rootPaint))
          .filter((p): p is TilePrimitive => p !== null)
      : []; // degenerate tile → registered as a no-op fill

    // Fast path: a lone horizontal hatch line tiles as continuous rows.
    let hLine: PatternDef['hLine'] = null;
    if (children.length === 1 && children[0]!.tagName.toLowerCase() === 'line') {
      const line = children[0]!;
      const y1 = numAttr(line, 'y1');
      const color = parseColor(styleProp(line, 'stroke') ?? rootPaint.stroke ?? undefined);
      if (color && y1 === numAttr(line, 'y2')) {
        hLine = { y: y1, color, width: numProp(line, 'stroke-width') ?? 1 };
      }
    }

    patterns.set(id, { width, height, rotateDeg, primitives, hLine });
  }
  return patterns;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface RenderCtx {
  page: PDFPage;
  font: PDFFont;
  patterns: Map<string, PatternDef>;
  /** When set, only elements inside a `data-ink="upper"` subtree are painted. */
  inkFilter?: 'upper';
}

const FILL_EVEN_ODD = () => PDFOperator.of(PDFOperatorNames.FillEvenOdd);
const FILL_NONZERO_AND_STROKE = () => PDFOperator.of(PDFOperatorNames.FillNonZeroAndStroke);
const FILL_EVEN_ODD_AND_STROKE = () => PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke);

/**
 * Append operators to the page content stream in chunks — spreading one huge
 * array into `pushOperators(...)` overflows the call stack on large pattern
 * fills (real OCAD areas can tile into 10⁵+ operators).
 */
const PUSH_CHUNK = 5_000;
function pushOps(page: PDFPage, ops: PDFOperator[]): void {
  for (let i = 0; i < ops.length; i += PUSH_CHUNK) {
    page.pushOperators(...ops.slice(i, i + PUSH_CHUNK));
  }
}

/** Register a one-off ExtGState carrying fill/stroke alpha for one element. */
function opacityGState(page: PDFPage, ca: number, CA: number): PDFOperator {
  const dict = page.doc.context.obj({ Type: 'ExtGState', ca, CA });
  const name = page.node.newExtGState('GSsvg', dict);
  return setGraphicsState(name);
}

const KAPPA = 0.5522847498307936;

/** Path-construction operators for an ellipse as four cubic Bézier arcs. */
function ellipseOps(cx: number, cy: number, rx: number, ry: number): PDFOperator[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    moveTo(cx + rx, cy),
    appendBezierCurve(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
    appendBezierCurve(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
    appendBezierCurve(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
    appendBezierCurve(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
    closePath(),
  ];
}

const LINE_CAPS: Record<string, LineCapStyle> = {
  butt: LineCapStyle.Butt,
  round: LineCapStyle.Round,
  square: LineCapStyle.Projecting,
};

const LINE_JOINS: Record<string, LineJoinStyle> = {
  miter: LineJoinStyle.Miter,
  round: LineJoinStyle.Round,
  bevel: LineJoinStyle.Bevel,
};

interface ResolvedPaint {
  fillColor: Color | null;
  /** Pattern id when fill references url(#id). */
  fillPatternId: string | null;
  strokeColor: Color | null;
  strokeOps: PDFOperator[];
  /** Combined alpha; ExtGState op present when < 1 on either channel. */
  gStateOp: PDFOperator | null;
}

function resolvePaint(ctx: RenderCtx, el: Element, inherited: InheritedPaint): ResolvedPaint {
  const fillRaw = styleProp(el, 'fill') ?? inherited.fill;
  const strokeRaw = styleProp(el, 'stroke') ?? inherited.stroke ?? undefined;

  let fillColor: Color | null = null;
  let fillPatternId: string | null = null;
  const urlMatch = /^url\(#([^)]+)\)$/.exec(fillRaw.trim());
  if (urlMatch) {
    fillPatternId = urlMatch[1]!;
  } else {
    fillColor = parseColor(fillRaw);
  }

  const strokeColor = parseColor(strokeRaw);
  const strokeOps: PDFOperator[] = [];
  if (strokeColor) {
    strokeOps.push(setStrokingColor(strokeColor));
    strokeOps.push(setLineWidth(numProp(el, 'stroke-width') ?? 1));
    const cap = styleProp(el, 'stroke-linecap');
    if (cap && LINE_CAPS[cap] !== undefined) strokeOps.push(setLineCap(LINE_CAPS[cap]!));
    const join = styleProp(el, 'stroke-linejoin');
    if (join && LINE_JOINS[join] !== undefined) strokeOps.push(setLineJoin(LINE_JOINS[join]!));
    const dash = styleProp(el, 'stroke-dasharray');
    if (dash && dash !== 'none') {
      const values = dash.split(/[\s,]+/).map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0);
      if (values.length > 0 && values.some((n) => n > 0)) strokeOps.push(setDashPattern(values, 0));
    }
  }

  const opacity = numProp(el, 'opacity') ?? 1;
  const ca = Math.max(0, Math.min(1, opacity * (numProp(el, 'fill-opacity') ?? 1)));
  const CA = Math.max(0, Math.min(1, opacity * (numProp(el, 'stroke-opacity') ?? 1)));
  const gStateOp = ca < 1 || CA < 1 ? opacityGState(ctx.page, ca, CA) : null;

  return { fillColor, fillPatternId, strokeColor, strokeOps, gStateOp };
}

/**
 * Paint one shape: emit its path-construction ops wrapped in q…Q with colour,
 * stroke state, opacity, and the correct paint operator (f, f-star, S, B, B-star).
 * Pattern fills are reconstructed by clipping to the path and tiling.
 */
function paintShape(
  ctx: RenderCtx,
  el: Element,
  pathOps: PDFOperator[],
  opts: { evenOdd: boolean; bbox: Bbox | null; inherited: InheritedPaint },
): void {
  if (pathOps.length === 0) return;
  const paint = resolvePaint(ctx, el, opts.inherited);
  const { fillColor, fillPatternId, strokeColor } = paint;
  if (!fillColor && !fillPatternId && !strokeColor) return;

  if (fillPatternId) {
    const pattern = ctx.patterns.get(fillPatternId);
    if (pattern && opts.bbox) {
      paintPatternFill(ctx, pattern, pathOps, opts.evenOdd, opts.bbox, paint.gStateOp);
    }
    if (strokeColor) {
      const ops = [pushGraphicsState()];
      if (paint.gStateOp) ops.push(paint.gStateOp);
      ops.push(...paint.strokeOps, ...pathOps, stroke(), popGraphicsState());
      pushOps(ctx.page, ops);
    }
    return;
  }

  const ops: PDFOperator[] = [pushGraphicsState()];
  if (paint.gStateOp) ops.push(paint.gStateOp);
  if (fillColor) ops.push(setFillingColor(fillColor));
  ops.push(...paint.strokeOps, ...pathOps);

  if (fillColor && strokeColor) {
    ops.push(opts.evenOdd ? FILL_EVEN_ODD_AND_STROKE() : FILL_NONZERO_AND_STROKE());
  } else if (fillColor) {
    ops.push(opts.evenOdd ? FILL_EVEN_ODD() : fill());
  } else {
    ops.push(stroke());
  }
  ops.push(popGraphicsState());
  pushOps(ctx.page, ops);
}

/**
 * Reconstruct a `fill="url(#pattern)"` by clipping to the filled path and
 * tiling the pattern's primitives (hatch lines, dot circles, OCAD rect bars
 * and path dashes) across the path's bbox, honouring
 * `patternTransform="rotate(deg)"`. A lone horizontal hatch line is drawn as
 * continuous full-width rows (fewer ops, no seam artefacts); everything else
 * replays each tile's primitives under a per-cell translate CTM. Degenerate
 * patterns (zero size / no drawable children) are a silent no-op.
 */
function paintPatternFill(
  ctx: RenderCtx,
  pattern: PatternDef,
  pathOps: PDFOperator[],
  evenOdd: boolean,
  bbox: Bbox,
  gStateOp: PDFOperator | null,
): void {
  if (pattern.width <= 0 || pattern.height <= 0) return;
  if (pattern.primitives.length === 0 && !pattern.hLine) return;

  const ops: PDFOperator[] = [pushGraphicsState()];
  if (gStateOp) ops.push(gStateOp);
  ops.push(...pathOps, evenOdd ? clipEvenOdd() : clip(), endPath());

  // Rotate the tiling frame, then tile over the bbox as seen in that frame
  // (inverse-rotate the bbox corners and take their extent).
  const rad = (pattern.rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let tb = bbox;
  if (pattern.rotateDeg !== 0) {
    ops.push(concatTransformationMatrix(cos, sin, -sin, cos, 0, 0));
    const corners = [
      [bbox.minX, bbox.minY], [bbox.maxX, bbox.minY],
      [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY],
    ] as const;
    tb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [x, y] of corners) {
      // Inverse rotation: rotate by -rad.
      const rx = x * cos + y * sin;
      const ry = -x * sin + y * cos;
      tb = {
        minX: Math.min(tb.minX, rx), minY: Math.min(tb.minY, ry),
        maxX: Math.max(tb.maxX, rx), maxY: Math.max(tb.maxY, ry),
      };
    }
  }

  const { width: w, height: h } = pattern;
  const col0 = Math.floor(tb.minX / w) - 1;
  const col1 = Math.ceil(tb.maxX / w) + 1;
  const row0 = Math.floor(tb.minY / h) - 1;
  const row1 = Math.ceil(tb.maxY / h) + 1;
  const rows = row1 - row0 + 1;
  const cols = col1 - col0 + 1;

  const tileCount = pattern.hLine ? rows : rows * cols * pattern.primitives.length;

  if (tileCount > MAX_PATTERN_TILES) {
    // Degenerate case (enormous area / tiny spacing): approximate with a
    // faint solid fill in the pattern colour instead of exploding the PDF.
    const first = pattern.primitives[0];
    const color = pattern.hLine?.color ?? first?.fillColor ?? first?.strokeColor;
    if (color) {
      const solid = opacityGState(ctx.page, 0.35, 0.35);
      ops.push(solid, setFillingColor(color), ...pathOps, evenOdd ? FILL_EVEN_ODD() : fill());
    }
    ops.push(popGraphicsState());
    pushOps(ctx.page, ops);
    return;
  }

  if (pattern.hLine) {
    // Continuous full-width rows for the lone-horizontal-line hatch.
    const { y: ly, color, width } = pattern.hLine;
    ops.push(setStrokingColor(color), setLineWidth(width), setLineCap(LineCapStyle.Butt));
    for (let j = row0; j <= row1; j++) {
      const y = j * h + ly;
      ops.push(moveTo(tb.minX, y), lineTo(tb.maxX, y));
    }
    ops.push(stroke());
  } else {
    // General tiling: replay each primitive's ops under a per-cell translate.
    for (let j = row0; j <= row1; j++) {
      for (let i = col0; i <= col1; i++) {
        ops.push(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, i * w, j * h));
        for (const prim of pattern.primitives) ops.push(...prim.ops);
        ops.push(popGraphicsState());
      }
    }
  }

  ops.push(popGraphicsState());
  pushOps(ctx.page, ops);
}

// ---------------------------------------------------------------------------
// Per-element renderers
// ---------------------------------------------------------------------------

function renderPath(ctx: RenderCtx, el: Element, inherited: InheritedPaint): void {
  const d = el.getAttribute('d');
  if (!d) return;
  const cmds = parsePathD(d);
  if (!cmds || cmds.length === 0) return;
  const evenOdd = styleProp(el, 'fill-rule') === 'evenodd';
  paintShape(ctx, el, pathCommandsToOps(cmds), { evenOdd, bbox: pathBbox(cmds), inherited });
}

function renderCircleOrEllipse(ctx: RenderCtx, el: Element, inherited: InheritedPaint): void {
  const cx = numAttr(el, 'cx');
  const cy = numAttr(el, 'cy');
  const rx = el.tagName.toLowerCase() === 'circle' ? numAttr(el, 'r') : numAttr(el, 'rx');
  const ry = el.tagName.toLowerCase() === 'circle' ? rx : numAttr(el, 'ry');
  if (rx <= 0 || ry <= 0) return;
  const bbox: Bbox = { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  paintShape(ctx, el, ellipseOps(cx, cy, rx, ry), { evenOdd: false, bbox, inherited });
}

function renderRect(ctx: RenderCtx, el: Element, inherited: InheritedPaint): void {
  const x = numAttr(el, 'x');
  const y = numAttr(el, 'y');
  const w = numAttr(el, 'width');
  const h = numAttr(el, 'height');
  if (w <= 0 || h <= 0) return;
  const ops = [moveTo(x, y), lineTo(x + w, y), lineTo(x + w, y + h), lineTo(x, y + h), closePath()];
  paintShape(ctx, el, ops, {
    evenOdd: false,
    bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h },
    inherited,
  });
}

function renderLine(ctx: RenderCtx, el: Element, inherited: InheritedPaint): void {
  const ops = [
    moveTo(numAttr(el, 'x1'), numAttr(el, 'y1')),
    lineTo(numAttr(el, 'x2'), numAttr(el, 'y2')),
  ];
  // A bare line has no fillable area — stroke only (never inherit a fill).
  paintShape(ctx, el, ops, {
    evenOdd: false,
    bbox: null,
    inherited: { fill: 'none', stroke: inherited.stroke },
  });
}

function parsePoints(el: Element): number[] {
  return (el.getAttribute('points') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function renderPoly(ctx: RenderCtx, el: Element, close: boolean, inherited: InheritedPaint): void {
  const pts = parsePoints(el);
  if (pts.length < 4) return;
  const ops: PDFOperator[] = [moveTo(pts[0]!, pts[1]!)];
  let minX = pts[0]!, minY = pts[1]!, maxX = pts[0]!, maxY = pts[1]!;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    ops.push(lineTo(x, y));
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (close) ops.push(closePath());
  paintShape(ctx, el, ops, {
    evenOdd: styleProp(el, 'fill-rule') === 'evenodd',
    bbox: { minX, minY, maxX, maxY },
    inherited,
  });
}

/** Approximate SVG dominant-baseline as an offset (in em) below the y anchor. */
const BASELINE_EM_OFFSET: Record<string, number> = {
  hanging: 0.75,
  central: 0.35,
  middle: 0.35,
  auto: 0,
  alphabetic: 0,
};

interface TextRun { text: string; x: number; y: number; anchor: string }

/**
 * Render `<text>` (and child `<tspan>`s). Under the y-negating base CTM,
 * glyphs would come out mirrored — so each run pushes a local CTM at its
 * anchor that re-flips y (translate + scale(1,-1) folded into one matrix),
 * draws at (0,0) with an embedded Helvetica, then pops. Font size is passed
 * in SVG user units; the base CTM scales it onto the page.
 */
function renderText(ctx: RenderCtx, el: Element, inherited: InheritedPaint): void {
  const color = parseColor(styleProp(el, 'fill') ?? inherited.fill);
  if (!color) return;
  const fontSize = numProp(el, 'font-size') ?? 16;
  if (fontSize <= 0) return;
  const baselineShift = (BASELINE_EM_OFFSET[styleProp(el, 'dominant-baseline') ?? 'auto'] ?? 0) * fontSize;
  const textX = numAttr(el, 'x');
  const textY = numAttr(el, 'y');
  const textAnchor = styleProp(el, 'text-anchor') ?? 'start';

  // Gather runs: direct text content and/or tspan children with x/y/dy.
  const runs: TextRun[] = [];
  let currentY = textY;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      if (text.trim() !== '') runs.push({ text, x: textX, y: currentY, anchor: textAnchor });
    } else if (node.nodeType === 1 && (node as Element).tagName.toLowerCase() === 'tspan') {
      const span = node as Element;
      const yAttr = span.getAttribute('y');
      if (yAttr !== null) {
        currentY = parseFloat(yAttr) || 0;
      } else {
        const dyAttr = span.getAttribute('dy');
        if (dyAttr !== null) {
          const em = /^(-?[\d.]+)em$/.exec(dyAttr.trim());
          currentY += em ? parseFloat(em[1]!) * fontSize : (parseFloat(dyAttr) || 0);
        }
      }
      const x = span.getAttribute('x') !== null ? numAttr(span, 'x') : textX;
      const text = span.textContent ?? '';
      if (text.trim() !== '') {
        runs.push({ text, x, y: currentY, anchor: styleProp(span, 'text-anchor') ?? textAnchor });
      }
    }
  }

  for (const run of runs) {
    // Skip runs Helvetica cannot encode (e.g. ř/ł/ő) rather than throwing.
    try {
      ctx.font.encodeText(run.text);
    } catch {
      continue;
    }
    let x = run.x;
    if (run.anchor === 'middle' || run.anchor === 'end') {
      const width = ctx.font.widthOfTextAtSize(run.text, fontSize);
      x -= run.anchor === 'middle' ? width / 2 : width;
    }
    ctx.page.pushOperators(
      pushGraphicsState(),
      // translate(x, baselineY) · scale(1, -1) folded into one matrix.
      concatTransformationMatrix(1, 0, 0, -1, x, run.y + baselineShift),
    );
    ctx.page.drawText(run.text, { x: 0, y: 0, size: fontSize, font: ctx.font, color });
    ctx.page.pushOperators(popGraphicsState());
  }
}

/** Fold an element's own fill/stroke into the paint context for its subtree. */
function inheritPaint(el: Element, inherited: InheritedPaint): InheritedPaint {
  const fill = styleProp(el, 'fill');
  const stroke = styleProp(el, 'stroke');
  if (fill === undefined && stroke === undefined) return inherited;
  return { fill: fill ?? inherited.fill, stroke: stroke ?? inherited.stroke };
}

function renderElement(ctx: RenderCtx, el: Element, inherited: InheritedPaint, inkActive = false): void {
  // Ink filtering: a data-ink="upper" tag activates painting for the element
  // and its whole subtree; untagged groups still recurse (a tagged child may
  // sit anywhere), but untagged shapes/text are skipped entirely.
  const active = inkActive || el.getAttribute('data-ink') === 'upper';
  const skip = ctx.inkFilter !== undefined && !active;

  switch (el.tagName.toLowerCase()) {
    case 'defs':
    case 'pattern':
      return; // pattern defs are consumed via collectPatterns
    case 'g': {
      const m = parseTransform(el.getAttribute('transform'));
      const hasTransform = m !== null && m !== IDENTITY
        && (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0);
      if (hasTransform) {
        ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
      }
      const childPaint = inheritPaint(el, inherited);
      for (const child of Array.from(el.children)) renderElement(ctx, child, childPaint, active);
      if (hasTransform) ctx.page.pushOperators(popGraphicsState());
      return;
    }
    case 'path': return skip ? undefined : renderPath(ctx, el, inherited);
    case 'circle':
    case 'ellipse': return skip ? undefined : renderCircleOrEllipse(ctx, el, inherited);
    case 'rect': return skip ? undefined : renderRect(ctx, el, inherited);
    case 'line': return skip ? undefined : renderLine(ctx, el, inherited);
    case 'polygon': return skip ? undefined : renderPoly(ctx, el, true, inherited);
    case 'polyline': return skip ? undefined : renderPoly(ctx, el, false, inherited);
    case 'text': return skip ? undefined : renderText(ctx, el, inherited);
    default:
      return; // validator should have rejected; be lenient here
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render a validated OCAD/OMAP SVG string into a fresh single-page scratch
 * PDFDocument built entirely from vector operators.
 *
 * The page box is `viewBox × s` (s ≤ 1, capped so the longest side stays
 * under {@link MAX_PAGE_SIDE} points) and the content fills it exactly, so
 * the caller can `embedPdf(await scratch.save())` and stretch the embedded
 * page onto the course-map page — only the aspect ratio matters.
 *
 * Call {@link validateSvgForVector} first; this function assumes an
 * in-vocabulary SVG and silently skips constructs it cannot draw.
 */
export async function renderSvgToScratchPdf(svg: string, options: RenderSvgOptions = {}): Promise<PDFDocument> {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (dom.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid SVG: XML parse error');
  }
  const root = dom.documentElement;
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n)) || viewBox[2]! <= 0 || viewBox[3]! <= 0) {
    throw new Error('Invalid SVG: missing or malformed viewBox');
  }
  const [vbX, vbY, vbW, vbH] = viewBox as [number, number, number, number];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const s = Math.min(1, MAX_PAGE_SIDE / Math.max(vbW, vbH));
  const page = doc.addPage([vbW * s, vbH * s]);

  // Root paint context. SVG's initial values are fill:black / stroke:none,
  // but the root <svg> may override them for the whole tree — OCAD roots set
  // fill="transparent", which is what makes their line paths stroke-only.
  // Pattern content sits outside the render tree and inherits from the root
  // too, so the same context seeds collectPatterns.
  const rootPaint: InheritedPaint = {
    fill: styleProp(root, 'fill') ?? 'black',
    stroke: styleProp(root, 'stroke') ?? null,
  };

  const ctx: RenderCtx = {
    page,
    font,
    patterns: collectPatterns(root, rootPaint),
    inkFilter: options.inkFilter,
  };

  // Base CTM: SVG user space (y-down, viewBox origin) → page points (y-up).
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(s, 0, 0, -s, -s * vbX, s * (vbY + vbH)),
  );
  for (const child of Array.from(root.children)) renderElement(ctx, child, rootPaint);
  page.pushOperators(popGraphicsState());

  return doc;
}
