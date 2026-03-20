import { useRef, useEffect, useCallback, type ReactNode } from 'react';
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

const DISMISS_THRESHOLD = 0.15; // swipe down 15% of vh to dismiss
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
    startTranslate: 0,
    currentTranslate: 0,
    isDragging: false,
    lastY: 0,
    lastTime: 0,
  });
  const snapIndexRef = useRef(initialSnap);

  const getSnapHeight = useCallback(
    (index: number) => {
      const point = snapPoints[Math.min(index, snapPoints.length - 1)] ?? 0.5;
      return window.innerHeight * point;
    },
    [snapPoints],
  );

  // Animate to a Y position
  const animateTo = useCallback((translateY: number, duration = 200) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = `transform ${duration}ms ease-out`;
    sheet.style.transform = `translateY(${translateY}px)`;
    dragRef.current.currentTranslate = translateY;
  }, []);

  // Open/close animation
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    if (open) {
      // Start off-screen, then animate in
      const height = getSnapHeight(snapIndexRef.current);
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${window.innerHeight}px)`;
      // Force reflow
      sheet.offsetHeight;
      animateTo(window.innerHeight - height);
    } else {
      animateTo(window.innerHeight, 150);
    }
  }, [open, animateTo, getSnapHeight]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;

      // Only drag from the handle area (first 40px)
      const rect = sheet.getBoundingClientRect();
      if (e.clientY - rect.top > 40) return;

      sheet.style.transition = 'none';
      sheet.setPointerCapture(e.pointerId);

      dragRef.current.isDragging = true;
      dragRef.current.startY = e.clientY;
      dragRef.current.startTranslate = dragRef.current.currentTranslate;
      dragRef.current.lastY = e.clientY;
      dragRef.current.lastTime = Date.now();
    },
    [],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const deltaY = e.clientY - dragRef.current.startY;
    const newTranslate = dragRef.current.startTranslate + deltaY;

    // Don't allow dragging above the highest snap point
    const maxHeight = getSnapHeight(snapPoints.length - 1);
    const minTranslate = window.innerHeight - maxHeight;
    const clamped = Math.max(minTranslate, newTranslate);

    sheet.style.transform = `translateY(${clamped}px)`;
    dragRef.current.currentTranslate = clamped;
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastTime = Date.now();
  }, [getSnapHeight, snapPoints.length]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;

      const sheet = sheetRef.current;
      if (!sheet) return;
      sheet.releasePointerCapture(e.pointerId);

      // Calculate velocity
      const dt = Math.max(Date.now() - dragRef.current.lastTime, 1);
      const dy = e.clientY - dragRef.current.lastY;
      const velocity = (dy / dt) * 1000; // px/s

      const currentY = dragRef.current.currentTranslate;
      const vh = window.innerHeight;

      // Dismiss if swiped down fast enough or past threshold
      if (velocity > VELOCITY_DISMISS || currentY > vh * (1 - DISMISS_THRESHOLD)) {
        onClose();
        return;
      }

      // Snap to nearest snap point
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < snapPoints.length; i++) {
        const snapY = vh - vh * (snapPoints[i] ?? 0);
        const dist = Math.abs(currentY - snapY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      snapIndexRef.current = bestIndex;
      animateTo(vh - getSnapHeight(bestIndex));
    },
    [onClose, snapPoints, animateTo, getSnapHeight],
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

  if (!open) return null;

  return createPortal(
    <>
      {/* Scrim */}
      {showScrim && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl touch-none"
        style={{
          maxHeight: '90vh',
          borderTopLeftRadius: 'var(--sheet-border-radius)',
          borderTopRightRadius: 'var(--sheet-border-radius)',
          paddingBottom: 'var(--safe-bottom)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center py-3">
          <div
            className="rounded-full bg-gray-300"
            style={{
              width: 'var(--sheet-handle-width)',
              height: 'var(--sheet-handle-height)',
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
