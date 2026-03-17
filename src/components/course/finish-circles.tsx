import { Circle } from 'react-konva';

const PURPLE = '#CD59A4';

interface FinishCirclesProps {
  outerRadius: number;
  innerRadius: number;
  lineWidth: number;
}

export function FinishCircles({ outerRadius, innerRadius, lineWidth }: FinishCirclesProps) {
  return (
    <>
      <Circle
        radius={outerRadius}
        stroke={PURPLE}
        strokeWidth={lineWidth}
        fill="transparent"
        listening={false}
      />
      <Circle
        radius={innerRadius}
        stroke={PURPLE}
        strokeWidth={lineWidth}
        fill="transparent"
        listening={false}
      />
    </>
  );
}
