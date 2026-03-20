import { useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which edge the drawer slides from */
  side?: 'left' | 'right';
  /** Width of the drawer (CSS value) */
  width?: string;
  children: ReactNode;
}

const DISMISS_THRESHOLD = 80; // px swipe distance to dismiss
const VELOCITY_DISMISS = 400; // px/s

export function SlideDrawer({
  open,
  onClose,
  side = 'right',
  width = '280px',
  children,
}: SlideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    startX: 0,
    currentOffset: 0,
    isDragging: false,
    lastX: 0,
    lastTime: 0,
  });

  const getOffscreenX = useCallback(() => {
    return side === 'right' ? '100%' : '-100%';
  }, [side]);

  // Open/close animation
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    if (open) {
      drawer.style.transition = 'none';
      drawer.style.transform = `translateX(${getOffscreenX()})`;
      drawer.offsetHeight; // force reflow
      drawer.style.transition = 'transform 240ms ease-out';
      drawer.style.transform = 'translateX(0)';
    } else {
      drawer.style.transition = 'transform 150ms ease-in';
      drawer.style.transform = `translateX(${getOffscreenX()})`;
    }
  }, [open, getOffscreenX]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    // Only start drag from the edge area (first 24px from the open edge)
    const rect = drawer.getBoundingClientRect();
    const edgeDist = side === 'right'
      ? e.clientX - rect.left
      : rect.right - e.clientX;
    if (edgeDist > 24) return;

    drawer.style.transition = 'none';
    drawer.setPointerCapture(e.pointerId);
    dragRef.current.isDragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.currentOffset = 0;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastTime = Date.now();
  }, [side]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const deltaX = e.clientX - dragRef.current.startX;
    // Only allow dragging in the dismiss direction
    const offset = side === 'right' ? Math.max(0, deltaX) : Math.min(0, deltaX);

    drawer.style.transform = `translateX(${offset}px)`;
    dragRef.current.currentOffset = offset;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastTime = Date.now();
  }, [side]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;

      const drawer = drawerRef.current;
      if (!drawer) return;
      drawer.releasePointerCapture(e.pointerId);

      const dt = Math.max(Date.now() - dragRef.current.lastTime, 1);
      const dx = e.clientX - dragRef.current.lastX;
      const velocity = (dx / dt) * 1000;

      const offset = Math.abs(dragRef.current.currentOffset);
      const dismissVelocity = side === 'right' ? velocity > VELOCITY_DISMISS : velocity < -VELOCITY_DISMISS;

      if (offset > DISMISS_THRESHOLD || dismissVelocity) {
        onClose();
      } else {
        // Snap back
        drawer.style.transition = 'transform 200ms ease-out';
        drawer.style.transform = 'translateX(0)';
      }
    },
    [onClose, side],
  );

  // Escape key dismisses the drawer
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
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className="fixed top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl touch-none overflow-y-auto overscroll-contain"
        style={{
          width,
          ...(side === 'right' ? { right: 0 } : { left: 0 }),
          paddingBottom: 'var(--safe-bottom)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
