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
  const multiPage = computeMultiPageViewports(
    layout, mapScale, printScale, dpi, imgWidth, imgHeight, bounds,
  );
  const totalPages = multiPage.viewports.length;

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
      drawEmbeddedMap(page, embeddedMap.image, embeddedMap.renderScale, toPdf, imgWidth, imgHeight);
    }

    // Draw vector overprint (elements outside page bounds are harmless — PDF clips them)
    renderOverprint(
      { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP },
      course,
      event.controls,
      font,
    );

    // Draw special items (filter by course: items with no courseIds restriction, or this course)
    renderSpecialItems(page, event.specialItems, course.id, toPdf, font);

    // Title on every page (with page indicator if multi-page)
    const mapTitleBase = event.settings.mapTitle ?? event.name;
    const titleText = totalPages > 1
      ? `${course.name} — ${mapTitleBase} (${pageIndex + 1}/${totalPages})`
      : `${course.name} — ${mapTitleBase}`;
    drawCourseTitle(page, layout, titleText, boldFont);

    // Scale bar on every page
    drawScaleBar(page, layout, printScale, font, event.settings.contourInterval);
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
 * The renderScale compensates for any downscaling applied during embedding.
 */
function drawEmbeddedMap(
  page: PDFPage,
  image: EmbeddedMapImage['image'],
  renderScale: number,
  toPdf: (point: MapPoint) => MapPoint,
  imgWidth: number,
  imgHeight: number,
): void {
  // Map pixel (0,0) = top-left, (imgWidth, imgHeight) = bottom-right.
  // pdf-lib drawImage: (x, y) = bottom-left corner of image.
  const topLeft = toPdf({ x: 0, y: 0 });
  const bottomRight = toPdf({ x: imgWidth, y: imgHeight });

  // The embedded image was rendered at renderScale, so its intrinsic size is
  // smaller. drawImage width/height are in PDF points (screen-independent),
  // so we pass the full PDF extent — pdf-lib handles the scaling internally.
  void renderScale; // used during embedding, not needed here

  page.drawImage(image, {
    x: topLeft.x,
    y: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: topLeft.y - bottomRight.y,
  });
}

// ---------------------------------------------------------------------------
// Title and scale bar helpers
// ---------------------------------------------------------------------------

const TITLE_FONT_SIZE = 14; // pt
const SCALE_BAR_FONT_SIZE = 8; // pt
const BLACK = rgb(0, 0, 0);

/**
 * Draw the course name as a centred bold title at the top of the printable area.
 *
 * Position: horizontally centred within the printable width; vertically
 * placed just inside the top margin so it sits above the map image.
 */
function drawCourseTitle(
  page: PDFPage,
  layout: PageLayout,
  courseName: string,
  boldFont: PDFFont,
): void {
  const textWidth = boldFont.widthOfTextAtSize(courseName, TITLE_FONT_SIZE);
  const x = layout.marginLeft + (layout.printableWidth - textWidth) / 2;
  // In PDF coordinate space, Y increases upward. The printable top edge is at:
  //   marginBottom + printableHeight
  // Place the text baseline a small offset below that top edge.
  const y = layout.marginBottom + layout.printableHeight - TITLE_FONT_SIZE - 4;

  page.drawText(courseName, {
    x,
    y,
    size: TITLE_FONT_SIZE,
    font: boldFont,
    color: BLACK,
  });
}

/**
 * Choose a nice round bar length (in metres) and segment count for the given
 * print scale, such that the bar is roughly 40–60 mm wide on paper.
 */
function chooseScaleBarParams(printScale: number): {
  segmentMetres: number;
  segments: number;
} {
  // Candidates: segment sizes in metres
  const candidates = [25, 50, 100, 200, 500, 1000, 2000] as const;

  for (const segmentMetres of candidates) {
    // mm on paper per segment at this print scale
    const mmPerSegment = (segmentMetres / printScale) * 1000;
    // Try 5 segments first, then 4, then 3
    for (const segments of [5, 4, 3]) {
      const totalMm = mmPerSegment * segments;
      if (totalMm >= 30 && totalMm <= 80) {
        return { segmentMetres, segments };
      }
    }
  }

  // Fallback: 5 × 100m regardless of scale
  return { segmentMetres: 100, segments: 5 };
}

/**
 * Draw a horizontal scale bar with tick marks and labels in the bottom-right
 * corner of the printable area.
 *
 * Layout (all in PDF points, Y-up):
 *   - tick height = 6pt
 *   - label baseline: 2pt below tick bottom
 *   - "Scale 1:X" text: 2pt below labels
 */
