import { useEffect, useRef, useState, type MutableRefObject } from 'react';

interface Size {
  width: number;
  height: number;
}

export function useCanvasSize(
  gestureActiveRef?: MutableRefObject<boolean>,
): [React.RefObject<HTMLDivElement | null>, Size] {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  // Hold pending size during gesture, apply when gesture ends
  const pendingSizeRef = useRef<Size | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        if (gestureActiveRef?.current) {
          // Defer the update — applying it now would re-render the Stage
          // and reset the Konva transform during a pinch gesture
          pendingSizeRef.current = { width, height };
        } else {
          setSize({ width, height });
          pendingSizeRef.current = null;
        }
      }
    });

    observer.observe(container);

    // Poll for deferred size updates (check every 200ms)
    const interval = setInterval(() => {
      if (pendingSizeRef.current && !gestureActiveRef?.current) {
        setSize(pendingSizeRef.current);
        pendingSizeRef.current = null;
      }
    }, 200);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [gestureActiveRef]);

  return [containerRef, size];
}
