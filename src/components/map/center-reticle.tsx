import type { RefObject } from 'react';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useEventStore } from '@/stores/event-store';
import { useGpsStore } from '@/stores/gps-store';
import { useToastStore } from '@/stores/toast-store';
import { hapticTap } from '@/utils/haptics';
import { useT } from '@/i18n/use-t';

interface CenterReticleProps {
  stageRef: RefObject<StageType | null>;
  containerWidth: number;
  containerHeight: number;
}

export function CenterReticle({ stageRef, containerWidth, containerHeight }: CenterReticleProps) {
  const t = useT();
  const canUndo = useEventStore((s) => s.event !== null && useEventStore.temporal.getState().pastStates.length > 0);

  // GPS state
  const gpsEnabled = useGpsStore((s) => s.enabled);
  const gpsStatus = useGpsStore((s) => s.status);
  const gpsMapPoint = useGpsStore((s) => s.mapPoint);
  const gpsPosition = useGpsStore((s) => s.position);

  const gpsActive = gpsEnabled && gpsMapPoint !== null && (gpsStatus === 'active' || gpsStatus === 'poor-signal');

  const handleUndo = () => {
    useEventStore.temporal.getState().undo();
    hapticTap();
  };

  const handlePlace = () => {
    const stage = stageRef.current;
    if (!stage) return;

    let mapX: number;
    let mapY: number;

    if (gpsActive && gpsMapPoint) {
      // GPS mode: place at GPS position
      mapX = gpsMapPoint.x;
      mapY = gpsMapPoint.y;
    } else {
      // Standard mode: place at screen center
      mapX = (containerWidth / 2 - stage.x()) / stage.scaleX();
      mapY = (containerHeight / 2 - stage.y()) / stage.scaleY();
    }

    useEventStore.getState().addControlToCourse({ x: mapX, y: mapY });

    hapticTap();
    useToastStore.getState().addToast(t('controlPlaced'));
  };

  // Compute crosshair screen position
  let crosshairX = containerWidth / 2;
  let crosshairY = containerHeight / 2;

  if (gpsActive && gpsMapPoint) {
    const stage = stageRef.current;
    if (stage) {
      // Convert GPS map-space coords to screen coords
      crosshairX = gpsMapPoint.x * stage.scaleX() + stage.x();
      crosshairY = gpsMapPoint.y * stage.scaleY() + stage.y();
    }
  }

  // Check if GPS crosshair is within viewport
  const gpsOffScreen = gpsActive && (
    crosshairX < 0 || crosshairX > containerWidth ||
    crosshairY < 0 || crosshairY > containerHeight
  );

  // Crosshair colour: blue in GPS mode, violet in standard mode
  const crosshairColor = gpsActive ? 'blue' : 'violet';
  const lineClass = crosshairColor === 'blue' ? 'bg-blue-500/70' : 'bg-violet-500/70';
  const dotClass = crosshairColor === 'blue' ? 'bg-blue-500' : 'bg-violet-500';
  const pingClass = crosshairColor === 'blue' ? 'border-blue-400/30' : 'border-violet-400/30';
  const buttonClass = gpsActive ? 'bg-blue-600 active:bg-blue-700' : 'bg-violet-600 active:bg-violet-700';

  const accuracy = gpsPosition?.accuracy ? Math.round(gpsPosition.accuracy) : null;
  const isPoor = gpsStatus === 'poor-signal';

  const placeLabel = gpsActive
    ? (isPoor && accuracy ? `Place anyway (\u00B1${accuracy}m)` : t('gpsPlaceAtGps'))
    : t('placeHere');

  return (
    <>
      {/* Crosshair — tracks GPS position or fixed at center */}
      {!gpsOffScreen && (
        <div
          className="pointer-events-none absolute"
          style={{ left: crosshairX, top: crosshairY }}
        >
          {/* Horizontal line */}
          <div className={`absolute -left-4 top-0 h-px w-3 ${lineClass}`} />
          <div className={`absolute left-1 top-0 h-px w-3 ${lineClass}`} />
          {/* Vertical line */}
          <div className={`absolute left-0 -top-4 h-3 w-px ${lineClass}`} />
          <div className={`absolute left-0 top-1 h-3 w-px ${lineClass}`} />
          {/* Center dot */}
          <div className={`absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full ${dotClass}`} />
          {/* Pulse ring */}
          <div className={`absolute -left-3 -top-3 h-6 w-6 animate-ping rounded-full border ${pingClass}`} />
        </div>
      )}

      {/* Action buttons — at ~65% screen height to avoid thumb occlusion */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-3"
        style={{ top: `${containerHeight * 0.65}px` }}
      >
        {canUndo && (
          <button
            onClick={handleUndo}
            className="rounded-full bg-gray-600 px-4 py-3 text-sm font-medium text-white shadow-lg active:bg-gray-700"
          >
            {t('undo')}
          </button>
        )}

        {/* Poor accuracy warning */}
        {gpsActive && isPoor && accuracy && (
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 shadow">
            Poor accuracy &mdash; &plusmn;{accuracy}m
          </span>
        )}

        <button
          onClick={handlePlace}
          disabled={gpsActive && gpsOffScreen}
          className={`rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg disabled:opacity-50 ${buttonClass}`}
        >
          {placeLabel}
        </button>
      </div>
    </>
  );
}