function drawScaleBar(
  page: PDFPage,
  layout: PageLayout,
  printScale: number,
  font: PDFFont,
  contourInterval?: number,
): void {
  const { segmentMetres, segments } = chooseScaleBarParams(printScale);

  // Convert segment length from metres to PDF points
  // 1m = (1000/printScale) mm on paper = (1000/printScale) * (72/25.4) pt
  const ptPerMetre = (1000 / printScale) * (72 / 25.4);
  const segmentPt = segmentMetres * ptPerMetre;
  const barWidthPt = segmentPt * segments;

  const tickHeight = 6; // pt
  const labelGap = 2;   // pt between tick bottom and label baseline
  // Measure approximate label height at SCALE_BAR_FONT_SIZE
  const labelHeight = SCALE_BAR_FONT_SIZE;
  const scaleTextGap = 2; // pt between labels and scale text
  const scaleTextHeight = SCALE_BAR_FONT_SIZE;

  // Total block height: tick + labelGap + labelHeight + scaleTextGap + scaleTextHeight
  const blockHeight = tickHeight + labelGap + labelHeight + scaleTextGap + scaleTextHeight;

  // Place block at bottom-right of printable area, 4pt inside the margin
  const rightEdge = layout.marginLeft + layout.printableWidth - 4;
  const barLeft = rightEdge - barWidthPt;
  const blockBottom = layout.marginBottom + 4;
  const barLineY = blockBottom + scaleTextHeight + scaleTextGap + labelHeight + labelGap;

  // Draw horizontal bar line
  page.drawLine({
    start: { x: barLeft, y: barLineY },
    end: { x: rightEdge, y: barLineY },
    thickness: 1,
    color: BLACK,
  });

  // Draw tick marks and labels at each segment boundary
  for (let i = 0; i <= segments; i++) {
    const tickX = barLeft + i * segmentPt;
    const labelMetres = i * segmentMetres;

    // Tick
    page.drawLine({
      start: { x: tickX, y: barLineY },
      end: { x: tickX, y: barLineY - tickHeight },
      thickness: 1,
      color: BLACK,
    });

    // Label — format as whole metres; use "k" suffix if ≥ 1000m
    const labelText =
      labelMetres >= 1000 ? `${labelMetres / 1000}k` : String(labelMetres);
    const labelWidth = font.widthOfTextAtSize(labelText, SCALE_BAR_FONT_SIZE);
    const labelX = tickX - labelWidth / 2;
    const labelY = barLineY - tickHeight - labelGap - labelHeight;

    page.drawText(labelText, {
      x: labelX,
      y: labelY,
      size: SCALE_BAR_FONT_SIZE,
      font,
      color: BLACK,
    });
  }

  // Draw alternating filled/empty segments for readability (classic scale bar style)
  for (let i = 0; i < segments; i++) {
    const segLeft = barLeft + i * segmentPt;
    if (i % 2 === 0) {
      page.drawRectangle({
        x: segLeft,
        y: barLineY - tickHeight,
        width: segmentPt,
        height: tickHeight,
        color: BLACK,
      });
    }
    // Odd segments: already white (no fill needed)
  }

  // Draw "Scale 1:X,XXX [· Contours X m]" text centred under the bar
  const scaleText = contourInterval
    ? `Scale 1:${printScale.toLocaleString('en')} \u00b7 Contours ${contourInterval} m`
    : `Scale 1:${printScale.toLocaleString('en')}`;
  const scaleTextWidth = font.widthOfTextAtSize(scaleText, SCALE_BAR_FONT_SIZE);
  const scaleTextX = barLeft + (barWidthPt - scaleTextWidth) / 2;
  const scaleTextY = blockBottom;

  page.drawText(scaleText, {
    x: scaleTextX,
    y: scaleTextY,
    size: SCALE_BAR_FONT_SIZE,
    font,
    color: BLACK,
  });

  // Suppress unused variable warning for blockHeight (used for documentation)
  void blockHeight;
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
): void {
  const MM_TO_PT = 72 / 25.4;
  const IOF_SYMBOL_PT = 12; // pt half-size for IOF symbols in PDF

  for (const item of specialItems) {
    // Filter by course
    if (item.courseIds && item.courseIds.length > 0 && !item.courseIds.includes(courseId)) {
      continue;
    }

    const colorHex = item.color ?? '#CD59A4';
    const itemColor = hexToRgb(colorHex);
    const pos = toPdf(item.position);

    switch (item.type) {
      case 'text': {
        const fontSizePt = item.fontSize * MM_TO_PT;
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
  if (!match) return rgb(0.804, 0.349, 0.643); // fallback: overprint purple
  return rgb(
    parseInt(match[1]!, 16) / 255,
    parseInt(match[2]!, 16) / 255,
    parseInt(match[3]!, 16) / 255,
  );
}
