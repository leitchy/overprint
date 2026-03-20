import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, clip, endPath } from 'pdf-lib';
import { rectangle as rectOp } from 'pdf-lib';
import type { PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import type { OverprintEvent, Course, Control, EventSettings, PageSetup, SpecialItem } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
import type { CourseId, ControlId } from '@/utils/id';
import type { PageLayout, MapViewport } from './pdf-page-layout';
import { computePageLayout, computeCourseBounds, computeMultiPageViewports } from './pdf-page-layout';
import { renderOverprint } from './pdf-overprint-renderer';
import { getSymbolSvg, getSymbolName } from '@/core/iof/symbol-db';
import { generateTextDescription } from '@/core/iof/text-descriptions';
import { calculateCourseLength } from '@/core/geometry/course-length';

export interface PdfExportOptions {
  /** Which course to export. If omitted, exports the first course. */
  courseIndex?: number;
  /** Export multiple courses into one PDF. Overrides courseIndex when set. */
  courseIndices?: number[];
}

/**
 * Merge per-course page setup overrides with the event-level defaults.
 * Unset fields in the course override fall back to the event default.
 */
function mergePageSetup(eventSetup: PageSetup, courseOverride?: Partial<PageSetup>): PageSetup {
  if (!courseOverride) return eventSetup;
  return {
    ...eventSetup,
    ...courseOverride,
    margins: courseOverride.margins
      ? { ...eventSetup.margins, ...courseOverride.margins }
      : eventSetup.margins,
  };
}

/**
 * Generate a course map PDF as a Blob. Does not trigger a save dialog.
 * Call saveBlob() separately from a user gesture handler.
 *
 * When courseIndices is provided, all specified courses are rendered into a
 * single PDF. Each course may have its own page setup (orientation, paper size).
 *
 * When a single course is too large to fit on one page at the desired print
 * scale, multiple pages are generated automatically with 15mm overlap.
 */
export async function generateCoursePdf(
  event: OverprintEvent,
  mapImage: HTMLCanvasElement | HTMLImageElement,
  options: PdfExportOptions = {},
  pdfArrayBuffer?: ArrayBuffer | null,
): Promise<{ blob: Blob; suggestedName: string }> {
  if (!event.mapFile) throw new Error('No map file loaded');

  // Determine which courses to export
  const indices = options.courseIndices ?? [options.courseIndex ?? 0];
  const isMultiCourse = indices.length > 1;

  const { dpi, scale: mapScale } = event.mapFile;

  // Map image dimensions
  const imgWidth = mapImage instanceof HTMLCanvasElement ? mapImage.width : mapImage.naturalWidth;
  const imgHeight = mapImage instanceof HTMLCanvasElement ? mapImage.height : mapImage.naturalHeight;

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Embed the base map once — pdf-lib reuses across all pages.
  // For PDF-source maps, embed the original PDF page as vectors.
  // For raster/OCAD/OMAP, fall back to PNG rasterisation.
  const isPdfSource = event.mapFile.type === 'pdf' && pdfArrayBuffer;
  let embeddedMap: EmbeddedMapImage | null = null;
  let embeddedPdfPage: PDFEmbeddedPage | null = null;

  if (isPdfSource) {
    const pages = await pdfDoc.embedPdf(pdfArrayBuffer!);
    embeddedPdfPage = pages[0] ?? null;
  }
  if (!embeddedPdfPage) {
    embeddedMap = await prepareMapImage(pdfDoc, mapImage, imgWidth, imgHeight);
  }

  let lastCourseName = '';

  for (const ci of indices) {
    const course: Course | undefined = event.courses[ci];
    if (!course) continue;

    // Course bounding box — skip courses with no controls
    const bounds = computeCourseBounds(course, event.controls);
    if (!bounds) {
      console.warn(`Skipping course "${course.name}": no controls`);
      continue;
    }

    lastCourseName = course.name;
    const printScale = course.settings.printScale ?? event.settings.printScale;

    // Per-course page setup (may override orientation, paper size, margins)
    const pageSetup = mergePageSetup(event.settings.pageSetup, course.settings.pageSetup);
    const layout = computePageLayout(pageSetup);

    // Compute viewport grid for this course
    const printAreaOverride = course.settings.printArea;
    const multiPage = computeMultiPageViewports(
      layout, mapScale, printScale, dpi, imgWidth, imgHeight, bounds,
      30, 15, printAreaOverride,
    );
    const coursePageCount = multiPage.viewports.length;

    for (let pageIndex = 0; pageIndex < coursePageCount; pageIndex++) {
      const viewport = multiPage.viewports[pageIndex]!;
      const toPdf = viewportToPdf(layout, viewport);

      // Each page gets its own dimensions (supports mixed portrait/landscape)
      const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

      // Draw base map — vector PDF page or rasterised PNG
      if (embeddedPdfPage) {
        drawEmbeddedPdfPage(page, embeddedPdfPage, layout, toPdf, imgWidth, imgHeight);
      } else if (embeddedMap) {
        drawEmbeddedMap(page, embeddedMap.image, toPdf, imgWidth, imgHeight);
      }

      // Draw vector overprint
      renderOverprint(
        { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP },
        course,
        event.controls,
        font,
      );

      // Draw special items (filtered by course)
      await renderSpecialItems(page, pdfDoc, event.specialItems, course.id, course, event.controls, event.settings, toPdf, font, viewport.effectivePPP);

      // Page label — show course name for multi-course, page number for multi-page courses
      if (isMultiCourse || coursePageCount > 1) {
        const pageLabel = coursePageCount > 1
          ? `${course.name} (${pageIndex + 1}/${coursePageCount})`
          : course.name;
        page.drawText(pageLabel, {
          x: layout.marginLeft + 4,
          y: layout.pageHeight - layout.marginTop - 12,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const suggestedName = isMultiCourse
    ? `${event.name} - All Courses.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '')
    : `${event.name} - ${lastCourseName}.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '');
  return { blob, suggestedName };
}

/**
 * Build a coordinate transform function for a given viewport.
 * Map: (0,0) = top-left, Y down. PDF: (0,0) = bottom-left, Y up.
 */
function viewportToPdf(layout: PageLayout, viewport: MapViewport): (point: MapPoint) => MapPoint {
  return (point: MapPoint): MapPoint => ({
    x: layout.marginLeft + (point.x - viewport.left) * viewport.effectivePPP,
    y: layout.marginBottom + (viewport.top + viewport.heightPx - point.y) * viewport.effectivePPP,
  });
}

interface EmbeddedMapImage {
  image: Awaited<ReturnType<PDFDocument['embedPng']>>;
  renderScale: number;
}

/**
 * Prepare the map image for embedding — scales it down if needed and embeds it
 * into the PDF document. Returns null if the canvas context is unavailable.
 */
async function prepareMapImage(
  pdfDoc: PDFDocument,
  mapImage: HTMLCanvasElement | HTMLImageElement,
  imgWidth: number,
  imgHeight: number,
): Promise<EmbeddedMapImage | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Cap at 4096px on longest side to keep PDF size reasonable
  const maxDim = 4096;
  const renderScale = Math.min(1, maxDim / Math.max(imgWidth, imgHeight));
  canvas.width = Math.round(imgWidth * renderScale);
  canvas.height = Math.round(imgHeight * renderScale);

  if (renderScale !== 1) {
    ctx.scale(renderScale, renderScale);
  }
  ctx.drawImage(mapImage, 0, 0);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png');
  });

  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const image = await pdfDoc.embedPng(pngBytes);
  return { image, renderScale };
}

/**
 * Draw an already-embedded map image onto a page using the given coordinate transform.
 * pdf-lib handles any downscaling that was applied during embedding internally —
 * drawImage width/height are in PDF points, not in embedded-image pixels.
 */
function drawEmbeddedMap(
  page: PDFPage,
  image: EmbeddedMapImage['image'],
  toPdf: (point: MapPoint) => MapPoint,
  imgWidth: number,
  imgHeight: number,
): void {
  // Map pixel (0,0) = top-left, (imgWidth, imgHeight) = bottom-right.
  // pdf-lib drawImage: (x, y) = bottom-left corner of image.
  const topLeft = toPdf({ x: 0, y: 0 });
  const bottomRight = toPdf({ x: imgWidth, y: imgHeight });

  page.drawImage(image, {
    x: topLeft.x,
    y: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: topLeft.y - bottomRight.y,
  });
}

/**
 * Draw an embedded PDF page (vector-preserving) onto the output page.
 * Uses a clip rectangle to keep the map within the printable area.
 * Positioning math is identical to drawEmbeddedMap.
 */
function drawEmbeddedPdfPage(
  page: PDFPage,
  embeddedPage: PDFEmbeddedPage,
  layout: PageLayout,
  toPdf: (point: MapPoint) => MapPoint,
  imgWidth: number,
  imgHeight: number,
): void {
  const topLeft = toPdf({ x: 0, y: 0 });
  const bottomRight = toPdf({ x: imgWidth, y: imgHeight });

  // Clip to printable area — the full PDF page may extend beyond the viewport
  page.pushOperators(
    pushGraphicsState(),
    rectOp(layout.marginLeft, layout.marginBottom, layout.printableWidth, layout.printableHeight),
    clip(),
    endPath(),
  );

  page.drawPage(embeddedPage, {
    x: topLeft.x,
    y: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: topLeft.y - bottomRight.y,
  });

  page.pushOperators(popGraphicsState());
}

// ---------------------------------------------------------------------------
// Special items rendering
// ---------------------------------------------------------------------------

/**
 * Render all special items for a course onto the PDF page.
 * Items with no courseIds restriction are always rendered.
 * Items with courseIds are only rendered if courseId is in the list.
 */
async function renderSpecialItems(
  page: PDFPage,
  pdfDoc: PDFDocument,
  specialItems: SpecialItem[],
  courseId: CourseId,
  course: Course,
  controls: Record<ControlId, Control>,
  eventSettings: EventSettings,
  toPdf: (point: MapPoint) => MapPoint,
  font: PDFFont,
  effectivePPP: number,
): Promise<void> {
  const IOF_SYMBOL_PT = 12; // pt half-size for IOF symbols in PDF

  for (const item of specialItems) {
    // Filter by course
    if (item.courseIds && item.courseIds.length > 0 && !item.courseIds.includes(courseId)) {
      continue;
    }

    const colorHex = item.color ?? '#C850A0';
    const itemColor = hexToRgb(colorHex);
    const pos = toPdf(item.position);

    switch (item.type) {
      case 'text': {
        // fontSize is in map pixels — convert to PDF points
        const fontSizePt = item.fontSize * effectivePPP;
        page.drawText(item.text, {
          x: pos.x,
          y: pos.y,
          size: fontSizePt,
          font,
          color: itemColor,
        });
        break;
      }

      case 'line': {
        const endPos = toPdf(item.endPosition);
        const lineThickness = (item.lineWidth ?? 2) * effectivePPP;
        page.drawLine({
          start: { x: pos.x, y: pos.y },
          end: { x: endPos.x, y: endPos.y },
          thickness: lineThickness,
          color: itemColor,
        });
        break;
      }

      case 'rectangle': {
        const endPos = toPdf(item.endPosition);
        const rectX = Math.min(pos.x, endPos.x);
        const rectY = Math.min(pos.y, endPos.y);
        const borderThickness = (item.lineWidth ?? 2) * effectivePPP;
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: Math.abs(endPos.x - pos.x),
          height: Math.abs(endPos.y - pos.y),
          borderColor: itemColor,
          borderWidth: borderThickness,
        });
        break;
      }

      case 'outOfBounds': {
        // Hatched square
        const s = IOF_SYMBOL_PT;
        page.drawRectangle({
          x: pos.x - s, y: pos.y - s,
          width: s * 2, height: s * 2,
          borderColor: itemColor, borderWidth: 1,
        });
        for (let i = -2; i <= 2; i++) {
          const ox = i * (s / 2);
          page.drawLine({
            start: { x: pos.x + ox - s, y: pos.y - s },
            end: { x: pos.x + ox + s, y: pos.y + s },
            thickness: 0.7,
            color: itemColor,
          });
        }
        break;
      }

      case 'dangerousArea': {
        const s = IOF_SYMBOL_PT;
        page.drawLine({ start: { x: pos.x, y: pos.y + s }, end: { x: pos.x + s * 0.9, y: pos.y - s * 0.7 }, thickness: 1, color: itemColor });
        page.drawLine({ start: { x: pos.x + s * 0.9, y: pos.y - s * 0.7 }, end: { x: pos.x - s * 0.9, y: pos.y - s * 0.7 }, thickness: 1, color: itemColor });
        page.drawLine({ start: { x: pos.x - s * 0.9, y: pos.y - s * 0.7 }, end: { x: pos.x, y: pos.y + s }, thickness: 1, color: itemColor });
        break;
      }

      case 'waterLocation': {
        // Circle with wave inside
        const s = IOF_SYMBOL_PT;
        page.drawCircle({ x: pos.x, y: pos.y, size: s, borderColor: itemColor, borderWidth: 1 });
        page.drawLine({
          start: { x: pos.x - s * 0.5, y: pos.y },
          end: { x: pos.x + s * 0.5, y: pos.y },
          thickness: 1, color: itemColor,
        });
        break;
      }

      case 'firstAid': {
        const s = IOF_SYMBOL_PT * 0.7;
        page.drawLine({ start: { x: pos.x, y: pos.y - s }, end: { x: pos.x, y: pos.y + s }, thickness: 2, color: itemColor });
        page.drawLine({ start: { x: pos.x - s, y: pos.y }, end: { x: pos.x + s, y: pos.y }, thickness: 2, color: itemColor });
        break;
      }

      case 'forbiddenRoute': {
        const s = IOF_SYMBOL_PT * 0.7;
        page.drawLine({ start: { x: pos.x - s, y: pos.y - s }, end: { x: pos.x + s, y: pos.y + s }, thickness: 2, color: itemColor });
        page.drawLine({ start: { x: pos.x + s, y: pos.y - s }, end: { x: pos.x - s, y: pos.y + s }, thickness: 2, color: itemColor });
        break;
      }

      case 'descriptionBox': {
        const endPos = toPdf(item.endPosition);
        const rectX = Math.min(pos.x, endPos.x);
        const rectY = Math.min(pos.y, endPos.y);
        const rectW = Math.abs(endPos.x - pos.x);
        const rectH = Math.abs(endPos.y - pos.y);

        await renderDescriptionBoxToPdf(
          page, pdfDoc, course, controls,
          { x: rectX, y: rectY, width: rectW, height: rectH },
          eventSettings,
          font,
        );
        break;
      }
    }
  }
}

