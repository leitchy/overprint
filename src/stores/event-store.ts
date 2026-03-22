import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type {
  Control,
  ControlDescription,
  Course,
  CourseControl,
  CourseControlType,
  CourseSettings,
  EventSettings,
  MapFile,
  MapPoint,
  OverprintEvent,
  SpecialItem,
  LegGap,
} from '@/core/models/types';
import type { ControlId, CourseId, SpecialItemId } from '@/utils/id';
import { generateCourseId } from '@/utils/id';
import { createEvent, createCourse, createControl, DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';
import { useAppSettingsStore } from './app-settings-store';
import { SUPPORTED_IOF_LANGUAGES } from '@/i18n/languages';

export type ViewMode = 'allControls' | 'course';

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
    // Preserve 'crossingPoint', 'mapExchange', and 'mapFlip' for middle controls
  }
}

import { AMBIGUOUS_CODES } from '@/core/validation/ambiguous-codes';

function nextControlCode(event: OverprintEvent): number {
  const codes = Object.values(event.controls).map((c) => c.code);
  let next = codes.length > 0 ? Math.max(...codes) + 1 : 31;
  while (AMBIGUOUS_CODES.has(next)) next++;
  return next;
}

// --- State interfaces ---

interface EventState {
  event: OverprintEvent | null;
  // UI state — not undoable (excluded from partialize)
  activeCourseId: CourseId | null;
  selectedControlId: ControlId | null;
  viewMode: ViewMode;
  /** Which background courses are visible on the canvas. Keyed by CourseId string. */
  visibleCourseIds: Record<string, boolean>;
  /** Show non-current controls (pink, no legs) when a course is selected */
  showNonCurrentControls: boolean;
  /** Which part of the active multi-part course is selected. null = all parts. */
  activePartIndex: number | null;
}

interface EventActions {
  newEvent: (name: string) => void;
  setMapFile: (mapFile: MapFile) => void;
  setMapScale: (scale: number) => void;
  setMapDpi: (dpi: number) => void;
  updateSettings: (settings: Partial<EventSettings>) => void;

  // Course management
  addCourse: (name: string) => void;
  duplicateCourse: (id: CourseId) => void;
  renameCourse: (id: CourseId, name: string) => void;
  deleteCourse: (id: CourseId) => void;
  setActiveCourse: (id: CourseId | null) => void;
  showAllControls: () => void;
  setSelectedControl: (id: ControlId | null) => void;

  // Course parts
  setActivePartIndex: (index: number | null) => void;

  // Background course visibility
  toggleCourseVisibility: (id: CourseId) => void;
  showAllCourses: () => void;
  hideAllCourses: () => void;
  toggleNonCurrentControls: () => void;

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

  // Leg bend points
  setBendPoints: (courseId: CourseId, controlIndex: number, bendPoints: MapPoint[] | undefined) => void;
  addBendPoint: (courseId: CourseId, controlIndex: number, insertAt: number, point: MapPoint) => void;
  removeBendPoint: (courseId: CourseId, controlIndex: number, bendIndex: number) => void;

  // Leg gaps
  addLegGap: (courseId: CourseId, controlIndex: number, gap: LegGap) => void;
  removeLegGap: (courseId: CourseId, controlIndex: number, gapIndex: number) => void;
  updateLegGap: (courseId: CourseId, controlIndex: number, gapIndex: number, gap: LegGap) => void;

  // Control type (crossing point / map exchange)
  setCourseControlType: (courseId: CourseId, controlIndex: number, type: CourseControlType) => void;

  // Score course support
  setCourseType: (courseId: CourseId, courseType: 'normal' | 'score') => void;
  setControlScore: (courseId: CourseId, controlIndex: number, score: number | undefined) => void;

  // Low-level control operations (internal — prefer course-aware actions)
  updateControlPosition: (id: ControlId, position: MapPoint) => void;

  // Course settings
  updateCourseSettings: (courseId: CourseId, updates: Partial<CourseSettings>) => void;
  clearPrintArea: (courseId: CourseId) => void;

  // Special item operations
  addSpecialItem: (item: SpecialItem) => void;
  updateSpecialItem: (id: SpecialItemId, updates: Partial<SpecialItem>) => void;
  deleteSpecialItem: (id: SpecialItemId) => void;
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
      viewMode: 'course',
      visibleCourseIds: {},
      showNonCurrentControls: false,
      activePartIndex: null,

