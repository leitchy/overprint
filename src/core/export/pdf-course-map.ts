import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { OverprintEvent, Course, SpecialItem } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
import type { CourseId } from '@/utils/id';
import type { PageLayout, MapViewport } from './pdf-page-layout';
import { computePageLayout, computeCourseBounds, computeMultiPageViewports } from './pdf-page-layout';
import { renderOverprint } from './pdf-overprint-renderer';

export interface PdfExportOptions {
  /** Which course to export. If omitted, exports the first course. */
  courseIndex?: number;
}

/**
 * Generate a course map PDF as a Blob. Does not trigger a save dialog.
 * Call saveBlob() separately from a user gesture handler.
 *
 * When the course is too large to fit on one page at the desired print scale,
 * multiple pages are generated automatically with 15mm overlap between them.
 */
export async function generateCoursePdf(
  event: OverprintEvent,
  mapImage: HTMLCanvasElement | HTMLImageElement,
  options: PdfExportOptions = {},
): Promise<{ blob: Blob; suggestedName: string }> {
  const courseIndex = options.courseIndex ?? 0;
  const course: Course | undefined = event.courses[courseIndex];
  if (!course) throw new Error('No course to export');
  if (!event.mapFile) throw new Error('No map file loaded');

  const { dpi, scale: mapScale } = event.mapFile;
  const printScale = course.settings.printScale ?? event.settings.printScale;
  const layout = computePageLayout(event.settings.pageSetup);

  // Map image dimensions
  const imgWidth = mapImage instanceof HTMLCanvasElement ? mapImage.width : mapImage.naturalWidth;
  const imgHeight = mapImage instanceof HTMLCanvasElement ? mapImage.height : mapImage.naturalHeight;

  // Course bounding box
  const bounds = computeCourseBounds(course, event.controls);
  if (!bounds) throw new Error('Course has no controls');

  // Compute viewport grid (1×1 for single-page, n×m for multi-page)
  // Pass custom print area override if set on the course
  const printAreaOverride = course.settings.printArea;
  const multiPage = computeMultiPageViewports(
    layout, mapScale, printScale, dpi, imgWidth, imgHeight, bounds,
    30, 15, printAreaOverride,
  );
  const totalPages = multiPage.viewports.length;

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Embed the base map image once — pdf-lib allows drawing the same embedded image
  // on multiple pages without re-encoding.
  const embeddedMap = await prepareMapImage(pdfDoc, mapImage, imgWidth, imgHeight);

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const viewport = multiPage.viewports[pageIndex]!;

    // Coordinate transform for this page's viewport
    const toPdf = viewportToPdf(layout, viewport);

    const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

    // Draw base map
    if (embeddedMap) {
      drawEmbeddedMap(page, embeddedMap.image, toPdf, imgWidth, imgHeight);
    }

    // Draw vector overprint (elements outside page bounds are harmless — PDF clips them)
    renderOverprint(
      { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP },
      course,
      event.controls,
      font,
    );

    // Draw special items (filter by course: items with no courseIds restriction, or this course)
    renderSpecialItems(page, event.specialItems, course.id, toPdf, font, viewport.effectivePPP);

    // Page indicator for multi-page exports (no title/scale bar — the map provides those)
    if (totalPages > 1) {
      const pageLabel = `${course.name} (${pageIndex + 1}/${totalPages})`;
      page.drawText(pageLabel, {
        x: layout.marginLeft + 4,
        y: layout.pageHeight - layout.marginTop - 12,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const suggestedName = `${event.name} - ${course.name}.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '');
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

// ---------------------------------------------------------------------------
// Special items rendering
// ---------------------------------------------------------------------------

/**
 * Render all special items for a course onto the PDF page.
 * Items with no courseIds restriction are always rendered.
 * Items with courseIds are only rendered if courseId is in the list.
 */
function renderSpecialItems(
  page: PDFPage,
  specialItems: SpecialItem[],
  courseId: CourseId,
  toPdf: (point: MapPoint) => MapPoint,
  font: PDFFont,
  effectivePPP: number,
): void {
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
        page.drawLine({
          start: { x: pos.x, y: pos.y },
          end: { x: endPos.x, y: endPos.y },
          thickness: 1.5,
          color: itemColor,
        });
        break;
      }

      case 'rectangle': {
        const endPos = toPdf(item.endPosition);
        const rectX = Math.min(pos.x, endPos.x);
        const rectY = Math.min(pos.y, endPos.y);
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: Math.abs(endPos.x - pos.x),
          height: Math.abs(endPos.y - pos.y),
          borderColor: itemColor,
          borderWidth: 1.5,
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
