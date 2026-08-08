import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, clip, clipEvenOdd, endPath } from 'pdf-lib';
import { rectangle as rectOp } from 'pdf-lib';
import type { PDFFont, PDFPage, PDFEmbeddedPage } from 'pdf-lib';
import type { OverprintEvent, Course, CourseControl, Control, EventSettings, PageSetup, SpecialItem } from '@/core/models/types';
import type { MapPoint } from '@/core/models/types';
import type { CourseId, ControlId } from '@/utils/id';
import type { PageLayout, MapViewport } from './pdf-page-layout';
import { computePageLayout, computeCourseBounds, computeMultiPageViewports, mmToPdfPoints } from './pdf-page-layout';
import { renderOverprint, PURPLE } from './pdf-overprint-renderer';
import { getSymbolSvg, getSymbolName } from '@/core/iof/symbol-db';
import { generateTextDescription } from '@/core/iof/text-descriptions';
import { buildDescRows, type DescRow } from '@/core/descriptions/desc-rows';
import { crossHatchSegments } from '@/core/geometry/hatch';
import { eventOverprintSizeMultiplier } from '@/core/geometry/overprint-dimensions';
import { countCourseParts, getPartControls, getPartBounds } from '@/core/models/course-parts';
import { maxRasterLongSide, printRasterLongSide } from '@/core/files/raster-config';
import { rasterizeSvgToImage } from '@/core/files/rasterize-svg';
import { OVERPRINT_PURPLE, IOF_SPECIAL_SYMBOL_MM, IOF_SPECIAL_SYMBOL_LINE_MM, MARKED_ROUTE_DASH_MM, MARKED_ROUTE_GAP_MM, OOB_HATCH_WIDTH_MM, OOB_HATCH_SPACING_MM } from '@/core/models/constants';

export interface PdfExportOptions {
  /** Which course to export. If omitted, exports the first course. */
  courseIndex?: number;
  /** Export multiple courses into one PDF. Overrides courseIndex when set. */
  courseIndices?: number[];
}

/**
 * The base map, described in a way the exporter can render at print resolution.
 *
 * `mapImage` is the screen-density display bitmap. For vector maps (OCAD/OMAP)
 * `svg` carries the sized-less source so the exporter can re-rasterise at print
 * DPI instead of embedding the (lower-resolution) display bitmap — this is the
 * detail-preserving path (D5). `width`/`height` are the *logical* map dimensions
 * (control-coordinate space), which may differ from the current display bitmap's
 * pixel size when an adaptive zoom raster is active.
 */
