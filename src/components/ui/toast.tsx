import { createPortal } from 'react-dom';
import { useToastStore } from '@/stores/toast-store';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2"
      style={{
        bottom: 'calc(var(--mobile-nav-height, 0px) + var(--safe-bottom) + 12px)',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-fade-in rounded-full bg-gray-800 px-4 py-2 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
