import { Circle, Text, Group } from 'react-konva';
import type { Control, CourseControlType } from '@/core/models/types';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';

const PURPLE = '#CD59A4';
const SELECTION_COLOR = '#FFD700';

interface ControlShapeProps {
  control: Control;
  type: CourseControlType;
  sequenceNumber: number;
  dimensions: OverprintPixelDimensions;
  isSelected: boolean;
  draggable: boolean;
  onSelect?: () => void;
  onDragEnd?: (x: number, y: number) => void;
}

export function ControlShape({
  control,
  type,
  sequenceNumber,
  dimensions,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
}: ControlShapeProps) {
  const { x, y } = control.position;
  const { circleRadius, lineWidth, numberSize } = dimensions;

  // For now, render all types as circles (start triangle + finish circles in Step 4)
  const isRegularControl = type === 'control';
  const showCode = isRegularControl || type === 'start' || type === 'finish';

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect?.();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect?.();
      }}
      onDragEnd={(e) => {
        onDragEnd?.(e.target.x(), e.target.y());
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage()?.container();
        if (container && draggable) {
          container.style.cursor = 'pointer';
        }
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) {
          container.style.cursor = '';
        }
      }}
    >
      {/* Selection highlight ring */}
      {isSelected && (
        <Circle
          radius={circleRadius + lineWidth * 3}
          stroke={SELECTION_COLOR}
          strokeWidth={lineWidth}
          dash={[6, 4]}
          listening={false}
        />
      )}

      {/* Control circle */}
      <Circle
        radius={circleRadius}
        stroke={PURPLE}
        strokeWidth={lineWidth}
        fill="transparent"
      />

      {/* Control code number */}
      {showCode && (
        <Text
          text={String(sequenceNumber)}
          x={circleRadius + lineWidth * 2}
          y={-(numberSize / 2)}
          fontSize={numberSize}
          fill={PURPLE}
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
}
