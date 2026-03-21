/**
 * Screen Wake Lock hook — keeps the screen on during GPS field use.
 *
 * Uses the Screen Wake Lock API (iOS 16.4+, Android Chrome 84+).
 * Acquires on mount when `active` is true, releases on unmount or when
 * `active` becomes false. Re-acquires on page visibility change (the
 * browser releases wake locks when the tab goes hidden).
 */

import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;

        // The browser releases the lock when the tab goes hidden.
        // Re-acquire when it becomes visible again.
        sentinel.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        // Wake lock not supported or denied — silently ignore
      }
    }

    acquire();

    // Re-acquire on visibility change
    const handleVisibility = () => {
      if (!document.hidden && !wakeLockRef.current && !cancelled) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [active]);
}
