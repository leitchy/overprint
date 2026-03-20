import { useRef, useCallback } from 'react';
import type Konva from 'konva';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;

interface LongPressHandlers {
  onTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onTouchEnd: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  /** Check this in onTap handler — if true, suppress the tap */
  longPressFiredRef: React.MutableRefObject<boolean>;
}

/**
 * Konva-specific long-press detection.
 * Cancels on movement >10px, second finger, or touchend before threshold.
 */
export function useKonvaLongPress(
  onLongPress: (screenX: number, screenY: number) => void,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const longPressFiredRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      // Only track single-finger touches
      if (touches.length !== 1) {
        cancel();
        return;
      }

      const touch = touches[0]!;
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      longPressFiredRef.current = false;

      timerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        timerRef.current = null;
        onLongPress(touch.clientX, touch.clientY);
      }, LONG_PRESS_MS);
    },
    [onLongPress, cancel],
  );

  const onTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (!timerRef.current) return;
      const touches = e.evt.touches;
      // Cancel on second finger
      if (touches.length !== 1) {
        cancel();
        return;
      }
      const touch = touches[0]!;
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD_PX) {
        cancel();
      }
    },
    [cancel],
  );

  const onTouchEnd = useCallback(
    (_e: Konva.KonvaEventObject<TouchEvent>) => {
      cancel();
      // Reset the fired flag after a short delay so onTap sees it
      if (longPressFiredRef.current) {
        setTimeout(() => {
          longPressFiredRef.current = false;
        }, 100);
      }
    },
    [cancel],
  );

  return { onTouchStart, onTouchMove, onTouchEnd, longPressFiredRef };
}
