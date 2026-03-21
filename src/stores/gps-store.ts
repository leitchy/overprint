/**
 * Ephemeral GPS state store.
 *
 * Not saved, not undoable, separate from event store.
 * Holds the current GPS status, raw position, computed map point,
 * accuracy radius, and auto-follow state.
 */

import { create } from 'zustand';
import type { MapPoint } from '@/core/models/types';

export type GpsStatus =
  | 'inactive'      // GPS not requested
  | 'acquiring'     // watchPosition started, no fix yet
  | 'active'        // Receiving positions, accuracy <= 20m
  | 'poor-signal'   // Receiving positions, accuracy > 20m
  | 'lost'          // No fix for 10+ seconds
  | 'denied'        // User denied permission
  | 'unavailable';  // Device has no GPS

/** Accuracy threshold (metres) — above this is "poor signal" */
export const GPS_ACCURACY_THRESHOLD = 20;

/** Seconds without a fix before status transitions to "lost" */
export const GPS_LOST_TIMEOUT_SEC = 10;

export interface GpsPosition {
  lon: number;
  lat: number;
  accuracy: number;    // metres
  timestamp: number;   // Date.now()
}

interface GpsState {
  /** Whether GPS is enabled by the user */
  enabled: boolean;
  /** Current GPS status */
  status: GpsStatus;
  /** Raw WGS84 position from Geolocation API */
  position: GpsPosition | null;
  /** Position transformed to map pixel coordinates */
  mapPoint: MapPoint | null;
  /** Accuracy circle radius in map pixels */
  accuracyRadiusPx: number | null;
  /** Auto-pan to keep GPS dot visible */
  followMode: boolean;
  /** Timestamp when follow was suspended by manual pan */
  followSuspendedAt: number | null;
}

interface GpsActions {
  setEnabled: (enabled: boolean) => void;
  setStatus: (status: GpsStatus) => void;
  setPosition: (position: GpsPosition | null) => void;
  setMapPoint: (point: MapPoint | null, accuracyRadiusPx: number | null) => void;
  setFollowMode: (follow: boolean) => void;
  suspendFollow: () => void;
  resumeFollow: () => void;
  reset: () => void;
}

const initialState: GpsState = {
  enabled: false,
  status: 'inactive',
  position: null,
  mapPoint: null,
  accuracyRadiusPx: null,
  followMode: true,
  followSuspendedAt: null,
};

export const useGpsStore = create<GpsState & GpsActions>()((set) => ({
  ...initialState,

  setEnabled: (enabled) => {
    if (!enabled) {
      set({ ...initialState });
    } else {
      set({ enabled: true, status: 'acquiring', followMode: true, followSuspendedAt: null });
    }
  },

  setStatus: (status) => set({ status }),

  setPosition: (position) => set({ position }),

  setMapPoint: (mapPoint, accuracyRadiusPx) => set({ mapPoint, accuracyRadiusPx }),

  setFollowMode: (followMode) => set({ followMode, followSuspendedAt: null }),

  suspendFollow: () => set({ followMode: false, followSuspendedAt: Date.now() }),

  resumeFollow: () => set({ followMode: true, followSuspendedAt: null }),

  reset: () => set({ ...initialState }),
}));
