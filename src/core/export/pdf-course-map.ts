import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, clip, endPath } from 'pdf-lib';
import { rectangle as rectOp } from 'pdf-lib';
import type { PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import type { OverprintEvent, Course, CourseControl, Control, EventSettings, PageSetup, SpecialItem } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
import type { CourseId, ControlId } from '@/utils/id';
import type { PageLayout, MapViewport } from './pdf-page-layout';
import { computePageLayout, computeCourseBounds, computeMultiPageViewports, mmToPdfPoints } from './pdf-page-layout';
import { renderOverprint } from './pdf-overprint-renderer';
import { getSymbolSvg, getSymbolName } from '@/core/iof/symbol-db';
import { generateTextDescription } from '@/core/iof/text-descriptions';
import { calculateCourseLength } from '@/core/geometry/course-length';
import { countCourseParts, getPartControls, getPartBounds } from '@/core/models/course-parts';

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

  // For multi-course export, compute a union bounding box so all courses
  // share a consistent map position (prevents the map from shifting between pages).
  // Prefer union of print areas (if set), otherwise union of control bounds.
  let unionBounds: import('@/core/models/types').CourseBounds | null = null;
  let unionPrintArea: import('@/core/models/types').CourseBounds | null = null;
  if (isMultiCourse) {
    for (const ci of indices) {
      const course = event.courses[ci];
      if (!course) continue;
      const b = computeCourseBounds(course, event.controls);
      if (!b) continue;
      if (!unionBounds) {
        unionBounds = { ...b };
      } else {
        unionBounds.minX = Math.min(unionBounds.minX, b.minX);
        unionBounds.minY = Math.min(unionBounds.minY, b.minY);
        unionBounds.maxX = Math.max(unionBounds.maxX, b.maxX);
        unionBounds.maxY = Math.max(unionBounds.maxY, b.maxY);
      }
      // Union of per-course print areas
      const pa = course.settings.printArea;
      if (pa) {
        if (!unionPrintArea) {
          unionPrintArea = { ...pa };
        } else {
          unionPrintArea.minX = Math.min(unionPrintArea.minX, pa.minX);
          unionPrintArea.minY = Math.min(unionPrintArea.minY, pa.minY);
          unionPrintArea.maxX = Math.max(unionPrintArea.maxX, pa.maxX);
          unionPrintArea.maxY = Math.max(unionPrintArea.maxY, pa.maxY);
        }
      }
    }
  }

  // --- All Controls page (multi-course export only) ---
  if (isMultiCourse) {
    // Build a synthetic "All Controls" score course (no legs) with every control
    const allControlIds = Object.keys(event.controls) as ControlId[];
    const allControlsCCs: CourseControl[] = allControlIds.map((id) => ({
      controlId: id,
      type: 'control' as const,
    }));
    // Sort by control code for consistent ordering
    allControlsCCs.sort((a, b) => {
      const ca = event.controls[a.controlId];
      const cb = event.controls[b.controlId];
      return (ca?.code ?? 0) - (cb?.code ?? 0);
    });

    const allControlsCourse: Course = {
      id: 'all-controls' as CourseId,
      name: event.name,
      courseType: 'score',
      controls: allControlsCCs,
      settings: {
        labelMode: 'code',
        descriptionAppearance: event.courses[0]?.settings.descriptionAppearance,
      },
    };

    const allBounds = unionBounds ?? computeCourseBounds(allControlsCourse, event.controls);
    if (allBounds) {
      const printScale = event.settings.printScale;
      const pageSetup = mergePageSetup(event.settings.pageSetup, event.courses[0]?.settings.pageSetup);
      const layout = computePageLayout(pageSetup);
      const printAreaOverride = unionPrintArea;
      const multiPage = computeMultiPageViewports(
        layout, mapScale, printScale, dpi, imgWidth, imgHeight, allBounds,
        30, 15, printAreaOverride ?? undefined,
      );

      for (let pageIndex = 0; pageIndex < multiPage.viewports.length; pageIndex++) {
        const viewport = multiPage.viewports[pageIndex]!;
        const toPdf = viewportToPdf(layout, viewport);
        const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

        if (embeddedPdfPage) {
          drawEmbeddedPdfPage(page, embeddedPdfPage, layout, toPdf, imgWidth, imgHeight);
        } else if (embeddedMap) {
          drawEmbeddedMap(page, embeddedMap.image, toPdf, imgWidth, imgHeight);
        }

        // Render all controls as circles with codes (score course = no legs)
        renderOverprint(
          { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP },
          allControlsCourse,
          event.controls,
          font,
        );

        // Auto description box for All Controls
        await renderAutoDescriptionBox(page, pdfDoc, allControlsCourse, event.controls, event.settings, layout, font);

        // Page label
        const label = multiPage.viewports.length > 1
          ? `All controls (${pageIndex + 1}/${multiPage.viewports.length})`
          : 'All controls';
        page.drawText(label, {
          x: layout.marginLeft + 4,
          y: layout.pageHeight - layout.marginTop - 12,
          size: 8, font, color: rgb(0.4, 0.4, 0.4),
        });
      }
    }
  }

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

    // Compute viewport — for multi-course, use union bounds/print area
    // so every page shares the same map position.
    const printAreaOverride = isMultiCourse ? unionPrintArea : course.settings.printArea;
    const effectiveBounds = unionBounds ?? bounds;
    const multiPage = computeMultiPageViewports(
      layout, mapScale, printScale, dpi, imgWidth, imgHeight, effectiveBounds,
      30, 15, printAreaOverride ?? undefined,
    );

    // Multi-part courses: one page per part. Single-part: one page for the whole course.
    const totalParts = countCourseParts(course.controls);
    const partIterations = totalParts > 1
      ? Array.from({ length: totalParts }, (_, i) => i)
      : [null]; // null = single-part (no filtering)

    for (const partIdx of partIterations) {
      // Build the course to render (full course or filtered to this part)
      let renderCourse: Course;
      let sequenceOffset = 0;
      let partLabel: string | undefined;

      if (partIdx !== null) {
        const partControls = getPartControls(course, partIdx);
        renderCourse = { ...course, controls: partControls };
        sequenceOffset = getPartBounds(course.controls, partIdx).start;
        partLabel = `(P${partIdx + 1}/${totalParts})`;
      } else {
        renderCourse = course;
      }

      // For each viewport page (usually 1 unless course is too large for the page)
      const coursePageCount = multiPage.viewports.length;
      for (let pageIndex = 0; pageIndex < coursePageCount; pageIndex++) {
        const viewport = multiPage.viewports[pageIndex]!;
        const toPdf = viewportToPdf(layout, viewport);

        const page = pdfDoc.addPage([layout.pageWidth, layout.pageHeight]);

        // Draw base map
        if (embeddedPdfPage) {
          drawEmbeddedPdfPage(page, embeddedPdfPage, layout, toPdf, imgWidth, imgHeight);
        } else if (embeddedMap) {
          drawEmbeddedMap(page, embeddedMap.image, toPdf, imgWidth, imgHeight);
        }

        // Draw vector overprint (filtered to part if multi-part)
        renderOverprint(
          { page, settings: event.settings, toPdf, effectivePPP: viewport.effectivePPP, sequenceOffset },
          renderCourse,
          event.controls,
          font,
        );

        // Auto-generate description box (rendered before special items so
        // images/logos from .ppen draw on top of the white background)
        await renderAutoDescriptionBox(page, pdfDoc, renderCourse, event.controls, event.settings, layout, font, partLabel);

        // Draw special items (description boxes filtered out — auto-gen handles them)
        await renderSpecialItems(page, pdfDoc, event.specialItems, course.id, renderCourse, event.controls, event.settings, toPdf, font, viewport.effectivePPP);

        // Page label
        const totalPages = coursePageCount * partIterations.length;
        if (isMultiCourse || totalPages > 1) {
          let pageLabel: string;
          if (partIdx !== null) {
            pageLabel = coursePageCount > 1
              ? `${course.name}-${partIdx + 1} (${pageIndex + 1}/${coursePageCount})`
              : `${course.name}-${partIdx + 1}`;
          } else {
            pageLabel = coursePageCount > 1
              ? `${course.name} (${pageIndex + 1}/${coursePageCount})`
              : course.name;
          }
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
  _course: Course,
  _controls: Record<ControlId, Control>,
  _eventSettings: EventSettings,
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

    // Skip ALL description boxes in special items — auto-generation handles them.
    // Imported .ppen description boxes lack part-awareness and would duplicate
    // the auto-generated ones.
    if (item.type === 'descriptionBox') {
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

      // descriptionBox items are filtered out above — auto-generation handles them

      case 'image': {
        const endPos = toPdf(item.endPosition);
        const imgX = Math.min(pos.x, endPos.x);
        const imgY = Math.min(pos.y, endPos.y);
        const imgW = Math.abs(endPos.x - pos.x);
        const imgH = Math.abs(endPos.y - pos.y);

        try {
          // Extract base64 data from data URL
          const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(item.imageDataUrl);
          if (match) {
            const format = match[1]!.toLowerCase();
            const base64 = match[2]!;
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const embedded = format === 'png'
              ? await pdfDoc.embedPng(bytes)
              : await pdfDoc.embedJpg(bytes);
            page.drawImage(embedded, { x: imgX, y: imgY, width: imgW, height: imgH });
          }
        } catch (e) {
          console.warn('Failed to embed image special item:', e);
        }
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
/** PurplePen uses 6mm cells for printed descriptions (not 7mm IOF spec) */
const DESC_CELL_SIZE_MM = 6;

const DESC_BORDER_WIDTH = 0.5;
const DESC_TEXT_FONT_SIZE = 8;
const DESC_HEADER_FONT_SIZE = 9;
const DESC_BORDER_COLOR = rgb(0, 0, 0);
const DESC_TEXT_COLOR = rgb(0, 0, 0);

// Old renderDescriptionBoxToPdf + DescBoxBounds deleted — see git history.
// Replaced by renderAutoDescriptionBox below.

// Auto-generated description box (rendered when no user-placed box exists)
// ---------------------------------------------------------------------------

const DESC_COL_GAP_MM = 2.5;
const DESC_BLEED_MM = 1.5;
const DESC_OUTER_BORDER_WIDTH = 1.0;
const DESC_TOP_OFFSET_MM = 15; // offset from top margin to avoid logos/titles
const DESC_RIGHT_OFFSET_MM = 5; // offset from right margin
const DESC_TEXT_COL_MULTIPLIER = 4.5; // text column is 4.5× wider than symbol columns

/**
 * Auto-generate and render a description box in the top-right corner of the page.
 * Splits into multiple columns if the description is taller than the page.
 * Header shows course name with optional part indicator.
 */
async function renderAutoDescriptionBox(
  page: PDFPage,
  pdfDoc: PDFDocument,
  course: Course,
  controls: Record<ControlId, Control>,
  eventSettings: EventSettings,
  layout: PageLayout,
  font: PDFFont,
  partLabel?: string, // e.g., "(P1/2)"
): Promise<void> {
  const lang = eventSettings.language ?? 'en';
  const appearance = course.settings.descriptionAppearance ?? 'symbols';
  const hasTextCol = appearance === 'symbolsAndText';
  const numCols = hasTextCol ? 9 : 8;

  const gapPt = mmToPdfPoints(DESC_COL_GAP_MM);
  const bleedPt = mmToPdfPoints(DESC_BLEED_MM);
  const topOffsetPt = mmToPdfPoints(DESC_TOP_OFFSET_MM);
  const rightOffsetPt = mmToPdfPoints(DESC_RIGHT_OFFSET_MM);

  const headerRows = 2; // course name + length/climb
  const controlCount = course.controls.length;

  // Effective column width multiplier (8 symbol cols + optional text col)
  const colWidthInCells = hasTextCol ? 8 + DESC_TEXT_COL_MULTIPLIER : 8;

  // Target: description block should use at most 50% of the page width
  // and at most 55% of the page height. Dynamically size cells to fit.
  const maxBlockWidth = layout.printableWidth * 0.5;
  const maxBlockHeight = (layout.printableHeight - topOffsetPt) * 0.55;

  // Find the number of columns that gives the largest cell size while fitting.
  // More columns = fewer rows = larger cells (up to the max of 6mm).
  let numDescCols = 1;
  let bestCellPt = 0;
  for (let n = 1; n <= 6; n++) {
    const ctrlPerCol = Math.ceil(controlCount / n);
    const tallest = headerRows + ctrlPerCol;
    const cellH = maxBlockHeight / tallest;
    const cellW = (maxBlockWidth - gapPt * (n - 1)) / (colWidthInCells * n);
    const cell = Math.min(cellH, cellW, mmToPdfPoints(DESC_CELL_SIZE_MM));
    if (cell >= mmToPdfPoints(3.5) && cell > bestCellPt) {
      bestCellPt = cell;
      numDescCols = n;
    }
  }

  // Compute cell size to fit the block within max dimensions.
  // The tallest column has header rows + its share of controls.
  const controlsPerCol = Math.ceil(controlCount / numDescCols);
  const tallestColRows = headerRows + controlsPerCol; // first column is tallest (has header)
  const cellFromHeight = maxBlockHeight / tallestColRows;
  const totalGridsWidth = maxBlockWidth - gapPt * (numDescCols - 1);
  const cellFromWidth = totalGridsWidth / (colWidthInCells * numDescCols);
  const cellPt = Math.min(cellFromHeight, cellFromWidth, mmToPdfPoints(DESC_CELL_SIZE_MM));

  const textColWidthPt = hasTextCol ? cellPt * DESC_TEXT_COL_MULTIPLIER : 0;
  const gridWidth = cellPt * 8 + textColWidthPt;

  // Split controls across columns evenly
  const columnSlices: { startIdx: number; endIdx: number; showHeader: boolean }[] = [];
  let remaining = controlCount;
  let offset = 0;

  for (let c = 0; c < numDescCols; c++) {
    // Distribute evenly: ceil division for remaining controls across remaining columns
    const colCount = Math.min(remaining, Math.ceil(remaining / (numDescCols - c)));
    columnSlices.push({ startIdx: offset, endIdx: offset + colCount, showHeader: c === 0 });
    remaining -= colCount;
    offset += colCount;
  }

  const totalBlockWidth = numDescCols * gridWidth + (numDescCols - 1) * gapPt;

  // Position: top-right corner of printable area
  const blockRight = layout.pageWidth - layout.marginRight - rightOffsetPt;
  const blockLeft = blockRight - totalBlockWidth;
  const blockTopY = layout.pageHeight - layout.marginTop - topOffsetPt;

  // Embed symbols cache (shared across all columns)
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

  // Helper: draw a single row of cells at the given position
  async function drawControlRow(
    gridX: number,
    rowY: number,
    cc: import('@/core/models/types').CourseControl,
    seqNumber: number | null,
  ): Promise<void> {
    const ctrl: Control | undefined = controls[cc.controlId as ControlId];
    if (!ctrl) return;

    const isStart = cc.type === 'start';
    const isFinish = cc.type === 'finish';

    const colA: string | null = (isStart || isFinish || seqNumber === null) ? null : String(seqNumber);
    const colB: string | null = (isStart || isFinish) ? null : String(ctrl.code);

    const desc = ctrl.description;
    const symOrText = (v: string | undefined): string | null => {
      if (!v) return null;
      if (appearance === 'text') return getSymbolName(v, lang);
      return getSymbolSvg(v) ? `sym:${v}` : getSymbolName(v, lang);
    };

    const cells: Array<string | null> = [
      colA, colB,
      symOrText(desc.columnC), symOrText(desc.columnD),
      symOrText(desc.columnE), symOrText(desc.columnF),
      symOrText(desc.columnG), symOrText(desc.columnH),
    ];
    if (appearance === 'symbolsAndText') {
      cells.push(generateTextDescription(desc, lang));
    }

    for (let col = 0; col < numCols; col++) {
      const isTextCol = hasTextCol && col === 8;
      const colWidth = isTextCol ? textColWidthPt : cellPt;
      // First 8 cols at cellPt each, 9th (text) starts after them
      const correctCellX = col < 8 ? gridX + col * cellPt : gridX + 8 * cellPt;
      page.drawRectangle({
        x: correctCellX, y: rowY, width: colWidth, height: cellPt,
        borderColor: DESC_BORDER_COLOR, borderWidth: DESC_BORDER_WIDTH,
      });

      const cell = cells[col];
      if (!cell) continue;

      if (cell.startsWith('sym:')) {
        const pdfImage = await embedSymbol(cell.slice(4));
        if (pdfImage) {
          const padding = cellPt * 0.08;
          page.drawImage(pdfImage, {
            x: correctCellX + padding, y: rowY + padding,
            width: cellPt - padding * 2, height: cellPt - padding * 2,
          });
        }
      } else {
        const fontSize = isTextCol ? DESC_TEXT_FONT_SIZE * 0.75 : DESC_TEXT_FONT_SIZE;
        let displayText = cell;
        const maxTextWidth = colWidth - colWidth * 0.1;
        while (font.widthOfTextAtSize(displayText, fontSize) > maxTextWidth && displayText.length > 1) {
          displayText = displayText.slice(0, -1);
        }
        if (isTextCol) {
          page.drawText(displayText, {
            x: correctCellX + cellPt * 0.08, y: rowY + (cellPt - fontSize) / 2,
            size: fontSize, font, color: DESC_TEXT_COLOR,
          });
        } else {
          const textWidth = font.widthOfTextAtSize(displayText, fontSize);
          page.drawText(displayText, {
            x: correctCellX + (colWidth - textWidth) / 2, y: rowY + (cellPt - fontSize) / 2,
            size: fontSize, font, color: DESC_TEXT_COLOR,
          });
        }
      }
    }
  }

  // Helper: draw a header row spanning all columns
  function drawHeader(gridX: number, rowY: number, text: string, fontSize: number): void {
    page.drawRectangle({
      x: gridX, y: rowY, width: gridWidth, height: cellPt,
      borderColor: DESC_BORDER_COLOR, borderWidth: DESC_BORDER_WIDTH,
    });
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: gridX + (gridWidth - textWidth) / 2, y: rowY + (cellPt - fontSize) / 2,
      size: fontSize, font, color: DESC_TEXT_COLOR,
    });
  }

  // Compute info text
  const dpi = 96;
  const scale = eventSettings.printScale;
  const lengthM = calculateCourseLength(course.controls, controls, scale, dpi);
  const climbValue = course.climb ?? course.settings.climb;
  const climbText = climbValue !== undefined ? `  ${climbValue} m` : '';
  const infoText = `${Math.round(lengthM)} m${climbText}`;

  const headerText = partLabel ? `${course.name} ${partLabel}` : course.name;

  // Track sequence numbering across columns
  let seqNumber = 0;

  for (let colIdx = 0; colIdx < numDescCols; colIdx++) {
    const slice = columnSlices[colIdx]!;
    const colX = blockLeft + colIdx * (gridWidth + gapPt);
    const colRows = slice.showHeader
      ? headerRows + (slice.endIdx - slice.startIdx)
      : (slice.endIdx - slice.startIdx);
    const colHeight = colRows * cellPt;

    // White background with bleed
    page.drawRectangle({
      x: colX - bleedPt, y: blockTopY - colHeight - bleedPt,
      width: gridWidth + bleedPt * 2, height: colHeight + bleedPt * 2,
      color: rgb(1, 1, 1),
    });

    // Outer border
    page.drawRectangle({
      x: colX, y: blockTopY - colHeight,
      width: gridWidth, height: colHeight,
      borderColor: DESC_BORDER_COLOR, borderWidth: DESC_OUTER_BORDER_WIDTH,
    });

    let rowY = blockTopY; // start from top, grow downward

    // Header rows (first column only)
    if (slice.showHeader) {
      rowY -= cellPt;
      drawHeader(colX, rowY, headerText, DESC_HEADER_FONT_SIZE);
      rowY -= cellPt;
      drawHeader(colX, rowY, infoText, DESC_HEADER_FONT_SIZE);
    }

    // Control rows
    for (let i = slice.startIdx; i < slice.endIdx; i++) {
      const cc = course.controls[i]!;
      const isStart = cc.type === 'start';
      const isFinish = cc.type === 'finish';

      let seq: number | null = null;
      if (!isStart && !isFinish) {
        seqNumber++;
        seq = seqNumber;
      }

      rowY -= cellPt;
      await drawControlRow(colX, rowY, cc, seq);
    }
  }
}
