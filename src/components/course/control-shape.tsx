import { memo } from 'react';
import { Circle, Rect, Text, Group } from 'react-konva';
import type { Control, CourseControlType, MapPoint } from '@/core/models/types';
import type { OverprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { OVERPRINT_PURPLE, SCREEN_LINE_MULTIPLIER } from '@/core/models/constants';
import { StartTriangle } from './start-triangle';
import { FinishCircles } from './finish-circles';
import { CrossingPoint } from './crossing-point';
import { useKonvaLongPress } from '@/hooks/use-konva-long-press';
import { hapticTap } from '@/utils/haptics';

const SELECTION_COLOR = '#FFD700';

interface ControlShapeProps {
  control: Control;
  type: CourseControlType;
  /** Resolved label text to display — empty string means no label rendered. */
  labelText: string;
  dimensions: OverprintPixelDimensions;
  isSelected: boolean;
  draggable: boolean;
  startTarget?: MapPoint; // For start triangle — direction to point toward
  color?: string;
  showNumber?: boolean;
  /** White outline around control numbers — used for non-current controls in All Controls view */
  numberOutline?: boolean;
  score?: number; // For score courses — displayed beside the control
  clickable?: boolean; // shows copy cursor on hover (for background control reuse)
  numberOffset?: MapPoint; // Current offset for the sequence number label
  onSelect?: () => void;
  onDragEnd?: (x: number, y: number) => void;
  onNumberDragEnd?: (offset: MapPoint) => void; // Called when the number label is dragged
  onLongPress?: (screenX: number, screenY: number) => void;
}

export const ControlShape = memo(function ControlShape({
  control,
  type,
  labelText,
  dimensions,
  isSelected,
  draggable,
  startTarget,
  color = OVERPRINT_PURPLE,
  showNumber = true,
  numberOutline = false,
  score,
  clickable = false,
  numberOffset,
  onSelect,
  onDragEnd,
  onNumberDragEnd,
  onLongPress,
}: ControlShapeProps) {
  const { x, y } = control.position;

  const longPress = useKonvaLongPress((screenX, screenY) => {
    hapticTap();
    onLongPress?.(screenX, screenY);
  });
  const { circleRadius, numberSize } = dimensions;
  const screenLineWidth = dimensions.lineWidth * SCREEN_LINE_MULTIPLIER;

  // Selection ring radius varies by shape type
  const selectionRadius =
    type === 'start' || type === 'mapExchange'
      ? dimensions.startTriangleSide / Math.sqrt(3) + screenLineWidth * 2
      : type === 'finish'
        ? dimensions.finishOuterRadius + screenLineWidth * 2
        : type === 'crossingPoint'
          ? dimensions.crossingPointArm * Math.SQRT2 + screenLineWidth * 2
          : circleRadius + screenLineWidth * 2;

  // Default number position (top-right of the shape)
  const defaultNumX = selectionRadius + screenLineWidth;
  const defaultNumY = -(numberSize * 0.6);

  // Apply stored offset
  const numX = defaultNumX + (numberOffset?.x ?? 0);
  const numY = defaultNumY + (numberOffset?.y ?? 0);

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
        if (longPress.longPressFiredRef.current) return;
        onSelect?.();
      }}
      onTouchStart={longPress.onTouchStart}
      onTouchMove={longPress.onTouchMove}
      onTouchEnd={longPress.onTouchEnd}
      onDragEnd={(e) => {
        // Ignore drag events bubbling up from child nodes (e.g., number text)
        if (e.target !== e.currentTarget) return;
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
      {/* Hit region for start/finish/mapExchange controls — their shapes have
          listening={false}, so the Group needs a hittable child for
          click, drag, and hover to work. Rendered when draggable
          (active course) or clickable (background reuse). */}
      {(type === 'start' || type === 'finish' || type === 'mapExchange' || type === 'crossingPoint') && (draggable || clickable) && (
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
      ) : type === 'crossingPoint' ? (
        <CrossingPoint
          armLength={dimensions.crossingPointArm * 2}
          lineWidth={screenLineWidth}
          color={color}
        />
      ) : type === 'mapExchange' ? (
        <StartTriangle
          sideLength={dimensions.startTriangleSide}
          lineWidth={screenLineWidth}
          targetPoint={startTarget}
          extraRotation={Math.PI}
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

      {/* Score value (score courses only) — shown below the sequence number */}
      {score !== undefined && (
        <Text
          text={String(score)}
          x={numX}
          y={numY + numberSize * 1.4}
          fontSize={numberSize}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* Control label (sequence number, code, both, or none) */}
      {showNumber && labelText !== '' && (
        <Text
          text={labelText}
          x={numX}
          y={numY}
          fontSize={numberSize}
          fill={color}
          fontStyle="bold"
          stroke="#FFFFFF"
          strokeWidth={numberOutline ? 3 : 2}
          draggable={!!onNumberDragEnd}
          listening={!!onNumberDragEnd}
          onDragStart={(e) => {
            // Prevent the parent Group from also starting a drag
            e.cancelBubble = true;
          }}
          onDragEnd={(e) => {
            // e.target.x()/y() is the Text's new position relative to its
            // parent Group — already in the correct coordinate space.
            const newOffset: MapPoint = {
              x: e.target.x() - defaultNumX,
              y: e.target.y() - defaultNumY,
            };
            onNumberDragEnd?.(newOffset);
          }}
          onMouseEnter={(e) => {
            if (onNumberDragEnd) {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
      )}
    </Group>
  );
});
