/**
 * GPS Position Layer — Konva layer rendering the GPS blue dot and accuracy circle.
 *
 * Renders above the course overprint layer, below special items.
 * Non-interactive (listening={false}).
 *
 * Visual elements:
 * - Accuracy circle: semi-transparent blue fill + blue stroke
 * - White outer ring (14px) for contrast on all map backgrounds
 * - Blue inner dot (10px) — colour varies by status
 * - Not rendered when GPS is inactive or has no map point
 */

import { Layer, Circle, Group } from 'react-konva';
import { useGpsStore } from '@/stores/gps-store';
import type { GpsStatus } from '@/stores/gps-store';

// GPS colour constants (from UX spec section 12)
const GPS_BLUE = '#3B82F6';
const GPS_AMBER = '#F59E0B';
const GPS_RED = '#EF4444';
const GPS_GREY = '#9CA3AF';
const ACCURACY_FILL = 'rgba(59, 130, 246, 0.12)';
const ACCURACY_STROKE = 'rgba(59, 130, 246, 0.35)';

function dotColor(status: GpsStatus): string {
  switch (status) {
    case 'active': return GPS_BLUE;
    case 'poor-signal': return GPS_AMBER;
    case 'lost': return GPS_RED;
    case 'acquiring': return GPS_GREY;
    default: return GPS_BLUE;
  }
}

export function GpsPositionLayer() {
  const mapPoint = useGpsStore((s) => s.mapPoint);
  const accuracyRadiusPx = useGpsStore((s) => s.accuracyRadiusPx);
  const status = useGpsStore((s) => s.status);
  const enabled = useGpsStore((s) => s.enabled);

  if (!enabled || !mapPoint) return null;

  const showAccuracyCircle = accuracyRadiusPx !== null && accuracyRadiusPx > 0 && accuracyRadiusPx < 5000;

  return (
    <Layer listening={false}>
      <Group x={mapPoint.x} y={mapPoint.y}>
        {/* Accuracy circle */}
        {showAccuracyCircle && (
          <Circle
            radius={accuracyRadiusPx!}
            fill={ACCURACY_FILL}
            stroke={ACCURACY_STROKE}
            strokeWidth={1.5}
            perfectDrawEnabled={false}
          />
        )}

        {/* White outer ring for contrast */}
        <Circle
          radius={7}
          fill="white"
          perfectDrawEnabled={false}
        />

        {/* Coloured inner dot */}
        <Circle
          radius={5}
          fill={dotColor(status)}
          perfectDrawEnabled={false}
        />
      </Group>
    </Layer>
  );
}
