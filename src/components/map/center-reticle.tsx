import type { RefObject } from 'react';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useEventStore } from '@/stores/event-store';
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

  const handleUndo = () => {
    useEventStore.temporal.getState().undo();
    hapticTap();
  };

  const handlePlace = () => {
    const stage = stageRef.current;
    if (!stage) return;

    // Convert screen center to map-space coordinates
    const centerX = (containerWidth / 2 - stage.x()) / stage.scaleX();
    const centerY = (containerHeight / 2 - stage.y()) / stage.scaleY();

    // addControlToCourse takes a position and handles control creation internally
    useEventStore.getState().addControlToCourse({ x: centerX, y: centerY });

    hapticTap();
    useToastStore.getState().addToast(t('controlPlaced'));
  };

  return (
    <>
      {/* Crosshair — fixed at container center, non-interactive */}
      <div
        className="pointer-events-none absolute"
        style={{ left: containerWidth / 2, top: containerHeight / 2 }}
      >
        {/* Horizontal line */}
        <div className="absolute -left-4 top-0 h-px w-3 bg-violet-500/70" />
        <div className="absolute left-1 top-0 h-px w-3 bg-violet-500/70" />
        {/* Vertical line */}
        <div className="absolute left-0 -top-4 h-3 w-px bg-violet-500/70" />
        <div className="absolute left-0 top-1 h-3 w-px bg-violet-500/70" />
        {/* Center dot */}
        <div className="absolute -left-0.5 -top-0.5 h-1 w-1 rounded-full bg-violet-500" />
        {/* Pulse ring */}
        <div className="absolute -left-3 -top-3 h-6 w-6 animate-ping rounded-full border border-violet-400/30" />
      </div>

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
        <button
          onClick={handlePlace}
          className="rounded-full bg-violet-600 px-6 py-3 text-sm font-medium text-white shadow-lg active:bg-violet-700"
        >
          {t('placeHere')}
        </button>
      </div>
    </>
  );
}
