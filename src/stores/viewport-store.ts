import { create } from 'zustand';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface ViewportActions {
  setViewport: (update: Partial<ViewportState>) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
}

const INITIAL_STATE: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const useViewportStore = create<ViewportState & ViewportActions>()(
  (set) => ({
    ...INITIAL_STATE,

    setViewport: (update) => {
      set((state) => ({
        ...state,
        ...update,
        zoom: update.zoom !== undefined ? clampZoom(update.zoom) : state.zoom,
      }));
    },

    setZoom: (zoom) => {
      set({ zoom: clampZoom(zoom) });
    },

    setPan: (x, y) => {
      set({ panX: x, panY: y });
    },

    resetView: () => {
      set(INITIAL_STATE);
    },
  }),
);

export { MIN_ZOOM, MAX_ZOOM };
