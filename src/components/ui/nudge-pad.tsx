import { useRef, useCallback, useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import { hapticTap } from '@/utils/haptics';

const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 80;

type Direction = 'up' | 'down' | 'left' | 'right';

const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const ARROWS: Record<Direction, string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
};

export function NudgePad() {
  const dpi = useEventStore((s) => s.event?.mapFile?.dpi ?? 150);
  const selectedControlId = useEventStore((s) => s.selectedControlId);

  // 1mm in map-space pixels
  const nudgeAmount = dpi / 25.4;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    pressedRef.current = false;
  }, []);

  // Window-level cleanup for finger-slide-off
  useEffect(() => {
    const stop = () => clearTimers();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      clearTimers();
    };
  }, [clearTimers]);

  const nudge = useCallback((direction: Direction) => {
    const store = useEventStore.getState();
    const controlId = store.selectedControlId;
    if (!controlId || !store.event) return;

    const control = store.event.controls[controlId];
    if (!control) return;

    const { dx, dy } = DELTAS[direction];
    store.updateControlPosition(controlId, {
      x: control.position.x + dx * nudgeAmount,
      y: control.position.y + dy * nudgeAmount,
    });
  }, [nudgeAmount]);

  const handlePointerDown = useCallback((direction: Direction) => {
    pressedRef.current = true;
    nudge(direction);
    hapticTap();

    // Two-phase repeat: initial delay, then fast interval
    timeoutRef.current = setTimeout(() => {
      if (!pressedRef.current) return;
      intervalRef.current = setInterval(() => {
        nudge(direction);
      }, REPEAT_INTERVAL);
    }, INITIAL_DELAY);
  }, [nudge]);

  const handlePointerUp = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  if (!selectedControlId) return null;

  const btn = (direction: Direction) => (
    <button
      className="flex min-h-(--touch-target-min) min-w-(--touch-target-min) items-center justify-center rounded bg-white/90 text-gray-600 shadow active:bg-gray-100"
      onPointerDown={() => handlePointerDown(direction)}
      onPointerUp={handlePointerUp}
      title={direction}
    >
      {ARROWS[direction]}
    </button>
  );

  return (
    <div className="absolute bottom-20 left-4 z-20 grid grid-cols-3 gap-0.5">
      <div /> {/* empty top-left */}
      {btn('up')}
      <div /> {/* empty top-right */}
      {btn('left')}
      <div /> {/* empty center */}
      {btn('right')}
      <div /> {/* empty bottom-left */}
      {btn('down')}
      <div /> {/* empty bottom-right */}
    </div>
  );
}
