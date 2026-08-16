import type { PDFFont, PDFPage, PDFName } from 'pdf-lib';
import { cmyk, pushGraphicsState, popGraphicsState, setGraphicsState } from 'pdf-lib';
import type {
  Control,
  Course,
  CourseControl,
  CourseControlType,
  EventSettings,
  MapPoint,
} from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { computeNumberFanOffsets } from '@/core/geometry/number-fan';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';
import { buildLegPath, splitPathByGaps, mergeGaps } from '@/core/geometry/leg-path';
import { computeCourseAutoLegGaps, type AutoGapControl } from '@/core/geometry/auto-leg-gaps';
import { computeShapeOffset } from '@/core/geometry/shape-offset';
import { visibleArcs } from '@/core/geometry/circle-gaps';
import { overprintDims, OVERPRINT_PURPLE_CMYK, NUMBER_DIGIT_HEIGHT_TO_EM } from '@/core/models/constants';
import { mmToPdfPoints } from './pdf-page-layout';

/**
 * IOF course-overprint purple as DeviceCMYK 35/85/0/0 (ISOM 2017 App. 1 §4). Emitting
 * CMYK — not sRGB — makes it a spot-correct separation that can truly overprint the
 * map inks. The overprint flag + optional Multiply blend are applied to the whole
 * overprint layer via an ExtGState (see registerOverprintGState).
 */
export const PURPLE = cmyk(...OVERPRINT_PURPLE_CMYK);

/**
 * Build an SVG path `d` string for a polyline of PDF-space (y-up) points.
 *
 * pdf-lib's `drawSvgPath` applies an internal `scale(1,-1)` (SVG is y-down), so a
 * point given in PDF y-up space would render mirrored to `-y` (off-page). We
 * pre-negate y here so the internal flip cancels out and the polyline lands
 * on-page — while keeping the mitre joins that a polyline (vs. per-segment lines)
 * gives at bends/arcs. Exported for regression testing.
 */
export function pdfPolylineToSvgPath(points: MapPoint[]): string {
  return points.map((p, j) => `${j === 0 ? 'M' : 'L'} ${p.x} ${-p.y}`).join(' ');
}

/**
 * Register (once per page) an ExtGState that makes the overprint layer behave like a
 * real spot overprint: OP/op (stroking + non-stroking overprint), OPM 1 so it applies
 * per-component on CMYK output. When `multiply` is set, also add a Multiply blend so
 * on-screen viewers (which ignore OP unless overprint-preview is on) still show map
 * detail through the purple. Returns the resource name to pass to setGraphicsState.
 */
function registerOverprintGState(
  page: PDFPage,
  { overprint, multiply }: { overprint: boolean; multiply: boolean },
): PDFName {
  const dict = page.doc.context.obj({
    Type: 'ExtGState',
    ...(overprint ? { OP: true, op: true, OPM: 1 } : {}),
    ...(multiply ? { BM: 'Multiply' } : {}),
  });
  return page.node.newExtGState('OP', dict);
}

/**
 * Which part of the overprint to render, so the caller can interleave the map's
 * black/brown/blue linework between them (the PurplePen-matching order):
 *
 *   1. `'legs'`   — connecting lines (705). Drawn UNDER the map's upper inks and
 *                   with the Multiply blend, so contours/streams a leg crosses
 *                   still show through the solid purple (ISOM §3.7 intent).
 *   2. map upper-ink redraw (black/brown/blue 100%) happens between the calls.
 *   3. `'symbols'` — the locating marks: control circle (703), start (701),
 *                    finish (706), crossing (710.1), map exchange/flip (715),
 *                    and the control NUMBERS (704, with a white halo). Drawn
 *                    SOLID (no Multiply) and ON TOP of the upper inks, so a brown
 *                    contour never crosses the circle the runner must read.
 *
 * When omitted, BOTH parts draw in one pass (legacy raster fallback — there is no
 * upper-ink redraw to sit between them anyway).
 */
export type OverprintPart = 'legs' | 'symbols';

