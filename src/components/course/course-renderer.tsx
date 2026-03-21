import { memo } from 'react';
import type { Course, Control, CourseControlType, MapPoint } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { OVERPRINT_PURPLE, SCREEN_LINE_MULTIPLIER } from '@/core/models/constants';
import { computeShapeOffset } from '@/core/geometry/shape-offset';
import { ControlShape } from './control-shape';
import { LegLine } from './leg-line';

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
  clickable?: boolean;
  /** Control IDs to skip rendering shapes for (but still use for leg positions). */
  hideControlIds?: Set<ControlId>;
  onSelectControl: (id: ControlId) => void;
  onDragControlEnd: (id: ControlId, x: number, y: number) => void;
  onInsertOnLeg?: (position: MapPoint, afterIndex: number) => void;
  onNumberDragEnd?: (controlIndex: number, offset: MapPoint) => void;
  onLongPressControl?: (controlId: ControlId, screenX: number, screenY: number) => void;
  /** Enable bend point editing on legs (active course in pan mode). */
  editLegs?: boolean;
  onAddBendPoint?: (controlIndex: number, position: MapPoint, insertAt: number) => void;
  onBendPointDragEnd?: (controlIndex: number, bendIndex: number, position: MapPoint) => void;
  onRemoveBendPoint?: (controlIndex: number, bendIndex: number) => void;
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
  clickable = false,
  hideControlIds,
  onSelectControl,
  onDragControlEnd,
  onInsertOnLeg,
  onNumberDragEnd,
  onLongPressControl,
  editLegs = false,
  onAddBendPoint,
  onBendPointDragEnd,
  onRemoveBendPoint,
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
          />
        );
      })}

      {/* Control shapes — skip controls that are hidden (shared with active course) */}
      {resolvedControls.map(({ control, type, index, numberOffset, score }) => {
        if (hideControlIds?.has(control.id)) return null;

        // Compute label text from course labelMode setting
        const labelMode = course.settings.labelMode ?? 'sequence';
        let labelText: string;
        if (labelMode === 'sequence') {
          labelText = String(index + 1);
        } else if (labelMode === 'code') {
          labelText = String(control.code);
        } else if (labelMode === 'both') {
          labelText = `${index + 1} (${control.code})`;
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
          startTarget={(type === 'start' || type === 'mapExchange') ? startTarget : undefined}
          color={color}
          showNumber={showNumbers}
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
