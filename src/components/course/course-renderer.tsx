import { Fragment } from 'react';
import type { Course, Control, CourseControlType, MapPoint } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { ControlShape } from './control-shape';
import { LegLine } from './leg-line';

const SCREEN_LINE_MULTIPLIER = 3;

interface CourseRendererProps {
  course: Course;
  controls: Record<ControlId, Control>;
  dimensions: OverprintPixelDimensions;
  selectedControlId: ControlId | null;
  draggable: boolean;
  onSelectControl: (id: ControlId) => void;
  onDragControlEnd: (id: ControlId, x: number, y: number) => void;
}

/**
 * Get the shape offset (radius + gap) for a control based on its type.
 * Used to shorten leg lines so they don't enter the shape.
 */
function shapeOffset(
  type: CourseControlType,
  dims: OverprintPixelDimensions,
): number {
  const screenLineWidth = dims.lineWidth * SCREEN_LINE_MULTIPLIER;
  const gap = dims.circleGap * SCREEN_LINE_MULTIPLIER;

  switch (type) {
    case 'start':
      // Triangle circumradius
      return dims.startTriangleSide / Math.sqrt(3) + gap + screenLineWidth / 2;
    case 'finish':
      return dims.finishOuterRadius + gap + screenLineWidth / 2;
    default:
      return dims.circleRadius + gap + screenLineWidth / 2;
  }
}

export function CourseRenderer({
  course,
  controls,
  dimensions,
  selectedControlId,
  draggable,
  onSelectControl,
  onDragControlEnd,
}: CourseRendererProps) {
  const screenLineWidth = dimensions.lineWidth * SCREEN_LINE_MULTIPLIER;

  // Resolve control positions for leg drawing
  const resolvedControls: Array<{
    control: Control;
    type: CourseControlType;
    index: number;
  }> = [];

  for (let i = 0; i < course.controls.length; i++) {
    const cc = course.controls[i]!;
    const control = controls[cc.controlId];
    if (control) {
      resolvedControls.push({ control, type: cc.type, index: i });
    }
  }

  // Compute target point for start triangle (position of next control, relative to start)
  const startTarget: MapPoint | undefined =
    resolvedControls.length >= 2
      ? {
          x: resolvedControls[1]!.control.position.x - resolvedControls[0]!.control.position.x,
          y: resolvedControls[1]!.control.position.y - resolvedControls[0]!.control.position.y,
        }
      : undefined;

  return (
    <>
      {/* Leg lines — drawn first so they appear behind controls */}
      {resolvedControls.map((curr, i) => {
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
          />
        );
      })}

      {/* Control shapes */}
      {resolvedControls.map(({ control, type, index }) => (
        <Fragment key={control.id}>
          <ControlShape
            control={control}
            type={type}
            sequenceNumber={index + 1}
            dimensions={dimensions}
            isSelected={control.id === selectedControlId}
            draggable={draggable}
            startTarget={type === 'start' ? startTarget : undefined}
            onSelect={() => onSelectControl(control.id)}
            onDragEnd={(x, y) => onDragControlEnd(control.id, x, y)}
          />
        </Fragment>
      ))}
    </>
  );
}
