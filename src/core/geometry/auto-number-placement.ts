/**
 * Automatic control-number placement (PurplePen-style).
 *
 * For each numbered control, tries 32 candidate angles around the circle and picks
 * the one that maximises the minimum clearance from the connecting legs, other
 * control circles, and already-placed numbers (maximin), defaulting to upper-right
 * on ties. Pure — no React/Konva. Output is a `numberOffset` per control index,
 * relative to the renderer's default anchor, in map pixels.
 */
import type { Course, Control, MapPoint, CourseControlType } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import type { OverprintPixelDimensions } from './overprint-dimensions';
import { computeShapeOffset } from './shape-offset';
import { buildLegPath, pointToSegmentDistanceSq } from './leg-path';
import { SCREEN_LINE_MULTIPLIER, NUMBER_DIGIT_HEIGHT_TO_EM } from '@/core/models/constants';

const NUM_CANDIDATES = 32;
/** Default number angle: upper-right in canvas (y-down) coords. */
const DEFAULT_ANGLE = -Math.PI / 6;

export interface AutoPlaceOptions {
  /** Control indices whose numberOffset the user set manually — kept as-is (still avoided). */
  preserveIndices?: Set<number>;
  /** Measure a label's pixel size at a font size (offscreen canvas). Falls back to a heuristic. */
  measureText?: (text: string, fontSize: number) => { width: number; height: number };
}

interface Rect { x: number; y: number; w: number; h: number } // top-left + size, relative to control centre
interface CircleObstacle { c: MapPoint; r: number }
type Segment = [MapPoint, MapPoint];

/** Outer radius of a control's overprint shape by type (px). */
function shapeRadius(type: CourseControlType, d: OverprintPixelDimensions): number {
  switch (type) {
    case 'start':
    case 'mapExchange':
    case 'mapFlip':
      return d.startTriangleSide / Math.sqrt(3);
    case 'finish':
      return d.finishOuterRadius;
    case 'crossingPoint':
      return d.crossingPointArm * Math.SQRT2;
    default:
      return d.circleRadius;
  }
}

/** The renderer's default number anchor (top-left, relative to control centre). */
function defaultAnchor(type: CourseControlType, d: OverprintPixelDimensions): MapPoint {
  const screenLineWidth = d.lineWidth * SCREEN_LINE_MULTIPLIER;
  const selectionRadius = shapeRadius(type, d) + screenLineWidth * 2;
  return { x: selectionRadius + screenLineWidth, y: -(d.numberSize * 0.6) };
}

function labelFor(course: Course, control: Control, index: number): string {
  const mode = course.settings.labelMode ?? 'sequence';
  const seq = index + 1;
  if (mode === 'sequence') return String(seq);
  if (mode === 'code') return String(control.code);
  if (mode === 'both') return `${seq} (${control.code})`;
  return '';
}

