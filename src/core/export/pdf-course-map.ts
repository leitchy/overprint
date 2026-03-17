import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { OverprintEvent, Course } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
import type { PageLayout } from './pdf-page-layout';
import { computePageLayout, computeCourseBounds, computeMapViewport } from './pdf-page-layout';
import { renderOverprint } from './pdf-overprint-renderer';

export interface PdfExportOptions {
  /** Which course to export. If omitted, exports the first course. */
  courseIndex?: number;
}

/**
 * Generate a course map PDF as a Blob. Does not trigger a save dialog.
 * Call saveBlob() separately from a user gesture handler.
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

  // Compute viewport: what portion of the map fits on the page at correct scale
  const viewport = computeMapViewport(layout, mapScale, printScale, dpi, imgWidth, imgHeight, bounds);

  // Coordinate transform: map pixel → PDF point
  // Map: (0,0) = top-left, Y down. PDF: (0,0) = bottom-left, Y up.
  const toPdf = (point: MapPoint): MapPoint => ({
    x: layout.marginLeft + (point.x - viewport.left) * viewport.effectivePPP,
    y: layout.marginBottom + (viewport.top + viewport.heightPx - point.y) * viewport.effectivePPP,
  });

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Embed base map
  await embedMap(pdfDoc, page, mapImage, toPdf, imgWidth, imgHeight);

  // Draw vector overprint
  renderOverprint(
    { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP },
    course,
    event.controls,
    font,
  );

  // Embed bold font for title
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Draw course title (top of page, centered within printable area)
  drawCourseTitle(page, layout, course.name, boldFont);

  // Draw scale bar (bottom-right of page, within printable area)
  drawScaleBar(page, layout, printScale, font);

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const suggestedName = `${event.name} - ${course.name}.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '');
  return { blob, suggestedName };
}

/**
 * Embed the base map onto the PDF page.
 * Uses the same toPdf coordinate transform as the overprint renderer so
 * the image and vector elements share a single consistent coordinate system.
 */
async function embedMap(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['addPage']>,
  mapImage: HTMLCanvasElement | HTMLImageElement,
  toPdf: (point: MapPoint) => MapPoint,
  imgWidth: number,
  imgHeight: number,
): Promise<void> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Position the map using the same toPdf transform as the overprint.
  // Map pixel (0,0) = top-left, (imgWidth, imgHeight) = bottom-right.
  // pdf-lib drawImage: (x, y) = bottom-left corner of image.
  const topLeft = toPdf({ x: 0, y: 0 });
  const bottomRight = toPdf({ x: imgWidth, y: imgHeight });

  page.drawImage(pngImage, {
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
  page: ReturnType<PDFDocument['addPage']>,
  layout: PageLayout,
  courseName: string,
  boldFont: ReturnType<PDFDocument['embedFont']> extends Promise<infer F> ? F : never,
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
  page: ReturnType<PDFDocument['addPage']>,
  layout: PageLayout,
  printScale: number,
  font: ReturnType<PDFDocument['embedFont']> extends Promise<infer F> ? F : never,
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

  // Draw "Scale 1:X,XXX" text centred under the bar
  const scaleText = `Scale 1:${printScale.toLocaleString('en')}`;
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
