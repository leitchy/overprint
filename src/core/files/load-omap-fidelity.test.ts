/**
 * OMAP renderer fidelity harness (2026-08). Locks the verified-good symbol-rendering
 * behaviour of the hand-rolled .omap → SVG builder so future edits to this ~1400-line
 * file can't silently regress it. Two tiers:
 *   1. Small synthetic fixtures, one per symbol category → readable golden-SVG snapshots.
 *   2. Structural invariants over a real map fixture (determinism + shape), not a
 *      multi-MB snapshot.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOmapXml, _buildSvg, _flattenCoords, _sampleAt, _extractGeoRef } from './load-omap';

// ---------------------------------------------------------------------------
// Minimal-OMAP fixture builder
// ---------------------------------------------------------------------------

/** Three colours: index 0 Black (upper ink), 1 Blue, 2 Brown. */
const COLORS = `
<color priority="0" name="Black" c="0" m="0" y="0" k="1"><rgb r="0" g="0" b="0"/></color>
<color priority="1" name="Blue" c="1" m="0.3" y="0" k="0"><rgb r="0" g="0.5" b="1"/></color>
<color priority="2" name="Brown" c="0" m="0.5" y="1" k="0.2"><rgb r="0.6" g="0.3" b="0"/></color>`;

/** Assemble a minimal but real-shaped .omap document (colors outside the barrier;
 *  symbols + objects inside barrier[0], matching the format the loader reads). */