/** Distance from a point to an axis-aligned rect (0 if inside). */
function pointToRect(p: MapPoint, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function autoNumberOffsets(
  course: Course,
  controls: Record<ControlId, Control>,
  dims: OverprintPixelDimensions,
  opts: AutoPlaceOptions = {},
): Map<number, MapPoint> {
  const result = new Map<number, MapPoint>();
  const preserve = opts.preserveIndices ?? new Set<number>();
  const screenLineWidth = dims.lineWidth * SCREEN_LINE_MULTIPLIER;
  const gap = dims.circleGap * SCREEN_LINE_MULTIPLIER;

  const ccs = course.controls;
  const resolved = ccs.map((cc) => ({ cc, control: controls[cc.controlId] }));

  // --- Obstacle geometry (course-wide) ---
  const circles: CircleObstacle[] = [];
  for (const { cc, control } of resolved) {
    if (!control) continue;
    circles.push({ c: control.position, r: shapeRadius(cc.type, dims) });
  }

  const legSegs: Segment[] = [];
  if (course.courseType !== 'score') {
    for (let i = 1; i < resolved.length; i++) {
      const from = resolved[i - 1]!;
      const to = resolved[i]!;
      if (!from.control || !to.control) continue;
      const path = buildLegPath(
        from.control.position,
        to.control.position,
        from.cc.bendPoints,
        computeShapeOffset(from.cc.type, dims.circleRadius, dims.startTriangleSide, dims.finishOuterRadius, dims.crossingPointArm, gap, screenLineWidth),
        computeShapeOffset(to.cc.type, dims.circleRadius, dims.startTriangleSide, dims.finishOuterRadius, dims.crossingPointArm, gap, screenLineWidth),
      );
      if (!path) continue;
      for (let s = 1; s < path.length; s++) legSegs.push([path[s - 1]!, path[s]!]);
    }
  }

  // Numbers placed so far (in control-centre-relative rects, keyed by absolute position)
  const placedRects: { c: MapPoint; rect: Rect }[] = [];

  // Pre-seed obstacles with manually-placed numbers so auto-placed ones avoid them.
  for (let i = 0; i < resolved.length; i++) {
    if (!preserve.has(i)) continue;
    const { cc, control } = resolved[i]!;
    if (!control || !cc.numberOffset) continue;
    const label = labelFor(course, control, i);
    if (!label) continue;
    const fontSize = dims.numberSize * NUMBER_DIGIT_HEIGHT_TO_EM;
    const w = (opts.measureText?.(label, fontSize).width) ?? label.length * 0.6 * fontSize;
    const anchor = defaultAnchor(cc.type, dims);
    const tl = { x: anchor.x + cc.numberOffset.x, y: anchor.y + cc.numberOffset.y };
    placedRects.push({ c: control.position, rect: { x: tl.x, y: tl.y, w, h: fontSize } });
  }

  for (let i = 0; i < resolved.length; i++) {
    if (preserve.has(i)) continue;
    const { cc, control } = resolved[i]!;
    if (!control) continue;
    const label = labelFor(course, control, i);
    if (!label) continue; // unnumbered (start/finish/none) — still an obstacle circle, no number

    const fontSize = dims.numberSize * NUMBER_DIGIT_HEIGHT_TO_EM;
    const w = (opts.measureText?.(label, fontSize).width) ?? label.length * 0.6 * fontSize;
    const h = fontSize;
    const rShape = shapeRadius(cc.type, dims);
    const centre = control.position;

    let best: { offset: MapPoint; rect: Rect; clearance: number } | null = null;

    for (let k = 0; k < NUM_CANDIDATES; k++) {
      const theta = DEFAULT_ANGLE + (k * 2 * Math.PI) / NUM_CANDIDATES;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      // Box centre at radius that keeps its near edge ~gap outside the circle.
      const support = 0.5 * (Math.abs(w * ct) + Math.abs(h * st));
      const rc = rShape + screenLineWidth * 1.5 + dims.numberSize * 0.15 + support;
      const bcx = ct * rc;
      const bcy = st * rc;
      const tlx = bcx - w / 2;
      const tly = bcy - h / 2;
      // Sample points: centre + 4 corners (relative to control centre → absolute)
      const samplesRel = [
        { x: bcx, y: bcy },
        { x: tlx, y: tly },
        { x: tlx + w, y: tly },
        { x: tlx, y: tly + h },
        { x: tlx + w, y: tly + h },
      ];

      let clearance = Infinity;
      for (const sr of samplesRel) {
        const p = { x: centre.x + sr.x, y: centre.y + sr.y };
        // legs
        for (const [a, b] of legSegs) {
          const dist = Math.sqrt(pointToSegmentDistanceSq(p, a, b)) - dims.lineWidth / 2;
          if (dist < clearance) clearance = dist;
        }
        // other circles (skip this control's own)
        for (const circ of circles) {
          if (circ.c === centre) continue;
          const dist = Math.hypot(p.x - circ.c.x, p.y - circ.c.y) - circ.r;
          if (dist < clearance) clearance = dist;
        }
        // placed numbers (rects are control-centre-relative → make absolute)
        for (const pr of placedRects) {
          const abs = { x: pr.c.x + pr.rect.x, y: pr.c.y + pr.rect.y, w: pr.rect.w, h: pr.rect.h };
          const dist = pointToRect(p, abs);
          if (dist < clearance) clearance = dist;
        }
        if (clearance <= 0) break; // can't get worse than a collision
      }

      const anchor = defaultAnchor(cc.type, dims);
      const offset = { x: tlx - anchor.x, y: tly - anchor.y };
      // strict '>' so ties keep the earliest (default-angle-first) candidate
      if (!best || clearance > best.clearance) {
        best = { offset, rect: { x: tlx, y: tly, w, h }, clearance };
      }
    }

    if (best) {
      result.set(i, best.offset);
      placedRects.push({ c: centre, rect: best.rect });
    }
  }

  return result;
}
