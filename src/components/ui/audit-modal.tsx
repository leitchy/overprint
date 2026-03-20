import { useMemo, useState, useCallback } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useModalClose } from './use-modal-close';
import { BottomSheet } from './bottom-sheet';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { auditEvent, type AuditItem, type AuditSeverity } from '@/core/validation/event-audit';
import { useT } from '@/i18n/use-t';

interface AuditModalProps {
  onClose: () => void;
}

type FilterMode = 'all' | 'error' | 'warning';

export function AuditModal({ onClose }: AuditModalProps) {
  const t = useT();
  const breakpoint = useBreakpoint();
  const event = useEventStore((s) => s.event);
  const imgWidth = useMapImageStore((s) => s.imageWidth);
  const imgHeight = useMapImageStore((s) => s.imageHeight);

  const [filter, setFilter] = useState<FilterMode>('all');

  // Reactive audit — recalculates when event changes
  const items = useMemo(() => {
    if (!event) return [];
    const ctx = imgWidth > 0 && imgHeight > 0 ? { imgWidth, imgHeight } : undefined;
    return auditEvent(event, ctx);
  }, [event, imgWidth, imgHeight]);

  const errorCount = items.filter((i) => i.severity === 'error').length;
  const warningCount = items.filter((i) => i.severity === 'warning').length;

  const filtered = filter === 'all' ? items : items.filter((i) => i.severity === filter);

  const handleNavigate = useCallback((item: AuditItem) => {
    if (item.courseId) {
      useEventStore.getState().setActiveCourse(item.courseId);
    }
    if (item.controlId) {
      useEventStore.getState().setSelectedControl(item.controlId);
    }
    // Desktop: close modal. Mobile: handled by sheet snap.
    if (breakpoint === 'lg') {
      onClose();
    }
  }, [breakpoint, onClose]);

  const content = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('eventAudit')}</h2>
          <p className="text-xs text-gray-500">
            {errorCount} {t('auditErrors')} · {warningCount} {t('auditWarnings')}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
      </div>

      {/* Filter chips */}
      {items.length > 0 && (
        <div className="flex gap-1 border-b border-gray-100 px-4 py-2">
          {(['all', 'error', 'warning'] as FilterMode[]).map((mode) => {
            const count = mode === 'all' ? items.length : mode === 'error' ? errorCount : warningCount;
            const isActive = filter === mode;
            const label = mode === 'all' ? t('auditAll') : mode === 'error' ? t('auditErrors') : t('auditWarnings');
            return (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isActive
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto" style={{ maxHeight: breakpoint === 'lg' ? '400px' : undefined }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="text-2xl">✓</span>
            <p className="text-sm font-medium text-gray-700">{t('auditAllClear')}</p>
            <p className="text-xs text-gray-500">{t('auditReadyToPrint')}</p>
          </div>
        ) : (
          <ul>
            {filtered.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => handleNavigate(item)}
                  className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 max-lg:min-h-(--touch-target-min)"
                  aria-label={`${item.severity}: ${t(item.messageKey as Parameters<typeof t>[0], item.messageParams)}`}
                >
                  <SeverityIcon severity={item.severity} />
                  <span className="text-sm text-gray-700">
                    {t(item.messageKey as Parameters<typeof t>[0], item.messageParams)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // Desktop: centered modal
  if (breakpoint === 'lg') {
    return <DesktopModal onClose={onClose}>{content}</DesktopModal>;
  }

  // Tablet/phone: bottom sheet
  return (
    <BottomSheet
      open
      onClose={onClose}
      snapPoints={breakpoint === 'sm' ? [0.15, 0.9] : [0.15, 0.7]}
      initialSnap={1}
    >
      {content}
    </BottomSheet>
  );
}

function DesktopModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { handleBackdropClick } = useModalClose(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div className="w-110 rounded-lg border border-gray-200 bg-white shadow-xl">
        {children}
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: AuditSeverity }) {
  if (severity === 'error') {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white" title="Error">
        !
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-amber-500" title="Warning">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5L1 14h14L8 1.5zM8 12a1 1 0 110-2 1 1 0 010 2zm-.75-3.5v-4h1.5v4h-1.5z" />
      </svg>
    </span>
  );
}