export interface MapSource {
  /** Sized-less SVG (viewBox only) for OCAD/OMAP; null for raster/PDF maps. */
  svg?: string | null;
  /** Logical map width in pixels (control-coordinate space). */
  width: number;
  /** Logical map height in pixels (control-coordinate space). */
  height: number;
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
  mapSource?: MapSource,
): Promise<{ blob: Blob; suggestedName: string }> {
  if (!event.mapFile) throw new Error('No map file loaded');

  // Determine which courses to export
  const indices = options.courseIndices ?? [options.courseIndex ?? 0];
  const isMultiCourse = indices.length > 1;

  const { dpi, scale: mapScale } = event.mapFile;

  // Logical map dimensions (control-coordinate space). Prefer the caller-supplied
  // logical size — the display bitmap's pixel size can diverge from it when an
  // adaptive zoom raster is active. Fall back to the bitmap size for back-compat.
  const imgWidth = mapSource?.width ?? (mapImage instanceof HTMLCanvasElement ? mapImage.width : mapImage.naturalWidth);
  const imgHeight = mapSource?.height ?? (mapImage instanceof HTMLCanvasElement ? mapImage.height : mapImage.naturalHeight);

  // Smallest print scale across the exported courses drives the print-DPI target
  // (a course printed most-enlarged needs the densest raster).
  const exportedPrintScales = indices
    .map((ci) => event.courses[ci]?.settings.printScale ?? event.settings.printScale)
    .filter((s): s is number => typeof s === 'number' && s > 0);
  const minPrintScale = exportedPrintScales.length > 0
    ? Math.min(...exportedPrintScales)
    : event.settings.printScale;

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Embed the base map once — pdf-lib reuses across all pages.
  // Priority: PDF-source → embed original PDF page (vectors); OCAD/OMAP → embed
  // the retained SVG as true vectors (D5); anything else / on failure → PNG raster.
  const isPdfSource = event.mapFile.type === 'pdf' && pdfArrayBuffer;
  let embeddedMap: EmbeddedMapImage | null = null;
  let embeddedPdfPage: PDFEmbeddedPage | null = null;
  // True colour-order (D2): a second scratch page holding ONLY the map's
  // upper-ink linework (100% black/brown/blue, tagged data-ink="upper" by the
  // loaders), redrawn between the lower and upper purple layers. Null when the
  // map has no tagged inks or the vector embed failed — those cases keep the
  // interim single-layer Multiply behaviour.
  let embeddedUpperInkPage: PDFEmbeddedPage | null = null;

  if (isPdfSource) {
    const pages = await pdfDoc.embedPdf(pdfArrayBuffer!);
    embeddedPdfPage = pages[0] ?? null;
  }
  // OCAD/OMAP vector base map: render the retained SVG into a scratch PDF and
  // embed it. The scratch page shares the map's aspect ratio, so drawEmbeddedPdfPage
  // stretches it onto the map rect exactly like the PDF-source path. Falls back to
  // raster on any validation/render failure so export never breaks.
  if (!embeddedPdfPage && mapSource?.svg) {
    try {
      const { validateSvgForVector, renderSvgToScratchPdf } = await import('./svg-to-pdf');
      if (validateSvgForVector(mapSource.svg).ok) {
        const scratch = await renderSvgToScratchPdf(mapSource.svg);
        const scratchBytes = await scratch.save();
        const pages = await pdfDoc.embedPdf(scratchBytes);
        embeddedPdfPage = pages[0] ?? null;

        // Upper-ink pass — only worth rendering when the loader tagged
        // something. Failure here just degrades to single-layer behaviour.
        if (embeddedPdfPage && mapSource.svg.includes('data-ink="upper"')) {
          const upperScratch = await renderSvgToScratchPdf(mapSource.svg, { inkFilter: 'upper' });
          const upperPages = await pdfDoc.embedPdf(await upperScratch.save());
          embeddedUpperInkPage = upperPages[0] ?? null;
        }
      }
    } catch (err) {
      console.warn('Vector map embed failed; using raster fallback:', err);
      embeddedPdfPage = null;
      embeddedUpperInkPage = null;
    }
  }
  if (!embeddedPdfPage) {
    embeddedMap = await prepareMapImage(pdfDoc, mapImage, imgWidth, imgHeight, {
      svg: mapSource?.svg ?? null,
      nativeDpi: dpi,
      mapScale,
      printScale: minPrintScale,
    });
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

  // Compute desc box Y from imported All Controls desc box (used for all pages)
  let descBoxTopY: number | undefined;

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

        // White-out masks — below the overprint
        drawWhiteOuts(page, event.specialItems, 'all-controls' as CourseId, toPdf);

        // Render all controls as circles with codes (score course = no legs)
        drawOverprintPasses(
          {
            page,
            settings: event.settings,
            toPdf,
            effectivePPP: viewport.effectivePPP,
            sizeMultiplier: eventOverprintSizeMultiplier(event.settings, mapScale, printScale),
          },
          allControlsCourse,
          event.controls,
          font,
          embeddedUpperInkPage,
          { layout, imgWidth, imgHeight, specialItems: event.specialItems, courseId: 'all-controls' as CourseId },
        );

        // Auto-generate All Controls description box.
        // Use imported column count and position if available.
        const allControlsDescBox = event.specialItems.find(
          (si) => si.type === 'descriptionBox' && si.allControls,
        );
        const importedCols = (allControlsDescBox?.type === 'descriptionBox' && allControlsDescBox.columns) || undefined;
        // Use only the Y from imported position (for vertical alignment below logo).
        // X is auto-computed (right-aligned). Pass as overrideTopY.
        const importedTopY = allControlsDescBox ? toPdf(allControlsDescBox.position).y : undefined;
        descBoxTopY = importedTopY; // share with course pages
        await renderAutoDescriptionBox(
          page, pdfDoc, allControlsCourse, event.controls, event.settings, layout, font,
          event.name, undefined, undefined, importedCols, undefined, descBoxTopY, true,
        );

        // Render other special items (text, images, etc.) — desc boxes are filtered out
        await renderSpecialItems(page, pdfDoc, event.specialItems, 'all-controls' as CourseId, allControlsCourse, event.controls, event.settings, layout, toPdf, font, viewport.effectivePPP);

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

        // White-out masks — below the overprint
        drawWhiteOuts(page, event.specialItems, course.id, toPdf);

        // Draw vector overprint (filtered to part if multi-part)
        drawOverprintPasses(
          {
            page,
            settings: event.settings,
            toPdf,
            effectivePPP: viewport.effectivePPP,
            sequenceOffset,
            sizeMultiplier: eventOverprintSizeMultiplier(event.settings, mapScale, printScale),
          },
          renderCourse,
          event.controls,
          font,
          embeddedUpperInkPage,
          { layout, imgWidth, imgHeight, specialItems: event.specialItems, courseId: course.id },
        );

        // Auto-generate description box (rendered before special items so
        // images/logos from .ppen draw on top of the white background)
        await renderAutoDescriptionBox(page, pdfDoc, renderCourse, event.controls, event.settings, layout, font, event.name, partLabel, undefined, undefined, undefined, descBoxTopY);

        // Draw special items (description boxes filtered out — auto-gen handles them)
        await renderSpecialItems(page, pdfDoc, event.specialItems, course.id, renderCourse, event.controls, event.settings, layout, toPdf, font, viewport.effectivePPP);

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
}

/** Print-resolution options for {@link prepareMapImage}. */
interface PrintRasterOptions {
  /** Sized-less SVG (viewBox only) for a vector map, or null for raster/PDF. */
  svg: string | null;
  /** Effective dpi of the map at its own `mapScale`. */
  nativeDpi: number;
  /** Map scale denominator. */
  mapScale: number;
  /** Smallest print-scale denominator being exported. */
  printScale: number;
}

/**
 * Prepare the map image for embedding and embed it into the PDF document.
 *
 * For vector maps (OCAD/OMAP), `opts.svg` is re-rasterised at the print-DPI
 * target long side (capped per device) rather than reusing the screen-density
 * display bitmap — this preserves detail in print (D5). For raster/PDF-fallback
 * maps the display bitmap is used, downscaled only if it exceeds the device cap.
 * Returns null if the canvas context is unavailable.
 */
async function prepareMapImage(
  pdfDoc: PDFDocument,
  mapImage: HTMLCanvasElement | HTMLImageElement,
  imgWidth: number,
  imgHeight: number,
  opts?: PrintRasterOptions,
): Promise<EmbeddedMapImage | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const maxDim = maxRasterLongSide();

  // Decide the embedded bitmap's pixel dimensions (embedW × embedH) and the
  // source to draw from. The source is always scaled to fill the canvas, so its
  // own natural size is irrelevant — this keeps a zoomed adaptive display bitmap
  // (natural size ≠ logical size) from being clipped.
  let source: HTMLCanvasElement | HTMLImageElement = mapImage;
  let embedW: number;
  let embedH: number;

  if (opts?.svg) {
    // Vector source: re-rasterise the SVG at the print-DPI target long side so the
    // embedded bitmap has real detail, not upscaled screen pixels.
    const longSide = Math.max(imgWidth, imgHeight);
    const embedLong = printRasterLongSide(longSide, opts.nativeDpi, opts.mapScale, opts.printScale, maxDim);
    const up = longSide > 0 ? embedLong / longSide : 1;
    embedW = Math.round(imgWidth * up);
    embedH = Math.round(imgHeight * up);
    source = await rasterizeSvgToImage(opts.svg, embedW, embedH, 'blob');
  } else {
    // Raster / PDF-fallback: use the display bitmap, downscaled only if it
    // exceeds the device-safe long side (desktop 8192, less on iOS / low-memory).
    const natW = mapImage instanceof HTMLCanvasElement ? mapImage.width : mapImage.naturalWidth;
    const natH = mapImage instanceof HTMLCanvasElement ? mapImage.height : mapImage.naturalHeight;
    const scaleDown = Math.min(1, maxDim / Math.max(natW, natH));
    embedW = Math.max(1, Math.round(natW * scaleDown));
    embedH = Math.max(1, Math.round(natH * scaleDown));
  }

  canvas.width = embedW;
  canvas.height = embedH;
  ctx.drawImage(source, 0, 0, embedW, embedH);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png');
  });

  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const image = await pdfDoc.embedPng(pngBytes);
  return { image };
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