      newEvent: (name: string) => {
        set((state) => {
          const appLang = useAppSettingsStore.getState().appLanguage;
          const iofLang = SUPPORTED_IOF_LANGUAGES.find((l) => l.code === appLang)?.code ?? 'en';
          state.event = createEvent(name, iofLang);
          state.activeCourseId = null;
          state.selectedControlId = null;
          state.viewMode = 'course';
          state.visibleCourseIds = {};
          state.showNonCurrentControls = false;
          state.activePartIndex = null;
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
          state.viewMode = 'course';
        });
      },

      duplicateCourse: (id: CourseId) => {
        set((state) => {
          if (!state.event) return;
          const source = state.event.courses.find((c) => c.id === id);
          if (!source) return;
          const newId = generateCourseId();
          const clone: Course = {
            id: newId,
            name: `${source.name} (copy)`,
            courseType: source.courseType,
            controls: source.controls.map((cc) => ({ ...cc })),
            climb: source.climb,
            settings: JSON.parse(JSON.stringify(source.settings)),
            partOptions: source.partOptions ? JSON.parse(JSON.stringify(source.partOptions)) : undefined,
          };
          // Insert after the source course
          const index = state.event.courses.findIndex((c) => c.id === id);
          state.event.courses.splice(index + 1, 0, clone);
          state.activeCourseId = newId;
          state.viewMode = 'course';
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
          delete state.visibleCourseIds[id];

          // TODO: orphan control cleanup — controls that belong only to this
          // course remain in the pool but don't affect display (just nextControlCode)

          // Switch activeCourseId to an adjacent course or null
          if (state.activeCourseId === id) {
            const remaining = state.event.courses;
            const next = remaining[index] ?? remaining[index - 1] ?? null;
            state.activeCourseId = next?.id ?? null;
            state.selectedControlId = null;
            state.activePartIndex = null;
            // If no courses remain, switch to all-controls view
            if (!state.activeCourseId) {
              state.viewMode = 'allControls';
            }
          }
        });
      },

      setActiveCourse: (id: CourseId | null) => {
        set((state) => {
          state.activeCourseId = id;
          state.selectedControlId = null;
          state.viewMode = 'course';
          state.activePartIndex = null;
        });
      },

      showAllControls: () => {
        set((state) => {
          state.viewMode = 'allControls';
          state.activeCourseId = null;
          state.selectedControlId = null;
        });
      },

      setActivePartIndex: (index: number | null) => {
        set((state) => {
          state.activePartIndex = index;
        });
      },

      setSelectedControl: (id: ControlId | null) => {
        set((state) => {
          state.selectedControlId = id;
        });
      },

      // --- Background course visibility ---

      toggleCourseVisibility: (id: CourseId) => {
        set((state) => {
          if (state.visibleCourseIds[id]) {
            delete state.visibleCourseIds[id];
          } else {
            state.visibleCourseIds[id] = true;
          }
        });
      },

      showAllCourses: () => {
        set((state) => {
          if (!state.event) return;
          const vis: Record<string, boolean> = {};
          for (const course of state.event.courses) {
            if (course.id !== state.activeCourseId) {
              vis[course.id] = true;
            }
          }
          state.visibleCourseIds = vis;
        });
      },

      hideAllCourses: () => {
        set((state) => {
          state.visibleCourseIds = {};
          state.showNonCurrentControls = false;
        });
      },

