import { useEffect } from 'react';
import { usePwaStore } from '@/stores/pwa-store';
import { useEventStore } from '@/stores/event-store';
import { useToastStore } from '@/stores/toast-store';
import { useT } from '@/i18n/use-t';

/**
 * Service-worker update banner + "ready offline" toast.
 *
 * `offlineReady` is a one-off confirmation, shown as a transient toast.
 * `needRefresh` is a persistent, low-pressure banner: the new version is already
 * precached and will apply on next launch, so we don't force a reload. If the
 * user reloads now while an event is open we warn that the map must be re-loaded
 * (the auto-save draft carries the course, but not the large map image).
 */
export function PwaBanner() {
  const t = useT();
  const needRefresh = usePwaStore((s) => s.needRefresh);
  const offlineReady = usePwaStore((s) => s.offlineReady);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);
  const dismissUpdate = usePwaStore((s) => s.dismissUpdate);
  const dismissOfflineReady = usePwaStore((s) => s.dismissOfflineReady);
  const hasEvent = useEventStore((s) => s.event !== null);

  // Surface offline-ready as a transient toast, then clear the flag.
  useEffect(() => {
    if (!offlineReady) return;
    useToastStore.getState().addToast(t('pwaOfflineReady'), 3500);
    dismissOfflineReady();
  }, [offlineReady, dismissOfflineReady, t]);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed left-1/2 z-40 flex max-w-[min(92vw,30rem)] -translate-x-1/2 flex-col gap-2 rounded-lg border border-violet-200 bg-white px-4 py-3 shadow-lg"
      style={{ bottom: 'calc(var(--mobile-nav-height, 0px) + var(--safe-bottom) + 16px)' }}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-gray-700">
        <span className="font-medium">{t('pwaUpdateTitle')}</span>{' '}
        {hasEvent ? t('pwaUpdateReloadWarn') : t('pwaUpdateBody')}
      </p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={dismissUpdate}
          className="rounded px-2.5 py-1 text-sm text-gray-500 hover:text-gray-800"
        >
          {t('pwaUpdateLater')}
        </button>
        <button
          onClick={applyUpdate}
          className="rounded bg-violet-600 px-3 py-1 text-sm font-medium text-white hover:bg-violet-700"
        >
          {t('pwaUpdateReload')}
        </button>
      </div>
    </div>
  );
}
