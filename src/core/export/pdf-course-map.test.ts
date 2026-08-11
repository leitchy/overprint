/**
 * Structural tests for the vector-PDF true colour-order pipeline (D2).
 *
 * Runs the real generateCoursePdf vector path over a tiny tagged SVG map and
 * asserts, from the decompressed PAGE content stream, that the draw order is:
 *
 *   base map (Do) → white-outs → LOWER purple → upper-ink redraw (Do, clipped
 *   around white-outs) → UPPER purple
 *
 * and that the vector path never sets a Multiply blend mode.
 */
import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream } from 'pdf-lib';
import { generateCoursePdf, descBoxOrigin, fitHeaderText } from './pdf-course-map';
import type { PageLayout } from './pdf-page-layout';

describe('fitHeaderText — title fits the description-box grid (Task #19)', () => {
  // Fake monospace-ish font: width = chars × size × 0.5.
  const font = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 };

  it('leaves a short title unchanged at full size', () => {
    const r = fitHeaderText(font, 'ACT League', 9, 200);
    expect(r.text).toBe('ACT League');
    expect(r.size).toBe(9);
  });

  it('shrinks the font (no ellipsis) so a moderately long title fits', () => {
    // 'Radford College Sprint' = 22 chars → width 99 at size 9; force a shrink.
    const maxWidth = 80;
    const r = fitHeaderText(font, 'Radford College Sprint', 9, maxWidth);
    expect(r.text).toBe('Radford College Sprint'); // full text preserved
    expect(r.size).toBeLessThan(9);
    expect(font.widthOfTextAtSize(r.text, r.size)).toBeLessThanOrEqual(maxWidth);
  });

  it('ellipsizes once shrinking hits the minimum size, and still fits', () => {
    const maxWidth = 100;
    const long = '2026 NOL Round 2 — ACT League 1 — Radford College Sprint Championships';
    const r = fitHeaderText(font, long, 9, maxWidth);
    expect(r.text.endsWith('…')).toBe(true);
    expect(r.text.length).toBeLessThan(long.length);
    expect(font.widthOfTextAtSize(r.text, r.size)).toBeLessThanOrEqual(maxWidth);
    expect(r.size).toBeGreaterThanOrEqual(9 * 0.6); // never below the floor
  });
});

describe('descBoxOrigin — description-box placement', () => {
  const layout: PageLayout = {
    pageWidth: 842, pageHeight: 595,
    printableWidth: 802, printableHeight: 555,
    marginLeft: 20, marginBottom: 20, marginTop: 20, marginRight: 20,
  };
  const blockWidth = 200;

  it('anchors to the imported box top-left when a position is given', () => {
    const { left, topY } = descBoxOrigin(layout, blockWidth, { overridePosition: { x: 123, y: 456 }, overrideTopY: 999 });
    expect(left).toBe(123);
    expect(topY).toBe(456); // position wins over overrideTopY
  });

  it('right-aligns to the printable area with no override', () => {
    const { left, topY } = descBoxOrigin(layout, blockWidth, {});
    // right edge = pageWidth - marginRight - 5mm offset; left = right - blockWidth
    expect(left).toBeLessThan(layout.pageWidth - layout.marginRight - blockWidth);
    expect(left).toBeGreaterThan(0);
    expect(topY).toBeLessThan(layout.pageHeight - layout.marginTop); // below the top margin+offset
  });

  it('uses overrideTopY for the top when only a top (no full position) is given', () => {
    const { topY } = descBoxOrigin(layout, blockWidth, { overrideTopY: 500 });
    expect(topY).toBe(500);
  });
});
import type { Control, Course, CourseControl, EventSettings, OverprintEvent, SpecialItem } from '@/core/models/types';
import type { ControlId, CourseId, EventId, SpecialItemId } from '@/utils/id';
import { asBranchId, asControlId, asCourseControlId, asForkId } from '@/utils/id';

