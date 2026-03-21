import { memo } from 'react';
import { Line, Circle, Group } from 'react-konva';
import type Konva from 'konva';
import type { MapPoint, LegGap } from '@/core/models/types';
import { OVERPRINT_PURPLE } from '@/core/models/constants';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';
import { buildLegPath, splitPathByGaps, nearestSegmentIndex } from '@/core/geometry/leg-path';

interface LegLineProps {
  from: MapPoint;
  to: MapPoint;
  fromOffset: number;
  toOffset: number;
  lineWidth: number;
  color?: string;
  bendPoints?: MapPoint[];
  legGaps?: LegGap[];
  editable?: boolean;
  onInsert?: (position: MapPoint) => void;
  onAddBendPoint?: (position: MapPoint, insertIndex: number) => void;
  onBendPointDragEnd?: (index: number, position: MapPoint) => void;
  onRemoveBendPoint?: (index: number) => void;
}

/** Flatten a MapPoint array into Konva's flat [x1,y1,x2,y2,...] format. */
function flattenPoints(points: MapPoint[]): number[] {
  const result: number[] = [];
  for (const p of points) {
    result.push(p.x, p.y);
  }
  return result;
}

export const LegLine = memo(function LegLine({
  from, to, fromOffset, toOffset, lineWidth,
  color = OVERPRINT_PURPLE,
  bendPoints, legGaps, editable = false,
  onInsert, onAddBendPoint, onBendPointDragEnd, onRemoveBendPoint,
}: LegLineProps) {
  const hasBends = bendPoints && bendPoints.length > 0;

  // Build the polyline path (or straight leg for no bends)
  let path: MapPoint[] | null;
  if (hasBends) {
    path = buildLegPath(from, to, bendPoints, fromOffset, toOffset);
  } else {
    const endpoints = shortenedLeg(from, to, fromOffset, toOffset);
    path = endpoints ? [endpoints[0], endpoints[1]] : null;
  }

  if (!path) return null;

  // Split by gaps if any
  const subPaths = legGaps && legGaps.length > 0
    ? splitPathByGaps(path, legGaps)
    : [path];

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    if (onInsert) {
      onInsert({ x: pos.x, y: pos.y });
    }
  };

  const handleLegClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!onAddBendPoint || !path) return;
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    // Find which segment was clicked and insert the bend point there
    // The full point sequence (with bends) is [from, ...bends, to]
    const fullPath = [from, ...(bendPoints ?? []), to];
    const segIdx = nearestSegmentIndex(fullPath, pos);
    // insertIndex is relative to the bendPoints array (not the full path)
    // segment 0 = from→bend[0] (or from→to), insert at bend index 0
    // segment 1 = bend[0]→bend[1], insert at bend index 1
    onAddBendPoint({ x: pos.x, y: pos.y }, segIdx);
  };

  const handleInsertTap = () => {
    if (!onInsert) return;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    onInsert({ x: midX, y: midY });
  };

  // Determine which click handler to use based on mode
  const isInsertMode = !!onInsert;
  const isBendMode = editable && !!onAddBendPoint && !isInsertMode;

  return (
    <Group>
      {/* Render the leg line(s) — one per visible sub-path */}
      {subPaths.map((subPath, i) => (
        <Line
          key={i}
          points={flattenPoints(subPath)}
          stroke={color}
          strokeWidth={lineWidth}
          hitStrokeWidth={20}
          listening={isInsertMode || isBendMode}
          onClick={isInsertMode ? handleClick : isBendMode ? handleLegClick : undefined}
          onTap={isInsertMode ? handleInsertTap : undefined}
          onMouseEnter={(e) => {
            if (isInsertMode || isBendMode) {
              const container = e.target.getStage()?.container();
              if (container) container.style.cursor = isInsertMode ? 'copy' : 'crosshair';
            }
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
      ))}

      {/* Bend point handles — visible when editable */}
      {editable && bendPoints?.map((bp, i) => (
        <Circle
          key={`bend-${i}`}
          x={bp.x}
          y={bp.y}
          radius={5}
          fill="white"
          stroke={color}
          strokeWidth={2}
          draggable
          hitStrokeWidth={16}
          perfectDrawEnabled={false}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            onBendPointDragEnd?.(i, { x: e.target.x(), y: e.target.y() });
          }}
          onClick={(e) => {
            e.cancelBubble = true;
          }}
          onDblClick={(e) => {
            e.cancelBubble = true;
            onRemoveBendPoint?.(i);
          }}
          onDblTap={(e) => {
            e.cancelBubble = true;
            onRemoveBendPoint?.(i);
          }}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'grab';
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = '';
          }}
        />
      ))}
    </Group>
  );
});