/** Axis-aligned rectangle in PDF points (bottom-left origin). */
interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draw an embedded PDF page (vector-preserving) onto the output page.
 * Uses a clip rectangle to keep the map within the printable area.
 * Positioning math is identical to drawEmbeddedMap.
 *
 * `holes` (optional) punches rectangles OUT of the clip region via an
 * even-odd clip path — used by the upper-ink colour-order pass so redrawn map
 * linework never reappears over white-out masks. Caveat: two OVERLAPPING
 * holes re-include their intersection under even-odd; overlapping white-outs
 * are rare enough that we accept that edge case.
 */
function drawEmbeddedPdfPage(
  page: PDFPage,
  embeddedPage: PDFEmbeddedPage,
  layout: PageLayout,
  toPdf: (point: MapPoint) => MapPoint,
  imgWidth: number,
  imgHeight: number,
  holes?: PdfRect[],
): void {
  const topLeft = toPdf({ x: 0, y: 0 });
  const bottomRight = toPdf({ x: imgWidth, y: imgHeight });

  // Clip to printable area — the full PDF page may extend beyond the viewport
  const clipOps = [
    pushGraphicsState(),
    rectOp(layout.marginLeft, layout.marginBottom, layout.printableWidth, layout.printableHeight),
  ];
  if (holes && holes.length > 0) {
    for (const h of holes) clipOps.push(rectOp(h.x, h.y, h.width, h.height));
    clipOps.push(clipEvenOdd());
  } else {
    clipOps.push(clip());
  }
  clipOps.push(endPath());
  page.pushOperators(...clipOps);

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
/** PDF-point rectangles of the white-out masks that apply to a course. */
function whiteOutRects(
  specialItems: SpecialItem[],
  courseId: CourseId,
  toPdf: (point: MapPoint) => MapPoint,
): Array<PdfRect & { color: string }> {
  const rects: Array<PdfRect & { color: string }> = [];
  for (const item of specialItems) {
    if (item.type !== 'whiteOut') continue;
    if (item.courseIds && item.courseIds.length > 0 && !item.courseIds.includes(courseId)) continue;
    const p0 = toPdf(item.position);
    const p1 = toPdf(item.endPosition);
    rects.push({
      x: Math.min(p0.x, p1.x),
      y: Math.min(p0.y, p1.y),
      width: Math.abs(p1.x - p0.x),
      height: Math.abs(p1.y - p0.y),
      color: item.color ?? '#FFFFFF',
    });
  }
  return rects;
}

/**
 * Draw white-out masks as opaque rectangles. Called AFTER the base map and
 * BEFORE the overprint so masks hide map detail but not course symbols.
 */
function drawWhiteOuts(
  page: PDFPage,
  specialItems: SpecialItem[],
  courseId: CourseId,
  toPdf: (point: MapPoint) => MapPoint,
): void {
  for (const r of whiteOutRects(specialItems, courseId, toPdf)) {
    page.drawRectangle({
      x: r.x, y: r.y, width: r.width, height: r.height,
      color: hexToRgb(r.color),
    });
  }
}

/**
 * Render the course overprint, honouring IOF colour order when possible (D2).
 *
 * With an upper-ink page available (vector OCAD/OMAP path with tagged inks),
 * this performs the true colour-order passes 2–4 of the printed stack —
 * pass 1 (full base map) and the white-outs were already drawn by the caller:
 *
 *   2. LOWER purple course symbols (701/703/705/706/710.1/715, ISOM 704),
 *   3. the map's black/brown/blue-100% linework REDRAWN above the purple,
 *      clipped to exclude the white-out rectangles so masks stay effective,
 *   4. UPPER purple symbols (sprint 704 numbers).
 *
 * On this path the purple is a solid spot overprint (OP, no Multiply): the
 * map detail genuinely sits on top, so a blend would double-compensate.
 *
 * Without an upper-ink page (raster fallback, PDF-source maps, untagged
 * SVGs), the legacy single pass with the optional Multiply interim is kept.
 */
function drawOverprintPasses(
  ctx: {
    page: PDFPage;
    settings: EventSettings;
    toPdf: (point: MapPoint) => MapPoint;
    effectivePPP: number;
    sequenceOffset?: number;
    sizeMultiplier?: number;
  },
  course: Course,
  controls: Record<ControlId, Control>,
  font: PDFFont,
  upperInkPage: PDFEmbeddedPage | null,
  opts: {
    layout: PageLayout;
    imgWidth: number;
    imgHeight: number;
    specialItems: SpecialItem[];
    courseId: CourseId;
  },
): void {
  if (!upperInkPage) {
    renderOverprint(ctx, course, controls, font);
    return;
  }

  renderOverprint({ ...ctx, layer: 'lower', solidOverprint: true }, course, controls, font);

  const holes = whiteOutRects(opts.specialItems, opts.courseId, ctx.toPdf);
  drawEmbeddedPdfPage(
    ctx.page, upperInkPage, opts.layout, ctx.toPdf, opts.imgWidth, opts.imgHeight, holes,
  );

  renderOverprint({ ...ctx, layer: 'upper', solidOverprint: true }, course, controls, font);
}

async function renderSpecialItems(
  page: PDFPage,
  pdfDoc: PDFDocument,
  specialItems: SpecialItem[],
  courseId: CourseId,
  _course: Course,
  _controls: Record<ControlId, Control>,
  _eventSettings: EventSettings,
  _layout: PageLayout,
  toPdf: (point: MapPoint) => MapPoint,
  font: PDFFont,
  effectivePPP: number,
): Promise<void> {
  // Scale-aware: symbols are a fixed physical size (mm) on the printed page.
  const IOF_SYMBOL_PT = mmToPdfPoints(IOF_SPECIAL_SYMBOL_MM) / 2; // half-size in pt
  const symLine = mmToPdfPoints(IOF_SPECIAL_SYMBOL_LINE_MM); // stroke width in pt

  for (const item of specialItems) {
    // Filter by course
    if (item.courseIds && item.courseIds.length > 0 && !item.courseIds.includes(courseId)) {
      continue;
    }

    // Skip description boxes on individual course pages — auto-generation handles them.
    // Allow allControls description boxes through only on the All Controls page.
    if (item.type === 'descriptionBox') {
      continue; // All desc boxes skipped — auto-generation handles them
    }

    // White-outs are drawn below the overprint by drawWhiteOuts(), not here.
    if (item.type === 'whiteOut') continue;

    // Colour resolution:
    // - An explicit user colour is honoured (spot DeviceCMYK purple when it IS
    //   the overprint purple, otherwise sRGB).
    // - With NO colour set, text and rectangles (titles, notes, map borders)
    //   default to BLACK — matching PurplePen; only IOF course-symbol specials
    //   (OOB, dangerous, water, first aid, forbidden route, map issue) and
    //   course lines default to the overprint purple.
    const annotationDefaultsBlack = item.type === 'text' || item.type === 'rectangle';
    const itemColor = !item.color
      ? (annotationDefaultsBlack ? rgb(0, 0, 0) : PURPLE)
      : item.color === OVERPRINT_PURPLE ? PURPLE : hexToRgb(item.color);
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
        // Marked-route lines dash at a fixed physical size (mm → pt).
        const dashArray = item.lineStyle === 'dashed'
          ? [mmToPdfPoints(MARKED_ROUTE_DASH_MM), mmToPdfPoints(MARKED_ROUTE_GAP_MM)]
          : undefined;
        page.drawLine({
          start: { x: pos.x, y: pos.y },
          end: { x: endPos.x, y: endPos.y },
          thickness: lineThickness,
          color: itemColor,
          dashArray,
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

      case 'outOfBoundsArea':
      case 'dangerousArea': {
        // Cross-hatch (45°+135°) fill, no boundary — vertices are relative to position.
        const poly = item.vertices.map((v) =>
          toPdf({ x: item.position.x + v.x, y: item.position.y + v.y }),
        );
        const spacingPt = mmToPdfPoints(OOB_HATCH_SPACING_MM);
        const hatchPt = mmToPdfPoints(OOB_HATCH_WIDTH_MM);
        for (const s of crossHatchSegments(poly, spacingPt)) {
          page.drawLine({
            start: { x: s.x1, y: s.y1 },
            end: { x: s.x2, y: s.y2 },
            thickness: hatchPt,
            color: itemColor,
          });
        }
        break;
      }

      case 'outOfBounds': {
        // Hatched square
        const s = IOF_SYMBOL_PT;
        page.drawRectangle({
          x: pos.x - s, y: pos.y - s,
          width: s * 2, height: s * 2,
          borderColor: itemColor, borderWidth: symLine,
        });
        for (let i = -2; i <= 2; i++) {
          const ox = i * (s / 2);
          page.drawLine({
            start: { x: pos.x + ox - s, y: pos.y - s },
            end: { x: pos.x + ox + s, y: pos.y + s },
            thickness: symLine * 0.7,
            color: itemColor,
          });
        }
        break;
      }

      case 'waterLocation': {
        // Circle with wave inside
        const s = IOF_SYMBOL_PT;
        page.drawCircle({ x: pos.x, y: pos.y, size: s, borderColor: itemColor, borderWidth: symLine });
        page.drawLine({
          start: { x: pos.x - s * 0.5, y: pos.y },
          end: { x: pos.x + s * 0.5, y: pos.y },
          thickness: symLine, color: itemColor,
        });
        break;
      }

      case 'firstAid': {
        const s = IOF_SYMBOL_PT * 0.7;
        page.drawLine({ start: { x: pos.x, y: pos.y - s }, end: { x: pos.x, y: pos.y + s }, thickness: symLine * 2, color: itemColor });
        page.drawLine({ start: { x: pos.x - s, y: pos.y }, end: { x: pos.x + s, y: pos.y }, thickness: symLine * 2, color: itemColor });
        break;
      }

      case 'forbiddenRoute': {
        // PurplePen: ±1.06 mm arms, 0.35 mm line (a point cross).
        const s = mmToPdfPoints(1.06);
        const w = mmToPdfPoints(0.35);
        page.drawLine({ start: { x: pos.x - s, y: pos.y - s }, end: { x: pos.x + s, y: pos.y + s }, thickness: w, color: itemColor });
        page.drawLine({ start: { x: pos.x + s, y: pos.y - s }, end: { x: pos.x - s, y: pos.y + s }, thickness: w, color: itemColor });
        break;
      }

      case 'mapIssue': {
        // Horizontal bar (2.5mm, 0.6mm) + downward tail (1.5mm, 0.35mm) — mm on page.
        const halfBar = mmToPdfPoints(2.5 / 2);
        const tail = mmToPdfPoints(1.5);
        page.drawLine({ start: { x: pos.x - halfBar, y: pos.y }, end: { x: pos.x + halfBar, y: pos.y }, thickness: mmToPdfPoints(0.6), color: itemColor });
        // PDF y-up: the tail points downward (−y) to match the on-screen glyph.
        page.drawLine({ start: { x: pos.x, y: pos.y }, end: { x: pos.x, y: pos.y - tail }, thickness: mmToPdfPoints(0.35), color: itemColor });
        break;
      }

      // descriptionBox: all filtered out above — auto-generation handles them

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
const DESC_BLEED_MM = 0; // no white margin beyond the grid border
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
  eventName: string,
  partLabel?: string,
  overrideCellPt?: number,
  overrideColumns?: number,
  _overridePosition?: MapPoint,
  overrideTopY?: number,
  isAllControls = false,
): Promise<void> {
  const lang = eventSettings.language ?? 'en';
  const appearance = course.settings.descriptionAppearance ?? 'symbols';
  const hasTextCol = appearance === 'symbolsAndText';
  const numCols = hasTextCol ? 9 : 8;

  const gapPt = mmToPdfPoints(DESC_COL_GAP_MM);
  const bleedPt = mmToPdfPoints(DESC_BLEED_MM);
  const topOffsetPt = mmToPdfPoints(DESC_TOP_OFFSET_MM);
  const rightOffsetPt = mmToPdfPoints(DESC_RIGHT_OFFSET_MM);

  // --- Step 1: Build explicit row list (shared builder — see desc-rows.ts) ---
  const { headerRows: headerRowList, bodyRows: bodyRowList } = buildDescRows(course, controls, {
    eventName,
    scale: eventSettings.printScale,
    dpi: 96,
    isAllControls,
    isScore: course.courseType === 'score',
    partLabel,
    headerFontSize: DESC_HEADER_FONT_SIZE,
  });

  // --- Step 2: Sizing (uses row counts, not control counts) ---
  const headerCount = headerRowList.length;
  const bodyCount = bodyRowList.length;
  const colWidthInCells = hasTextCol ? 8 + DESC_TEXT_COL_MULTIPLIER : 8;

  const maxBlockWidth = layout.printableWidth * 0.5;
  const maxBlockHeight = (layout.printableHeight - topOffsetPt) * 0.55;

  // Find best column count (maximize cell size)
  let numDescCols = 1;
  let bestCellPt = 0;
  for (let n = 1; n <= 6; n++) {
    const bodyPerCol = Math.ceil(bodyCount / n);
    const tallest = headerCount + bodyPerCol;
    const cellH = maxBlockHeight / tallest;
    const cellW = (maxBlockWidth - gapPt * (n - 1)) / (colWidthInCells * n);
    const cell = Math.min(cellH, cellW, mmToPdfPoints(DESC_CELL_SIZE_MM));
    if (cell >= mmToPdfPoints(3.5) && cell > bestCellPt) {
      bestCellPt = cell;
      numDescCols = n;
    }
  }
  if (overrideColumns) numDescCols = overrideColumns;

  // Compute cell size
  const bodyPerCol = Math.ceil(bodyCount / numDescCols);
  const tallestColRows = headerCount + bodyPerCol;
  const cellFromHeight = maxBlockHeight / tallestColRows;
  const totalGridsWidth = maxBlockWidth - gapPt * (numDescCols - 1);
  const cellFromWidth = totalGridsWidth / (colWidthInCells * numDescCols);
  let cellPt = Math.max(mmToPdfPoints(2), Math.min(cellFromHeight, cellFromWidth, mmToPdfPoints(DESC_CELL_SIZE_MM)));
  if (overrideCellPt) cellPt = overrideCellPt;

  const textColWidthPt = hasTextCol ? cellPt * DESC_TEXT_COL_MULTIPLIER : 0;
  const gridWidth = cellPt * 8 + textColWidthPt;

  // --- Step 3: Split body rows across columns ---
  const columnBodySlices: { rows: DescRow[]; showHeader: boolean }[] = [];
  let bodyOffset = 0;
  for (let c = 0; c < numDescCols; c++) {
    const count = Math.min(bodyCount - bodyOffset, Math.ceil((bodyCount - bodyOffset) / (numDescCols - c)));
    columnBodySlices.push({
      rows: bodyRowList.slice(bodyOffset, bodyOffset + count),
      showHeader: c === 0,
    });
    bodyOffset += count;
  }

  const totalBlockWidth = numDescCols * gridWidth + (numDescCols - 1) * gapPt;

  // --- Positioning (UNCHANGED) ---
  const blockRight = layout.pageWidth - layout.marginRight - rightOffsetPt;
  const blockLeft = blockRight - totalBlockWidth;
  const blockTopY = overrideTopY ?? (layout.pageHeight - layout.marginTop - topOffsetPt);

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
      symOrText(desc.columnE), desc.columnFText ?? symOrText(desc.columnF),
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

  // Helper: draw a 2-section or 3-section info row
  function drawSplitInfoRow(gridX: number, rowY: number, sections: string[]): void {
    const numSections = sections.length;
    // Split grid width proportionally: for 3 sections → 3:3:2, for 2 sections → 4:4
    const widths = numSections === 3
      ? [gridWidth * 3 / 8, gridWidth * 3 / 8, gridWidth * 2 / 8]
      : [gridWidth / 2, gridWidth / 2];

    let x = gridX;
    for (let i = 0; i < numSections; i++) {
      const w = widths[i]!;
      page.drawRectangle({
        x, y: rowY, width: w, height: cellPt,
        borderColor: DESC_BORDER_COLOR, borderWidth: DESC_BORDER_WIDTH,
      });
      const fontSize = DESC_HEADER_FONT_SIZE;
      let text = sections[i]!;
      const maxW = w - cellPt * 0.16;
      while (font.widthOfTextAtSize(text, fontSize) > maxW && text.length > 1) text = text.slice(0, -1);
      const tw = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: x + (w - tw) / 2, y: rowY + (cellPt - fontSize) / 2,
        size: fontSize, font, color: DESC_TEXT_COLOR,
      });
      x += w;
    }
  }

  // Helper: draw a directive row (start/finish/exchange)
  // Left section shows a symbol label, right section shows distance text
  function drawDirectiveRow(gridX: number, rowY: number, symbolType: string, rightText: string): void {
    // Left section (3 cells wide)
    const leftW = cellPt * 3;
    const rightW = gridWidth - leftW;
    page.drawRectangle({
      x: gridX, y: rowY, width: leftW, height: cellPt,
      borderColor: DESC_BORDER_COLOR, borderWidth: DESC_BORDER_WIDTH,
    });
    page.drawRectangle({
      x: gridX + leftW, y: rowY, width: rightW, height: cellPt,
      borderColor: DESC_BORDER_COLOR, borderWidth: DESC_BORDER_WIDTH,
    });

    // Draw symbol in left section
    const cx = gridX + leftW / 2;
    const cy = rowY + cellPt / 2;
    const s = cellPt * 0.3; // symbol size

    if (symbolType === 'start') {
      // Start triangle (pointing right)
      const triH = s * 0.866; // equilateral triangle half-height
      page.drawLine({ start: { x: cx - triH, y: cy - s }, end: { x: cx + triH, y: cy }, thickness: 1, color: DESC_TEXT_COLOR });
      page.drawLine({ start: { x: cx + triH, y: cy }, end: { x: cx - triH, y: cy + s }, thickness: 1, color: DESC_TEXT_COLOR });
      page.drawLine({ start: { x: cx - triH, y: cy + s }, end: { x: cx - triH, y: cy - s }, thickness: 1, color: DESC_TEXT_COLOR });
    } else if (symbolType === 'finish') {
      // Finish double circle
      page.drawCircle({ x: cx, y: cy, size: s, borderColor: DESC_TEXT_COLOR, borderWidth: 1 });
      page.drawCircle({ x: cx, y: cy, size: s * 0.7, borderColor: DESC_TEXT_COLOR, borderWidth: 1 });
    } else if (symbolType === 'exchange') {
      // Map exchange arrow (right-pointing arrow)
      page.drawLine({ start: { x: cx - s, y: cy }, end: { x: cx + s, y: cy }, thickness: 1.5, color: DESC_TEXT_COLOR });
      page.drawLine({ start: { x: cx + s * 0.5, y: cy + s * 0.5 }, end: { x: cx + s, y: cy }, thickness: 1.5, color: DESC_TEXT_COLOR });
      page.drawLine({ start: { x: cx + s * 0.5, y: cy - s * 0.5 }, end: { x: cx + s, y: cy }, thickness: 1.5, color: DESC_TEXT_COLOR });
    }

    // Right: dashed line with distance text centered
    if (rightText) {
      // Draw dashed line
      const lineY = rowY + cellPt / 2;
      const lineStartX = gridX + leftW + cellPt * 0.3;
      const lineEndX = gridX + gridWidth - cellPt * 0.3;
      const dashLen = cellPt * 0.3;
      const gapLen = cellPt * 0.15;
      let dx = lineStartX;
      while (dx < lineEndX) {
        const endX = Math.min(dx + dashLen, lineEndX);
        page.drawLine({
          start: { x: dx, y: lineY }, end: { x: endX, y: lineY },
          thickness: 0.5, color: DESC_TEXT_COLOR,
        });
        dx += dashLen + gapLen;
      }

      // Distance text centered over the dashed line
      const rFontSize = DESC_TEXT_FONT_SIZE;
      const rw = font.widthOfTextAtSize(rightText, rFontSize);
      const textX = gridX + leftW + (rightW - rw) / 2;
      // White background behind text to clear the dashes
      page.drawRectangle({
        x: textX - 2, y: lineY - rFontSize / 2 - 1,
        width: rw + 4, height: rFontSize + 2,
        color: rgb(1, 1, 1),
      });
      page.drawText(rightText, {
        x: textX, y: rowY + (cellPt - rFontSize) / 2,
        size: rFontSize, font, color: DESC_TEXT_COLOR,
      });
    }
  }

  // --- Step 4: Render columns ---
  for (let colIdx = 0; colIdx < numDescCols; colIdx++) {
    const slice = columnBodySlices[colIdx]!;
    const colX = blockLeft + colIdx * (gridWidth + gapPt);

    // All rows for this column
    const colAllRows: DescRow[] = slice.showHeader
      ? [...headerRowList, ...slice.rows]
      : slice.rows;
    const colHeight = colAllRows.length * cellPt;

    // White background
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

    // Render each row
    let rowY = blockTopY;
    for (const row of colAllRows) {
      rowY -= cellPt;
      switch (row.kind) {
        case 'header':
          drawHeader(colX, rowY, row.text, row.fontSize);
          break;
        case 'splitInfo':
          drawSplitInfoRow(colX, rowY, row.sections);
          break;
        case 'directive':
          drawDirectiveRow(colX, rowY, row.leftSymbol, row.distanceText);
          break;
        case 'control':
          await drawControlRow(colX, rowY, row.cc, row.seqNumber);
          break;
      }
    }
  }
}
