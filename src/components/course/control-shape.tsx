import { Circle, Text, Group } from 'react-konva';
import type { Control, CourseControlType, MapPoint } from '@/core/models/types';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { StartTriangle } from './start-triangle';
import { FinishCircles } from './finish-circles';

const PURPLE = '#CD59A4';
const SELECTION_COLOR = '#FFD700';

// On-screen line width multiplier — IOF print spec (0.35mm) is too thin
// at screen DPI. PurplePen also renders thicker on screen.
// Exact IOF dimensions will be used for PDF export only.
const SCREEN_LINE_MULTIPLIER = 3;

interface ControlShapeProps {
  control: Control;
  type: CourseControlType;
  sequenceNumber: number;
  dimensions: OverprintPixelDimensions;
  isSelected: boolean;
  draggable: boolean;
  startTarget?: MapPoint; // For start triangle — direction to point toward
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
  startTarget,
  onSelect,
  onDragEnd,
}: ControlShapeProps) {
  const { x, y } = control.position;
  const { circleRadius, numberSize } = dimensions;
  const screenLineWidth = dimensions.lineWidth * SCREEN_LINE_MULTIPLIER;

  // Selection ring radius varies by shape type
  const selectionRadius =
    type === 'start'
      ? dimensions.startTriangleSide / Math.sqrt(3) + screenLineWidth * 2
      : type === 'finish'
        ? dimensions.finishOuterRadius + screenLineWidth * 2
        : circleRadius + screenLineWidth * 2;

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
          radius={selectionRadius}
          stroke={SELECTION_COLOR}
          strokeWidth={screenLineWidth}
          dash={[6, 4]}
          listening={false}
        />
      )}

      {/* Shape based on control type */}
      {type === 'start' ? (
        <StartTriangle
          sideLength={dimensions.startTriangleSide}
          lineWidth={screenLineWidth}
          targetPoint={startTarget}
        />
      ) : type === 'finish' ? (
        <FinishCircles
          outerRadius={dimensions.finishOuterRadius}
          innerRadius={dimensions.finishInnerRadius}
          lineWidth={screenLineWidth}
        />
      ) : (
        <Circle
          radius={circleRadius}
          stroke={PURPLE}
          strokeWidth={screenLineWidth}
          fill="transparent"
        />
      )}

      {/* Control sequence number */}
      <Text
        text={String(sequenceNumber)}
        x={selectionRadius + screenLineWidth}
        y={-(numberSize * 0.6)}
        fontSize={numberSize * 1.2}
        fill={PURPLE}
        fontStyle="bold"
        listening={false}
      />
    </Group>
  );
}
