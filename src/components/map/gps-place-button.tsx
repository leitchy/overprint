/**
 * Floating "Place at GPS" button for tablet and desktop.
 *
 * Shows at the bottom-center of the map canvas when:
 * - GPS is active (has a map point)
 * - addControl tool is selected
 * - Not on phone (phone uses the CenterReticle GPS mode)
 *
 * Uses fresh position at the moment of placement.
 */

import { useGpsStore } from '@/stores/gps-store';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { useToastStore } from '@/stores/toast-store';
import { useT } from '@/i18n/use-t';
import { hapticTap } from '@/utils/haptics';

export function GpsPlaceButton() {
  const t = useT();
  const enabled = useGpsStore((s) => s.enabled);
  const status = useGpsStore((s) => s.status);
  const mapPoint = useGpsStore((s) => s.mapPoint);
  const position = useGpsStore((s) => s.position);
  const activeTool = useToolStore((s) => s.activeTool);

  const gpsReady = enabled && mapPoint !== null && (status === 'active' || status === 'poor-signal');
  const isAddControl = activeTool.type === 'addControl';

  if (!gpsReady || !isAddControl) return null;

  const accuracy = position?.accuracy ? Math.round(position.accuracy) : null;
  const isPoor = status === 'poor-signal';

  const handlePlace = () => {
    if (!mapPoint) return;
    useEventStore.getState().addControlToCourse({ x: mapPoint.x, y: mapPoint.y });
    hapticTap();
    useToastStore.getState().addToast(t('controlPlaced'));
  };

  const label = isPoor && accuracy
    ? `Place at GPS (\u00b1${accuracy}m)`
    : t('gpsPlaceAtGps');

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
      <button
        onClick={handlePlace}
        className={`rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg ${
          isPoor ? 'bg-amber-500 active:bg-amber-600' : 'bg-blue-600 active:bg-blue-700'
        }`}
      >
        {label}
      </button>
    </div>
  );
}
