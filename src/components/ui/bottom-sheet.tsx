import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Snap points as fractions of viewport height, e.g. [0.4, 0.85] */
  snapPoints?: number[];
  /** Initial snap index (defaults to 0 — first snap point) */
  initialSnap?: number;
  /** Show backdrop scrim */
  showScrim?: boolean;
  children: ReactNode;
}

const VELOCITY_DISMISS = 800; // px/s downward velocity to dismiss

export function BottomSheet({
  open,
  onClose,
  snapPoints = [0.5],
  initialSnap = 0,
  showScrim = true,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    startY: 0,
    startHeight: 0,
    isDragging: false,
    lastY: 0,
    lastTime: 0,
  });

  // Track current sheet height as state so the content area gets a real height
  const [sheetHeight, setSheetHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  const getSnapHeight = useCallback(
    (index: number) => {
      const point = snapPoints[Math.min(index, snapPoints.length - 1)] ?? 0.5;
      return Math.round(window.innerHeight * point);
    },
    [snapPoints],
  );

  // Open animation
  useEffect(() => {
    if (open) {
      // Start at 0 height, then animate to snap point
      setSheetHeight(0);
      setVisible(true);
      // Delay to allow mount, then animate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSheetHeight(getSnapHeight(initialSnap));
        });
      });
    } else {
      setSheetHeight(0);
      // Keep mounted briefly for close animation
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open, getSnapHeight, initialSnap]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current.isDragging = true;
      dragRef.current.startY = e.clientY;
      dragRef.current.startHeight = sheetHeight;
      dragRef.current.lastY = e.clientY;
      dragRef.current.lastTime = Date.now();
    },
    [sheetHeight],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;

    const deltaY = dragRef.current.startY - e.clientY; // positive = dragging up
    const maxHeight = Math.round(window.innerHeight * 0.9);
    const newHeight = Math.max(0, Math.min(maxHeight, dragRef.current.startHeight + deltaY));

    setSheetHeight(newHeight);
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastTime = Date.now();
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      // Calculate velocity (positive = dragging down / closing)
      const dt = Math.max(Date.now() - dragRef.current.lastTime, 1);
      const dy = e.clientY - dragRef.current.lastY;
      const velocity = (dy / dt) * 1000;

      const currentHeight = sheetHeight;
      const vh = window.innerHeight;

      // Dismiss if swiped down fast enough or sheet is very small
      if (velocity > VELOCITY_DISMISS || currentHeight < vh * 0.1) {
        onClose();
        return;
      }

      // Snap to nearest snap point
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < snapPoints.length; i++) {
        const snapH = Math.round(vh * (snapPoints[i] ?? 0));
        const dist = Math.abs(currentHeight - snapH);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      setSheetHeight(getSnapHeight(bestIndex));
    },
    [onClose, snapPoints, getSnapHeight, sheetHeight],
  );

  // Escape key dismisses the sheet
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!visible && !open) return null;

  return createPortal(
    <>
      {/* Scrim */}
      {showScrim && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          style={{ opacity: sheetHeight > 0 ? 1 : 0, transition: 'opacity 200ms' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sheet — height-driven instead of transform-driven */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{
          height: sheetHeight > 0 ? `${sheetHeight}px` : '0px',
          transition: dragRef.current.isDragging ? 'none' : 'height 200ms ease-out',
          borderTopLeftRadius: 'var(--sheet-border-radius)',
          borderTopRightRadius: 'var(--sheet-border-radius)',
          paddingBottom: 'var(--safe-bottom)',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle — touch-none so it doesn't conflict with content scroll */}
        <div
          className="flex shrink-0 justify-center py-3 touch-none cursor-grab"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div
            className="rounded-full bg-gray-300"
            style={{
              width: 'var(--sheet-handle-width)',
              height: 'var(--sheet-handle-height)',
            }}
          />
        </div>

        {/* Content — scrollable with normal touch */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
