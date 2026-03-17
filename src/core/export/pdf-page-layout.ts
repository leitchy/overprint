import type { Control, Course, PageSetup, PaperSize } from '@/core/models/types';
import type { ControlId } from '@/utils/id';

/**
 * Paper dimensions in PDF points (1 point = 1/72 inch).
 */
const PAPER_SIZES_PT: Record<Exclude<PaperSize, 'custom'>, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
};

const MM_TO_PT = 72 / 25.4;

export interface PageLayout {
  /** Page width in points */
  pageWidth: number;
  /** Page height in points */
  pageHeight: number;
  /** Printable area after margins */
  printableWidth: number;
  printableHeight: number;
  /** Margin offsets in points */
  marginLeft: number;
  marginBottom: number;
  marginTop: number;
  marginRight: number;
}

/**
 * Calculate page layout from event PageSetup.
 */
export function computePageLayout(pageSetup: PageSetup): PageLayout {
  let pageWidth: number;
  let pageHeight: number;

  if (pageSetup.paperSize === 'custom') {
    pageWidth = (pageSetup.customWidth ?? 210) * MM_TO_PT;
    pageHeight = (pageSetup.customHeight ?? 297) * MM_TO_PT;
  } else {
    const [w, h] = PAPER_SIZES_PT[pageSetup.paperSize];
    pageWidth = w;
    pageHeight = h;
  }

  // Swap for landscape
  if (pageSetup.orientation === 'landscape') {
    [pageWidth, pageHeight] = [pageHeight, pageWidth];
  }

  const marginLeft = pageSetup.margins.left * MM_TO_PT;
  const marginRight = pageSetup.margins.right * MM_TO_PT;
  const marginTop = pageSetup.margins.top * MM_TO_PT;
  const marginBottom = pageSetup.margins.bottom * MM_TO_PT;

  return {
    pageWidth,
    pageHeight,
    printableWidth: pageWidth - marginLeft - marginRight,
    printableHeight: pageHeight - marginTop - marginBottom,
    marginLeft,
    marginBottom,
    marginTop,
    marginRight,
  };
}

/**
 * Convert a distance in mm to PDF points.
 */
export function mmToPdfPoints(mm: number): number {
  return mm * MM_TO_PT;
}

// --- Viewport computation for print-scale-correct export ---

export interface CourseBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box of all control positions in a course (in map pixels).
 * Returns null if the course has no resolvable controls.
 */
export function computeCourseBounds(
  course: Course,
  controls: Record<ControlId, Control>,
): CourseBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (const cc of course.controls) {
    const ctrl = controls[cc.controlId];
    if (!ctrl) continue;
    found = true;
    if (ctrl.position.x < minX) minX = ctrl.position.x;
    if (ctrl.position.y < minY) minY = ctrl.position.y;
    if (ctrl.position.x > maxX) maxX = ctrl.position.x;
    if (ctrl.position.y > maxY) maxY = ctrl.position.y;
  }

  return found ? { minX, minY, maxX, maxY } : null;
}

export interface MapViewport {
  /** Top-left corner of the visible map region in map pixels */
  left: number;
  top: number;
  /** Dimensions of the visible region in map pixels */
  widthPx: number;
  heightPx: number;
  /** PDF points per map pixel — the fundamental scale factor */
  effectivePPP: number;
}

/**
 * Compute the map viewport that fits on the page at correct print scale,
 * centered on the course controls.
 *
 * @param layout - Page layout with printable area
 * @param mapScale - Source map scale (e.g. 15000 for 1:15000)
 * @param printScale - Desired print scale (e.g. 15000 for 1:15000)
 * @param dpi - Map image resolution
 * @param imgWidth - Map image width in pixels
 * @param imgHeight - Map image height in pixels
 * @param bounds - Course control bounding box in map pixels
 * @param paddingMm - Padding around course bounds in mm at print scale (default 30)
 */
export function computeMapViewport(
  layout: PageLayout,
  mapScale: number,
  printScale: number,
  dpi: number,
  imgWidth: number,
  imgHeight: number,
  bounds: CourseBounds,
  paddingMm = 30,
): MapViewport {
  // PDF points per map pixel at correct print scale
  const effectivePPP = (72 / dpi) * (mapScale / printScale);

  // Convert padding from mm at print scale to map pixels
  const paddingPx = (paddingMm / 25.4) * dpi * (printScale / mapScale);

  // How many map pixels fit in the printable area
  const viewportWidthPx = layout.printableWidth / effectivePPP;
  const viewportHeightPx = layout.printableHeight / effectivePPP;

  // Course center in map pixels (including padding in the bounds)
  const paddedMinX = bounds.minX - paddingPx;
  const paddedMinY = bounds.minY - paddingPx;
  const paddedMaxX = bounds.maxX + paddingPx;
  const paddedMaxY = bounds.maxY + paddingPx;
  const courseCenterX = (paddedMinX + paddedMaxX) / 2;
  const courseCenterY = (paddedMinY + paddedMaxY) / 2;

  // Center viewport on course center
  let left = courseCenterX - viewportWidthPx / 2;
  let top = courseCenterY - viewportHeightPx / 2;

  // Clamp to map image boundaries (don't show beyond the map edge)
  if (viewportWidthPx < imgWidth) {
    left = Math.max(0, Math.min(left, imgWidth - viewportWidthPx));
  } else {
    // Viewport wider than image — center image within viewport
    left = -(viewportWidthPx - imgWidth) / 2;
  }

  if (viewportHeightPx < imgHeight) {
    top = Math.max(0, Math.min(top, imgHeight - viewportHeightPx));
  } else {
    // Viewport taller than image — center image within viewport
    top = -(viewportHeightPx - imgHeight) / 2;
  }

  return { left, top, widthPx: viewportWidthPx, heightPx: viewportHeightPx, effectivePPP };
}
