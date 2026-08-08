/**
 * IOF Control Description Sheet PDF export.
 *
 * Renders the standard 8-column control description grid as pdf-lib vector
 * graphics. Symbol cells (C-H) are rasterized from SVG via an off-screen
 * canvas and embedded as PNG images. Text cells (A, B) use Roboto Condensed,
 * header rows Roboto / Roboto Bold (Helvetica fallback — see description-fonts.ts).
 *
 * IOF cell size: 7mm × 7mm (standard grid unit).
 * Header row: course name spanning all 8 columns.
 * Info row: course length (metres) spanning all 8 columns.
 * Control rows: one row per CourseControl in sequence.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { embedDescriptionFonts } from './description-fonts';
import type { Course, OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { computePageLayout, mmToPdfPoints } from './pdf-page-layout';
import { buildDescRows, type DescRow } from '@/core/descriptions/desc-rows';
import { generateTextDescription } from '@/core/iof/text-descriptions';
import { sortControlsByCode } from '@/core/geometry/course-utils';
import { getSymbolSvg, getSymbolName } from '@/core/iof/symbol-db';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Standard IOF cell size in mm */
const CELL_SIZE_MM = 7;

/** Number of columns in the IOF description grid */
const NUM_COLS = 8;

/** Border thickness in PDF points */
const BORDER_WIDTH = 0.5;

/** Font size for sequence number and code cells */
const TEXT_FONT_SIZE = 8;

/** Font size for header / info rows */
const HEADER_FONT_SIZE = 9;

const BORDER_COLOR = rgb(0, 0, 0);
const TEXT_COLOR = rgb(0, 0, 0);

// ---------------------------------------------------------------------------
// SVG → PNG rasterisation helpers
// ---------------------------------------------------------------------------

/**
 * Render a raw SVG string to a PNG Blob using an off-screen canvas.
 * We create an <img> element, load the SVG as a data URL, then draw it to a
 * canvas. All DOM work is done in-browser — this function only runs in a
 * browser context.
 *
 * @param svgString - Raw SVG markup
 * @param sizePx    - Output canvas size in pixels (square)
 */
