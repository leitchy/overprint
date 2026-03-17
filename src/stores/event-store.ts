import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type {
  Course,
  CourseControl,
  EventSettings,
  MapFile,
  MapPoint,
  OverprintEvent,
} from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';

// --- Type derivation helper ---

function deriveCourseControlTypes(controls: CourseControl[]): void {
  for (let i = 0; i < controls.length; i++) {
    const cc = controls[i]!;
    if (i === 0) {
      cc.type = 'start';
    } else if (i === controls.length - 1) {
      cc.type = 'finish';
    } else {
      cc.type = 'control';
    }
  }
}

function nextControlCode(event: OverprintEvent): number {
  const codes = Object.values(event.controls).map((c) => c.code);
  return codes.length > 0 ? Math.max(...codes) + 1 : 31;
}

// --- State interfaces ---

interface EventState {
  event: OverprintEvent | null;
  // UI state — not undoable (excluded from partialize)
  activeCourseId: CourseId | null;
  selectedControlId: ControlId | null;
}

interface EventActions {
  newEvent: (name: string) => void;
  setMapFile: (mapFile: MapFile) => void;
  setMapScale: (scale: number) => void;
  setMapDpi: (dpi: number) => void;
  updateSettings: (settings: Partial<EventSettings>) => void;

  // Course management
  addCourse: (name: string) => void;
  setActiveCourse: (id: CourseId | null) => void;
  setSelectedControl: (id: ControlId | null) => void;

  // Control-to-course operations (public API)
  addControlToCourse: (position: MapPoint) => void;
  removeControlFromCourse: (courseId: CourseId, controlId: ControlId) => void;
  moveControlInCourse: (courseId: CourseId, fromIndex: number, toIndex: number) => void;
  insertControlInCourse: (courseId: CourseId, controlId: ControlId, atIndex: number) => void;

  // Low-level control operations (internal — prefer course-aware actions)
  updateControlPosition: (id: ControlId, position: MapPoint) => void;
}

// --- Helper to find active course in draft ---

function findCourse(event: OverprintEvent, courseId: CourseId): Course | undefined {
  return event.courses.find((c) => c.id === courseId);
}

// --- Store ---

export const useEventStore = create<EventState & EventActions>()(
  temporal(
    immer((set) => ({
      event: null,
      activeCourseId: null,
      selectedControlId: null,

      newEvent: (name: string) => {
        set((state) => {
          state.event = createEvent(name);
          state.activeCourseId = null;
          state.selectedControlId = null;
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

      // --- Course management ---

      addCourse: (name: string) => {
        set((state) => {
          if (!state.event) return;
          const course = createCourse(name);
          state.event.courses.push(course);
          state.activeCourseId = course.id;
        });
      },

      setActiveCourse: (id: CourseId | null) => {
        set((state) => {
          state.activeCourseId = id;
          state.selectedControlId = null;
        });
      },

      setSelectedControl: (id: ControlId | null) => {
        set((state) => {
          state.selectedControlId = id;
        });
      },

      // --- Control-to-course operations ---

      addControlToCourse: (position: MapPoint) => {
        set((state) => {
          if (!state.event) return;

          // Auto-create "Course 1" if no courses exist
          if (state.event.courses.length === 0) {
            const course = createCourse('Course 1');
            state.event.courses.push(course);
            state.activeCourseId = course.id;
          }

          const courseId = state.activeCourseId;
          if (!courseId) return;

          const course = findCourse(state.event, courseId);
          if (!course) return;

          // Create control with auto-incremented code
          const code = nextControlCode(state.event);
          const control = createControl(code, position);

          // Add to controls pool
          state.event.controls[control.id] = control;

          // Append to course
          const courseControl: CourseControl = {
            controlId: control.id,
            type: 'control',
          };
          course.controls.push(courseControl);

          // Auto-derive start/finish types
          deriveCourseControlTypes(course.controls);

          // Select the new control
          state.selectedControlId = control.id;
        });
      },

      removeControlFromCourse: (courseId: CourseId, controlId: ControlId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;

          course.controls = course.controls.filter(
            (cc) => cc.controlId !== controlId,
          );
          deriveCourseControlTypes(course.controls);

          if (state.selectedControlId === controlId) {
            state.selectedControlId = null;
          }
        });
      },

      moveControlInCourse: (courseId: CourseId, fromIndex: number, toIndex: number) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          if (fromIndex < 0 || fromIndex >= course.controls.length) return;
          if (toIndex < 0 || toIndex >= course.controls.length) return;

          const [removed] = course.controls.splice(fromIndex, 1);
          if (removed) {
            course.controls.splice(toIndex, 0, removed);
            deriveCourseControlTypes(course.controls);
          }
        });
      },

      insertControlInCourse: (courseId: CourseId, controlId: ControlId, atIndex: number) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;

          const courseControl: CourseControl = {
            controlId,
            type: 'control',
          };
          course.controls.splice(atIndex, 0, courseControl);
          deriveCourseControlTypes(course.controls);
        });
      },

      // --- Low-level control position update (for drag) ---

      updateControlPosition: (id: ControlId, position: MapPoint) => {
        set((state) => {
          const control = state.event?.controls[id];
          if (control) {
            control.position = position;
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
