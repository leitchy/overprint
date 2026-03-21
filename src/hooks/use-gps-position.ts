/**
 * Geolocation API hook with permission pre-check, page visibility,
 * poor-signal detection, and lost-signal timeout.
 *
 * - Uses watchPosition for continuous tracking at walking speed
 * - Pre-checks permissions via navigator.permissions.query
 * - Listens for permission change events to auto-resume
 * - Only PERMISSION_DENIED stops the watch; TIMEOUT and POSITION_UNAVAILABLE
 *   keep it alive (canopy dropout is transient)
 * - Clears watch on page hidden, restarts on visible
 * - Detects poor signal (>20m accuracy) and lost signal (10s timeout)
 * - Cleans up on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import { useGpsStore, GPS_ACCURACY_THRESHOLD, GPS_LOST_TIMEOUT_SEC } from '@/stores/gps-store';

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,    // 1s — tight for walking speed
  timeout: 30000,      // 30s — avoid spurious timeout under canopy
};

export function useGpsPosition(): void {
  const enabled = useGpsStore((s) => s.enabled);
  const setStatus = useGpsStore((s) => s.setStatus);
  const setPosition = useGpsStore((s) => s.setPosition);
  const watchIdRef = useRef<number | null>(null);
  const lostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLostTimer = useCallback(() => {
    if (lostTimerRef.current !== null) {
      clearTimeout(lostTimerRef.current);
      lostTimerRef.current = null;
    }
  }, []);

  const startLostTimer = useCallback(() => {
    clearLostTimer();
    lostTimerRef.current = setTimeout(() => {
      const state = useGpsStore.getState();
      if (state.enabled && (state.status === 'active' || state.status === 'poor-signal')) {
        setStatus('lost');
      }
    }, GPS_LOST_TIMEOUT_SEC * 1000);
  }, [clearLostTimer, setStatus]);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    // Already watching
    if (watchIdRef.current !== null) return;

    setStatus('acquiring');

    watchIdRef.current = navigator.geolocation.watchPosition(
      // Success
      (pos) => {
        const accuracy = pos.coords.accuracy;
        const status = accuracy <= GPS_ACCURACY_THRESHOLD ? 'active' : 'poor-signal';
        setStatus(status);
        setPosition({
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy,
          timestamp: pos.timestamp,
        });
        // Reset lost timer on every successful fix
        startLostTimer();
      },
      // Error
      (err) => {
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          stopWatch();
          clearLostTimer();
          setStatus('denied');
        }
        // TIMEOUT and POSITION_UNAVAILABLE: keep watch alive (transient under canopy)
        // The lost timer will handle transitioning to 'lost' if no fix comes
      },
      WATCH_OPTIONS,
    );

    // Start the lost timer immediately — if no fix arrives within the timeout, go to 'lost'
    startLostTimer();
  }, [setStatus, setPosition, startLostTimer, clearLostTimer]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearLostTimer();
  }, [clearLostTimer]);

  // Permission pre-check and change listener
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function checkPermission() {
      if (!navigator.permissions?.query) {
        startWatch();
        return;
      }

      try {
        const permStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;

        if (permStatus.state === 'denied') {
          setStatus('denied');
          return;
        }

        startWatch();

        // Listen for permission changes (e.g. user re-enables in Settings)
        const handleChange = () => {
          if (permStatus.state === 'denied') {
            stopWatch();
            setStatus('denied');
          } else if (permStatus.state === 'granted' || permStatus.state === 'prompt') {
            if (useGpsStore.getState().enabled && watchIdRef.current === null) {
              startWatch();
            }
          }
        };
        permStatus.addEventListener('change', handleChange);
      } catch {
        if (!cancelled) startWatch();
      }
    }

    checkPermission();

    return () => {
      cancelled = true;
    };
  }, [enabled, startWatch, stopWatch, setStatus]);

  // Page visibility handling — stop GPS when hidden, restart when visible
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.hidden) {
        stopWatch();
      } else {
        const status = useGpsStore.getState().status;
        if (status !== 'denied') {
          startWatch();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, startWatch, stopWatch]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    if (!enabled) {
      stopWatch();
      return;
    }

    return () => {
      stopWatch();
    };
  }, [enabled, stopWatch]);
}