      toggleNonCurrentControls: () => {
        set((state) => {
          state.showNonCurrentControls = !state.showNonCurrentControls;
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
            // Clear bend/gap data on the moved control and its new neighbours
            // (leg geometry is meaningless after reorder)
            removed.bendPoints = undefined;
            removed.legGaps = undefined;
            course.controls.splice(toIndex, 0, removed);
            // Clear bends on the control now before the moved one
            if (toIndex > 0) {
              const prev = course.controls[toIndex - 1];
              if (prev) { prev.bendPoints = undefined; prev.legGaps = undefined; }
            }
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

          // Split bend points if inserting on a bent leg
          const prevCC = atIndex > 0 ? course.controls[atIndex - 1] : undefined;
          if (prevCC?.bendPoints && prevCC.bendPoints.length > 0) {
            // Find which segment the insertion is on (approximate: use midpoint split)
            // The inserted control's position determines the split, but we don't have
            // easy access to the geometry here. Use a simple heuristic: split bend
            // points roughly in half for the two new legs.
            const control = state.event.controls[controlId];
            const prevControl = state.event.controls[prevCC.controlId];
            if (control && prevControl) {
              // Find the nearest bend point to the insertion position
              const bends = prevCC.bendPoints;
              let bestIdx = 0;
              let bestDist = Infinity;
              for (let i = 0; i < bends.length; i++) {
                const dx = bends[i]!.x - control.position.x;
                const dy = bends[i]!.y - control.position.y;
                const d = dx * dx + dy * dy;
                if (d < bestDist) { bestDist = d; bestIdx = i; }
              }
              // Split: bends before the nearest go to the first leg, bends after go to the new control's leg
              const firstLegBends = bends.slice(0, bestIdx);
              const secondLegBends = bends.slice(bestIdx + 1);
              prevCC.bendPoints = firstLegBends.length > 0 ? firstLegBends : undefined;
              // The new CourseControl will get the second leg's bends after insertion
              var newCCBendPoints: MapPoint[] | undefined = secondLegBends.length > 0 ? secondLegBends : undefined;
            }
            // Drop leg gaps — too complex to remap
            prevCC.legGaps = undefined;
          }

          const courseControl: CourseControl = {
            controlId,
            type: 'control',
            bendPoints: typeof newCCBendPoints !== 'undefined' ? newCCBendPoints : undefined,
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
          const descKey = `column${column}` as keyof ControlDescription;
          if (descKey in control.description || descKey.startsWith('column')) {
            // ControlDescription.columnD is the only required field (string).
            // All others are optional (string | undefined). We assert via a
            // type-narrowing write rather than bypassing the type system with any.
            const desc = control.description as Record<string, string | undefined>;
            desc[descKey] = value;
          }
        });
      },

      // --- File operations ---

      loadEvent: (event: OverprintEvent) => {
        set((state) => {
          state.event = event;
          state.activeCourseId = event.courses[0]?.id ?? null;
          state.selectedControlId = null;
          state.viewMode = event.courses.length > 0 ? 'course' : 'allControls';
          state.visibleCourseIds = {};
          state.showNonCurrentControls = false;
          state.activePartIndex = null;
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

      // --- Leg bend points ---

      setBendPoints: (courseId, controlIndex, bendPoints) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (cc) cc.bendPoints = bendPoints;
        });
      },

      addBendPoint: (courseId, controlIndex, insertAt, point) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (!cc) return;
          if (!cc.bendPoints) cc.bendPoints = [];
          cc.bendPoints.splice(insertAt, 0, point);
        });
      },

      removeBendPoint: (courseId, controlIndex, bendIndex) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (!cc?.bendPoints) return;
          cc.bendPoints.splice(bendIndex, 1);
          if (cc.bendPoints.length === 0) cc.bendPoints = undefined;
        });
      },

      // --- Leg gaps ---

      addLegGap: (courseId, controlIndex, gap) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (!cc) return;
          if (!cc.legGaps) cc.legGaps = [];
          cc.legGaps.push(gap);
        });
      },

      removeLegGap: (courseId, controlIndex, gapIndex) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (!cc?.legGaps) return;
          cc.legGaps.splice(gapIndex, 1);
          if (cc.legGaps.length === 0) cc.legGaps = undefined;
        });
      },

      updateLegGap: (courseId, controlIndex, gapIndex, gap) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const cc = course?.controls[controlIndex];
          if (!cc?.legGaps?.[gapIndex]) return;
          cc.legGaps[gapIndex] = gap;
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

      // --- Course settings ---

      updateCourseSettings: (courseId: CourseId, updates: Partial<CourseSettings>) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (course) {
            Object.assign(course.settings, updates);
          }
        });
      },

      clearPrintArea: (courseId: CourseId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (course) {
            course.settings.printArea = undefined;
          }
        });
      },

      // --- Special item CRUD ---

      addSpecialItem: (item: SpecialItem) => {
        set((state) => {
          if (!state.event) return;
          state.event.specialItems.push(item);
        });
      },

      updateSpecialItem: (id: SpecialItemId, updates: Partial<SpecialItem>) => {
        set((state) => {
          if (!state.event) return;
          const index = state.event.specialItems.findIndex((si) => si.id === id);
          if (index === -1) return;
          Object.assign(state.event.specialItems[index]!, updates);
        });
      },

      deleteSpecialItem: (id: SpecialItemId) => {
        set((state) => {
          if (!state.event) return;
          state.event.specialItems = state.event.specialItems.filter((si) => si.id !== id);
        });
      },
    })),
    {
      partialize: (state) => ({ event: state.event }),
      limit: 100,
    },
  ),
);