// A map with one tagged (upper-ink) black line and one untagged yellow line,
// mimicking what the OCAD/OMAP loaders emit after ink classification.
const TAGGED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="transparent" viewBox="0 0 800 600">
<rect x="0" y="0" width="800" height="600" fill="white"/>
<path d="M 10 10 L 790 590" fill="none" stroke="rgb(0,0,0)" stroke-width="4" data-ink="upper"/>
<path d="M 10 590 L 790 10" fill="none" stroke="rgb(255,186,0)" stroke-width="4"/>
</svg>`;

function makeEvent(mapStandard: EventSettings['mapStandard'], specialItems: SpecialItem[] = []): OverprintEvent {
  const ctrl = (id: string, code: number, x: number, y: number): Control => ({
    id: id as ControlId,
    code,
    position: { x, y },
    description: { columnD: '' },
  });
  const course: Course = {
    id: 'course-1' as CourseId,
    name: 'Vector Test',
    courseType: 'normal',
    controls: [
      { controlId: 's1' as ControlId, type: 'start' },
      { controlId: 'c1' as ControlId, type: 'control' },
      { controlId: 'f1' as ControlId, type: 'finish' },
    ],
    settings: {},
  };
  return {
    id: 'event-1' as EventId,
    name: 'Colour Order Event',
    mapFile: { name: 'tiny.omap', type: 'omap', scale: 10000, dpi: 150 },
    courses: [course],
    controls: {
      ['s1' as ControlId]: ctrl('s1', 31, 150, 150),
      ['c1' as ControlId]: ctrl('c1', 32, 400, 300),
      ['f1' as ControlId]: ctrl('f1', 33, 650, 450),
    },
    settings: {
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
    },
    specialItems,
    version: '1',
  };
}

/** Decompressed content stream text of one page of a loaded PDF. */
function pageContentText(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  const push = (obj: unknown) => {
    if (obj instanceof PDFRawStream) streams.push(obj);
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) push(doc.context.lookup(contents.get(i)));
  } else if (contents) {
    push(doc.context.lookup(contents) ?? contents);
  }
  return streams
    .map((s) => {
      const body = s.getContents();
      try {
        return inflateSync(Buffer.from(body)).toString('latin1');
      } catch {
        return Buffer.from(body).toString('latin1');
      }
    })
    .join('\n');
}

/**
 * Every indirect object of the loaded document, stringified — dictionaries
 * like ExtGStates live inside compressed object streams, so raw-byte greps
 * miss them; the parsed object model doesn't.
 */
function allObjectsText(doc: PDFDocument): string {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => String(obj))
    .join('\n');
}

async function exportAndLoad(event: OverprintEvent): Promise<{ content: string; raw: string }> {
  const { blob } = await generateCoursePdf(
    event,
    // The vector path never touches the display bitmap when mapSource carries
    // logical dimensions — a bare object stands in for the HTMLImageElement.
    {} as HTMLImageElement,
    { courseIndex: 0 },
    null,
    { svg: TAGGED_SVG, width: 800, height: 600 },
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return { content: pageContentText(doc, 0), raw: allObjectsText(doc) };
}

const PURPLE_STROKE = '0.35 0.85 0 0 K';
const PURPLE_FILL = '0.35 0.85 0 0 k';

describe('generateCoursePdf true colour-order (vector path)', () => {
  it('orders the passes: map Do → lower purple → upper-ink Do → upper purple', async () => {
    // Sprint standard so the upper pass has visible content (704 numbers).
    const { content } = await exportAndLoad(makeEvent('ISSprOM2019'));

    const doMatches = [...content.matchAll(/\/\S+ Do/g)];
    expect(doMatches.length).toBe(2); // base map + upper-ink redraw

    const firstDo = doMatches[0]!.index;
    const secondDo = doMatches[1]!.index;
    const lowerPurple = content.indexOf(PURPLE_STROKE);
    const upperPurple = content.indexOf(PURPLE_FILL, secondDo);

    expect(lowerPurple).toBeGreaterThan(firstDo);
    expect(secondDo).toBeGreaterThan(lowerPurple);
    expect(upperPurple).toBeGreaterThan(secondDo);
  });

  it('ISOM keeps the upper purple pass empty but still redraws the upper inks', async () => {
    const { content } = await exportAndLoad(makeEvent('ISOM2017'));
    const doMatches = [...content.matchAll(/\/\S+ Do/g)];
    expect(doMatches.length).toBe(2);
    // Numbers (704) are LOWER on ISOM → purple text fill before the second Do.
    const purpleText = content.indexOf(PURPLE_FILL);
    expect(purpleText).toBeGreaterThan(-1);
    expect(purpleText).toBeLessThan(doMatches[1]!.index);
  });

  it('sets no Multiply blend anywhere on the vector colour-order path', async () => {
    const { raw } = await exportAndLoad(makeEvent('ISSprOM2019'));
    expect(raw).not.toContain('/Multiply');
    expect(raw).toContain('/OP true'); // solid spot overprint stays on
  });

  it('clips the upper-ink redraw around white-out rectangles (even-odd)', async () => {
    const whiteOut: SpecialItem = {
      id: 'w1' as SpecialItemId,
      type: 'whiteOut',
      position: { x: 300, y: 200 },
      endPosition: { x: 500, y: 400 },
    };
    const { content } = await exportAndLoad(makeEvent('ISSprOM2019', [whiteOut]));
    // The second Do (upper-ink page) is preceded by an even-odd clip (W* n)
    // carrying more than just the printable-area rectangle.
    const secondDo = [...content.matchAll(/\/\S+ Do/g)][1]!.index;
    const before = content.slice(0, secondDo);
    expect(before).toMatch(/W\*/);
  });

  it('exports a no-fork course as a single page and reports no truncation', async () => {
    const event = makeEvent('ISOM2017');
    const { blob, truncatedVariationCourses } = await generateCoursePdf(
      event, {} as HTMLImageElement, { courseIndex: 0 }, null,
      { svg: TAGGED_SVG, width: 800, height: 600 },
    );
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
    expect(truncatedVariationCourses).toEqual([]);
  });

  it('renders a single purple pass when the map has no tagged inks', async () => {
    const event = makeEvent('ISSprOM2019');
    const untagged = TAGGED_SVG.replace(/ data-ink="upper"/g, '');
    const { blob } = await generateCoursePdf(
      event, {} as HTMLImageElement, { courseIndex: 0 }, null,
      { svg: untagged, width: 800, height: 600 },
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const content = pageContentText(doc, 0);
    expect([...content.matchAll(/\/\S+ Do/g)].length).toBe(1); // base map only
  });
});

// ---------------------------------------------------------------------------
// E10.4 — fork-variation-aware export
// ---------------------------------------------------------------------------

/**
 * Event with one course "Relay": trunk S → anchor → (M → exchange →) F, plus a
 * 2-branch fork (A/B) anchored on the interior control.
 */
function makeForkEvent(opts: { withExchange?: boolean } = {}): OverprintEvent {
  const event = makeEvent('ISOM2017');
  const addCtrl = (id: string, code: number, x: number, y: number): void => {
    event.controls[asControlId(id)] = {
      id: asControlId(id), code, position: { x, y }, description: { columnD: '' },
    };
  };
  addCtrl('b1', 41, 300, 150); // branch A control
  addCtrl('b2', 42, 300, 450); // branch B control
  const trunk: CourseControl[] = [
    { courseControlId: asCourseControlId('cc-s'), controlId: asControlId('s1'), type: 'start' },
    { courseControlId: asCourseControlId('cc-a'), controlId: asControlId('c1'), type: 'control' },
  ];
  if (opts.withExchange) {
    addCtrl('m1', 43, 500, 300);
    trunk.push({ courseControlId: asCourseControlId('cc-m'), controlId: asControlId('m1'), type: 'control' });
    trunk.push({ courseControlId: asCourseControlId('cc-x'), controlId: asControlId('m1'), type: 'mapExchange' });
  }
  trunk.push({ courseControlId: asCourseControlId('cc-f'), controlId: asControlId('f1'), type: 'finish' });

  const course: Course = {
    ...event.courses[0]!,
    name: 'Relay',
    controls: trunk,
    variations: [{
      id: asForkId('fk1'),
      kind: 'fork',
      anchorCourseControlId: asCourseControlId('cc-a'),
      branches: [
        { id: asBranchId('br1'), label: 'A', controls: [{ courseControlId: asCourseControlId('cc-b1'), controlId: asControlId('b1'), type: 'control' }] },
        { id: asBranchId('br2'), label: 'B', controls: [{ courseControlId: asCourseControlId('cc-b2'), controlId: asControlId('b2'), type: 'control' }] },
      ],
    }],
  };
  event.courses = [course];
  return event;
}

async function loadPdf(event: OverprintEvent): Promise<PDFDocument> {
  const { blob } = await generateCoursePdf(
    event, {} as HTMLImageElement, { courseIndex: 0 }, null,
    { svg: TAGGED_SVG, width: 800, height: 600 },
  );
  return PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
}

/** pdf-lib hex-encodes drawText strings: 'Relay A' → '<52656C61792041>'. */
function pdfHexText(text: string): string {
  return `<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}>`;
}

describe('generateCoursePdf — fork variations (E10.4)', () => {
  it('exports one page per variation, with the variation code in the page title', async () => {
    const doc = await loadPdf(makeForkEvent());
    expect(doc.getPageCount()).toBe(2); // 2× the no-fork single page
    expect(pageContentText(doc, 0)).toContain(pdfHexText('Relay A'));
    expect(pageContentText(doc, 1)).toContain(pdfHexText('Relay B'));
  });

  it('exports variations × parts pages for a fork + map exchange', async () => {
    const doc = await loadPdf(makeForkEvent({ withExchange: true }));
    expect(doc.getPageCount()).toBe(4); // 2 variations × 2 parts
    expect(pageContentText(doc, 0)).toContain(pdfHexText('Relay A-1'));
    expect(pageContentText(doc, 1)).toContain(pdfHexText('Relay A-2'));
    expect(pageContentText(doc, 2)).toContain(pdfHexText('Relay B-1'));
    expect(pageContentText(doc, 3)).toContain(pdfHexText('Relay B-2'));
  });
});
