/**
 * OMAP renderer fidelity harness (2026-08). Locks the verified-good symbol-rendering
 * behaviour of the hand-rolled .omap → SVG builder so future edits to this ~1400-line
 * file can't silently regress it. Two tiers:
 *   1. Small synthetic fixtures, one per symbol category → readable golden-SVG snapshots.
 *   2. Structural invariants over a real map fixture (determinism + shape), not a
 *      multi-MB snapshot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOmapXml, _buildSvg, _flattenCoords, _sampleAt } from './load-omap';

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
});

// ---------------------------------------------------------------------------
// Tier 1b — targeted behavioural invariants (not snapshots)
// ---------------------------------------------------------------------------

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

describe('OMAP builder — real fixture (complete-map.omap)', () => {
  const xml = readFileSync(join(process.cwd(), 'tests/fixtures/maps/complete-map.omap'), 'utf-8');

  it('parses a substantial map', () => {
    const p = parseOmapXml(xml);
    expect(p.objects.length).toBeGreaterThan(50);
    expect(p.symbols.size).toBeGreaterThan(10);
    expect(p.colors.size).toBeGreaterThan(3);
  });

  it('builds a non-trivial, well-formed SVG deterministically', () => {
    const p = parseOmapXml(xml);
    const a = _buildSvg(p.objects, p.symbols, p.colors);
    const b = _buildSvg(p.objects, p.symbols, p.colors);
    expect(a).toBe(b); // pure builder → identical output
    expect(a.startsWith('<svg')).toBe(true);
    expect(a).toMatch(/viewBox="/);
    expect((a.match(/<path/g) ?? []).length).toBeGreaterThan(50);
    expect(a).toContain('data-ink="upper"'); // black/brown/blue upper inks tagged
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
});
