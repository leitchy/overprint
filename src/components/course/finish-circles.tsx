import { Circle } from 'react-konva';

interface FinishCirclesProps {
  outerRadius: number;
  innerRadius: number;
  lineWidth: number;
  color?: string;
}

export function FinishCircles({ outerRadius, innerRadius, lineWidth, color = '#CD59A4' }: FinishCirclesProps) {
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
