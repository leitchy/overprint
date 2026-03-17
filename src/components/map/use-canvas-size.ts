import { useEffect, useRef, useState } from 'react';

interface Size {
  width: number;
  height: number;
}

export function useCanvasSize(): [React.RefObject<HTMLDivElement | null>, Size] {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return [containerRef, size];
}