interface PdfOverprintContext {
  page: PDFPage;
  settings: EventSettings;
  /** Convert a map pixel coordinate to a PDF point (bottom-left origin) */
  toPdf: (point: MapPoint) => MapPoint;
  /** Scale factor: map pixels → PDF points. Used to convert relative offsets. */
  effectivePPP: number;
  /** Offset added to sequence numbers when rendering a course part (default 0). */
  sequenceOffset?: number;
  /** Render only legs, or only the locating symbols (see {@link OverprintPart}). Omit = both. */
  parts?: OverprintPart;
  /**
   * True on the vector-PDF colour-order path (D2): the purple is a solid spot
   * overprint (OP flag only, NO Multiply blend). With true colour-order the
   * map's dark linework is literally redrawn above the lower purple, so adding
   * a Multiply blend as well would double-compensate — map detail would show
   * through via the blend AND be painted on top. The Multiply interim stays
   * only on the raster path (where nothing is redrawn above the purple).
   */
  solidOverprint?: boolean;
  /**
   * Paper-space symbol size multiplier (see overprintSizeMultiplier /
   * ItemScaling). Scales SYMBOL dimensions only — never positions or the
   * viewport transform. Default 1 (fixed IOF mm on the page).
   */
  sizeMultiplier?: number;
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
  // Item-scaling multiplier — applied to every SYMBOL dimension (not positions).
  const k = ctx.sizeMultiplier ?? 1;
  // Line width scales with item-scaling, but never prints THINNER than the IOF
  // spec (0.35 mm) — a reduced print scale (k < 1) used to yield hairline,
  // barely-visible overprint. Floor at the spec width for legible print output.
  const specLineWidth = mmToPdfPoints(settings.lineWidth);
  const lineWidth = Math.max(specLineWidth, specLineWidth * k);

