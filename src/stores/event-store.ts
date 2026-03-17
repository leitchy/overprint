import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type {
  Control,
  Course,
  CourseControl,
  CourseControlType,
  EventSettings,
  MapFile,
  MapPoint,
  OverprintEvent,
} from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { createEvent, createCourse, createControl, DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';
import { useAppSettingsStore } from './app-settings-store';
import { SUPPORTED_IOF_LANGUAGES } from '@/i18n/languages';

// --- Type derivation helper ---

function deriveCourseControlTypes(controls: CourseControl[]): void {
  for (let i = 0; i < controls.length; i++) {
    const cc = controls[i]!;
    if (i === 0) {
      cc.type = 'start';
    } else if (i === controls.length - 1) {
      cc.type = 'finish';
    } else if (cc.type === 'start' || cc.type === 'finish') {
      // Reset start/finish types that are no longer at endpoints
      cc.type = 'control';
    }
    // Preserve 'crossingPoint' and 'mapExchange' for middle controls
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
  renameCourse: (id: CourseId, name: string) => void;
  deleteCourse: (id: CourseId) => void;
  setActiveCourse: (id: CourseId | null) => void;
  setSelectedControl: (id: ControlId | null) => void;

  // Control-to-course operations (public API)
  addControlToCourse: (position: MapPoint) => void;
  removeControlFromCourse: (courseId: CourseId, controlId: ControlId) => void;
  moveControlInCourse: (courseId: CourseId, fromIndex: number, toIndex: number) => void;
  insertControlInCourse: (courseId: CourseId, controlId: ControlId, atIndex: number) => void;

  // Control management
  deleteControl: (controlId: ControlId) => void;
  setControlCode: (controlId: ControlId, code: number) => void;

  // Event name editing
  setEventName: (name: string) => void;

  // Description editing
  updateControlDescription: (id: ControlId, column: string, value: string | undefined) => void;

  // File operations
  loadEvent: (event: OverprintEvent) => void;

  /**
   * Bulk-import controls and courses from an IOF XML parse result.
   * Appends to the existing event's controls and courses rather than replacing them.
   */
  importControlsAndCourses: (controls: Control[], courses: Course[]) => void;

  // Number offset (per-course draggable number position)
  setNumberOffset: (courseId: CourseId, controlIndex: number, offset: MapPoint) => void;

  // Control type (crossing point / map exchange)
  setCourseControlType: (courseId: CourseId, controlIndex: number, type: CourseControlType) => void;

  // Score course support
  setCourseType: (courseId: CourseId, courseType: 'normal' | 'score') => void;
  setControlScore: (courseId: CourseId, controlIndex: number, score: number | undefined) => void;

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
          const appLang = useAppSettingsStore.getState().appLanguage;
          const iofLang = SUPPORTED_IOF_LANGUAGES.find((l) => l.code === appLang)?.code ?? 'en';
          state.event = createEvent(name, iofLang);
          state.activeCourseId = null;
          state.selectedControlId = null;
        });
        // Clear undo history after temporal middleware finishes processing
        queueMicrotask(() => useEventStore.temporal.getState().clear());
      },

      setMapFile: (mapFile: MapFile) => {
        set((state) => {
          if (state.event) {
            state.event.mapFile = mapFile;
            // Default print scale to match map scale when first loading a map
            if (state.event.settings.printScale === DEFAULT_EVENT_SETTINGS.printScale) {
              state.event.settings.printScale = mapFile.scale;
            }
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

      renameCourse: (id: CourseId, name: string) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, id);
          if (course) {
            course.name = name;
          }
        });
      },

      deleteCourse: (id: CourseId) => {
        set((state) => {
          if (!state.event) return;
          const index = state.event.courses.findIndex((c) => c.id === id);
          if (index === -1) return;

          state.event.courses.splice(index, 1);

          // TODO: orphan control cleanup — controls that belong only to this
          // course remain in the pool but don't affect display (just nextControlCode)

          // Switch activeCourseId to an adjacent course or null
          if (state.activeCourseId === id) {
            const remaining = state.event.courses;
            const next = remaining[index] ?? remaining[index - 1] ?? null;
            state.activeCourseId = next?.id ?? null;
            state.selectedControlId = null;
          }
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

          // Auto-cleanup: if control is no longer referenced by any course, remove it
          const stillReferenced = state.event.courses.some((c) =>
            c.controls.some((cc) => cc.controlId === controlId),
          );
          if (!stillReferenced) {
            delete state.event.controls[controlId];
          }
        });
      },

      deleteControl: (controlId: ControlId) => {
        set((state) => {
          if (!state.event) return;

          // Remove from all courses
          for (const course of state.event.courses) {
            course.controls = course.controls.filter(
              (cc) => cc.controlId !== controlId,
            );
            deriveCourseControlTypes(course.controls);
          }

          // Remove from controls pool
          delete state.event.controls[controlId];

          if (state.selectedControlId === controlId) {
            state.selectedControlId = null;
          }
        });
      },

      setControlCode: (controlId: ControlId, code: number) => {
        set((state) => {
          const control = state.event?.controls[controlId];
          if (control) control.code = code;
        });
      },

      setEventName: (name: string) => {
        set((state) => {
          if (state.event) state.event.name = name;
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

          // Duplicate guard — do not insert if control already in course
          if (course.controls.some((cc) => cc.controlId === controlId)) return;

          const courseControl: CourseControl = {
            controlId,
            type: 'control',
          };
          course.controls.splice(atIndex, 0, courseControl);
          deriveCourseControlTypes(course.controls);
        });
      },

      // --- Description editing ---

      updateControlDescription: (id: ControlId, column: string, value: string | undefined) => {
        set((state) => {
          const control = state.event?.controls[id];
          if (!control) return;
          const key = `column${column}` as keyof typeof control.description;
          if (key in control.description || key.startsWith('column')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (control.description as any)[key] = value;
          }
        });
      },

      // --- File operations ---

      loadEvent: (event: OverprintEvent) => {
        set((state) => {
          state.event = event;
          state.activeCourseId = event.courses[0]?.id ?? null;
          state.selectedControlId = null;
        });
        // Clear undo history after temporal middleware finishes processing
        queueMicrotask(() => useEventStore.temporal.getState().clear());
      },

      importControlsAndCourses: (controls: Control[], courses: Course[]) => {
        set((state) => {
          if (!state.event) return;
          for (const ctrl of controls) {
            state.event.controls[ctrl.id] = ctrl;
          }
          for (const course of courses) {
            state.event.courses.push(course);
          }
          // Set the first imported course as active if none selected
          if (!state.activeCourseId && courses.length > 0) {
            state.activeCourseId = courses[0]!.id;
          }
        });
      },

      // --- Number offset update ---

      setNumberOffset: (courseId: CourseId, controlIndex: number, offset: MapPoint) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          const cc = course.controls[controlIndex];
          if (cc) {
            cc.numberOffset = offset;
          }
        });
      },

      // --- Control type (crossing point / map exchange) ---

      setCourseControlType: (courseId: CourseId, controlIndex: number, type: CourseControlType) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          const cc = course.controls[controlIndex];
          // Only allow setting non-endpoint types on middle controls
          if (cc && controlIndex > 0 && controlIndex < course.controls.length - 1) {
            cc.type = type;
          }
        });
      },

      // --- Score course support ---

      setCourseType: (courseId: CourseId, courseType: 'normal' | 'score') => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (course) course.courseType = courseType;
        });
      },

      setControlScore: (courseId: CourseId, controlIndex: number, score: number | undefined) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          const cc = course.controls[controlIndex];
          if (cc) {
            cc.score = score;
          }
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