/**
 * Convert a CSS hex colour string (e.g. '#CD59A4') to a pdf-lib rgb() value.
 * Falls back to purple overprint colour if parsing fails.
 */
function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return rgb(200 / 255, 80 / 255, 160 / 255); // fallback: overprint purple
  return rgb(
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  );
}

// ---------------------------------------------------------------------------
// SVG → PNG rasterisation (duplicated from pdf-description-sheet.ts)
// ---------------------------------------------------------------------------

/**
 * Render a raw SVG string to a PNG Blob using an off-screen canvas.
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
// Description box rendering (embedded IOF description grid on course map)
// ---------------------------------------------------------------------------

/** Standard IOF cell size in mm */
const DESC_CELL_SIZE_MM = 7;

const DESC_BORDER_WIDTH = 0.5;
const DESC_TEXT_FONT_SIZE = 8;
const DESC_HEADER_FONT_SIZE = 9;
const DESC_BORDER_COLOR = rgb(0, 0, 0);
const DESC_TEXT_COLOR = rgb(0, 0, 0);

interface DescBoxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Render an IOF control description grid within a bounded rectangle on a PDF page.
 * The grid is scaled to fit the given bounds while maintaining the IOF cell aspect ratio.
 *
 * Layout (top to bottom in visual order, but Y increases upward in PDF coords):
 *   1. Header row: course name (spans all columns)
 *   2. Info row: course length (spans all columns)
 *   3. Control rows: one per CourseControl
 */
