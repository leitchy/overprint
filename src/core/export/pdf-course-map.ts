import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { OverprintEvent, Course } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
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
