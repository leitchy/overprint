import { Circle } from 'react-konva';
import { OVERPRINT_PURPLE } from '@/core/models/constants';

interface FinishCirclesProps {
  outerRadius: number;
  innerRadius: number;
  lineWidth: number;
  color?: string;
}

export function FinishCircles({ outerRadius, innerRadius, lineWidth, color = OVERPRINT_PURPLE }: FinishCirclesProps) {
  return (
    <>
      <Circle
        radius={outerRadius}
        stroke={color}
        strokeWidth={lineWidth}
        fill="transparent"
        listening={false}
      />
      <Circle
        radius={innerRadius}
        stroke={color}
        strokeWidth={lineWidth}
        fill="transparent"
        listening={false}
      />
    </>
  );
}
