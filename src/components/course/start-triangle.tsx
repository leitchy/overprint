import { Line } from 'react-konva';
import type { MapPoint } from '@/core/models/types';

interface StartTriangleProps {
  sideLength: number;
  lineWidth: number;
  targetPoint?: MapPoint; // First regular control — triangle points toward it
  color?: string;
}

/**
 * Equilateral triangle vertices centered at (0,0), with one vertex pointing
 * toward the target. If no target, points upward.
 */
function trianglePoints(side: number, target?: MapPoint): number[] {
  // Angle from origin toward target (or upward by default)
  const angle = target
    ? Math.atan2(target.y, target.x)
    : -Math.PI / 2; // upward

  // Circumradius of equilateral triangle = side / sqrt(3)
  const r = side / Math.sqrt(3);

  const points: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * 2 * Math.PI) / 3;
    points.push(r * Math.cos(a), r * Math.sin(a));
  }
  return points;
}

export function StartTriangle({ sideLength, lineWidth, targetPoint, color = '#CD59A4' }: StartTriangleProps) {
  const points = trianglePoints(sideLength, targetPoint);

  return (
    <Line
      points={points}
      closed
      stroke={color}
      strokeWidth={lineWidth}
      fill="transparent"
      listening={false}
    />
  );
}
