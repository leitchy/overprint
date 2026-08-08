import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  parseColor,
  parsePathD,
  parseTransform,
  validateSvgForVector,
  renderSvgToScratchPdf,
  MAX_SVG_NODES,
} from './svg-to-pdf';

// ---------------------------------------------------------------------------
// parseColor
// ---------------------------------------------------------------------------

describe('parseColor', () => {
  it('parses rgb() with and without spaces', () => {
    expect(parseColor('rgb(187,41,187)')).toEqual(rgb(187 / 255, 41 / 255, 187 / 255));
    expect(parseColor('rgb(255, 0, 128)')).toEqual(rgb(1, 0, 128 / 255));
  });

  it('parses hex colours', () => {
    expect(parseColor('#BB29BB')).toEqual(rgb(187 / 255, 41 / 255, 187 / 255));
    expect(parseColor('#fff')).toEqual(rgb(1, 1, 1));
    expect(parseColor('#000')).toEqual(rgb(0, 0, 0));
  });

  it('parses keywords', () => {
    expect(parseColor('white')).toEqual(rgb(1, 1, 1));
    expect(parseColor('black')).toEqual(rgb(0, 0, 0));
  });

  it('returns null for none, empty, and unknown values', () => {
    expect(parseColor('none')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('url(#pat-1)')).toBeNull();
    expect(parseColor('rebeccapurple')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parsePathD
// ---------------------------------------------------------------------------

describe('parsePathD', () => {
  it('round-trips absolute M/L/C/Z commands', () => {
    const cmds = parsePathD('M 10 20 L 30 40 C 1 2 3 4 5 6 Z');
    expect(cmds).toEqual([
      { op: 'M', args: [10, 20] },
      { op: 'L', args: [30, 40] },
      { op: 'C', args: [1, 2, 3, 4, 5, 6] },
      { op: 'Z', args: [] },
    ]);
  });

  it('handles implicit L repetition after M and multi-subpath strings', () => {
    const cmds = parsePathD('M 0 0 10 0 10 10 Z M 20 20 L 30 30');
    expect(cmds).toEqual([
      { op: 'M', args: [0, 0] },
      { op: 'L', args: [10, 0] },
      { op: 'L', args: [10, 10] },
      { op: 'Z', args: [] },
      { op: 'M', args: [20, 20] },
      { op: 'L', args: [30, 30] },
    ]);
  });

  it('handles negative and decimal numbers with commas', () => {
    expect(parsePathD('M -1.5,2.5 L 3e2,-0.25')).toEqual([
      { op: 'M', args: [-1.5, 2.5] },
      { op: 'L', args: [300, -0.25] },
    ]);
  });

  it('rejects arcs, relative commands, and other verbs', () => {
    expect(parsePathD('M 0 0 A 5 5 0 0 1 10 10')).toBeNull();
    expect(parsePathD('m 0 0 l 1 1')).toBeNull();
    expect(parsePathD('M 0 0 H 10')).toBeNull();
    expect(parsePathD('M 0 0 Q 1 2 3 4')).toBeNull();
  });

  it('rejects malformed argument lists', () => {
    expect(parsePathD('M 0')).toBeNull();
    expect(parsePathD('M 0 0 C 1 2 3')).toBeNull();
    expect(parsePathD('M 0 0 L x y')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTransform
// ---------------------------------------------------------------------------

describe('parseTransform', () => {
  it('parses translate/rotate/scale and composes them', () => {
    expect(parseTransform('translate(10,20)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    const m = parseTransform('translate(100,200) rotate(90)');
    expect(m).not.toBeNull();
    expect(m![4]).toBeCloseTo(100);
    expect(m![5]).toBeCloseTo(200);
    expect(m![0]).toBeCloseTo(0);
    expect(m![1]).toBeCloseTo(1);
  });

  it('parses rotate with a centre', () => {
    const m = parseTransform('rotate(180, 10, 10)');
    expect(m).not.toBeNull();
    // (0,0) → (20,20) under rotate(180°) about (10,10)
    expect(m![4]).toBeCloseTo(20);
    expect(m![5]).toBeCloseTo(20);
  });

  it('rejects matrix/skew and garbage', () => {
    expect(parseTransform('matrix(1,0,0,1,0,0)')).toBeNull();
    expect(parseTransform('skewX(20)')).toBeNull();
    expect(parseTransform('translate(1,2) bogus')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateSvgForVector
// ---------------------------------------------------------------------------

/** Representative snippet of load-omap.ts buildSvg output. */
const OMAP_SNIPPET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 1200 1200">
<defs>
<pattern id="pat-9-0" patternUnits="userSpaceOnUse" width="600" height="600" patternTransform="rotate(45, 0, 0)">
<line x1="0" y1="300" x2="600" y2="300" stroke="rgb(0,120,0)" stroke-width="80"/>
</pattern>
<pattern id="pat-10-0" patternUnits="userSpaceOnUse" width="500" height="1000" patternTransform="rotate(0, 0, 0)">
<circle cx="250" cy="250" r="90" fill="rgb(0,120,0)"/>
<circle cx="0" cy="750" r="90" fill="rgb(0,120,0)"/>
<circle cx="500" cy="750" r="90" fill="rgb(0,120,0)"/>
</pattern>
</defs>
<rect x="-100" y="-100" width="1200" height="1200" fill="white"/>
<path d="M 0 0 L 100 0 C 150 0 200 50 200 100 L 0 100 Z" fill="rgb(255,186,0)" fill-rule="evenodd"/>
<path d="M 0 0 L 100 0 L 100 100 Z" fill="url(#pat-9-0)" fill-rule="evenodd"/>
<path d="M 200 200 L 300 300" fill="none" stroke="rgb(0,0,0)" stroke-width="35" stroke-dasharray="600,600" stroke-linecap="butt" stroke-linejoin="round"/>
<g transform="translate(500,500) rotate(30)"><circle cx="0" cy="0" r="80" fill="rgb(0,0,255)"/></g>
<circle cx="400" cy="400" r="80" fill="rgb(0,0,0)"/>
<text x="10" y="10" fill="rgb(0,0,0)" font-family="sans-serif" font-size="400" font-weight="bold" font-style="normal" text-anchor="start" dominant-baseline="hanging">Spring<tspan x="10" dy="1em">Gully</tspan></text>
</svg>`;

/** Representative snippet of ocad2geojson ocadToSvg output (style attrs). */
const OCAD_SNIPPET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5000 4000">
<g>
<path d="M 100 100 L 900 100 L 900 900 Z" style="fill:rgb(255,186,0);" fill-rule="evenodd"/>
<path d="M 0 0 C 10 20 30 40 50 60" style="fill:none;stroke:rgb(35,35,30);stroke-width:35;stroke-dasharray:600,600;stroke-linecap:butt;stroke-linejoin:round;"/>
<polygon points="10,10 20,10 20,20" style="fill:rgb(0,0,0);"/>
</g>
</svg>`;

describe('validateSvgForVector', () => {
  it('accepts a representative OMAP snippet', () => {
    const result = validateSvgForVector(OMAP_SNIPPET);
    expect(result.unsupportedTags).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.nodeCount).toBeGreaterThan(5);
  });

  it('accepts a representative OCAD snippet (style attrs, rotate pattern)', () => {
    const result = validateSvgForVector(OCAD_SNIPPET);
    expect(result.unsupportedTags).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a path with an arc command', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M 0 0 A 5 5 0 0 1 10 10" fill="black"/></svg>';
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('path[d]');
  });

  it('rejects an <image> element', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:," width="10" height="10"/></svg>';
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('image');
  });

  it('rejects a pattern with a non-tileable child (use/text)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><pattern id="p1" width="5" height="5"><use href="#glyph"/></pattern></defs>
      <path d="M 0 0 L 10 0 L 10 10 Z" fill="url(#p1)"/>
    </svg>`;
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('pattern');
  });

  it('rejects a pattern with a <path> child using unsupported commands', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><pattern id="p1" width="5" height="5"><path d="M 0 0 A 5 5 0 0 1 10 10" stroke="black"/></pattern></defs>
      <path d="M 0 0 L 10 0 L 10 10 Z" fill="url(#p1)"/>
    </svg>`;
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('pattern');
  });

  it('accepts OCAD-style rect-bar and path-dash pattern tiles', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <pattern id="bars" patternUnits="userSpaceOnUse" width="10" height="42" patternTransform="rotate(90,0,0)">
          <rect x="0" y="0" width="10" height="14" fill="rgb(54,182,75)"/>
        </pattern>
        <pattern id="dashes" patternUnits="userSpaceOnUse" width="20" height="20">
          <path d="M 0 5 L 12 5" style="stroke:rgb(0,60,255);stroke-width:2"/>
          <path d="M 4 12 L 16 12" style="stroke:rgb(0,60,255);stroke-width:2"/>
          <path d="M 0 19 L 12 19" style="stroke:rgb(0,60,255);stroke-width:2"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 50 0 L 50 50 Z" fill="url(#bars)"/>
      <path d="M 50 50 L 90 50 L 90 90 Z" fill="url(#dashes)"/>
    </svg>`;
    const result = validateSvgForVector(svg);
    expect(result.unsupportedTags).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts a degenerate 0x0 pattern with no children as a no-op fill', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <defs><pattern id="empty" patternUnits="userSpaceOnUse" width="0" height="0"/></defs>
      <path d="M 0 0 L 10 0 L 10 10 Z" fill="url(#empty)"/>
    </svg>`;
    const result = validateSvgForVector(svg);
    expect(result.unsupportedTags).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects an unsupported transform function', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g transform="matrix(1,0,0,1,5,5)"><rect x="0" y="0" width="1" height="1"/></g></svg>';
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('g[transform]');
  });

  it('rejects a fill referencing a missing pattern', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M 0 0 L 1 0 L 1 1 Z" fill="url(#nope)"/></svg>';
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.unsupportedTags).toContain('fill[url]');
  });

  it('rejects documents over the node cap', () => {
    const shapes = '<circle cx="0" cy="0" r="1" fill="black"/>'.repeat(MAX_SVG_NODES + 1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${shapes}</svg>`;
    const result = validateSvgForVector(svg);
    expect(result.ok).toBe(false);
    expect(result.nodeCount).toBeGreaterThan(MAX_SVG_NODES);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// renderSvgToScratchPdf
// ---------------------------------------------------------------------------

const TINY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
<rect x="0" y="0" width="200" height="100" fill="white"/>
<path d="M 10 10 L 90 10 L 90 90 L 10 90 Z M 30 30 L 70 30 L 70 70 L 30 70 Z" fill="rgb(255,186,0)" fill-rule="evenodd"/>
<circle cx="150" cy="50" r="30" fill="none" stroke="rgb(187,41,187)" stroke-width="4"/>
<text x="20" y="95" fill="black" font-size="10">Hello</text>
</svg>`;

/** Save without object streams so dictionaries stay plainly readable. */
async function saveFlat(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: false });
}

/** Latin1-decode bytes (1:1 byte↔char, so string offsets are byte offsets). */
function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

/**
 * Extract and decompress all stream bodies (pdf-lib Flate-compresses the
 * content streams it creates) and return the concatenated operator text.
 */
function contentStreamText(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  const bodies: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const body = bytes.subarray(start, end);
    try {
      bodies.push(inflateSync(body).toString('latin1'));
    } catch {
      bodies.push(latin1(body));
    }
    re.lastIndex = end;
  }
  return bodies.join('\n');
}

describe('renderSvgToScratchPdf', () => {
  it('produces a loadable one-page PDF with the viewBox aspect ratio', async () => {
    const doc = await renderSvgToScratchPdf(TINY_SVG);
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    const { width, height } = loaded.getPage(0).getSize();
    expect(width / height).toBeCloseTo(2, 5);
  });

  it('emits vector fill operators and no image XObjects', async () => {
    const doc = await renderSvgToScratchPdf(TINY_SVG);
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    // Even-odd fill for the donut path, plain fill for the white rect.
    expect(content).toMatch(/(^|\s)f\*(\s|$)/);
    expect(content).toMatch(/(^|\s)f(\s|$)/);
    // Stroke for the circle outline.
    expect(content).toMatch(/(^|\s)S(\s|$)/);
    // Bezier curves for the circle.
    expect(content).toMatch(/(^|\s)c(\s|$)/);
    // Text object for the label.
    expect(content).toContain('BT');
    // No raster anywhere.
    const raw = latin1(bytes);
    expect(raw).not.toContain('/Subtype /Image');
    expect(raw).not.toContain('/DCTDecode');
  });

  it('emits the base flip CTM for the viewBox', async () => {
    const doc = await renderSvgToScratchPdf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -20 100 200"><rect x="-50" y="-20" width="100" height="200" fill="white"/></svg>');
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    // s = 1 (small viewBox): cm 1 0 0 -1 50 180
    expect(content).toMatch(/1 0 0 -1 50 180 cm/);
  });

  it('scales oversized viewBoxes to fit the page cap', async () => {
    const doc = await renderSvgToScratchPdf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280000 140000"><rect x="0" y="0" width="280000" height="140000" fill="white"/></svg>');
    const [page] = doc.getPages();
    expect(page!.getWidth()).toBeCloseTo(14_000, 3);
    expect(page!.getHeight()).toBeCloseTo(7_000, 3);
  });

  it('renders pattern fills as clipped tiled vectors', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="100" height="100" patternTransform="rotate(45, 0, 0)">
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgb(0,120,0)" stroke-width="10"/>
        </pattern>
        <pattern id="dots" patternUnits="userSpaceOnUse" width="100" height="100" patternTransform="rotate(0, 0, 0)">
          <circle cx="50" cy="50" r="10" fill="rgb(0,120,0)"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 500 0 L 500 500 L 0 500 Z" fill="url(#hatch)" fill-rule="evenodd"/>
      <path d="M 500 500 L 900 500 L 900 900 Z" fill="url(#dots)" fill-rule="evenodd"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    // Clip (even-odd) before tiling, and stroked hatch lines inside.
    expect(content).toMatch(/(^|\s)W\*(\s|$)/);
    expect(content).toMatch(/(^|\s)S(\s|$)/);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('renders an OCAD rect-bar pattern as clipped tiled fills', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <defs>
        <pattern id="bars" patternUnits="userSpaceOnUse" width="10" height="42" patternTransform="rotate(90,0,0)">
          <rect x="0" y="0" width="10" height="14" fill="rgb(54,182,75)"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 400 0 L 400 400 L 0 400 Z" fill="url(#bars)" fill-rule="evenodd"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    // Clipped (even-odd), per-cell translate CTMs, filled rect tiles.
    expect(content).toMatch(/(^|\s)W\*(\s|$)/);
    expect(content).toMatch(/1 0 0 1 -?\d+ -?\d+ cm/);
    expect(content).toMatch(/0\.21\d* 0\.71\d* 0\.29\d* rg/); // rgb(54,182,75)
    expect(content).toMatch(/(^|\s)f(\s|$)/);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('renders an OCAD path-dash pattern (M/L tile) as tiled strokes', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <defs>
        <pattern id="dash" patternUnits="userSpaceOnUse" width="50" height="50">
          <path d="M 0 25 L 30 25" style="fill:none;stroke:rgb(0,60,255);stroke-width:4"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 400 0 L 400 400 Z" fill="url(#dash)"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    expect(content).toMatch(/(^|\s)W(\s|$)/); // nonzero clip (no fill-rule)
    expect(content).toMatch(/(^|\s)S(\s|$)/); // stroked dashes
    expect(content).toMatch(/1 0 0 1 -?\d+ -?\d+ cm/);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('renders a multi-path pattern tile (all three dashes per cell)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <defs>
        <pattern id="marsh" patternUnits="userSpaceOnUse" width="100" height="100">
          <path d="M 0 20 L 60 20" style="stroke:rgb(0,60,255);stroke-width:4"/>
          <path d="M 20 50 L 80 50" style="stroke:rgb(0,60,255);stroke-width:4"/>
          <path d="M 0 80 L 60 80" style="stroke:rgb(0,60,255);stroke-width:4"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 100 0 L 100 100 L 0 100 Z" fill="url(#marsh)"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const content = contentStreamText(await saveFlat(doc));
    // Each cell replays 3 dash primitives; with the ±1-cell tiling apron the
    // 100×100 area spans at least a 3×3 grid → ≥ 27 paint ops. Without an
    // explicit fill:none the SVG default black fill applies, so each dash
    // paints via B (fill+stroke); accept S or B.
    const paintCount = (content.match(/^[SB]\*?$/gm) ?? []).length;
    expect(paintCount).toBeGreaterThanOrEqual(27);
  });

  it('treats a degenerate 0x0 pattern fill as a no-op, not a failure', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><pattern id="empty" patternUnits="userSpaceOnUse" width="0" height="0"/></defs>
      <path d="M 0 0 L 100 0 L 100 100 Z" fill="url(#empty)"/>
      <circle cx="50" cy="50" r="10" fill="black"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const bytes = await saveFlat(doc);
    const content = contentStreamText(bytes);
    // No clip was emitted for the skipped pattern fill…
    expect(content).not.toMatch(/(^|\s)W\*?(\s|$)/);
    // …but the rest of the document still rendered.
    expect(content).toMatch(/(^|\s)f(\s|$)/);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('renders the full representative OMAP snippet without throwing', async () => {
    expect(validateSvgForVector(OMAP_SNIPPET).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(OMAP_SNIPPET);
    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('skips text Helvetica cannot encode instead of throwing', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50" fill="black" font-size="10">Čertův mlýn ř</text></svg>';
    const doc = await renderSvgToScratchPdf(svg);
    const bytes = await doc.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('applies opacity via an ExtGState', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 0 0 L 100 0 L 100 100 Z" fill="rgb(255,0,0)" fill-rule="evenodd" opacity="0.35"/></svg>';
    const doc = await renderSvgToScratchPdf(svg);
    const raw = latin1(await saveFlat(doc));
    expect(raw).toContain('/ExtGState');
    expect(raw).toContain('0.35');
  });

  it('inherits fill="transparent" from the root svg (stroke-only paths, no black flood)', async () => {
    // Real OCAD output: <svg fill="transparent"> and line paths whose style
    // sets only stroke — they must NOT be filled black by default.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="0 0 100 100">
      <g><path d="M 10 10 L 90 10 L 90 90" style="stroke: rgb(211,124,80); stroke-width: 3;"/></g>
    </svg>`;
    const doc = await renderSvgToScratchPdf(svg);
    const content = contentStreamText(await saveFlat(doc));
    expect(content).toMatch(/^S$/m);
    // No fill of any kind (f, f*, B, B*) anywhere in the document.
    expect(content).not.toMatch(/^[fB]\*?$/m);
  });

  it('inherits a <g fill> down to children without their own fill', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g fill="rgb(255,0,0)"><path d="M 10 10 L 90 10 L 50 90 Z"/></g>
    </svg>`;
    const doc = await renderSvgToScratchPdf(svg);
    const content = contentStreamText(await saveFlat(doc));
    expect(content).toMatch(/1 0 0 rg/); // red inherited from the group
    expect(content).toMatch(/^f$/m);
  });

  it('pattern path tiles inherit the root transparent fill (stroke-only dashes)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="0 0 200 200">
      <defs>
        <pattern id="dash" patternUnits="userSpaceOnUse" width="50" height="50">
          <path d="M 0 25 L 30 25" style="stroke: rgb(0,60,255); stroke-width: 4;"/>
        </pattern>
      </defs>
      <path d="M 0 0 L 200 0 L 200 200 L 0 200 Z" style="fill: url(#dash);"/>
    </svg>`;
    expect(validateSvgForVector(svg).ok).toBe(true);
    const doc = await renderSvgToScratchPdf(svg);
    const content = contentStreamText(await saveFlat(doc));
    // Dashes are stroked per cell — never filled-and-stroked (no black blobs).
    expect((content.match(/^S$/gm) ?? []).length).toBeGreaterThanOrEqual(9);
    expect(content).not.toMatch(/^B\*?$/m);
  });

  it('throws on a missing viewBox', async () => {
    await expect(renderSvgToScratchPdf('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1" height="1"/></svg>'))
      .rejects.toThrow(/viewBox/);
  });
});