async function svgToPngBlob(svgString: string, sizePx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get 2D context'));
      return;
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      ctx.drawImage(img, 0, 0, sizePx, sizePx);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
        'image/png',
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load SVG for symbol`));
    };

    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Description sheet generator
// ---------------------------------------------------------------------------

/**
 * Generate a control description sheet PDF as a Blob.
 * Does not trigger a save dialog — the caller handles that.
 *
 * @param event       - The OverprintEvent to render
 * @param courseIndex - Index into event.courses (default 0)
 */
export async function generateDescriptionSheetPdf(
  event: OverprintEvent,
  courseIndex = 0,
): Promise<{ blob: Blob; suggestedName: string }> {
  const course: Course | undefined = event.courses[courseIndex];
  if (!course) throw new Error('No course to export');

  const lang = event.settings.language ?? 'en';
  const appearance = course.settings.descriptionAppearance ?? 'symbols';
  const dpi = event.mapFile?.dpi ?? 96;
  const scale = event.mapFile?.scale ?? event.settings.printScale;

  // ---------------------------------------------------------------------------
  // SVG embedding with de-duplication
  // ---------------------------------------------------------------------------

  const pdfDoc = await PDFDocument.create();
  // Description typography (C8, matches PurplePen): Roboto Bold for the
  // primary header, Roboto for secondary header/split-info rows, Roboto
  // Condensed for grid cell text. Falls back to Helvetica when unavailable.
  const descFonts = await embedDescriptionFonts(pdfDoc);
  const font = descFonts.condensed;
  const headerFont = descFonts.regular;
  const boldFont = descFonts.bold;

  // Cache: symbolId → embedded PDFImage
  const embeddedSymbols = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();

  /**
   * Rasterise and embed a symbol SVG; returns the cached image on repeat calls.
   * Returns null if the symbol has no SVG.
   */
  async function embedSymbol(symbolId: string): Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>> | null> {
    const cached = embeddedSymbols.get(symbolId);
    if (cached) return cached;

    const svgString = getSymbolSvg(symbolId);
    if (!svgString) return null;

    // 300 DPI equivalent: cell is 7mm → 7/25.4*300 ≈ 83px — round up to 84
    const sizePx = Math.ceil((CELL_SIZE_MM / 25.4) * 300);
    const blob = await svgToPngBlob(svgString, sizePx);
    const arrayBuffer = await blob.arrayBuffer();
    const pngBytes = new Uint8Array(arrayBuffer);
    const image = await pdfDoc.embedPng(pngBytes);
    embeddedSymbols.set(symbolId, image);
    return image;
  }

  // ---------------------------------------------------------------------------
  // Page layout
  // ---------------------------------------------------------------------------

  const layout = computePageLayout(event.settings.pageSetup);
  let page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

  const cellPt = mmToPdfPoints(CELL_SIZE_MM);
  const gridWidth = cellPt * NUM_COLS;

  // Start drawing from top-left printable area corner
  // pdf-lib Y=0 is at the bottom; we draw from top downward
  const startX = layout.marginLeft;
  // Convert top margin from the page top to pdf-lib coordinates
  const startY = layout.pageHeight - layout.marginTop;

  let currentY = startY;

  // ---------------------------------------------------------------------------
  // Row drawing helper
  // ---------------------------------------------------------------------------

  /**
   * Draw a single row of cells at the current Y position.
   * `cells` is an array of 8 items corresponding to columns A-H.
   * Each cell is either:
   *   - A text string (drawn with Roboto Condensed)
   *   - A symbolId string prefixed with 'sym:' (embedded PNG)
   *   - null / undefined (empty cell)
   *
   * Returns the Y offset to apply (i.e., −cellPt).
   */
  async function drawRow(
    cells: ReadonlyArray<string | null | undefined>,
    opts: { fontSize?: number; bold?: boolean; headerSpan?: boolean; font?: PDFFont } = {},
  ): Promise<void> {
    const rowY = currentY - cellPt;
    const fontSize = opts.fontSize ?? TEXT_FONT_SIZE;
    const usedFont = opts.font ?? (opts.bold ? boldFont : font);

    if (opts.headerSpan) {
      // Single cell spanning all columns
      page.drawRectangle({
        x: startX,
        y: rowY,
        width: gridWidth,
        height: cellPt,
        borderColor: BORDER_COLOR,
        borderWidth: BORDER_WIDTH,
      });
      const text = cells[0] ?? '';
      if (typeof text === 'string' && !text.startsWith('sym:')) {
        const textWidth = usedFont.widthOfTextAtSize(text, fontSize);
        const textX = startX + (gridWidth - textWidth) / 2;
        const textY = rowY + (cellPt - fontSize) / 2;
        page.drawText(text, {
          x: textX,
          y: textY,
          size: fontSize,
          font: usedFont,
          color: TEXT_COLOR,
        });
      }
      currentY = rowY;
      return;
    }

    // Draw each cell
    for (let col = 0; col < NUM_COLS; col++) {
      const cellX = startX + col * cellPt;

      page.drawRectangle({
        x: cellX,
        y: rowY,
        width: cellPt,
        height: cellPt,
        borderColor: BORDER_COLOR,
        borderWidth: BORDER_WIDTH,
      });

      const cell = cells[col];
      if (!cell) continue;

      if (typeof cell === 'string' && cell.startsWith('sym:')) {
        const symbolId = cell.slice(4);
        const pdfImage = await embedSymbol(symbolId);
        if (pdfImage) {
          const padding = cellPt * 0.08;
          page.drawImage(pdfImage, {
            x: cellX + padding,
            y: rowY + padding,
            width: cellPt - padding * 2,
            height: cellPt - padding * 2,
          });
        }
      } else if (typeof cell === 'string') {
        const textWidth = usedFont.widthOfTextAtSize(cell, fontSize);
        const textX = cellX + (cellPt - textWidth) / 2;
        const textY = rowY + (cellPt - fontSize) / 2;
        page.drawText(cell, {
          x: textX,
          y: textY,
          size: fontSize,
          font: usedFont,
          color: TEXT_COLOR,
        });
      }
    }

    currentY = rowY;
  }

  const isScore = course.courseType === 'score';

  // ---------------------------------------------------------------------------
  // Build the canonical rows (shared with the course-map description box).
  // Score courses are code-sorted for display.
  // ---------------------------------------------------------------------------

  const sheetControls = isScore
    ? sortControlsByCode(course.controls, event.controls)
    : course.controls;
  const sheetCourse: Course = { ...course, controls: sheetControls };
  const { headerRows, bodyRows } = buildDescRows(sheetCourse, event.controls, {
    eventName: event.name,
    scale,
    dpi,
    isScore,
    headerFontSize: HEADER_FONT_SIZE,
  });
  // Title + split-info repeat at the top of every page; directives + controls flow.
  const repeatHeaderRows = headerRows.filter((r) => r.kind === 'header' || r.kind === 'splitInfo');
  const flowRows: DescRow[] = [...headerRows.filter((r) => r.kind === 'directive'), ...bodyRows];

  // --- Row painters (each advances currentY down by one cell) ---

  // Split-info row: name / length / climb (or count), divided proportionally.
  function drawSplitInfoRow(sections: string[]): void {
    const rowY = currentY - cellPt;
    const n = sections.length;
    const widths = n === 3
      ? [gridWidth * 3 / 8, gridWidth * 3 / 8, gridWidth * 2 / 8]
      : [gridWidth / 2, gridWidth / 2];
    let x = startX;
    for (let i = 0; i < n; i++) {
      const w = widths[i] ?? gridWidth / n;
      page.drawRectangle({ x, y: rowY, width: w, height: cellPt, borderColor: BORDER_COLOR, borderWidth: BORDER_WIDTH });
      let text = sections[i]!;
      const maxW = w - cellPt * 0.16;
      while (headerFont.widthOfTextAtSize(text, HEADER_FONT_SIZE) > maxW && text.length > 1) text = text.slice(0, -1);
      const tw = headerFont.widthOfTextAtSize(text, HEADER_FONT_SIZE);
      page.drawText(text, { x: x + (w - tw) / 2, y: rowY + (cellPt - HEADER_FONT_SIZE) / 2, size: HEADER_FONT_SIZE, font: headerFont, color: TEXT_COLOR });
      x += w;
    }
    currentY = rowY;
  }

  // Directive row: a start/finish/exchange symbol on the left, distance on the right.
  function drawDirectiveRow(symbolType: string, distanceText: string): void {
    const rowY = currentY - cellPt;
    const leftW = cellPt * 3;
    const rightW = gridWidth - leftW;
    page.drawRectangle({ x: startX, y: rowY, width: leftW, height: cellPt, borderColor: BORDER_COLOR, borderWidth: BORDER_WIDTH });
    page.drawRectangle({ x: startX + leftW, y: rowY, width: rightW, height: cellPt, borderColor: BORDER_COLOR, borderWidth: BORDER_WIDTH });
    const cx = startX + leftW / 2;
    const cy = rowY + cellPt / 2;
    const s = cellPt * 0.3;
    if (symbolType === 'start') {
      const triH = s * 0.866;
      page.drawLine({ start: { x: cx - triH, y: cy - s }, end: { x: cx + triH, y: cy }, thickness: BORDER_WIDTH * 2, color: TEXT_COLOR });
      page.drawLine({ start: { x: cx + triH, y: cy }, end: { x: cx - triH, y: cy + s }, thickness: BORDER_WIDTH * 2, color: TEXT_COLOR });
      page.drawLine({ start: { x: cx - triH, y: cy + s }, end: { x: cx - triH, y: cy - s }, thickness: BORDER_WIDTH * 2, color: TEXT_COLOR });
    } else if (symbolType === 'finish') {
      page.drawCircle({ x: cx, y: cy, size: s, borderColor: TEXT_COLOR, borderWidth: BORDER_WIDTH * 2 });
      page.drawCircle({ x: cx, y: cy, size: s * 0.7, borderColor: TEXT_COLOR, borderWidth: BORDER_WIDTH * 2 });
    } else if (symbolType === 'exchange') {
      page.drawLine({ start: { x: cx - s, y: cy }, end: { x: cx + s, y: cy }, thickness: BORDER_WIDTH * 2.5, color: TEXT_COLOR });
      page.drawLine({ start: { x: cx + s * 0.5, y: cy + s * 0.5 }, end: { x: cx + s, y: cy }, thickness: BORDER_WIDTH * 2.5, color: TEXT_COLOR });
      page.drawLine({ start: { x: cx + s * 0.5, y: cy - s * 0.5 }, end: { x: cx + s, y: cy }, thickness: BORDER_WIDTH * 2.5, color: TEXT_COLOR });
    }
    if (distanceText) {
      const fs = HEADER_FONT_SIZE - 1;
      const tw = font.widthOfTextAtSize(distanceText, fs);
      page.drawText(distanceText, { x: startX + leftW + (rightW - tw) / 2, y: rowY + (cellPt - fs) / 2, size: fs, font, color: TEXT_COLOR });
    }
    currentY = rowY;
  }

  // Control row: the 8-column A–H cells (shares the existing drawRow painter).
  async function drawControlRow(cc: typeof sheetControls[number], seqNumber: number | null): Promise<void> {
    const ctrl = event.controls[cc.controlId as ControlId];
    if (!ctrl) return;
    const isStart = cc.type === 'start';
    const isFinish = cc.type === 'finish';
    const colA = isScore
      ? (cc.score != null ? String(cc.score) : null)
      : (seqNumber != null ? String(seqNumber) : null);
    const colB: string | null = isStart || isFinish ? null : String(ctrl.code);
    const desc = ctrl.description;

    // Text mode: [seq][code][one wide sentence cell spanning columns C–H].
    if (appearance === 'text') {
      const rowY = currentY - cellPt;
      const drawTextCell = (x: number, w: number, text: string | null, center: boolean) => {
        page.drawRectangle({ x, y: rowY, width: w, height: cellPt, borderColor: BORDER_COLOR, borderWidth: BORDER_WIDTH });
        if (!text) return;
        // Shrink to fit the width; truncate with … only if it hits the minimum size.
        let size = TEXT_FONT_SIZE;
        const maxW = w - cellPt * 0.2;
        while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
        let shown = text;
        while (shown.length > 1 && font.widthOfTextAtSize(shown + '…', size) > maxW) shown = shown.slice(0, -1);
        if (shown !== text) shown += '…';
        const tw = font.widthOfTextAtSize(shown, size);
        page.drawText(shown, {
          x: center ? x + (w - tw) / 2 : x + cellPt * 0.1,
          y: rowY + (cellPt - size) / 2,
          size, font, color: TEXT_COLOR,
        });
      };
      drawTextCell(startX, cellPt, colA, true);
      drawTextCell(startX + cellPt, cellPt, colB, true);
      drawTextCell(startX + cellPt * 2, cellPt * 6, generateTextDescription(desc, lang) || null, false);
      currentY = rowY;
      return;
    }

    const symOrText = (v: string | undefined): string | null =>
      !v ? null : getSymbolSvg(v) ? `sym:${v}` : getSymbolName(v, lang);
    await drawRow([
      colA, colB,
      symOrText(desc.columnC), symOrText(desc.columnD), symOrText(desc.columnE),
      desc.columnFText ?? symOrText(desc.columnF), symOrText(desc.columnG), symOrText(desc.columnH),
    ]);
  }

  let gridTopY = currentY; // top of the current page's body block (outer frame)
  let controlRowIndex = 0;
  let rowsOnPage = 0;

  const closeFrame = (): void => {
    if (rowsOnPage > 0) {
      page.drawRectangle({
        x: startX, y: currentY, width: gridWidth, height: gridTopY - currentY,
        borderColor: BORDER_COLOR, borderWidth: BORDER_WIDTH * 3,
      });
    }
  };

  async function drawHeaders(): Promise<void> {
    for (const row of repeatHeaderRows) {
      if (row.kind === 'header') {
        const isPrimary = row === repeatHeaderRows[0];
        await drawRow([row.text], {
          headerSpan: true,
          bold: isPrimary,
          fontSize: row.fontSize,
          font: isPrimary ? boldFont : headerFont,
        });
      } else if (row.kind === 'splitInfo') {
        drawSplitInfoRow(row.sections);
      }
    }
  }

  await drawHeaders();
  gridTopY = currentY;

  for (const row of flowRows) {
    // Paginate: if the next row would fall below the bottom margin, close the
    // current page's frame, start a new page, and repeat the header rows.
    if (currentY - cellPt < layout.marginBottom) {
      closeFrame();
      page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
      currentY = startY;
      await drawHeaders();
      gridTopY = currentY;
      rowsOnPage = 0;
    }

    if (row.kind === 'splitInfo') {
      drawSplitInfoRow(row.sections);
    } else if (row.kind === 'directive') {
      drawDirectiveRow(row.leftSymbol, row.distanceText);
    } else if (row.kind === 'control') {
      await drawControlRow(row.cc, row.seqNumber);
      // IOF convention: a heavier horizontal line after every 3rd control row.
      controlRowIndex += 1;
      if (controlRowIndex % 3 === 0) {
        page.drawLine({
          start: { x: startX, y: currentY },
          end: { x: startX + gridWidth, y: currentY },
          thickness: BORDER_WIDTH * 3,
          color: BORDER_COLOR,
        });
      }
    }
    rowsOnPage += 1;
  }

  // Thicker outer frame around the body block on the final page.
  closeFrame();

  // ---------------------------------------------------------------------------
  // Serialise
  // ---------------------------------------------------------------------------

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const suggestedName = `${event.name} - ${course.name} Descriptions.pdf`.replace(
    /[^a-zA-Z0-9-_ .]/g,
    '',
  );

  return { blob, suggestedName };
}