  // Resolve controls with positions and their source CourseControl. `index` is the
  // position in `course.controls` (NOT in `resolved`) — leg geometry lookups must use
  // the carried `courseControl`, since `resolved` skips any control missing from the pool.
  const resolved: Array<{
    control: Control;
    type: CourseControlType;
    index: number;
    numberOffset?: MapPoint;
    courseControl: CourseControl;
  }> = [];

  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const control = controls[cc.controlId];
    if (control) {
      resolved.push({ control, type: cc.type, index: i, numberOffset: cc.numberOffset, courseControl: cc });
    }
  }

  if (resolved.length === 0) return;

  // Phase split (see OverprintPart): legs draw under the map's upper inks; the
  // locating symbols + numbers draw solid, on top.
  const drawLegs = ctx.parts !== 'symbols';
  const drawSymbols = ctx.parts !== 'legs';

  // Wrap the pass in an ExtGState. The SYMBOLS phase draws OPAQUE (no overprint,
  // no Multiply): it sits on top of the map, so it must read at full purple
  // strength and its white number halo must actually knock the map out — under
  // the OP overprint flag white paints nothing, and under Multiply white is a
  // no-op. Legs keep the overprint flag (+ optional Multiply on the raster path)
  // so map detail shows through the solid purple they cross.
  const isSymbolsPass = ctx.parts === 'symbols';
  const overprint = !isSymbolsPass;
  const multiply = isSymbolsPass || ctx.solidOverprint ? false : (settings.overprintBlend ?? true);
  const gsName = registerOverprintGState(page, { overprint, multiply });
  page.pushOperators(pushGraphicsState(), setGraphicsState(gsName));

  // Dimension helpers (IOF mm × item-scaling multiplier, in PDF points)
  const std = overprintDims(settings.mapStandard);
  const circleRadius = mmToPdfPoints(settings.controlCircleDiameter / 2) * k;
  const startTriangleSide = mmToPdfPoints(std.startTriangleSide) * k;
  const finishOuterRadius = mmToPdfPoints(std.finishOuterDiameter / 2) * k;
  const finishInnerRadius = mmToPdfPoints(std.finishInnerDiameter / 2) * k;
  const circleGap = mmToPdfPoints(std.circleGap) * k;
  const numberSize = mmToPdfPoints(settings.numberSize) * k;
  const crossingPointArm = mmToPdfPoints(std.crossingPointArm) * k;

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

  // Draw legs first (behind shapes). Legs (705) sit under the map's upper inks.
  // Score courses have no ordered legs — skip them entirely.
  if (drawLegs && course.courseType !== 'score') {
    // Auto leg-cut gaps, computed in PDF-point space (same as the drawn paths).
    const pdfRadius = (type: CourseControlType): number =>
      type === 'start' || type === 'mapExchange' || type === 'mapFlip' ? startTriangleSide / Math.sqrt(3)
        : type === 'finish' ? finishOuterRadius
          : type === 'crossingPoint' ? crossingPointArm * Math.SQRT2
            : circleRadius;
    const autoGapsByLeg = computeCourseAutoLegGaps(
      resolved.map((rc): AutoGapControl => ({
        position: ctx.toPdf(rc.control.position),
        type: rc.type,
        bendPoints: rc.courseControl.bendPoints?.map((bp) => ctx.toPdf(bp)),
      })),
      pdfRadius,
      shapeOffset,
      lineWidth,
      mmToPdfPoints(3.5) * k,
      mmToPdfPoints(0.5) * k,
    );

    for (let i = 1; i < resolved.length; i++) {
      const prev = resolved[i - 1]!;
      const curr = resolved[i]!;
      const prevPdf = ctx.toPdf(prev.control.position);
      const currPdf = ctx.toPdf(curr.control.position);
      const cc = prev.courseControl; // leg geometry lives on the SOURCE control
      const bendPoints = cc?.bendPoints?.map((bp) => ctx.toPdf(bp));
      const hasBends = bendPoints && bendPoints.length > 0;

      const path = hasBends
        ? buildLegPath(prevPdf, currPdf, bendPoints, shapeOffset(prev.type), shapeOffset(curr.type))
        : (() => {
            const ep = shortenedLeg(prevPdf, currPdf, shapeOffset(prev.type), shapeOffset(curr.type));
            return ep ? [ep[0], ep[1]] : null;
          })();

      if (path) {
        // Manual gaps are stored in MAP PIXELS — scale to PDF points to match the path.
        const manualGaps = (cc?.legGaps ?? []).map((g) => ({
          startDist: g.startDist * ctx.effectivePPP,
          endDist: g.endDist * ctx.effectivePPP,
        }));
        const allGaps = [...manualGaps, ...(autoGapsByLeg[i] ?? [])];
        const subPaths = allGaps.length > 0
          ? splitPathByGaps(path, mergeGaps(allGaps))
          : [path];

        for (const subPath of subPaths) {
          if (subPath.length === 2) {
            // Simple straight segment
            page.drawLine({
              start: { x: subPath[0]!.x, y: subPath[0]!.y },
              end: { x: subPath[1]!.x, y: subPath[1]!.y },
              thickness: lineWidth,
              color: PURPLE,
            });
          } else if (subPath.length > 2) {
            // Polyline via SVG path for proper joins at bends (y-flip handled).
            page.drawSvgPath(pdfPolylineToSvgPath(subPath), {
              borderColor: PURPLE,
              borderWidth: lineWidth,
            });
          }
        }
      }
    }
  }

  // Compute start triangle target direction (in PDF space)
  // Start triangle target direction — point toward first bend point if bends exist
  const firstLegBends = course.controls[0]?.bendPoints;
  const startTarget: MapPoint | undefined =
    resolved.length >= 2
      ? (() => {
          const p0 = ctx.toPdf(resolved[0]!.control.position);
          const targetPos = firstLegBends && firstLegBends.length > 0
            ? firstLegBends[0]!
            : resolved[1]!.control.position;
          const p1 = ctx.toPdf(targetPos);
          return { x: p1.x - p0.x, y: p1.y - p0.y };
        })()
      : undefined;

  // Fan the sequence numbers of any control that occurs more than once (loop hubs)
  // so co-located numbers don't stack. Radius in MAP PIXELS (numberOffset units);
  // the effectivePPP conversion below turns it into the same points as circleRadius.
  const fanRadiusMapPx = (circleRadius + numberSize) / ctx.effectivePPP;
  const fanOffsets = computeNumberFanOffsets(
    resolved.map((r) => ({ controlId: r.control.id, numberOffset: r.numberOffset })),
    fanRadiusMapPx,
  );

  // Draw the locating symbols + numbers (solid, on top of the map upper inks).
  const haloWidth = Math.max(lineWidth, mmToPdfPoints(0.3));
  if (drawSymbols) {
    for (let ri = 0; ri < resolved.length; ri++) {
      const { control, type, index } = resolved[ri]!;
      const numberOffset = fanOffsets[ri];
      const pt = ctx.toPdf(control.position);

      if (type === 'start') {
        drawStartTriangle(page, pt, startTriangleSide, lineWidth, startTarget);
      } else if (type === 'finish') {
        drawFinishCircles(page, pt, finishOuterRadius, finishInnerRadius, lineWidth);
      } else if (type === 'crossingPoint') {
        drawCrossingPoint(page, pt, crossingPointArm, lineWidth);
      } else if (type === 'mapExchange' || type === 'mapFlip') {
        // Inverted triangle — rotated π from start direction
        drawStartTriangle(page, pt, startTriangleSide, lineWidth, startTarget, Math.PI);
      } else if (control.circleGaps && control.circleGaps.length > 0) {
        drawGappedCircle(page, pt, circleRadius, lineWidth, control.circleGaps);
      } else {
        page.drawCircle({
          x: pt.x,
          y: pt.y,
          size: circleRadius,
          borderColor: PURPLE,
          borderWidth: lineWidth,
        });
      }

      // Compute label text from course labelMode setting
      const labelMode = course.settings.labelMode ?? 'sequence';
      const seqNum = index + (ctx.sequenceOffset ?? 0) + 1;
      let labelText: string;
      if (labelMode === 'sequence') {
        labelText = String(seqNum);
      } else if (labelMode === 'code') {
        labelText = String(control.code);
      } else if (labelMode === 'both') {
        labelText = `${seqNum} (${control.code})`;
      } else {
        labelText = '';
      }

      // Label — default offset to the right of the shape, then apply
      // the user-defined numberOffset (stored in map pixels, converted via effectivePPP).
      // PDF Y-axis is inverted relative to screen (bottom-left origin), so negate Y.
      if (labelText !== '') {
        // Control CODES render smaller than sequence NUMBERS (PurplePen: 3.0mm
        // code digit vs 4.0mm number digit) — otherwise all-controls code labels
        // are oversized.
        const labelDigitPt = labelMode === 'code' ? mmToPdfPoints(3.0) * k : numberSize;
        const baseOffsetX = shapeOffset(type) + lineWidth;
        const baseOffsetY = -labelDigitPt * 0.35;

        const numOffsetX = numberOffset ? numberOffset.x * ctx.effectivePPP : 0;
        const numOffsetY = numberOffset ? -(numberOffset.y * ctx.effectivePPP) : 0;

        drawHaloedText(page, labelText, {
          x: pt.x + baseOffsetX + numOffsetX,
          y: pt.y + baseOffsetY + numOffsetY,
          // digit (cap) height → font Em.
          size: labelDigitPt * NUMBER_DIGIT_HEIGHT_TO_EM,
          font,
          haloWidth,
        });
      }
    }
  }

  page.pushOperators(popGraphicsState());
}