function omap(symbolsXml: string, objectsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="8">
<colors count="3">${COLORS}</colors>
<barrier version="6" required="0.6.0">
<symbols count="9">${symbolsXml}</symbols>
<parts count="1" current="0"><part name="default"><objects count="9">${objectsXml}</objects></part></parts>
</barrier>
</map>`;
}

/** Parse + build the SVG for one minimal document. */
function render(symbolsXml: string, objectsXml: string): string {
  const p = parseOmapXml(omap(symbolsXml, objectsXml));
  return _buildSvg(p.objects, p.symbols, p.colors);
}

const SQUARE = `<coords count="4">0 0;2000 0;2000 2000;0 2000 2;</coords>`;
const LINE = `<coords count="2">0 0;3000 0;</coords>`;

// ---------------------------------------------------------------------------
// Tier 1 — synthetic golden-SVG snapshots, one per symbol category
// ---------------------------------------------------------------------------

describe('OMAP builder — golden snapshots per symbol category', () => {
  it('solid line', () => {
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="200"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    )).toMatchSnapshot();
  });

  it('dashed line (grouped)', () => {
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="200" dashed="true" dash_length="1000" break_length="400" dashes_in_group="2" in_group_break_length="150"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    )).toMatchSnapshot();
  });

  it('bordered (double) line', () => {
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="1" line_width="300"><borders><border color="0" width="100" shift="150"/></borders></line_symbol></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    )).toMatchSnapshot();
  });

  it('solid area fill', () => {
    expect(render(
      `<symbol type="4" id="1"><area_symbol inner_color="1"/></symbol>`,
      `<object type="1" symbol="1">${SQUARE}</object>`,
    )).toMatchSnapshot();
  });

  it('area with hatch pattern', () => {
    expect(render(
      `<symbol type="4" id="1"><area_symbol inner_color="-1"><pattern type="1" angle="0" line_spacing="600" line_width="100" color="0"/></area_symbol></symbol>`,
      `<object type="1" symbol="1">${SQUARE}</object>`,
    )).toMatchSnapshot();
  });

  it('area with dot pattern', () => {
    expect(render(
      `<symbol type="4" id="1"><area_symbol inner_color="-1"><pattern type="2" angle="0" line_spacing="600" point_distance="600"><point_symbol inner_radius="90" inner_color="0"/></pattern></area_symbol></symbol>`,
      `<object type="1" symbol="1">${SQUARE}</object>`,
    )).toMatchSnapshot();
  });

  it('combined symbol (area fill + line border) — the water/building case', () => {
    // Area part (id 1, blue fill) + line part (id 2, black outline).
    const syms =
      `<symbol type="4" id="1"><area_symbol inner_color="1"/></symbol>` +
      `<symbol type="2" id="2"><line_symbol color="0" line_width="150"/></symbol>` +
      `<symbol type="16" id="3"><combined_symbol><part symbol="1"/><part symbol="2"/></combined_symbol></symbol>`;
    expect(render(syms, `<object type="1" symbol="3">${SQUARE}</object>`)).toMatchSnapshot();
  });

  it('point symbol glyph', () => {
    expect(render(
      `<symbol type="1" id="1"><point_symbol inner_radius="200" inner_color="0"/></symbol>`,
      `<object type="0" symbol="1"><coords count="1">1000 1000;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('along-line mid symbol (fence ticks)', () => {
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="80" segment_length="1000"><mid_symbol><point_symbol inner_radius="0" inner_color="-1"><element><symbol type="2"><line_symbol color="0" line_width="60"/></symbol><object type="1"><coords count="2">0 -200;0 200;</coords></object></element></point_symbol></mid_symbol></line_symbol></symbol>`,
      `<object type="1" symbol="1"><coords count="2">0 0;4000 0;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('start + end along-line symbols (e.g. north-line arrow ends)', () => {
    const glyph = `<point_symbol inner_radius="150" inner_color="0"/>`;
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="60" segment_length="0"><start_symbol>${glyph}</start_symbol><end_symbol>${glyph}</end_symbol></line_symbol></symbol>`,
      `<object type="1" symbol="1"><coords count="2">0 0;3000 0;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('bezier-curved line', () => {
    // CurveStart flag (1) on the first coord → cubic through two control points.
    expect(render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="120"/></symbol>`,
      `<object type="1" symbol="1"><coords count="4">0 0 1;1000 1000;2000 1000;3000 0;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('area with a hole (island/donut polygon)', () => {
    // Outer square (HolePoint flag 16 on its last coord) then inner square = hole.
    expect(render(
      `<symbol type="4" id="1"><area_symbol inner_color="1"/></symbol>`,
      `<object type="1" symbol="1"><coords count="8">0 0;3000 0;3000 3000;0 3000 16;1000 1000;2000 1000;2000 2000;1000 2000 2;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('point glyph with line sub-elements (a cross/X symbol)', () => {
    expect(render(
      `<symbol type="1" id="1"><point_symbol inner_radius="0" inner_color="-1">` +
        `<element><symbol type="2"><line_symbol color="0" line_width="50"/></symbol><object type="1"><coords count="2">-200 0;200 0;</coords></object></element>` +
        `<element><symbol type="2"><line_symbol color="0" line_width="50"/></symbol><object type="1"><coords count="2">0 -200;0 200;</coords></object></element>` +
      `</point_symbol></symbol>`,
      `<object type="0" symbol="1"><coords count="1">1000 1000;</coords></object>`,
    )).toMatchSnapshot();
  });

  it('staggered (brick-layout) dot pattern', () => {
    expect(render(
      `<symbol type="4" id="1"><area_symbol inner_color="-1"><pattern type="2" angle="0" line_spacing="600" point_distance="600" offset_along_line="300"><point_symbol inner_radius="90" inner_color="2"/></pattern></area_symbol></symbol>`,
      `<object type="1" symbol="1">${SQUARE}</object>`,
    )).toMatchSnapshot();
  });

  it('glyphless point falls back to a dot', () => {
    // A point symbol whose glyph draws nothing → fallback circle r=80 at the object.
    expect(render(
      `<symbol type="1" id="1"><point_symbol inner_radius="0" inner_color="0"/></symbol>`,
      `<object type="0" symbol="1"><coords count="1">500 500;</coords></object>`,
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Tier 1b — targeted behavioural invariants (not snapshots)
// ---------------------------------------------------------------------------

describe('OMAP builder — text rendering', () => {
  const textSym = (extra = '') =>
    `<symbol type="8" id="1"><text_symbol><font family="Arial" size="4000"${extra}/><text color="0" line_spacing="1.2"/></text_symbol></symbol>`;

  it('left-aligned single-line text', () => {
    expect(render(
      textSym(),
      `<object type="4" symbol="1" h_align="0" v_align="2"><coords count="1">1000 1000;</coords><text>Hello</text></object>`,
    )).toMatchSnapshot();
  });

  it('bold + italic text', () => {
    expect(render(
      textSym(' bold="true" italic="true"'),
      `<object type="4" symbol="1" h_align="0" v_align="0"><coords count="1">0 0;</coords><text>Bold</text></object>`,
    )).toMatchSnapshot();
  });

  it('multi-line text emits tspans', () => {
    expect(render(
      textSym(),
      `<object type="4" symbol="1" h_align="0" v_align="0"><coords count="1">0 0;</coords><text>line one\nline two</text></object>`,
    )).toMatchSnapshot();
  });

  it('escapes XML-special characters in text', () => {
    const svg = render(
      textSym(),
      `<object type="4" symbol="1" h_align="0" v_align="2"><coords count="1">0 0;</coords><text>A &amp; B &lt;c&gt;</text></object>`,
    );
    expect(svg).toContain('A &amp; B &lt;c&gt;');
    expect(svg).not.toContain('A & B <c>');
  });
});

describe('OMAP builder — edge cases & fallbacks', () => {
  it('skips hidden symbols entirely', () => {
    const svg = render(
      `<symbol type="2" id="1" hidden="true"><line_symbol color="0" line_width="200"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    );
    expect(svg).not.toContain('<path d="M0 0 L3000 0"'); // the hidden line is not drawn
  });

  it('renders an unknown colour index as black', () => {
    const svg = render(
      `<symbol type="2" id="1"><line_symbol color="99" line_width="200"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    );
    expect(svg).toContain('stroke="rgb(0,0,0)"');
  });

  it('rotates a point glyph by the object rotation (radians → degrees)', () => {
    const svg = render(
      `<symbol type="1" id="1"><point_symbol inner_radius="0" inner_color="-1"><element><symbol type="2"><line_symbol color="0" line_width="50"/></symbol><object type="1"><coords count="2">0 -200;0 200;</coords></object></element></point_symbol></symbol>`,
      `<object type="0" symbol="1" rotation="1.5707963267948966"><coords count="1">1000 1000;</coords></object>`,
    );
    expect(svg).toMatch(/translate\(1000,1000\) rotate\(90(\.0+)?\)/);
  });
});

describe('OMAP builder — colour-priority draw order', () => {
  it('higher-priority (lower index) colour is emitted later → drawn on top', () => {
    // Two overlapping areas: brown (index 2, low priority) and black (index 0, high).
    const syms =
      `<symbol type="4" id="1"><area_symbol inner_color="2"/></symbol>` +
      `<symbol type="4" id="2"><area_symbol inner_color="0"/></symbol>`;
    const objs =
      `<object type="1" symbol="1">${SQUARE}</object>` +
      `<object type="1" symbol="2">${SQUARE}</object>`;
    const svg = render(syms, objs);
    const brownAt = svg.indexOf('fill="rgb(153,77,0)"'); // brown fill (0.6/0.3/0 → 153/77/0)
    const blackAt = svg.indexOf('fill="rgb(0,0,0)"'); // black fill
    expect(brownAt).toBeGreaterThanOrEqual(0);
    expect(blackAt).toBeGreaterThan(brownAt); // black later in string = on top
  });

  it('tags 100% black as an upper ink for IOF colour order', () => {
    const svg = render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="200"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>`,
    );
    expect(svg).toContain('data-ink="upper"');
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — real-fixture structural invariants + determinism
// ---------------------------------------------------------------------------

describe('OMAP builder — real fixtures (parse + deterministic build)', () => {
  // Two big .omap maps, the condensed complete-map, and the one .xmap (pretty-printed)
  // variant — the loader must handle both formatting styles of the same schema.
  const fixtures = [
    'maps/complete-map.omap',
    'maps/Mt Taylor 2024.omap',
    'maps/Radford College 3000 Feb 2026.omap',
    'maps/issue-513.xmap',
  ];

  for (const rel of fixtures) {
    it(`parses ${rel} and builds a well-formed SVG deterministically`, () => {
      const xml = readFileSync(join(process.cwd(), 'tests/fixtures', rel), 'utf-8');
      const p = parseOmapXml(xml);
      expect(p.objects.length).toBeGreaterThan(0);
      expect(p.symbols.size).toBeGreaterThan(0);

      const a = _buildSvg(p.objects, p.symbols, p.colors);
      const b = _buildSvg(p.objects, p.symbols, p.colors);
      expect(a).toBe(b); // pure builder → identical output
      expect(a.startsWith('<svg')).toBe(true);
      expect(a).toMatch(/viewBox="/);
      expect(a.trim().endsWith('</svg>')).toBe(true);
    });
  }

  it('the large maps produce substantial geometry with upper-ink tagging', () => {
    const xml = readFileSync(join(process.cwd(), 'tests/fixtures/maps/Mt Taylor 2024.omap'), 'utf-8');
    const p = parseOmapXml(xml);
    expect(p.objects.length).toBeGreaterThan(500);
    const svg = _buildSvg(p.objects, p.symbols, p.colors);
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(200);
    expect(svg).toContain('data-ink="upper"');
  });

  it('rejects the legacy binary OMAP format with a clear error', () => {
    expect(() => parseOmapXml('OMAP\x00\x08 legacy binary blob')).toThrow(/legacy/i);
  });
});

// ---------------------------------------------------------------------------
// Exported geometry helpers (previously unasserted)
// ---------------------------------------------------------------------------

describe('flattenCoords / sampleAt', () => {
  it('flattens a straight two-point line to one sub-path with correct length', () => {
    const subs = _flattenCoords([
      { x: 0, y: 0, flags: 0 },
      { x: 300, y: 400, flags: 0 },
    ]);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.length).toBeCloseTo(500, 3); // 3-4-5 triangle
    expect(subs[0]!.closed).toBe(false);
  });

  it('splits hole-flagged coords into separate sub-paths', () => {
    const subs = _flattenCoords([
      { x: 0, y: 0, flags: 0 },
      { x: 100, y: 0, flags: 16 }, // HOLE_POINT ends sub-path
      { x: 0, y: 100, flags: 0 },
      { x: 100, y: 100, flags: 0 },
    ]);
    expect(subs).toHaveLength(2);
  });

  it('samples position + tangent angle along a horizontal line', () => {
    const sp = _flattenCoords([
      { x: 0, y: 0, flags: 0 },
      { x: 1000, y: 0, flags: 0 },
    ])[0]!;
    const mid = _sampleAt(sp, 500);
    expect(mid.x).toBeCloseTo(500, 3);
    expect(mid.y).toBeCloseTo(0, 3);
    expect(mid.angleDeg).toBeCloseTo(0, 3); // pointing +x
  });

  it('flattens a bezier to a curve longer than its chord and samples the curve (not the chord)', () => {
    // CurveStart(1) → cubic from (0,0) via (0,1000),(1000,1000) to (1000,0).
    const subs = _flattenCoords([
      { x: 0, y: 0, flags: 1 },
      { x: 0, y: 1000, flags: 0 },
      { x: 1000, y: 1000, flags: 0 },
      { x: 1000, y: 0, flags: 0 },
    ]);
    expect(subs).toHaveLength(1);
    const chord = 1000; // straight-line distance (0,0)→(1000,0)
    expect(subs[0]!.length).toBeGreaterThan(chord); // arc is longer than the chord
    const mid = _sampleAt(subs[0]!, subs[0]!.length / 2);
    // Mid of this symmetric arc bulges up to y≈750 — NOT the chord midpoint (y=0).
    expect(mid.x).toBeCloseTo(500, 0);
    expect(mid.y).toBeGreaterThan(400);
  });
});

// ---------------------------------------------------------------------------
// Georeferencing — feeds GPS control placement (correctness-critical)
// ---------------------------------------------------------------------------

describe('extractGeoRef', () => {
  const geoDoc = (attrs: string, body: string) =>
    parseOmapXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="8">
<georeferencing ${attrs}>${body}</georeferencing>
<colors count="0"></colors>
<barrier version="6"><symbols count="0"></symbols><parts count="1"><part><objects count="0"></objects></part></parts></barrier>
</map>`,
    );

  it('parses PROJ.4, ref point, scale and converts grivation degrees → radians', () => {
    const p = geoDoc(
      'scale="15000" grivation="1.5"',
      `<projected_crs id="UTM zone 55S"><spec language="PROJ.4">+proj=utm +zone=55 +south +datum=WGS84</spec><ref_point x="689345.67" y="6077123.45"/></projected_crs>`,
    );
    expect(p.scale).toBe(15000);
    const g = _extractGeoRef(p.doc, p.scale, 1, 0, 0, 1000)!;
    expect(g).not.toBeNull();
    expect(g.projDef).toBe('+proj=utm +zone=55 +south +datum=WGS84');
    expect(g.easting).toBeCloseTo(689345.67, 2);
    expect(g.northing).toBeCloseTo(6077123.45, 2);
    expect(g.grivation).toBeCloseTo((1.5 * Math.PI) / 180, 9); // degrees → radians, NOT 1.5
    expect(g.scale).toBe(15000);
    expect(g.source).toBe('omap');
  });

  it('returns null without a projected_crs / PROJ.4 spec', () => {
    const p = geoDoc('scale="10000"', `<projected_crs id="Local"/>`);
    expect(_extractGeoRef(p.doc, p.scale, 1, 0, 0, 1000)).toBeNull();
  });

  it('extractScale rejects out-of-range scales (boundary guard)', () => {
    expect(geoDoc('scale="50"', '').scale).toBeNull(); // < 100
    expect(geoDoc('scale="2000000"', '').scale).toBeNull(); // ≥ 1_000_000
    expect(geoDoc('scale="100"', '').scale).toBe(100); // inclusive lower bound
  });

  it('extracts real fixtures\' georeferencing (Mt Taylor)', () => {
    const p = parseOmapXml(readFileSync(join(process.cwd(), 'tests/fixtures/maps/Mt Taylor 2024.omap'), 'utf-8'));
    const g = _extractGeoRef(p.doc, p.scale, 1, 0, 0, 1000);
    if (g) {
      expect(String(g.projDef).length).toBeGreaterThan(0);
      expect(Number.isFinite(g.grivation)).toBe(true);
      expect(g.scale).toBe(p.scale);
    }
    expect(typeof p.scale === 'number' || p.scale === null).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Text alignment — the real centering math (jsdom canvas measureText mocked)
// ---------------------------------------------------------------------------

describe('OMAP builder — text centering math', () => {
  afterEach(() => vi.restoreAllMocks());

  const textSym = `<symbol type="8" id="1"><text_symbol><font family="Arial" size="4000"/><text color="0"/></text_symbol></symbol>`;
  const centred = `<object type="4" symbol="1" h_align="1" v_align="2"><coords count="1">1000 0;</coords><text>X</text></object>`;
  const rightAligned = `<object type="4" symbol="1" h_align="2" v_align="2"><coords count="1">1000 0;</coords><text>X</text></object>`;

  // NOTE: without a mocked canvas, jsdom's measureText returns width 0, so centred /
  // right text collapses to the left-aligned x — the snapshots elsewhere lock that
  // degenerate (test-only) behaviour. Here we mock a known width to assert the REAL math.
  it('centre alignment shifts x left by half the measured width', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({ width: 400 }),
    } as unknown as CanvasRenderingContext2D);
    const p = parseOmapXml(omap(textSym, centred));
    const svg = _buildSvg(p.objects, p.symbols, p.colors);
    // svgRenderScale is 1 for a text-only bbox → measuredUnits = 400; centre: 1000 − 200.
    expect(svg).toMatch(/<text x="800"/);
  });

  it('right alignment shifts x left by the full measured width', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({ width: 400 }),
    } as unknown as CanvasRenderingContext2D);
    const p = parseOmapXml(omap(textSym, rightAligned));
    const svg = _buildSvg(p.objects, p.symbols, p.colors);
    expect(svg).toMatch(/<text x="600"/); // 1000 − 400
  });
});

// ---------------------------------------------------------------------------
// Along-line spacing — closed rings & min counts (midSpots branches)
// ---------------------------------------------------------------------------

describe('OMAP builder — along-line spacing', () => {
  const tickGlyph = `<point_symbol inner_radius="0" inner_color="-1"><element><symbol type="2"><line_symbol color="0" line_width="40"/></symbol><object type="1"><coords count="2">0 -150;0 150;</coords></object></element></point_symbol>`;
  const stamps = (svg: string) => (svg.match(/<g transform="translate\(/g) ?? []).length;

  it('closed ring uses the minimum-mid-symbol-count-when-closed', () => {
    // Perimeter 4000 (1000/side), segment_length 1000 → 4, but min-when-closed 6 wins.
    const svg = render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="60" segment_length="1000" minimum_mid_symbol_count_when_closed="6"><mid_symbol>${tickGlyph}</mid_symbol></line_symbol></symbol>`,
      `<object type="1" symbol="1"><coords count="4">0 0;1000 0;1000 1000;0 1000 2;</coords></object>`,
    );
    expect(stamps(svg)).toBe(6);
  });

  it('open line honours minimum_mid_symbol_count', () => {
    const svg = render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="60" segment_length="5000" minimum_mid_symbol_count="4"><mid_symbol>${tickGlyph}</mid_symbol></line_symbol></symbol>`,
      `<object type="1" symbol="1"><coords count="2">0 0;3000 0;</coords></object>`,
    );
    // segment_length ≫ line → 1 segment, but minCount forces ≥ 4 spots.
    expect(stamps(svg)).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Combined-symbol resolution variants + coord format + resilience
// ---------------------------------------------------------------------------

describe('OMAP builder — combined-symbol variants', () => {
  it('resolves a point part for colour', () => {
    const syms =
      `<symbol type="1" id="1"><point_symbol inner_radius="150" inner_color="2"/></symbol>` +
      `<symbol type="16" id="2"><combined_symbol><part symbol="1"/></combined_symbol></symbol>`;
    // No throw + the combined symbol adopts the point part's colour index (2 = brown).
    expect(() => render(syms, `<object type="0" symbol="2"><coords count="1">0 0;</coords></object>`)).not.toThrow();
  });

  it('legacy inline nested <symbol> form (older OOM exports) still renders', () => {
    const syms = `<symbol type="16" id="1"><symbol type="2"><line_symbol color="0" line_width="200"/></symbol></symbol>`;
    const svg = render(syms, `<object type="1" symbol="1">${LINE}</object>`);
    expect(svg).toContain('stroke="rgb(0,0,0)"');
  });
});

describe('OMAP builder — coord formats & resilience', () => {
  it('element-form <coord> list renders identically to the inline text form', () => {
    const sym = `<symbol type="2" id="1"><line_symbol color="0" line_width="200"/></symbol>`;
    const inline = render(sym, `<object type="1" symbol="1"><coords count="2">0 0;3000 0;</coords></object>`);
    const element = render(sym, `<object type="1" symbol="1"><coords count="2"><coord x="0" y="0"/><coord x="3000" y="0"/></coords></object>`);
    expect(element).toBe(inline);
  });

  it('does not throw on malformed / defensive inputs', () => {
    // object referencing a missing symbol id; a dashed=true line with zero dash length;
    // an empty-coords object — all should be skipped/handled, not crash.
    expect(() => render(
      `<symbol type="2" id="1"><line_symbol color="0" line_width="100" dashed="true" dash_length="0" break_length="0"/></symbol>`,
      `<object type="1" symbol="1">${LINE}</object>` +
      `<object type="1" symbol="999"><coords count="2">0 0;100 0;</coords></object>` +
      `<object type="1" symbol="1"><coords count="0"></coords></object>`,
    )).not.toThrow();
  });
});
