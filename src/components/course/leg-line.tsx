import { memo, useState, useCallback } from 'react';
import { Line, Circle, Rect, Group } from 'react-konva';
import type Konva from 'konva';
import type { MapPoint, LegGap } from '@/core/models/types';
import { OVERPRINT_PURPLE } from '@/core/models/constants';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';
import { buildLegPath, splitPathByGaps, nearestSegmentIndex, pointAtDistance, polylineLength } from '@/core/geometry/leg-path';


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
  onGapDragEnd?: (gapIndex: number, gap: LegGap) => void;
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
  onInsert, onAddBendPoint, onBendPointDragEnd, onRemoveBendPoint, onGapDragEnd,
}: LegLineProps) {
  const hasBends = bendPoints && bendPoints.length > 0;

  // Touch: pending bend position (tap leg → show "add bend" indicator, tap again to confirm)
  const [pendingBend, setPendingBend] = useState<{ pos: MapPoint; segIdx: number } | null>(null);

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

    const fullPath = [from, ...(bendPoints ?? []), to];
    const segIdx = nearestSegmentIndex(fullPath, pos);
    // Desktop: add immediately. Touch uses handleLegTap → pending confirm.
    onAddBendPoint({ x: pos.x, y: pos.y }, segIdx);
  };

  const handleConfirmBend = useCallback(() => {
    if (pendingBend && onAddBendPoint) {
      onAddBendPoint(pendingBend.pos, pendingBend.segIdx);
      setPendingBend(null);
    }
  }, [pendingBend, onAddBendPoint]);

  const handleCancelBend = useCallback(() => {
    setPendingBend(null);
  }, []);

  const handleInsertTap = () => {
    if (!onInsert) return;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    onInsert({ x: midX, y: midY });
  };

  const handleLegTap = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (!onAddBendPoint || !path) return;
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    const fullPath = [from, ...(bendPoints ?? []), to];
    const segIdx = nearestSegmentIndex(fullPath, pos);
    setPendingBend({ pos: { x: pos.x, y: pos.y }, segIdx });
  };

  // Determine which click handler to use based on mode
  const isInsertMode = !!onInsert;
  const isBendMode = editable && !!onAddBendPoint && !isInsertMode;

  // Compute gap boundary markers for rendering
  const gapMarkers = editable && legGaps && path ? legGaps.flatMap((gap, gi) => {
    const totalLen = polylineLength(path!);
    const startPt = pointAtDistance(path!, Math.min(gap.startDist, totalLen));
    const endPt = pointAtDistance(path!, Math.min(gap.endDist, totalLen));
    return [
      { gapIndex: gi, end: 'start' as const, point: startPt, dist: gap.startDist },
      { gapIndex: gi, end: 'end' as const, point: endPt, dist: gap.endDist },
    ];
  }) : [];

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
          onTap={isInsertMode ? handleInsertTap : isBendMode ? handleLegTap : undefined}
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

      {/* Touch: pending bend point indicator + confirm/cancel */}
      {pendingBend && (
        <>
          {/* Visual indicator at pending position */}
          <Circle
            x={pendingBend.pos.x}
            y={pendingBend.pos.y}
            radius={8}
            fill={color}
            opacity={0.5}
            listening={false}
          />
          {/* Confirm button (larger tap target) */}
          <Group
            x={pendingBend.pos.x}
            y={pendingBend.pos.y - 30}
          >
            {/* "Add" button background */}
            <Rect
              x={-20}
              y={-12}
              width={40}
              height={24}
              fill={color}
              cornerRadius={12}
              onClick={(e) => { e.cancelBubble = true; handleConfirmBend(); }}
              onTap={(e) => { e.cancelBubble = true; handleConfirmBend(); }}
              hitStrokeWidth={10}
            />
            {/* + symbol */}
            <Line points={[-6, 0, 6, 0]} stroke="white" strokeWidth={2} listening={false} />
            <Line points={[0, -6, 0, 6]} stroke="white" strokeWidth={2} listening={false} />
          </Group>
          {/* Cancel: tap elsewhere clears it (via stage click not bubbling) */}
          <Rect
            x={pendingBend.pos.x + 25}
            y={pendingBend.pos.y - 42}
            width={24}
            height={24}
            fill="white"
            stroke={color}
            strokeWidth={1}
            cornerRadius={12}
            onClick={(e) => { e.cancelBubble = true; handleCancelBend(); }}
            onTap={(e) => { e.cancelBubble = true; handleCancelBend(); }}
            hitStrokeWidth={10}
          />
        </>
      )}

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

      {/* Gap boundary tick marks — draggable to resize gaps */}
      {gapMarkers.map((marker) => {
        // Compute perpendicular direction for the tick mark
        // Find the direction of the path at this point
        const idx = Math.min(
          Math.floor(marker.dist / (polylineLength(path!) / Math.max(path!.length - 1, 1))),
          path!.length - 2,
        );
        const segStart = path![Math.max(0, idx)]!;
        const segEnd = path![Math.min(idx + 1, path!.length - 1)]!;
        const dx = segEnd.x - segStart.x;
        const dy = segEnd.y - segStart.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // Perpendicular direction
        const px = -dy / len;
        const py = dx / len;
        const tickLen = 5; // half-length of tick mark

        return (
          <Line
            key={`gap-${marker.gapIndex}-${marker.end}`}
            points={[
              marker.point.x + px * tickLen,
              marker.point.y + py * tickLen,
              marker.point.x - px * tickLen,
              marker.point.y - py * tickLen,
            ]}
            stroke={color}
            strokeWidth={lineWidth}
            hitStrokeWidth={20}
            draggable
            onDragEnd={(e) => {
              e.cancelBubble = true;
              if (!onGapDragEnd || !legGaps || !path) return;
              const gap = legGaps[marker.gapIndex];
              if (!gap) return;
              // Compute new distance along path from the drag end position
              const newPos = { x: e.target.x(), y: e.target.y() };
              // Find the nearest point on the path
              const totalLen = polylineLength(path);
              // Simple approximation: project onto nearest segment
              let bestDist = 0;
              let cumDist = 0;
              let bestDistSq = Infinity;
              for (let j = 1; j < path.length; j++) {
                const a = path[j - 1]!;
                const b = path[j]!;
                const segDx = b.x - a.x;
                const segDy = b.y - a.y;
                const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                if (segLen === 0) { cumDist += segLen; continue; }
                const t = Math.max(0, Math.min(1, ((newPos.x - a.x) * segDx + (newPos.y - a.y) * segDy) / (segLen * segLen)));
                const projX = a.x + t * segDx;
                const projY = a.y + t * segDy;
                const distSq = (newPos.x - projX) ** 2 + (newPos.y - projY) ** 2;
                if (distSq < bestDistSq) {
                  bestDistSq = distSq;
                  bestDist = cumDist + t * segLen;
                }
                cumDist += segLen;
              }
              const clampedDist = Math.max(0, Math.min(totalLen, bestDist));
              const updatedGap = marker.end === 'start'
                ? { startDist: clampedDist, endDist: gap.endDist }
                : { startDist: gap.startDist, endDist: clampedDist };
              // Ensure start < end
              if (updatedGap.startDist > updatedGap.endDist) {
                [updatedGap.startDist, updatedGap.endDist] = [updatedGap.endDist, updatedGap.startDist];
              }
              onGapDragEnd(marker.gapIndex, updatedGap);
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
        );
      })}
    </Group>
  );
});
