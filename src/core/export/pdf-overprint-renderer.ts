import type { PDFFont, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type {
  Control,
  Course,
  CourseControlType,
  EventSettings,
  MapPoint,
} from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';
import { computeShapeOffset } from '@/core/geometry/shape-offset';
import { IOF_OVERPRINT_MM } from '@/core/models/constants';
import { mmToPdfPoints } from './pdf-page-layout';

/** IOF purple: Pantone 814 approximation — #C850A0 */
const PURPLE = rgb(200 / 255, 80 / 255, 160 / 255);

interface PdfOverprintContext {
  page: PDFPage;
  settings: EventSettings;
  /** Convert a map pixel coordinate to a PDF point (bottom-left origin) */
  toPdf: (point: MapPoint) => MapPoint;
  /** Scale factor: map pixels → PDF points. Used to convert relative offsets. */
  effectivePPP: number;
}

/**
 * Render the complete course overprint onto a PDF page using vector drawing.
 * Uses exact IOF dimensions (no screen multiplier).
 */
export function renderOverprint(
  ctx: PdfOverprintContext,
  course: Course,
  controls: Record<ControlId, Control>,
  font: PDFFont,
): void {
  const { page, settings } = ctx;
  const lineWidth = mmToPdfPoints(settings.lineWidth);

  // Resolve controls with positions and per-course number offsets
  const resolved: Array<{
    control: Control;
    type: CourseControlType;
    index: number;
    numberOffset?: MapPoint;
  }> = [];

  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const control = controls[cc.controlId];
    if (control) {
      resolved.push({ control, type: cc.type, index: i, numberOffset: cc.numberOffset });
    }
  }

  if (resolved.length === 0) return;

  // Dimension helpers (IOF exact, in PDF points)
  const circleRadius = mmToPdfPoints(settings.controlCircleDiameter / 2);
  const startTriangleSide = mmToPdfPoints(IOF_OVERPRINT_MM.startTriangleSide);
  const finishOuterRadius = mmToPdfPoints(IOF_OVERPRINT_MM.finishOuterDiameter / 2);
  const finishInnerRadius = mmToPdfPoints(IOF_OVERPRINT_MM.finishInnerDiameter / 2);
  const circleGap = mmToPdfPoints(IOF_OVERPRINT_MM.circleGap);
  const numberSize = mmToPdfPoints(settings.numberSize);
  const crossingPointArm = mmToPdfPoints(IOF_OVERPRINT_MM.crossingPointArm);

  function shapeOffset(type: CourseControlType): number {
    return computeShapeOffset(
      type,
      circleRadius,
      startTriangleSide,
      finishOuterRadius,
      crossingPointArm,
      circleGap,
      lineWidth,
    );
  }

  // Draw legs first (behind shapes).
  // Score courses have no ordered legs — skip them entirely.
  if (course.courseType !== 'score') {
    for (let i = 1; i < resolved.length; i++) {
      const prev = resolved[i - 1]!;
      const curr = resolved[i]!;
      const prevPdf = ctx.toPdf(prev.control.position);
      const currPdf = ctx.toPdf(curr.control.position);

      const endpoints = shortenedLeg(prevPdf, currPdf, shapeOffset(prev.type), shapeOffset(curr.type));
      if (endpoints) {
        page.drawLine({
          start: { x: endpoints[0].x, y: endpoints[0].y },
          end: { x: endpoints[1].x, y: endpoints[1].y },
          thickness: lineWidth,
          color: PURPLE,
        });
      }
    }
  }

  // Compute start triangle target direction (in PDF space)
  const startTarget: MapPoint | undefined =
    resolved.length >= 2
      ? (() => {
          const p0 = ctx.toPdf(resolved[0]!.control.position);
          const p1 = ctx.toPdf(resolved[1]!.control.position);
          return { x: p1.x - p0.x, y: p1.y - p0.y };
        })()
      : undefined;

  // Draw shapes and numbers
  for (const { control, type, index, numberOffset } of resolved) {
    const pt = ctx.toPdf(control.position);

    if (type === 'start') {
      drawStartTriangle(page, pt, startTriangleSide, lineWidth, startTarget);
    } else if (type === 'finish') {
      drawFinishCircles(page, pt, finishOuterRadius, finishInnerRadius, lineWidth);
    } else if (type === 'crossingPoint') {
      drawCrossingPoint(page, pt, crossingPointArm, lineWidth);
    } else if (type === 'mapExchange') {
      // Inverted triangle — rotated π from start direction
      drawStartTriangle(page, pt, startTriangleSide, lineWidth, startTarget, Math.PI);
    } else {
      page.drawCircle({
        x: pt.x,
        y: pt.y,
        size: circleRadius,
        borderColor: PURPLE,
        borderWidth: lineWidth,
      });
    }

    // Sequence number — default offset to the right of the shape, then apply
    // the user-defined numberOffset (stored in map pixels, converted via effectivePPP).
    // PDF Y-axis is inverted relative to screen (bottom-left origin), so negate Y.
    const baseOffsetX = shapeOffset(type) + lineWidth;
    const baseOffsetY = -numberSize * 0.35;

    const numOffsetX = numberOffset ? numberOffset.x * ctx.effectivePPP : 0;
    const numOffsetY = numberOffset ? -(numberOffset.y * ctx.effectivePPP) : 0;

    page.drawText(String(index + 1), {
      x: pt.x + baseOffsetX + numOffsetX,
      y: pt.y + baseOffsetY + numOffsetY,
      size: numberSize,
      font,
      color: PURPLE,
    });
  }
}

