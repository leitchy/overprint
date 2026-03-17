import { Circle, Rect, Text, Group } from 'react-konva';
import type { Control, CourseControlType, MapPoint } from '@/core/models/types';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { StartTriangle } from './start-triangle';
import { FinishCircles } from './finish-circles';

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
  color?: string;
  showNumber?: boolean;
  clickable?: boolean; // shows copy cursor on hover (for background control reuse)
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
  color = '#CD59A4',
  showNumber = true,
  clickable = false,
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
        if (container) {
          if (draggable) {
            container.style.cursor = 'pointer';
          } else if (clickable) {
            container.style.cursor = 'copy';
          }
        }
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) {
          // Reset to '' — the map-canvas useEffect restores the tool cursor
          container.style.cursor = '';
        }
      }}
    >
      {/* Hit region for background course controls — ensures finish/start
          types (which have listening={false} on their shapes) are clickable
          for shared control reuse. Only rendered when clickable. */}
      {clickable && (
        <Rect
          x={-selectionRadius}
          y={-selectionRadius}
          width={selectionRadius * 2}
          height={selectionRadius * 2}
          fill="#000"
          opacity={0.001}
        />
      )}

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
          color={color}
        />
      ) : type === 'finish' ? (
        <FinishCircles
          outerRadius={dimensions.finishOuterRadius}
          innerRadius={dimensions.finishInnerRadius}
          lineWidth={screenLineWidth}
          color={color}
        />
      ) : (
        <Circle
          radius={circleRadius}
          stroke={color}
          strokeWidth={screenLineWidth}
          fill="transparent"
        />
      )}

      {/* Control sequence number */}
      {showNumber && (
        <Text
          text={String(sequenceNumber)}
          x={selectionRadius + screenLineWidth}
          y={-(numberSize * 0.6)}
          fontSize={numberSize * 1.2}
          fill={color}
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
}
