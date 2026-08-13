import { describe, it, expect } from 'vitest';
import type { MapPoint } from '@/core/models/types';
import { pdfPolylineToSvgPath } from './pdf-overprint-renderer';

/**
 * Regression guard for the drawSvgPath y-flip bug (bent legs + gapped circles).
 * pdf-lib's drawSvgPath applies an internal scale(1,-1); feeding PDF y-up points
 * with default options rendered them mirrored to -y (off-page). The path string
 * must pre-negate y so the internal flip lands the geometry back on-page.
 */
describe('pdfPolylineToSvgPath', () => {
  it('emits M/L commands with y pre-negated', () => {
    const pts: MapPoint[] = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ];
    expect(pdfPolylineToSvgPath(pts)).toBe('M 10 -20 L 30 -40 L 50 -60');
  });

  it('round-trips: internal flip restores the original on-page y', () => {
    // Points inside a 0..800pt page (all y >= 0 = on-page).
    const pts: MapPoint[] = [
      { x: 100, y: 700 },
      { x: 200, y: 650 },
      { x: 300, y: 720 },
    ];
    const d = pdfPolylineToSvgPath(pts);
    // Parse the y operands from the path string and apply drawSvgPath's flip (negate).
    const yOperands = [...d.matchAll(/[ML] \S+ (\S+)/g)].map((m) => Number(m[1]));
    const restored = yOperands.map((y) => -y); // scale(1,-1)
    expect(restored).toEqual([700, 650, 720]);
    // All restored y are on-page (>= 0); before the fix they would be negative.
    expect(restored.every((y) => y >= 0)).toBe(true);
  });

  it('handles a single-point polyline', () => {
    expect(pdfPolylineToSvgPath([{ x: 5, y: 5 }])).toBe('M 5 -5');
  });
});

// ---------------------------------------------------------------------------
// renderOverprint layer split (IOF colour order, D2)
// ---------------------------------------------------------------------------

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { allStreamText } from './__test-utils__/pdf-inspect';
import { renderOverprint } from './pdf-overprint-renderer';
import type { Control, Course, EventSettings } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';

function testSettings(mapStandard: EventSettings['mapStandard']): EventSettings {
  return {
    printScale: 10000,
    controlCircleDiameter: 5,
    lineWidth: 0.35,
    numberSize: 4,
    descriptionStandard: '2024',
    mapStandard,
    language: 'en',
    pageSetup: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  };
}

const CTRL = (id: string, code: number, x: number, y: number): Control => ({
  id: id as ControlId,
  code,
  position: { x, y },
  description: { columnD: '' },
});

const TEST_CONTROLS: Record<ControlId, Control> = {
  ['s1' as ControlId]: CTRL('s1', 31, 100, 100),
  ['c1' as ControlId]: CTRL('c1', 32, 300, 200),
  ['f1' as ControlId]: CTRL('f1', 33, 500, 300),
};

const TEST_COURSE: Course = {
  id: 'course-1' as CourseId,
  name: 'Test',
  courseType: 'normal',
  controls: [
    { controlId: 's1' as ControlId, type: 'start' },
    { controlId: 'c1' as ControlId, type: 'control' },
    { controlId: 'f1' as ControlId, type: 'finish' },
  ],
  settings: {},
};

async function renderToText(
  mapStandard: EventSettings['mapStandard'],
  opts: { layer?: 'lower' | 'upper'; solidOverprint?: boolean } = {},
): Promise<{ content: string; raw: string }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  renderOverprint(
    {
      page,
      settings: testSettings(mapStandard),
      toPdf: (p: MapPoint) => ({ x: p.x * 0.5 + 50, y: 800 - p.y * 0.5 }),
      effectivePPP: 0.5,
      ...opts,
    },
    TEST_COURSE,
    TEST_CONTROLS,
    font,
  );
  const bytes = await doc.save({ useObjectStreams: false });
  return { content: allStreamText(bytes), raw: Buffer.from(bytes).toString('latin1') };
}

const PURPLE_STROKE = /0\.35 0\.85 0 0 K/;
const PURPLE_FILL = /0\.35 0\.85 0 0 k/;

describe('renderOverprint layer split', () => {
  it('ISOM lower layer draws shapes AND numbers (704 is lower on ISOM)', async () => {
    const { content } = await renderToText('ISOM2017', { layer: 'lower' });
    expect(content).toMatch(PURPLE_STROKE); // legs/circles
    expect(content).toMatch(PURPLE_FILL);   // number text
    expect(content).toContain('BT');
  });

  it('ISOM upper layer draws nothing', async () => {
    const { content } = await renderToText('ISOM2017', { layer: 'upper' });
    expect(content).not.toMatch(/0\.35 0\.85 0 0/);
    expect(content).not.toContain('BT');
  });

  it('ISSprOM lower layer omits numbers (704 flips to upper on sprint)', async () => {
    const { content } = await renderToText('ISSprOM2019', { layer: 'lower' });
    expect(content).toMatch(PURPLE_STROKE);
    expect(content).not.toContain('BT');
  });

  it('ISSprOM upper layer draws ONLY the numbers', async () => {
    const { content } = await renderToText('ISSprOM2019', { layer: 'upper' });
    expect(content).toContain('BT');
    expect(content).toMatch(PURPLE_FILL);
    expect(content).not.toMatch(PURPLE_STROKE); // no legs/circles/shapes
  });

  it('unspecified layer draws both (legacy single pass)', async () => {
    const { content } = await renderToText('ISSprOM2019');
    expect(content).toMatch(PURPLE_STROKE);
    expect(content).toContain('BT');
  });
});

describe('renderOverprint overprint ExtGState', () => {
  it('default (raster interim) sets the Multiply blend', async () => {
    const { raw } = await renderToText('ISOM2017');
    expect(raw).toContain('/Multiply');
    expect(raw).toContain('/OP true');
  });

  it('solidOverprint (true colour-order path) sets OP but NO blend', async () => {
    const { raw } = await renderToText('ISOM2017', { layer: 'lower', solidOverprint: true });
    expect(raw).toContain('/OP true');
    expect(raw).not.toContain('/Multiply');
  });
});
