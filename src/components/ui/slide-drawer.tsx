import { useRef, useEffect, type ReactNode } from 'react';
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

export function SlideDrawer({
  open,
  onClose,
  side = 'right',
  width = '280px',
  children,
}: SlideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Open/close animation
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    const offscreen = side === 'right' ? '100%' : '-100%';

    if (open) {
      drawer.style.transition = 'none';
      drawer.style.transform = `translateX(${offscreen})`;
      drawer.offsetHeight; // force reflow
      drawer.style.transition = 'transform 240ms ease-out';
      drawer.style.transform = 'translateX(0)';
    } else {
      drawer.style.transition = 'transform 150ms ease-in';
      drawer.style.transform = `translateX(${offscreen})`;
    }
  }, [open, side]);

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
      {/* Scrim — tap to close */}
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
        className="fixed top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{
          width,
          ...(side === 'right' ? { right: 0 } : { left: 0 }),
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
