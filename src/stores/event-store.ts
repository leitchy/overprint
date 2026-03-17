import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type {
  Control,
  EventSettings,
  MapFile,
  OverprintEvent,
} from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { createEvent } from '@/core/models/defaults';

interface EventState {
  event: OverprintEvent | null;
}

interface EventActions {
  newEvent: (name: string) => void;
  setMapFile: (mapFile: MapFile) => void;
  setMapScale: (scale: number) => void;
  setMapDpi: (dpi: number) => void;
  updateSettings: (settings: Partial<EventSettings>) => void;
  addControl: (control: Control) => void;
  removeControl: (id: ControlId) => void;
  updateControl: (id: ControlId, updates: Partial<Control>) => void;
}

export const useEventStore = create<EventState & EventActions>()(
  temporal(
    immer((set) => ({
      event: null,

      newEvent: (name: string) => {
        set((state) => {
          state.event = createEvent(name);
        });
      },

      setMapFile: (mapFile: MapFile) => {
        set((state) => {
          if (state.event) {
            state.event.mapFile = mapFile;
          }
        });
      },

      setMapScale: (scale: number) => {
        set((state) => {
          if (state.event?.mapFile) {
            state.event.mapFile.scale = scale;
          }
        });
      },

      setMapDpi: (dpi: number) => {
        set((state) => {
          if (state.event?.mapFile) {
            state.event.mapFile.dpi = dpi;
          }
        });
      },

      updateSettings: (updates: Partial<EventSettings>) => {
        set((state) => {
          if (state.event) {
            Object.assign(state.event.settings, updates);
          }
        });
      },

      addControl: (control: Control) => {
        set((state) => {
          if (state.event) {
            state.event.controls[control.id] = control;
          }
        });
      },

      removeControl: (id: ControlId) => {
        set((state) => {
          if (state.event) {
            delete state.event.controls[id];
          }
        });
      },

      updateControl: (id: ControlId, updates: Partial<Control>) => {
        set((state) => {
          const control = state.event?.controls[id];
          if (control) {
            Object.assign(control, updates);
          }
        });
      },
    })),
    {
      partialize: (state) => ({ event: state.event }),
      limit: 100,
    },
  ),
);
