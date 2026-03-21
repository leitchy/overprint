/**
 * GPS Bridge — non-rendering component that connects the GPS position hook
 * to the geo-transform pipeline and updates the GPS store with map coordinates.
 *
 * Also handles:
 * - Screen wake lock (keeps screen on during field use)
 * - Permission denied toast
 * - Warm-up guidance toast on first enable
 */

import { useEffect, useRef } from 'react';
import { useGpsPosition } from '@/hooks/use-gps-position';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useGpsStore } from '@/stores/gps-store';
import { useEventStore } from '@/stores/event-store';
import { useToastStore } from '@/stores/toast-store';
import { gpsToMapPixels } from '@/core/geometry/geo-transform';

export function GpsBridge() {
  // Activate the GPS position hook (manages watchPosition lifecycle)
  useGpsPosition();

  const position = useGpsStore((s) => s.position);
  const enabled = useGpsStore((s) => s.enabled);
  const status = useGpsStore((s) => s.status);
  const setMapPoint = useGpsStore((s) => s.setMapPoint);
  const georef = useEventStore((s) => s.event?.mapFile?.georef);

  // Keep screen on while GPS is active
  useWakeLock(enabled);

  // Track previous status for toast triggers
  const prevStatusRef = useRef(status);
  const hasShownWarmupRef = useRef(false);

  // Toast on permission denied
  useEffect(() => {
    if (status === 'denied' && prevStatusRef.current !== 'denied') {
      useToastStore.getState().addToast(
        'Location access denied \u2014 enable in browser settings',
        5000,
      );
    }
    // Toast on first GPS signal lost
    if (status === 'lost' && prevStatusRef.current !== 'lost') {
      useToastStore.getState().addToast('GPS signal lost', 3000);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Warm-up toast on first enable
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

  // Transform GPS position to map pixels whenever position or georef changes
  useEffect(() => {
    if (!enabled || !position || !georef) {
      setMapPoint(null, null);
      return;
    }

    const mapPoint = gpsToMapPixels(position.lon, position.lat, georef);
    if (!mapPoint) {
      setMapPoint(null, null);
      return;
    }

    // Compute accuracy radius in map pixels.
    // For calibration georef, use a second point offset by accuracy metres
    // to determine the pixel scale. For OCAD/OMAP, use paper-unit math.
    let accuracyRadiusPx: number | null = null;
    if (georef.source === 'calibration') {
      // Offset ~accuracy metres east and measure pixel distance
      const degPerMetre = 1 / 111320; // approximate at mid-latitudes
      const offsetPoint = gpsToMapPixels(
        position.lon + position.accuracy * degPerMetre,
        position.lat,
        georef,
      );
      if (offsetPoint) {
        const dx = offsetPoint.x - mapPoint.x;
        const dy = offsetPoint.y - mapPoint.y;
        accuracyRadiusPx = Math.sqrt(dx * dx + dy * dy);
      }
    } else {
      const paperFactor = georef.paperUnit === 'hundredths-mm' ? 100_000 : 1_000_000;
      const accuracyPaperUnits = (position.accuracy / georef.scale) * paperFactor;
      accuracyRadiusPx = accuracyPaperUnits * georef.renderScale;
    }

    setMapPoint(mapPoint, accuracyRadiusPx);
  }, [position, georef, enabled, setMapPoint]);

  // This component renders nothing — it's a pure side-effect bridge
  return null;
}
