/**
 * GPS toggle button with state-dependent styling.
 *
 * Renders a satellite/crosshair icon button with visual variants for each GPS state.
 * Used in both the desktop toolbar (Zone 3) and the compact mobile toolbar.
 */

import { useGpsStore } from '@/stores/gps-store';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { useToastStore } from '@/stores/toast-store';
import { useMapImageStore } from '@/stores/map-image-store';
import type { GpsStatus } from '@/stores/gps-store';

/** SVG satellite icon — 18x18, reads clearly at small sizes */
function SatelliteIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Satellite dish shape */}
      <path d="M2 12a10 10 0 0 1 10-10" />
      <path d="M2 12a14 14 0 0 0 14 14" />
      <path d="M5 10a6 6 0 0 1 6-6" />
      <path d="M5 10a10 10 0 0 0 10 10" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

interface GpsToggleButtonProps {
  compact?: boolean;
}

export function GpsToggleButton({ compact }: GpsToggleButtonProps) {
  const enabled = useGpsStore((s) => s.enabled);
  const status = useGpsStore((s) => s.status);
  const setEnabled = useGpsStore((s) => s.setEnabled);
  const georef = useEventStore((s) => s.event?.mapFile?.georef);
  const hasImage = useMapImageStore((s) => s.image !== null);
  const hasGeolocationApi = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  // Don't render if no Geolocation API
  if (!hasGeolocationApi) return null;

  const needsCalibration = !georef;
  const isActive = enabled && status !== 'inactive';

  const handleClick = () => {
    if (isActive) {
      setEnabled(false);
    } else if (status === 'denied') {
      // Show platform-specific help for re-enabling location
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      let help: string;
      if (isIOS && isSafari) {
        help = 'Go to Settings > Safari > Location Services, then reload this page';
      } else if (isIOS) {
        help = 'Go to Settings > Chrome > Location, then reload this page';
      } else {
        help = 'Tap the lock icon in the address bar > Site settings > Location > Allow';
      }
      useToastStore.getState().addToast(help, 6000);
      // Try again — some browsers allow re-prompting after settings change
      setEnabled(true);
    } else if (needsCalibration) {
      if (!hasImage) {
        useToastStore.getState().addToast('Load a map first to use GPS', 3000);
      } else {
        useToolStore.getState().setTool({ type: 'calibrate' });
      }
    } else {
      setEnabled(true);
    }
  };

  const { className, title } = getButtonStyle(status, enabled, needsCalibration);

  const baseClass = compact
    ? 'flex h-10 w-10 items-center justify-center rounded'
    : 'flex h-[34px] w-[34px] items-center justify-center rounded';

  return (
    <button
      onClick={handleClick}
      className={`${baseClass} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
    >
      <SatelliteIcon className={status === 'acquiring' && enabled ? 'animate-pulse' : undefined} />
    </button>
  );
}

function getButtonStyle(
  status: GpsStatus,
  enabled: boolean,
  needsCalibration: boolean,
): { className: string; title: string } {
  if (needsCalibration && !enabled) {
    return {
      className: 'bg-muted text-faint ring-1 ring-warning',
      title: 'Map not georeferenced — tap to calibrate',
    };
  }

  if (!enabled || status === 'inactive') {
    return {
      className: 'bg-muted text-subtle hover:bg-surface-3',
      title: 'Enable GPS placement',
    };
  }

  switch (status) {
    case 'acquiring':
      return {
        className: 'bg-info-soft text-info-text',
        title: 'Acquiring GPS signal\u2026',
      };
    case 'active':
      return {
        className: 'bg-info-soft text-info-text ring-1 ring-info',
        title: 'GPS active \u2014 tap to disable',
      };
    case 'poor-signal':
      return {
        className: 'bg-warning-soft text-warning-text ring-1 ring-warning',
        title: 'GPS active \u2014 poor accuracy',
      };
    case 'lost':
      return {
        className: 'bg-danger-soft text-danger-text ring-1 ring-danger',
        title: 'GPS signal lost',
      };
    case 'denied':
      return {
        className: 'bg-muted text-faint cursor-not-allowed',
        title: 'Location access denied \u2014 check browser settings',
      };
    case 'unavailable':
      return {
        className: 'bg-muted text-faint cursor-not-allowed',
        title: 'GPS not available on this device',
      };
    default:
      return {
        className: 'bg-muted text-subtle',
        title: 'GPS',
      };
  }
}