/** White CMYK for the number halo (opaque knock-out — drawn in the opaque symbols pass). */
const HALO_WHITE = cmyk(0, 0, 0, 0);

/**
 * Draw control-number text with a white halo so it stays legible over busy map
 * detail (PurplePen renders the same white framing behind the glyphs). The halo
 * is eight white copies offset around the glyph, then the purple fill on top —
 * robust across pdf renderers (pdf-lib's drawText exposes no stroke/framing).
 * Must be called inside the OPAQUE symbols pass, or the white would not knock out.
 */
function drawHaloedText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; haloWidth: number },
): void {
  const { x, y, size, font, haloWidth } = opts;
  const r = haloWidth;
  const diag = r * Math.SQRT1_2;
  const offsets: Array<[number, number]> = [
    [r, 0], [-r, 0], [0, r], [0, -r],
    [diag, diag], [diag, -diag], [-diag, diag], [-diag, -diag],
  ];
  for (const [dx, dy] of offsets) {
    page.drawText(text, { x: x + dx, y: y + dy, size, font, color: HALO_WHITE });
  }
  page.drawText(text, { x, y, size, font, color: PURPLE });
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
 * Draw a control circle with gaps as sampled-arc polylines. PDF space is y-up, the
 * same convention as stored gap angles (CCW from +X), so points map directly. Uses
 * the same drawSvgPath polyline path as legs, guaranteeing matching orientation.
 */
function drawGappedCircle(
  page: PDFPage,
  center: MapPoint,
  radius: number,
  lineWidth: number,
  gaps: import('@/core/models/types').CircleGap[],
): void {
  const STEP_DEG = 2;
  for (const arc of visibleArcs(gaps)) {
    const steps = Math.max(1, Math.ceil(arc.sweepDeg / STEP_DEG));
    const pts: MapPoint[] = [];
    for (let s = 0; s <= steps; s++) {
      const deg = arc.startDeg + (arc.sweepDeg * s) / steps;
      const r = (deg * Math.PI) / 180;
      pts.push({ x: center.x + radius * Math.cos(r), y: center.y + radius * Math.sin(r) });
    }
    page.drawSvgPath(pdfPolylineToSvgPath(pts), { borderColor: PURPLE, borderWidth: lineWidth });
  }
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