async function renderDescriptionBoxToPdf(
  page: PDFPage,
  pdfDoc: PDFDocument,
  course: Course,
  controls: Record<ControlId, Control>,
  bounds: DescBoxBounds,
  eventSettings: EventSettings,
  font: PDFFont,
): Promise<void> {
  const lang = eventSettings.language ?? 'en';
  const appearance = course.settings.descriptionAppearance ?? 'symbols';
  const numCols = appearance === 'symbolsAndText' ? 9 : 8;

  // Count rows: header + info + control rows
  const controlRows = course.controls.length;
  const totalRows = 2 + controlRows; // header + info + controls

  // Calculate cell size to fit within bounds
  const cellW = bounds.width / numCols;
  const cellH = bounds.height / totalRows;
  // Use uniform cell size (square cells preferred, but fit to bounds)
  const cellSize = Math.min(cellW, cellH);

  // Actual grid dimensions
  const gridWidth = cellSize * numCols;
  const gridHeight = cellSize * totalRows;

  // Center the grid within the bounds
  const gridX = bounds.x + (bounds.width - gridWidth) / 2;
  // PDF Y=0 at bottom; bounds.y is the bottom of the box
  // Grid starts at the top of the bounds
  const gridTopY = bounds.y + bounds.height;

  // Draw white background
  page.drawRectangle({
    x: gridX,
    y: gridTopY - gridHeight,
    width: gridWidth,
    height: gridHeight,
    color: rgb(1, 1, 1),
  });

  // Embed symbols cache
  const embeddedSymbols = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();

  async function embedSymbol(symbolId: string): Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>> | null> {
    const cached = embeddedSymbols.get(symbolId);
    if (cached) return cached;

    const svgString = getSymbolSvg(symbolId);
    if (!svgString) return null;

    const sizePx = Math.ceil((DESC_CELL_SIZE_MM / 25.4) * 300);
    const blob = await svgToPngBlob(svgString, sizePx);
    const arrayBuffer = await blob.arrayBuffer();
    const pngBytes = new Uint8Array(arrayBuffer);
    const image = await pdfDoc.embedPng(pngBytes);
    embeddedSymbols.set(symbolId, image);
    return image;
  }

  // Track current row (0 = topmost row)
  let rowIndex = 0;

  /**
   * Draw a row at the given rowIndex.
   * rowY is the bottom-left Y of the row in PDF coordinates.
   */
  function getRowY(idx: number): number {
    return gridTopY - (idx + 1) * cellSize;
  }

  function drawHeaderRow(text: string, _bold: boolean, fontSize: number): void {
    const rowY = getRowY(rowIndex);

    // Spanning rectangle
    page.drawRectangle({
      x: gridX,
      y: rowY,
      width: gridWidth,
      height: cellSize,
      borderColor: DESC_BORDER_COLOR,
      borderWidth: DESC_BORDER_WIDTH,
    });

    // Centered text
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textX = gridX + (gridWidth - textWidth) / 2;
    const textY = rowY + (cellSize - fontSize) / 2;
    page.drawText(text, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: DESC_TEXT_COLOR,
    });

    rowIndex++;
  }

  // --- Header row: course name ---
  drawHeaderRow(course.name, true, DESC_HEADER_FONT_SIZE);

  // --- Info row: length + climb ---
  const dpi = 96; // fallback; description box doesn't need exact DPI
  const scale = eventSettings.printScale;
  const lengthM = calculateCourseLength(course.controls, controls, scale, dpi);
  const climbValue = course.climb ?? course.settings.climb;
  const climbText = climbValue !== undefined ? ` / ${climbValue}m climb` : '';
  const infoText = `${Math.round(lengthM)} m${climbText}`;
  drawHeaderRow(infoText, false, DESC_HEADER_FONT_SIZE);

  // --- Control rows ---
  let seqNumber = 0;

  for (const cc of course.controls) {
    const ctrl: Control | undefined = controls[cc.controlId as ControlId];
    if (!ctrl) continue;

    const rowY = getRowY(rowIndex);
    const isStart = cc.type === 'start';
    const isFinish = cc.type === 'finish';

    // Column A: sequence number
    let colA: string | null = null;
    if (!isStart && !isFinish) {
      seqNumber += 1;
      colA = String(seqNumber);
    }

    // Column B: control code
    const colB: string | null = isStart || isFinish ? null : String(ctrl.code);

    // Columns C-H: description symbols or text
    const desc = ctrl.description;
    const symOrText = (v: string | undefined): string | null => {
      if (!v) return null;
      if (appearance === 'text') {
        return getSymbolName(v, lang);
      }
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

    // Column I (9th): text description for symbolsAndText mode
    if (appearance === 'symbolsAndText') {
      cells.push(generateTextDescription(desc, lang));
    }

    // Draw each cell
    for (let col = 0; col < numCols; col++) {
      const cellX = gridX + col * cellSize;

      page.drawRectangle({
        x: cellX,
        y: rowY,
        width: cellSize,
        height: cellSize,
        borderColor: DESC_BORDER_COLOR,
        borderWidth: DESC_BORDER_WIDTH,
      });

      const cell = cells[col];
      if (!cell) continue;

      if (typeof cell === 'string' && cell.startsWith('sym:')) {
        const symbolId = cell.slice(4);
        const pdfImage = await embedSymbol(symbolId);
        if (pdfImage) {
          const padding = cellSize * 0.08;
          page.drawImage(pdfImage, {
            x: cellX + padding,
            y: rowY + padding,
            width: cellSize - padding * 2,
            height: cellSize - padding * 2,
          });
        }
      } else if (typeof cell === 'string') {
        // Text cell — for the 9th column (text description), use smaller font and left-align
        const isTextCol = appearance === 'symbolsAndText' && col === 8;
        const fontSize = isTextCol ? DESC_TEXT_FONT_SIZE * 0.75 : DESC_TEXT_FONT_SIZE;

        // Truncate text to fit cell width
        let displayText = cell;
        const maxTextWidth = cellSize - cellSize * 0.16;
        while (font.widthOfTextAtSize(displayText, fontSize) > maxTextWidth && displayText.length > 1) {
          displayText = displayText.slice(0, -1);
        }

        if (isTextCol) {
          // Left-aligned with small padding
          const textX = cellX + cellSize * 0.08;
          const textY = rowY + (cellSize - fontSize) / 2;
          page.drawText(displayText, {
            x: textX,
            y: textY,
            size: fontSize,
            font,
            color: DESC_TEXT_COLOR,
          });
        } else {
          // Center-aligned
          const textWidth = font.widthOfTextAtSize(displayText, fontSize);
          const textX = cellX + (cellSize - textWidth) / 2;
          const textY = rowY + (cellSize - fontSize) / 2;
          page.drawText(displayText, {
            x: textX,
            y: textY,
            size: fontSize,
            font,
            color: DESC_TEXT_COLOR,
          });
        }
      }
    }

    rowIndex++;
  }
}
