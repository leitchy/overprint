import { Line } from 'react-konva';
import { OVERPRINT_PURPLE } from '@/core/models/constants';

interface CrossingPointProps {
  armLength: number;
  lineWidth: number;
  color?: string;
}

/**
 * IOF crossing point symbol — an X shape centered at (0,0).
 * Two diagonal lines at ±45°. IOF spec: arms are 6mm wide at 45°.
 */
export function CrossingPoint({ armLength, lineWidth, color = OVERPRINT_PURPLE }: CrossingPointProps) {
  const half = armLength / 2;

  return (
    <>
      <Line
        points={[-half, -half, half, half]}
        stroke={color}
        strokeWidth={lineWidth}
        listening={false}
      />
      <Line
        points={[-half, half, half, -half]}
        stroke={color}
        strokeWidth={lineWidth}
        listening={false}
      />
    </>
  );
}
