import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateDescriptionSheetPdf, type SymbolRasterizer } from './pdf-description-sheet';
import type { OverprintEvent } from '@/core/models/types';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import { asBranchId, asCourseControlId, asForkId } from '@/utils/id';
import { getAllSymbolIds, getSymbolSvg } from '@/core/iof/symbol-db';
import { pageContentText, allObjectsText } from './__test-utils__/pdf-inspect';

/** A minimal valid 1×1 PNG (bytes) — lets embedPng run without a real rasteriser. */
const PNG_1x1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const stubRasterizer: SymbolRasterizer = async () => PNG_1x1;

/**
 * Build an event whose single course has `n` controls. Descriptions are left
 * empty so the sheet uses the text fallback (no SVG symbol embedding) and can
 * therefore render in the jsdom test environment.
 */
function makeEvent(n: number): OverprintEvent {
  const event = createEvent('Pagination Test');
  event.mapFile = { name: 'm.png', type: 'raster', scale: 10000, dpi: 96 };
  const course = createCourse('Long');
  for (let i = 0; i < n; i++) {
    const ctrl = createControl(31 + i, { x: i * 10, y: i * 10 });
    event.controls[ctrl.id] = ctrl;
    const type = i === 0 ? 'start' : i === n - 1 ? 'finish' : 'control';
    course.controls.push({ controlId: ctrl.id, type });
  }
  event.courses.push(course);
  return event;
}

async function pageCount(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('generateDescriptionSheetPdf — pagination (C6)', () => {
  it('keeps a short course on a single page', async () => {
    const { blob } = await generateDescriptionSheetPdf(makeEvent(8));
    expect(await pageCount(blob)).toBe(1);
  });

  it('paginates a long course across multiple pages', async () => {
    // ~60 controls at 7 mm/row overflow an A4 sheet.
    const { blob } = await generateDescriptionSheetPdf(makeEvent(60));
    expect(await pageCount(blob)).toBeGreaterThan(1);
  });
});

describe('generateDescriptionSheetPdf — text mode (C7)', () => {
  it('renders a text-appearance sheet as sentence rows without error', async () => {
    const event = makeEvent(6);
    // Give a control a real feature so the sentence composer has content.
    const mid = Object.values(event.controls)[2]!;
    mid.description = { columnD: '1.3' }; // re-entrant
    event.courses[0]!.settings.descriptionAppearance = 'text';
    const { blob } = await generateDescriptionSheetPdf(event);
    expect(await pageCount(blob)).toBe(1);
    // Valid PDF
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder('latin1').decode(bytes).startsWith('%PDF')).toBe(true);
  });
});

describe('generateDescriptionSheetPdf — fork variations (E10.4)', () => {
  /** Adds a 2-branch fork (A/B) anchored on the second control of makeEvent's course. */
  function addFork(event: OverprintEvent): void {
    const course = event.courses[0]!;
    course.controls.forEach((cc, i) => {
      cc.courseControlId = asCourseControlId(`cc-${i}`);
    });
    const bA = createControl(91, { x: 500, y: 100 });
    const bB = createControl(92, { x: 500, y: 400 });
    event.controls[bA.id] = bA;
    event.controls[bB.id] = bB;
    course.variations = [{
      id: asForkId('fk1'),
      kind: 'fork',
      anchorCourseControlId: asCourseControlId('cc-1'),
      branches: [
        { id: asBranchId('brA'), label: 'A', controls: [{ courseControlId: asCourseControlId('cc-bA'), controlId: bA.id, type: 'control' }] },
        { id: asBranchId('brB'), label: 'B', controls: [{ courseControlId: asCourseControlId('cc-bB'), controlId: bB.id, type: 'control' }] },
      ],
    }];
  }

  it('emits one sheet per variation (2 pages for a 2-branch fork)', async () => {
    const event = makeEvent(8);
    addFork(event);
    const { blob } = await generateDescriptionSheetPdf(event);
    expect(await pageCount(blob)).toBe(2);
  });

  it('keeps a no-fork course on a single sheet', async () => {
    const { blob } = await generateDescriptionSheetPdf(makeEvent(8));
    expect(await pageCount(blob)).toBe(1);
  });
});

describe('generateDescriptionSheetPdf — symbol embedding + content (C6/C8)', () => {
  /** Event with `n` controls carrying real IOF symbols in column D (feature) so the
   *  SVG-symbol embedding path runs. Two controls share a symbol to test dedup. */
  function symbolEvent(n: number): { event: OverprintEvent; codes: number[]; distinctSymbols: number } {
    const symIds = getAllSymbolIds().filter((id) => getSymbolSvg(id));
    const event = createEvent('Symbols');
    event.mapFile = { name: 'm.png', type: 'raster', scale: 10000, dpi: 96 };
    const course = createCourse('Long');
    const codes: number[] = [];
    for (let i = 0; i < n; i++) {
      const code = 31 + i;
      const ctrl = createControl(code, { x: i * 10, y: i * 10 });
      // First and last controls reuse symIds[0] (dedup); middle ones cycle distinct ids.
      const feature = i === 0 || i === n - 1 ? symIds[0]! : symIds[(i % (symIds.length - 1)) + 1]!;
      ctrl.description = { columnD: feature };
      event.controls[ctrl.id] = ctrl;
      course.controls.push({ controlId: ctrl.id, type: i === 0 ? 'start' : i === n - 1 ? 'finish' : 'control' });
      codes.push(code);
    }
    event.courses.push(course);
    const distinct = new Set(course.controls.map((cc) => event.controls[cc.controlId]!.description.columnD)).size;
    return { event, codes, distinctSymbols: distinct };
  }

  it('runs the symbol-embedding path and de-duplicates repeated symbols', async () => {
    const { event, distinctSymbols } = symbolEvent(6);
    const spy = vi.fn(stubRasterizer);
    const { blob } = await generateDescriptionSheetPdf(event, 0, { renderSymbolPng: spy });
    // Rasteriser invoked exactly once per DISTINCT symbol (cache dedups repeats).
    expect(spy).toHaveBeenCalledTimes(distinctSymbols);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    // Embedded PNG XObjects present; each symbol cell drawn via a `Do`.
    expect(allObjectsText(doc)).toContain('/Image');
    expect(pageContentText(doc, 0)).toContain(' Do');
  });

  it('draws text for every control row (≥ one show-text op per control)', async () => {
    // Font-subset glyph encoding makes exact-string matching brittle across faces, so
    // assert structure: every row draws column-A number + column-B code + more, so the
    // page must contain at least as many text-show ops as controls.
    const { event, codes } = symbolEvent(5);
    const { blob } = await generateDescriptionSheetPdf(event, 0, { renderSymbolPng: stubRasterizer });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const content = pageContentText(doc, 0);
    const showTextOps = (content.match(/Tj|TJ/g) ?? []).length;
    expect(showTextOps).toBeGreaterThanOrEqual(codes.length);
  });

  it('embeds a font for the grid text', async () => {
    const { event } = symbolEvent(4);
    const { blob } = await generateDescriptionSheetPdf(event, 0, { renderSymbolPng: stubRasterizer });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(allObjectsText(doc)).toContain('/Font');
  });

  it('still works with no options arg (default rasteriser path is wired)', async () => {
    // No symbols → default rasteriser never invoked → no canvas needed.
    const { blob } = await generateDescriptionSheetPdf(makeEvent(4));
    expect(await pageCount(blob)).toBe(1);
  });
});
