/**
 * GPS Status Chip — DOM overlay showing GPS status as a pill badge.
 *
 * Positioned in the top-left of the map canvas area (below toolbar).
 * Only renders when GPS is active (not in idle/hidden states).
 *
 * Status indicators:
 * - Acquiring: pulsing blue dot, gray text
 * - Active (good): blue dot, blue text with accuracy
 * - Poor signal: amber dot, amber text with accuracy
 * - Lost: red dot, red text
 */

import { useGpsStore } from '@/stores/gps-store';

export function GpsStatusChip() {
  const enabled = useGpsStore((s) => s.enabled);
  const status = useGpsStore((s) => s.status);
  const position = useGpsStore((s) => s.position);
  const followMode = useGpsStore((s) => s.followMode);
  const resumeFollow = useGpsStore((s) => s.resumeFollow);

  if (!enabled || status === 'inactive') return null;

  const accuracy = position?.accuracy ? Math.round(position.accuracy) : null;

  let dotClass: string;
  let textClass: string;
  let label: string;

  switch (status) {
    case 'acquiring':
      dotClass = 'bg-blue-400 animate-pulse';
      textClass = 'text-gray-600';
      label = 'Acquiring GPS\u2026';
      break;
    case 'active':
      dotClass = 'bg-blue-500';
      textClass = 'text-blue-700';
      label = accuracy !== null ? `GPS \u2014 \u00B1${accuracy}m` : 'GPS active';
      break;
    case 'poor-signal':
      dotClass = 'bg-amber-500';
      textClass = 'text-amber-700';
      label = accuracy !== null ? `GPS \u2014 \u00B1${accuracy}m poor` : 'GPS \u2014 poor signal';
      break;
    case 'lost':
      dotClass = 'bg-red-500';
      textClass = 'text-red-700';
      label = 'GPS signal lost';
      break;
    case 'denied':
      dotClass = 'bg-gray-400';
      textClass = 'text-gray-600';
      label = 'Location denied';
      break;
    default:
      return null;
  }

  return (
    <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5">
      {/* Status chip */}
      <div
        className="flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium shadow backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        <span className={textClass}>{label}</span>
      </div>

      {/* Follow GPS chip — appears when auto-follow is suspended */}
      {!followMode && (status === 'active' || status === 'poor-signal') && (
        <button
          onClick={resumeFollow}
          className="flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow"
        >
          Follow GPS
        </button>
      )}
    </div>
  );
}