/**
 * Draw an equilateral start triangle centered at `center` using drawLine.
 * All coordinates in PDF space (bottom-left origin).
 * `extraRotation` (radians) is added after target-pointing — use Math.PI for map exchange.
 */
function drawStartTriangle(
  page: PDFPage,
  center: MapPoint,
  sideLength: number,
  lineWidth: number,
  target?: MapPoint,
  extraRotation = 0,
): void {
  // In PDF, Y points up. Default direction = up = pi/2
  const angle = (target
    ? Math.atan2(target.y, target.x)
    : Math.PI / 2) + extraRotation;

  const r = sideLength / Math.sqrt(3);
  const vertices: MapPoint[] = [];
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * 2 * Math.PI) / 3;
    vertices.push({
      x: center.x + r * Math.cos(a),
      y: center.y + r * Math.sin(a),
    });
  }

  // Draw three edges
  for (let i = 0; i < 3; i++) {
    const from = vertices[i]!;
    const to = vertices[(i + 1) % 3]!;
    page.drawLine({
      start: { x: from.x, y: from.y },
      end: { x: to.x, y: to.y },
      thickness: lineWidth,
      color: PURPLE,
    });
  }
}

/**
 * Draw a crossing point (X shape) centered at `center`.
 * Two diagonal lines at ±45°, arm half-length = armHalf.
 */
function drawCrossingPoint(
  page: PDFPage,
  center: MapPoint,
  armHalf: number,
  lineWidth: number,
): void {
  // Line 1: top-left to bottom-right (PDF Y-up, so (-arm,-arm) is bottom-left)
  page.drawLine({
    start: { x: center.x - armHalf, y: center.y + armHalf },
    end: { x: center.x + armHalf, y: center.y - armHalf },
    thickness: lineWidth,
    color: PURPLE,
  });
  // Line 2: top-right to bottom-left
  page.drawLine({
    start: { x: center.x + armHalf, y: center.y + armHalf },
    end: { x: center.x - armHalf, y: center.y - armHalf },
    thickness: lineWidth,
    color: PURPLE,
  });
}

/**
 * Draw finish double circles centered at `center`.
 */
function drawFinishCircles(
  page: PDFPage,
  center: MapPoint,
  outerRadius: number,
  innerRadius: number,
  lineWidth: number,
): void {
  page.drawCircle({
    x: center.x,
    y: center.y,
    size: outerRadius,
    borderColor: PURPLE,
    borderWidth: lineWidth,
  });
  page.drawCircle({
    x: center.x,
    y: center.y,
    size: innerRadius,
    borderColor: PURPLE,
    borderWidth: lineWidth,
  });
}
