import { memo } from 'react';
import type { Course, Control, CourseControlType, MapPoint, LegGap, CircleGap } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { OVERPRINT_PURPLE, SCREEN_LINE_MULTIPLIER } from '@/core/models/constants';
import { computeShapeOffset } from '@/core/geometry/shape-offset';
import { computeCourseAutoLegGaps, type AutoGapControl } from '@/core/geometry/auto-leg-gaps';
import { ControlShape } from './control-shape';
import { LegLine } from './leg-line';

/** Outer radius of a control's overprint shape by type (map pixels). */
function controlRadius(type: CourseControlType, dims: OverprintPixelDimensions): number {
  switch (type) {
    case 'start':
    case 'mapExchange':
    case 'mapFlip':
      return dims.startTriangleSide / Math.sqrt(3);
    case 'finish':
      return dims.finishOuterRadius;
    case 'crossingPoint':
      return dims.crossingPointArm * Math.SQRT2;
    default:
      return dims.circleRadius;
  }
}

interface CourseRendererProps {
  course: Course;
  controls: Record<ControlId, Control>;
  dimensions: OverprintPixelDimensions;
  selectedControlId: ControlId | null;
  draggable: boolean;
  allowLegInsert: boolean;
  /** courseId is required to enable number dragging (active course only). */
  courseId?: CourseId;
  color?: string;
  showNumbers?: boolean;
  /** White outline around control numbers (e.g., non-current controls in All Controls view) */
  numberOutline?: boolean;
  clickable?: boolean;
  /** Control IDs to skip rendering shapes for (but still use for leg positions). */
  hideControlIds?: Set<ControlId>;
  onSelectControl: (id: ControlId) => void;
  onDragControlEnd: (id: ControlId, x: number, y: number) => void;
  onInsertOnLeg?: (position: MapPoint, afterIndex: number) => void;
  onNumberDragEnd?: (controlIndex: number, offset: MapPoint) => void;
  onLongPressControl?: (controlId: ControlId, screenX: number, screenY: number) => void;
  /** Offset added to sequence numbers when rendering a course part (e.g., part 2 starts at control 6). */
  sequenceOffset?: number;
  /** Enable bend point editing on legs (active course in pan mode). */
  editLegs?: boolean;
  onAddBendPoint?: (controlIndex: number, position: MapPoint, insertAt: number) => void;
  onBendPointDragEnd?: (controlIndex: number, bendIndex: number, position: MapPoint) => void;
  onRemoveBendPoint?: (controlIndex: number, bendIndex: number) => void;
  onGapDragEnd?: (controlIndex: number, gapIndex: number, gap: LegGap) => void;
  onAddCircleGap?: (controlId: ControlId, angleDeg: number) => void;
  onUpdateCircleGap?: (controlId: ControlId, gapIndex: number, gap: CircleGap) => void;
  onRemoveCircleGap?: (controlId: ControlId, gapIndex: number) => void;
}

/**
 * Get the shape offset (radius + gap) for a control based on its type.
 * Delegates to the shared computeShapeOffset utility.
 */
function shapeOffset(
  type: Parameters<typeof computeShapeOffset>[0],
  dims: OverprintPixelDimensions,
): number {
  const screenLineWidth = dims.lineWidth * SCREEN_LINE_MULTIPLIER;
  const gap = dims.circleGap * SCREEN_LINE_MULTIPLIER;
  return computeShapeOffset(
    type,
    dims.circleRadius,
    dims.startTriangleSide,
    dims.finishOuterRadius,
    dims.crossingPointArm,
    gap,
    screenLineWidth,
  );
}

