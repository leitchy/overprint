import { Line } from 'react-konva';
import type { MapPoint } from '@/core/models/types';
import { shortenedLeg } from '@/core/geometry/leg-endpoints';

const PURPLE = '#CD59A4';

interface LegLineProps {
  from: MapPoint;
  to: MapPoint;
  fromOffset: number; // Radius + gap for the "from" control shape
  toOffset: number;   // Radius + gap for the "to" control shape
  lineWidth: number;
}

export function LegLine({ from, to, fromOffset, toOffset, lineWidth }: LegLineProps) {
  const endpoints = shortenedLeg(from, to, fromOffset, toOffset);
  if (!endpoints) return null;

  const [start, end] = endpoints;

  return (
    <Line
      points={[start.x, start.y, end.x, end.y]}
      stroke={PURPLE}
      strokeWidth={lineWidth}
      hitStrokeWidth={20}
      listening={false}
    />
  );
}
