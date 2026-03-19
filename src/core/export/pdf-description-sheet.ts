/**
 * IOF Control Description Sheet PDF export.
 *
 * Renders the standard 8-column control description grid as pdf-lib vector
 * graphics. Symbol cells (C-H) are rasterized from SVG via an off-screen
 * canvas and embedded as PNG images. Text cells (A, B) use Helvetica.
 *
 * IOF cell size: 7mm × 7mm (standard grid unit).
 * Header row: course name spanning all 8 columns.
 * Info row: course length (metres) spanning all 8 columns.
 * Control rows: one row per CourseControl in sequence.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Control, Course, OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { computePageLayout, mmToPdfPoints } from './pdf-page-layout';
import { calculateCourseLength } from '@/core/geometry/course-length';
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
  const dpi = event.mapFile?.dpi ?? 96;
  const scale = event.mapFile?.scale ?? event.settings.printScale;

  // Calculate total course length
  const lengthM = calculateCourseLength(course.controls, event.controls, scale, dpi);

  // ---------------------------------------------------------------------------
  // SVG embedding with de-duplication
  // ---------------------------------------------------------------------------

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
  const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

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
   *   - A text string (drawn with Helvetica)
   *   - A symbolId string prefixed with 'sym:' (embedded PNG)
   *   - null / undefined (empty cell)
   *
   * Returns the Y offset to apply (i.e., −cellPt).
   */
  async function drawRow(
    cells: ReadonlyArray<string | null | undefined>,
    opts: { fontSize?: number; bold?: boolean; headerSpan?: boolean } = {},
  ): Promise<void> {
    const rowY = currentY - cellPt;
    const fontSize = opts.fontSize ?? TEXT_FONT_SIZE;
    const usedFont = opts.bold ? boldFont : font;

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

  // ---------------------------------------------------------------------------
  // Header row: course name
  // ---------------------------------------------------------------------------

  await drawRow([course.name], { headerSpan: true, bold: true, fontSize: HEADER_FONT_SIZE });

  // ---------------------------------------------------------------------------
  // Secondary title row (e.g. class list)
  // ---------------------------------------------------------------------------

  if (course.settings.secondaryTitle) {
    await drawRow([course.settings.secondaryTitle], { headerSpan: true, fontSize: HEADER_FONT_SIZE - 1 });
  }

  // ---------------------------------------------------------------------------
  // Info row: length + climb (hidden for score courses — no meaningful length)
  // ---------------------------------------------------------------------------

  const isScore = course.courseType === 'score';

  if (!isScore) {
    const climbValue = course.climb ?? course.settings.climb;
    const climbText = climbValue !== undefined ? ` / ${climbValue}m climb` : '';
    const infoText = `${Math.round(lengthM)} m${climbText}`;
    await drawRow([infoText], { headerSpan: true, fontSize: HEADER_FONT_SIZE });
  }

  // ---------------------------------------------------------------------------
  // Control rows (score courses sorted by code number)
  // ---------------------------------------------------------------------------

  const displayControls = isScore
    ? [...course.controls].sort((a, b) => {
        const ca = event.controls[a.controlId as ControlId];
        const cb = event.controls[b.controlId as ControlId];
        return (ca?.code ?? 0) - (cb?.code ?? 0);
      })
    : course.controls;

  let seqNumber = 0;

  for (const cc of displayControls) {
    const ctrl: Control | undefined = event.controls[cc.controlId as ControlId];
    if (!ctrl) continue;

    const isStart = cc.type === 'start';
    const isFinish = cc.type === 'finish';

    // Column A: point value for score courses, sequence number for normal
    let colA: string | null = null;
    if (isScore) {
      colA = cc.score != null ? String(cc.score) : null;
    } else if (isStart) {
      colA = null;
    } else if (isFinish) {
      colA = null;
    } else {
      seqNumber += 1;
      colA = String(seqNumber);
    }

    // Column B: control code (blank for start/finish)
    const colB: string | null = isStart || isFinish ? null : String(ctrl.code);

    // Columns C-H: description symbols (SVG preferred) or localised text fallback
    const desc = ctrl.description;
    const symOrText = (v: string | undefined): string | null => {
      if (!v) return null;
      return getSymbolSvg(v) ? `sym:${v}` : getSymbolName(v, lang);
    };

    const cells: Array<string | null> = [
      colA,
      colB,
      symOrText(desc.columnC),
      symOrText(desc.columnD),
      symOrText(desc.columnE),
      symOrText(desc.columnF),
      symOrText(desc.columnG),
      symOrText(desc.columnH),
    ];

    await drawRow(cells);
  }

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
