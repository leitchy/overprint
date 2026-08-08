import { describe, it, expect } from 'vitest';
import { _coordsToPath as coordsToPath } from './load-omap';

/** Helper to create coords with flags */
function c(x: number, y: number, flags = 0) {
  return { x, y, flags };
}

// Flag constants (matching load-omap.ts)
const CURVE_START = 1;
const CLOSE_POINT = 2;
const HOLE_POINT = 16;

describe('coordsToPath', () => {
  it('returns empty string for empty coords', () => {
    expect(coordsToPath([], false)).toBe('');
  });

  it('generates straight line path with L commands', () => {
    const coords = [c(0, 0), c(100, 0), c(100, 100)];
    expect(coordsToPath(coords, false)).toBe('M0 0 L100 0 L100 100');
  });

  it('closes path with Z when close=true', () => {
    const coords = [c(0, 0), c(100, 0), c(100, 100)];
    expect(coordsToPath(coords, true)).toBe('M0 0 L100 0 L100 100 Z');
  });

  it('does not double-close when last coord has ClosePoint flag', () => {
    const coords = [c(0, 0), c(100, 0), c(100, 100, CLOSE_POINT)];
    const result = coordsToPath(coords, true);
    // Should have exactly one Z, not two
    expect(result.match(/Z/g)?.length).toBe(1);
    expect(result).toBe('M0 0 L100 0 L100 100 Z');
  });

  it('generates cubic bezier C commands from CurveStart flags', () => {
    // Simple bezier: start(CurveStart) → cp1 → cp2 → endpoint
    const coords = [
      c(0, 0, CURVE_START),
      c(10, 20),  // cp1
      c(30, 40),  // cp2
      c(50, 50),  // endpoint
    ];
    expect(coordsToPath(coords, false)).toBe('M0 0 C10 20 30 40 50 50');
  });

  it('handles a circle (4 bezier segments, closed)', () => {
    // From helper-hidden-symbols.omap — a circle as 4 bezier curves
    const coords = [
      c(-42372, -56765, CURVE_START),
      c(-42785, -55708),
      c(-42262, -54517),
      c(-41205, -54104, CURVE_START),
      c(-40148, -53692),
      c(-38957, -54214),
      c(-38544, -55271, CURVE_START),
      c(-38132, -56328),
      c(-38654, -57520),
      c(-39711, -57932, CURVE_START),
      c(-40768, -58345),
      c(-41960, -57822),
      c(-42372, -56765, CLOSE_POINT | HOLE_POINT), // 18 = close + hole
    ];
    const result = coordsToPath(coords, true);

    // Should contain 4 C commands (one per bezier segment)
    expect(result.match(/C/g)?.length).toBe(4);
    // Should start with M
    expect(result).toMatch(/^M-42372 -56765/);
    // Should end with Z (closed)
    expect(result).toMatch(/Z$/);
    // Should NOT contain any L commands (all curves)
    expect(result).not.toMatch(/L/);
  });

  it('handles mixed bezier and straight segments', () => {
    const coords = [
      c(0, 0, CURVE_START),
      c(10, 20),  // cp1
      c(30, 40),  // cp2
      c(50, 50),  // endpoint (no CurveStart → next is straight)
      c(100, 100), // straight line
      c(150, 50),  // straight line
    ];
    const result = coordsToPath(coords, false);
    expect(result).toBe('M0 0 C10 20 30 40 50 50 L100 100 L150 50');
  });

  it('handles HolePoint to start a new sub-path', () => {
    // Outer ring with a hole
    const coords = [
      c(0, 0),
      c(100, 0),
      c(100, 100),
      c(0, 100, HOLE_POINT), // last coord of outer ring
      c(20, 20),              // first coord of hole
      c(80, 20),
      c(80, 80),
      c(20, 80, CLOSE_POINT | HOLE_POINT),
    ];
    const result = coordsToPath(coords, true);
    // Should have two sub-paths separated by Z M
    expect(result).toMatch(/Z M/);
    // Outer ring closes at (0,100) then hole starts at (20,20)
    expect(result).toContain('L0 100 Z');
    expect(result).toContain('M20 20');
  });

  it('handles single coord', () => {
    const coords = [c(42, 99)];
    expect(coordsToPath(coords, false)).toBe('M42 99');
  });

  it('HolePoint on open path (close=false) does NOT emit Z', () => {
    // A line (fence, wall) ending with HolePoint should NOT close back to start
    const coords = [
      c(0, 0),
      c(100, 0, CURVE_START),
      c(150, 50),  // cp1
      c(200, 50),  // cp2
      c(250, 0),   // endpoint
      c(300, -50, HOLE_POINT),
    ];
    const result = coordsToPath(coords, false);
    // Should NOT contain Z — this is an open line
    expect(result).not.toContain('Z');
    expect(result).toBe('M0 0 L100 0 C150 50 200 50 250 0 L300 -50');
  });

  it('HolePoint on closed path (close=true) DOES emit Z', () => {
    const coords = [
      c(0, 0),
      c(100, 0),
      c(100, 100),
      c(0, 100, HOLE_POINT),
    ];
    const result = coordsToPath(coords, true);
    expect(result).toContain('L0 100 Z');
  });

  it('HolePoint on bezier endpoint for open path does NOT emit Z', () => {
    // Bezier curve ending with HolePoint on a line object
    const coords = [
      c(0, 0, CURVE_START),
      c(10, 20),
      c(30, 40),
      c(50, 50, HOLE_POINT),
    ];
    const result = coordsToPath(coords, false);
    // Should have the bezier but NO Z
    expect(result).toBe('M0 0 C10 20 30 40 50 50');
    expect(result).not.toContain('Z');
  });

  it('handles bezier with ClosePoint on endpoint', () => {
    const coords = [
      c(0, 0, CURVE_START),
      c(10, 20),
      c(30, 40),
      c(50, 50, CLOSE_POINT),
    ];
    const result = coordsToPath(coords, true);
    expect(result).toBe('M0 0 C10 20 30 40 50 50 Z');
    // Only one Z
    expect(result.match(/Z/g)?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Upper-ink tagging (IOF colour order, D2)
// ---------------------------------------------------------------------------

import { parseOmapXml, _buildSvg as buildSvg } from './load-omap';

/** Minimal OMAP document: 4 colours, one line symbol per colour, one path each. */
const INK_TEST_OMAP = `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
  <colors count="4">
    <color priority="0" name="Black" c="0" m="0" y="0" k="1" opacity="1">
      <rgb method="cmyk" r="0" g="0" b="0"/>
    </color>
    <color priority="1" name="Black 50%" c="0" m="0" y="0" k="0.5" opacity="1">
      <rgb method="cmyk" r="0.5" g="0.5" b="0.5"/>
    </color>
    <color priority="2" name="Brown for contours" c="0" m="0.56" y="1" k="0.18" opacity="1">
      <rgb method="cmyk" r="0.82" g="0.45" b="0.09"/>
    </color>
    <color priority="3" name="Green" c="0.76" m="0" y="0.91" k="0" opacity="1">
      <rgb method="cmyk" r="0.24" g="0.68" b="0.26"/>
    </color>
  </colors>
  <barrier version="6" required="0.6.0">
    <symbols count="4">
      <symbol type="2" id="0" code="1"><line_symbol color="0" line_width="200"/></symbol>
      <symbol type="2" id="1" code="2"><line_symbol color="1" line_width="200"/></symbol>
      <symbol type="2" id="2" code="3"><line_symbol color="2" line_width="200"/></symbol>
      <symbol type="4" id="3" code="4"><area_symbol inner_color="3"/></symbol>
    </symbols>
    <parts count="1" current="0">
      <part name="map">
        <objects count="4">
          <object type="1" symbol="0"><coords>0 0;1000 0</coords></object>
          <object type="1" symbol="1"><coords>0 100;1000 100</coords></object>
          <object type="1" symbol="2"><coords>0 200;1000 200</coords></object>
          <object type="1" symbol="3"><coords>0 300;1000 300;1000 400;0 400 18</coords></object>
        </objects>
      </part>
    </parts>
  </barrier>
</map>`;

describe('extractColors CMYK retention', () => {
  it('retains cmyk fractions and colour names', () => {
    const { colors } = parseOmapXml(INK_TEST_OMAP);
    expect(colors.get(0)).toMatchObject({ name: 'Black', cmyk: [0, 0, 0, 1] });
    expect(colors.get(1)).toMatchObject({ name: 'Black 50%', cmyk: [0, 0, 0, 0.5] });
    expect(colors.get(2)?.cmyk).toEqual([0, 0.56, 1, 0.18]);
  });
});

describe('buildSvg upper-ink tagging', () => {
  it('tags 100% black and brown strokes, not screens or green fills', () => {
    const { objects, symbols, colors } = parseOmapXml(INK_TEST_OMAP);
    const svg = buildSvg(objects, symbols, colors);

    const tagged = svg.match(/<[^>]*data-ink="upper"[^>]*>/g) ?? [];
    expect(tagged).toHaveLength(2);
    // Black (rgb(0,0,0)) and brown strokes are tagged...
    expect(tagged.some((t) => t.includes('stroke="rgb(0,0,0)"'))).toBe(true);
    expect(tagged.some((t) => t.includes('stroke="rgb(209,115,23)"'))).toBe(true);
    // ...the 50% black screen and the green area fill are not.
    expect(tagged.some((t) => t.includes('rgb(128,128,128)'))).toBe(false);
    expect(tagged.some((t) => t.includes('fill="rgb'))).toBe(false);
  });
});