export const CourseRenderer = memo(function CourseRenderer({
  course,
  controls,
  dimensions,
  selectedControlId,
  draggable,
  allowLegInsert,
  courseId,
  color = OVERPRINT_PURPLE,
  showNumbers = true,
  numberOutline = false,
  clickable = false,
  hideControlIds,
  onSelectControl,
  onDragControlEnd,
  onInsertOnLeg,
  onNumberDragEnd,
  onLongPressControl,
  sequenceOffset = 0,
  editLegs = false,
  onAddBendPoint,
  onBendPointDragEnd,
  onRemoveBendPoint,
  onGapDragEnd,
  onAddCircleGap,
  onUpdateCircleGap,
  onRemoveCircleGap,
}: CourseRendererProps) {
  const screenLineWidth = dimensions.lineWidth * SCREEN_LINE_MULTIPLIER;

  // Resolve control positions for leg drawing — include numberOffset per-control
  const resolvedControls: Array<{
    control: Control;
    type: CourseControlType;
    index: number;
    numberOffset?: { x: number; y: number };
    score?: number;
  }> = [];

  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const control = controls[cc.controlId];
    if (control) {
      resolvedControls.push({
        control,
        type: cc.type,
        index: i,
        numberOffset: cc.numberOffset,
        score: cc.score,
      });
    }
  }

  // Auto leg-cut gaps (render-time, non-stored): cut where a leg passes through
  // another control's circle or crosses an earlier leg. Skipped for score courses.
  const autoGapsByLeg = course.courseType === 'score'
    ? ([] as (LegGap[] | undefined)[])
    : computeCourseAutoLegGaps(
        resolvedControls.map((rc, idx): AutoGapControl => ({
          position: rc.control.position,
          type: rc.type,
          bendPoints: course.controls[idx]?.bendPoints,
        })),
        (type) => controlRadius(type, dimensions),
        (type) => shapeOffset(type, dimensions),
        screenLineWidth,
        dimensions.autoLegGap,
        dimensions.autoLegGapMinEnd,
      );

  // Compute target point for start triangle (direction toward next point on leg)
  // If the first leg has bends, point toward the first bend point instead of the second control
  const firstLegBends = course.controls[0]?.bendPoints;
  const startTargetPoint = firstLegBends && firstLegBends.length > 0
    ? firstLegBends[0]!
    : resolvedControls[1]?.control.position;
  const startTarget: MapPoint | undefined =
    resolvedControls.length >= 2 && startTargetPoint
      ? {
          x: startTargetPoint.x - resolvedControls[0]!.control.position.x,
          y: startTargetPoint.y - resolvedControls[0]!.control.position.y,
        }
      : undefined;

  return (
    <>
      {/* Leg lines — drawn first so they appear behind controls.
          Score courses have no ordered legs — skip them entirely. */}
      {course.courseType !== 'score' && resolvedControls.map((curr, i) => {
        if (i === 0) return null;
        const prev = resolvedControls[i - 1]!;
        return (
          <LegLine
            key={`leg-${prev.control.id}-${curr.control.id}`}
            from={prev.control.position}
            to={curr.control.position}
            fromOffset={shapeOffset(prev.type, dimensions)}
            toOffset={shapeOffset(curr.type, dimensions)}
            lineWidth={screenLineWidth}
            color={color}
            bendPoints={course.controls[i - 1]?.bendPoints}
            legGaps={course.controls[i - 1]?.legGaps}
            autoGaps={autoGapsByLeg[i]}
            editable={editLegs}
            onInsert={
              allowLegInsert && onInsertOnLeg
                ? (pos) => onInsertOnLeg(pos, i)
                : undefined
            }
            onAddBendPoint={
              onAddBendPoint
                ? (pos, insertAt) => onAddBendPoint(i - 1, pos, insertAt)
                : undefined
            }
            onBendPointDragEnd={
              onBendPointDragEnd
                ? (bendIdx, pos) => onBendPointDragEnd(i - 1, bendIdx, pos)
                : undefined
            }
            onRemoveBendPoint={
              onRemoveBendPoint
                ? (bendIdx) => onRemoveBendPoint(i - 1, bendIdx)
                : undefined
            }
            onGapDragEnd={
              onGapDragEnd
                ? (gapIdx, gap) => onGapDragEnd(i - 1, gapIdx, gap)
                : undefined
            }
          />
        );
      })}

      {/* Control shapes — skip controls that are hidden (shared with active course) */}
      {resolvedControls.map(({ control, type, index, numberOffset, score }) => {
        if (hideControlIds?.has(control.id)) return null;

        // Compute label text from course labelMode setting
        const labelMode = course.settings.labelMode ?? 'sequence';
        const seqNum = index + sequenceOffset + 1;
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

        return (
        <ControlShape
          key={control.id}
          control={control}
          type={type}
          labelText={labelText}
          dimensions={dimensions}
          isSelected={control.id === selectedControlId}
          draggable={draggable}
          startTarget={(type === 'start' || type === 'mapExchange' || type === 'mapFlip') ? startTarget : undefined}
          color={color}
          showNumber={showNumbers}
          numberOutline={numberOutline}
          score={course.courseType === 'score' ? score : undefined}
          clickable={clickable}
          numberOffset={numberOffset}
          onSelect={() => onSelectControl(control.id)}
          onDragEnd={(x, y) => onDragControlEnd(control.id, x, y)}
          onNumberDragEnd={
            courseId && onNumberDragEnd
              ? (offset) => onNumberDragEnd(index, offset)
              : undefined
          }
          onAddCircleGap={
            courseId && onAddCircleGap
              ? (angleDeg) => onAddCircleGap(control.id, angleDeg)
              : undefined
          }
          onUpdateCircleGap={
            courseId && onUpdateCircleGap
              ? (gapIndex, gap) => onUpdateCircleGap(control.id, gapIndex, gap)
              : undefined
          }
          onRemoveCircleGap={
            courseId && onRemoveCircleGap
              ? (gapIndex) => onRemoveCircleGap(control.id, gapIndex)
              : undefined
          }
          onLongPress={
            onLongPressControl
              ? (screenX, screenY) => onLongPressControl(control.id, screenX, screenY)
              : undefined
          }
        />
        );
      })}
    </>
  );
});
