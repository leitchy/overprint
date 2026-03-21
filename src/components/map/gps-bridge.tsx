/**
 * GPS Bridge — non-rendering component that connects the GPS position hook
 * to the geo-transform pipeline and updates the GPS store with map coordinates.
 *
 * Also handles:
 * - Auto-follow viewport panning (keeps GPS dot visible)
 * - Screen wake lock (keeps screen on during field use)
 * - Permission denied / signal lost toasts
 * - Warm-up guidance toast on first enable
 */

import { useEffect, useRef } from 'react';
import { useGpsPosition } from '@/hooks/use-gps-position';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useGpsStore } from '@/stores/gps-store';
import { useEventStore } from '@/stores/event-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useToastStore } from '@/stores/toast-store';
import { gpsToMapPixels } from '@/core/geometry/geo-transform';

/** Seconds before auto-follow re-engages after manual pan */
const FOLLOW_RESUME_DELAY = 8000;

export function GpsBridge() {
  // Activate the GPS position hook (manages watchPosition lifecycle)
  useGpsPosition();

  const position = useGpsStore((s) => s.position);
  const enabled = useGpsStore((s) => s.enabled);
  const status = useGpsStore((s) => s.status);
  const mapPoint = useGpsStore((s) => s.mapPoint);
  const followMode = useGpsStore((s) => s.followMode);
  const followSuspendedAt = useGpsStore((s) => s.followSuspendedAt);
  const setMapPoint = useGpsStore((s) => s.setMapPoint);
  const georef = useEventStore((s) => s.event?.mapFile?.georef);

  // Keep screen on while GPS is active
  useWakeLock(enabled);

  // Track previous status for toast triggers
  const prevStatusRef = useRef(status);
  const hasShownWarmupRef = useRef(false);

  // --- Toast on status transitions ---
  useEffect(() => {
    if (status === 'denied' && prevStatusRef.current !== 'denied') {
      useToastStore.getState().addToast(
        'Location access denied \u2014 enable in browser settings',
        5000,
      );
    }
    if (status === 'lost' && prevStatusRef.current !== 'lost') {
      useToastStore.getState().addToast('GPS signal lost', 3000);
    }
    prevStatusRef.current = status;
  }, [status]);

  // --- Extended lost toast (60s without fix) ---
  const lostTimestampRef = useRef<number | null>(null);
  useEffect(() => {
    if (status === 'lost') {
      if (!lostTimestampRef.current) lostTimestampRef.current = Date.now();
      const timer = setTimeout(() => {
        if (useGpsStore.getState().status === 'lost') {
          useToastStore.getState().addToast(
            'GPS signal lost. Move outside to restore.',
            5000,
          );
        }
      }, 60000);
      return () => clearTimeout(timer);
    }
    lostTimestampRef.current = null;
  }, [status]);

  // --- Warm-up toast on first enable ---
  useEffect(() => {
    if (enabled && !hasShownWarmupRef.current) {
      hasShownWarmupRef.current = true;
      useToastStore.getState().addToast(
        'Enable GPS before going into the forest for faster signal lock',
        4000,
      );
    }
    if (!enabled) {
      hasShownWarmupRef.current = false;
    }
  }, [enabled]);

  // --- 30s acquiring timeout toast ---
  useEffect(() => {
    if (status !== 'acquiring') return;
    const timer = setTimeout(() => {
      if (useGpsStore.getState().status === 'acquiring') {
        useToastStore.getState().addToast(
          'GPS signal not found. Are you indoors?',
          5000,
        );
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [status]);

  // --- Transform GPS position to map pixels ---
  useEffect(() => {
    if (!enabled || !position || !georef) {
      setMapPoint(null, null);
      return;
    }

    const mp = gpsToMapPixels(position.lon, position.lat, georef);
    if (!mp) {
      setMapPoint(null, null);
      return;
    }

    // Compute accuracy radius in map pixels
    let accuracyRadiusPx: number | null = null;
    if (georef.source === 'calibration') {
      const degPerMetre = 1 / 111320;
      const offsetPoint = gpsToMapPixels(
        position.lon + position.accuracy * degPerMetre,
        position.lat,
        georef,
      );
      if (offsetPoint) {
        const dx = offsetPoint.x - mp.x;
        const dy = offsetPoint.y - mp.y;
        accuracyRadiusPx = Math.sqrt(dx * dx + dy * dy);
      }
    } else {
      const paperFactor = georef.paperUnit === 'hundredths-mm' ? 100_000 : 1_000_000;
      const accuracyPaperUnits = (position.accuracy / georef.scale) * paperFactor;
      accuracyRadiusPx = accuracyPaperUnits * georef.renderScale;
    }

    setMapPoint(mp, accuracyRadiusPx);
  }, [position, georef, enabled, setMapPoint]);

  // --- Auto-follow: pan viewport to keep GPS dot visible ---
  useEffect(() => {
    if (!enabled || !mapPoint || !followMode) return;
    if (status !== 'active' && status !== 'poor-signal' && status !== 'acquiring') return;

    // Get the map container to know viewport size
    const container = document.querySelector('[data-map-container]');
    if (!container) return;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    if (cw <= 0 || ch <= 0) return;

    const { zoom, panX, panY } = useViewportStore.getState();

    // Convert GPS map-space point to screen-space
    const screenX = mapPoint.x * zoom + panX;
    const screenY = mapPoint.y * zoom + panY;

    // Check if GPS dot is within the viewport with 10% padding
    const padX = cw * 0.1;
    const padY = ch * 0.1;
    const inView =
      screenX >= padX && screenX <= cw - padX &&
      screenY >= padY && screenY <= ch - padY;

    if (!inView) {
      // Pan to center the GPS dot
      const newPanX = cw / 2 - mapPoint.x * zoom;
      const newPanY = ch / 2 - mapPoint.y * zoom;
      useViewportStore.getState().setPan(newPanX, newPanY);
    }
  }, [mapPoint, enabled, followMode, status]);

  // --- Auto-resume follow after 8s timeout ---
  useEffect(() => {
    if (!enabled || followMode || followSuspendedAt === null) return;

    const elapsed = Date.now() - followSuspendedAt;
    const remaining = Math.max(0, FOLLOW_RESUME_DELAY - elapsed);

    const timer = setTimeout(() => {
      if (useGpsStore.getState().enabled && !useGpsStore.getState().followMode) {
        useGpsStore.getState().resumeFollow();
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [enabled, followMode, followSuspendedAt]);

  return null;
}
