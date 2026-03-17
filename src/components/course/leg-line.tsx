import { Line } from 'react-konva';
import type Konva from 'konva';
import type { MapPoint } from '@/core/models/types';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';

const PURPLE = '#CD59A4';

interface LegLineProps {
  from: MapPoint;
  to: MapPoint;
  fromOffset: number;
  toOffset: number;
  lineWidth: number;
  onInsert?: (position: MapPoint) => void;
}

export function LegLine({ from, to, fromOffset, toOffset, lineWidth, onInsert }: LegLineProps) {
  const endpoints = shortenedLeg(from, to, fromOffset, toOffset);
  if (!endpoints) return null;

  const [start, end] = endpoints;

  const handleInsert = () => {
    if (!onInsert) return;
    // Use midpoint of the leg as insertion position
    // (the click position is hard to get reliably from tap events)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    onInsert({ x: midX, y: midY });
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!onInsert) return;
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (pos) {
      onInsert({ x: pos.x, y: pos.y });
    }
  };

  return (
    <Line
      points={[start.x, start.y, end.x, end.y]}
      stroke={PURPLE}
      strokeWidth={lineWidth}
      hitStrokeWidth={20}
      listening={!!onInsert}
      onClick={handleClick}
      onTap={() => handleInsert()}
      onMouseEnter={(e) => {
        if (onInsert) {
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = 'copy';
        }
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = '';
      }}
    />
  );
}
