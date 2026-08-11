import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import { overprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { autoNumberOffsets } from '@/core/geometry/auto-number-placement';
import type {
  Control,
  ControlDescription,
  Course,
  CourseControl,
  CourseControlType,
  CourseFork,
  CourseSettings,
  EventSettings,
  MapFile,
  MapPoint,
  OverprintEvent,
  RelaySettings,
  SpecialItem,
  LegGap,
  CircleGap,
} from '@/core/models/types';
import { addGap, simplifyGaps } from '@/core/geometry/circle-gaps';
import { DEFAULT_CIRCLE_GAP_DEG } from '@/core/models/constants';
import type { BranchId, ControlId, CourseControlId, CourseId, ForkId, SpecialItemId } from '@/utils/id';
import { generateBranchId, generateCourseControlId, generateCourseId, generateForkId } from '@/utils/id';
import { createEvent, createCourse, createControl, makeCourseControl, DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';
import { forEachCourseControl } from '@/core/models/course-controls';
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
  /** Which enumerated variation of the active forked course is shown (E10).
   *  Index into enumerateVariations(course).variations; 0 = first variation.
   *  Not undoable (excluded from partialize), mirrors activePartIndex. */
  activeVariationIndex: number;
  /** When set, new controls placed on the map go into this fork/loop branch instead
   *  of the trunk (E10 Phase 2 loop authoring). Not undoable. */
  activeLoopTarget: { forkId: ForkId; branchId: BranchId } | null;
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
  setPartShowFinish: (courseId: CourseId, partIndex: number, showFinish: boolean) => void;

  // Course forks / variations (E10)
  /** Attach a fork at an interior trunk control. Creates two empty branches
   *  ('A'/'B') — the fork is "in progress" until each branch has ≥1 control
   *  (courseForkIssues reports emptyBranch; enumeration/export are gated on it). */
  addFork: (courseId: CourseId, anchorCourseControlId: CourseControlId) => void;
  /** Attach a butterfly/phi loop generator (hub) at an interior trunk control. */
  addLoop: (courseId: CourseId, anchorCourseControlId: CourseControlId) => void;
  removeFork: (courseId: CourseId, forkId: ForkId) => void;
  /** Append a branch with the next free letter label ('C', 'D', …). */
  addBranch: (courseId: CourseId, forkId: ForkId) => void;
  /** Remove a branch. Removing the last branch removes the whole fork. */
  removeBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId) => void;
  setBranchLabel: (courseId: CourseId, forkId: ForkId, branchId: BranchId, label: string) => void;
  /** Append an existing pool control to a branch. */
  addControlToBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId, controlId: ControlId) => void;
  /** Remove one occurrence (by CourseControlId) from a branch. Pool controls no
   *  longer referenced anywhere are cleaned up, like removeControlFromCourse. */
  removeControlFromBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId, courseControlId: CourseControlId) => void;
  /** Geometry of the anchor→branch[0] entry leg (held on the branch). */
  setBranchEntryBendPoints: (courseId: CourseId, forkId: ForkId, branchId: BranchId, bendPoints: MapPoint[] | undefined) => void;
  setBranchEntryLegGaps: (courseId: CourseId, forkId: ForkId, branchId: BranchId, legGaps: LegGap[] | undefined) => void;
  setActiveVariationIndex: (index: number) => void;
  /** Set/clear the branch that map clicks place new controls into (loop authoring). */
  setActiveLoopTarget: (target: { forkId: ForkId; branchId: BranchId } | null) => void;
  /** Create a NEW control at `position` and append it to a fork/loop branch. */
  placeControlInBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId, position: MapPoint) => void;
  /** Set relay team-assignment settings on a course (E10 Phase 3). Clamps inputs
   *  and clears `course.relay` when `teams` is 0. */
  setRelaySettings: (courseId: CourseId, patch: Partial<RelaySettings>) => void;

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
  /** Set free-text dimensions for description column F (takes precedence over the F symbol). */
  setColumnFText: (id: ControlId, text: string | undefined) => void;

  // Control-circle gaps (stored on the shared Control; keyed by ControlId)
  /** Add a default-width gap centred on `angleDeg` (y-up, CCW degrees). */
  addCircleGap: (controlId: ControlId, angleDeg: number) => void;
  /** Replace a single gap (e.g. after dragging one of its endpoints). */
  updateCircleGap: (controlId: ControlId, gapIndex: number, gap: CircleGap) => void;
  /** Remove the gap at `gapIndex`. */
  removeCircleGap: (controlId: ControlId, gapIndex: number) => void;

  // File operations
  loadEvent: (event: OverprintEvent) => void;

  /**
   * Bulk-import controls and courses from an IOF XML parse result.
   * Appends to the existing event's controls and courses rather than replacing them.
   */
  importControlsAndCourses: (controls: Control[], courses: Course[]) => void;

  // Number offset (per-course draggable number position)
  setNumberOffset: (courseId: CourseId, controlIndex: number, offset: MapPoint) => void;
  /** Auto-place all control numbers in a course to avoid legs/circles/other numbers. */
  autoPlaceNumbers: (courseId: CourseId) => void;

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
  /** Translate every control, leg bend point, print area and special item by
   *  (dx, dy) map pixels — used to re-anchor the event onto a revised base map. */
  moveAllControls: (dx: number, dy: number) => void;

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

function findFork(course: Course, forkId: ForkId): CourseFork | undefined {
  return course.variations?.find((f) => f.id === forkId);
}

/** Anchor must resolve to an INTERIOR trunk control (matches the enumerator's
 *  drop rule in variation-enumerator.ts and courseForkIssues). */
function isForkAnchorResolvable(course: Course, anchorCourseControlId: CourseControlId): boolean {
  const idx = course.controls.findIndex((cc) => cc.courseControlId === anchorCourseControlId);
  return idx > 0 && idx < course.controls.length - 1;
}

/** True when a generator (fork or loop) already occupies this anchor — a second
 *  would be dropped by the enumerator, so creation is refused. */
function isAnchorOccupied(course: Course, anchorCourseControlId: CourseControlId): boolean {
  return (course.variations ?? []).some((f) => f.anchorCourseControlId === anchorCourseControlId);
}

/** After any trunk mutation: drop forks whose anchor no longer resolves to an
 *  interior trunk control (deleted, or pushed to first/last position). */
function dropOrphanedForks(course: Course): void {
  if (!course.variations) return;
  course.variations = course.variations.filter((f) =>
    isForkAnchorResolvable(course, f.anchorCourseControlId),
  );
  if (course.variations.length === 0) course.variations = undefined;
}

/** True when any course (trunk or fork branch) still references the control. */
function controlStillReferenced(event: OverprintEvent, controlId: ControlId): boolean {
  for (const course of event.courses) {
    let found = false;
    forEachCourseControl(course, (cc) => {
      if (cc.controlId === controlId) found = true;
    });
    if (found) return true;
  }
  return false;
}

/** Next free single-letter branch label: 'A', 'B', … 'Z', then 'AA', 'AB', …. */
function nextBranchLabel(fork: CourseFork): string {
  const used = new Set(fork.branches.map((b) => b.label));
  for (let i = 0; ; i++) {
    const label =
      i < 26
        ? String.fromCharCode(65 + i)
        : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
    if (!used.has(label)) return label;
  }
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
      activeVariationIndex: 0,
      activeLoopTarget: null,

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
          state.activeVariationIndex = 0;
          state.activeLoopTarget = null;
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

          // Regenerate every per-occurrence id so the copy never shares
          // CourseControlIds / ForkIds / BranchIds with the source (fork
          // addressing is by these ids — collisions would cross-wire courses).
          const idMap = new Map<CourseControlId, CourseControlId>();
          const cloneCourseControl = (cc: CourseControl): CourseControl => {
            const copy: CourseControl = JSON.parse(JSON.stringify(cc));
            copy.courseControlId = generateCourseControlId();
            if (cc.courseControlId) idMap.set(cc.courseControlId, copy.courseControlId);
            return copy;
          };
          const controls = source.controls.map(cloneCourseControl);

          // Copy forks, remapping each anchor onto the NEW trunk copy's id.
          // A fork whose anchor doesn't resolve in the source trunk is dropped
          // (same rule the enumerator applies to stale data).
          let variations: CourseFork[] | undefined;
          if (source.variations) {
            variations = [];
            for (const fork of source.variations) {
              const newAnchor = idMap.get(fork.anchorCourseControlId);
              if (!newAnchor) continue;
              variations.push({
                id: generateForkId(),
                kind: fork.kind,
                anchorCourseControlId: newAnchor,
                branches: fork.branches.map((b) => ({
                  id: generateBranchId(),
                  label: b.label,
                  entryBendPoints: b.entryBendPoints
                    ? JSON.parse(JSON.stringify(b.entryBendPoints))
                    : undefined,
                  entryLegGaps: b.entryLegGaps
                    ? JSON.parse(JSON.stringify(b.entryLegGaps))
                    : undefined,
                  controls: b.controls.map(cloneCourseControl),
                })),
              });
            }
            if (variations.length === 0) variations = undefined;
          }

          const clone: Course = {
            id: newId,
            name: `${source.name} (copy)`,
            courseType: source.courseType,
            controls,
            climb: source.climb,
            settings: JSON.parse(JSON.stringify(source.settings)),
            partOptions: source.partOptions ? JSON.parse(JSON.stringify(source.partOptions)) : undefined,
            variations,
            relay: source.relay ? { ...source.relay } : undefined,
          };
          // Insert after the source course
          const index = state.event.courses.findIndex((c) => c.id === id);
          state.event.courses.splice(index + 1, 0, clone);
          state.activeCourseId = newId;
          state.viewMode = 'course';
          state.activeVariationIndex = 0;
          state.activeLoopTarget = null;
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
            state.activeVariationIndex = 0;
          state.activeLoopTarget = null;
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
          state.activeVariationIndex = 0;
          state.activeLoopTarget = null;
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

      setActiveVariationIndex: (index: number) => {
        set((state) => {
          state.activeVariationIndex = Math.max(0, index);
        });
      },

      setActiveLoopTarget: (target) => {
        set((state) => {
          state.activeLoopTarget = target;
        });
      },

      placeControlInBranch: (courseId, forkId, branchId, position) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          if (!branch) return;
          // New control with an auto-incremented code, added to the shared pool.
          const control = createControl(nextControlCode(state.event), position);
          state.event.controls[control.id] = control;
          branch.controls.push(makeCourseControl(control.id, 'control'));
          state.selectedControlId = control.id;
        });
      },

      setRelaySettings: (courseId: CourseId, patch: Partial<RelaySettings>) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          const current: RelaySettings = course.relay ?? { firstTeamNumber: 1, teams: 0, legs: 1 };
          const next: RelaySettings = { ...current, ...patch };
          // Clamp to sane integers.
          next.firstTeamNumber = Math.max(0, Math.floor(next.firstTeamNumber) || 0);
          next.teams = Math.max(0, Math.floor(next.teams) || 0);
          next.legs = Math.max(1, Math.floor(next.legs) || 1);
          // teams === 0 means "not configured" — drop the relay block entirely.
          course.relay = next.teams === 0 ? undefined : next;
        });
      },

      // --- Course forks / variations (E10) ---

      addFork: (courseId: CourseId, anchorCourseControlId: CourseControlId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          // Anchor must be an interior trunk control (entry leg + rejoin exist)
          if (!isForkAnchorResolvable(course, anchorCourseControlId)) return;
          // At most one generator per anchor.
          if (isAnchorOccupied(course, anchorCourseControlId)) return;
          if (!course.variations) course.variations = [];
          course.variations.push({
            id: generateForkId(),
            kind: 'fork',
            anchorCourseControlId,
            branches: [
              { id: generateBranchId(), label: 'A', controls: [] },
              { id: generateBranchId(), label: 'B', controls: [] },
            ],
          });
        });
      },

      addLoop: (courseId: CourseId, anchorCourseControlId: CourseControlId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          // Hub must be an interior trunk control; at most one generator per anchor.
          if (!isForkAnchorResolvable(course, anchorCourseControlId)) return;
          if (isAnchorOccupied(course, anchorCourseControlId)) return;
          if (!course.variations) course.variations = [];
          // Seed two loops; the runner runs both, in either order (2! = 2 variations).
          course.variations.push({
            id: generateForkId(),
            kind: 'loop',
            anchorCourseControlId,
            branches: [
              { id: generateBranchId(), label: 'A', controls: [] },
              { id: generateBranchId(), label: 'B', controls: [] },
            ],
          });
        });
      },

      removeFork: (courseId: CourseId, forkId: ForkId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course?.variations) return;
          course.variations = course.variations.filter((f) => f.id !== forkId);
          if (course.variations.length === 0) course.variations = undefined;
          if (state.activeLoopTarget?.forkId === forkId) state.activeLoopTarget = null;
        });
      },

      addBranch: (courseId: CourseId, forkId: ForkId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          if (!fork) return;
          fork.branches.push({
            id: generateBranchId(),
            label: nextBranchLabel(fork),
            controls: [],
          });
        });
      },

      removeBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course?.variations) return;
          const fork = findFork(course, forkId);
          if (!fork) return;
          fork.branches = fork.branches.filter((b) => b.id !== branchId);
          // A fork with no branches is meaningless — remove it entirely
          if (fork.branches.length === 0) {
            course.variations = course.variations.filter((f) => f.id !== forkId);
            if (course.variations.length === 0) course.variations = undefined;
          }
          if (state.activeLoopTarget?.branchId === branchId) state.activeLoopTarget = null;
        });
      },

      setBranchLabel: (courseId: CourseId, forkId: ForkId, branchId: BranchId, label: string) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          const trimmed = label.trim();
          if (branch && trimmed !== '') branch.label = trimmed;
        });
      },

      addControlToBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId, controlId: ControlId) => {
        set((state) => {
          if (!state.event?.controls[controlId]) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          if (!branch) return;
          branch.controls.push(makeCourseControl(controlId, 'control'));
        });
      },

      removeControlFromBranch: (courseId: CourseId, forkId: ForkId, branchId: BranchId, courseControlId: CourseControlId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          if (!branch) return;
          const removed = branch.controls.find((cc) => cc.courseControlId === courseControlId);
          if (!removed) return;
          branch.controls = branch.controls.filter((cc) => cc.courseControlId !== courseControlId);
          // Same pool cleanup as removeControlFromCourse
          if (!controlStillReferenced(state.event, removed.controlId)) {
            delete state.event.controls[removed.controlId];
          }
        });
      },

      setBranchEntryBendPoints: (courseId: CourseId, forkId: ForkId, branchId: BranchId, bendPoints: MapPoint[] | undefined) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          if (branch) branch.entryBendPoints = bendPoints;
        });
      },

      setBranchEntryLegGaps: (courseId: CourseId, forkId: ForkId, branchId: BranchId, legGaps: LegGap[] | undefined) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          const fork = course && findFork(course, forkId);
          const branch = fork?.branches.find((b) => b.id === branchId);
          if (branch) branch.entryLegGaps = legGaps;
        });
      },

      setPartShowFinish: (courseId: CourseId, partIndex: number, showFinish: boolean) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          if (!course.partOptions) course.partOptions = [];
          if (!course.partOptions[partIndex]) course.partOptions[partIndex] = {};
          course.partOptions[partIndex]!.showFinish = showFinish;
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

          // Append to course (makeCourseControl assigns a stable courseControlId)
          course.controls.push(makeCourseControl(control.id, 'control'));

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
          dropOrphanedForks(course);

          if (state.selectedControlId === controlId) {
            state.selectedControlId = null;
          }

          // Auto-cleanup: if control is no longer referenced by any course
          // (trunk OR fork branch), remove it from the pool. Branch references
          // count — deleting the pool record would dangle the branch.
          if (!controlStillReferenced(state.event, controlId)) {
            delete state.event.controls[controlId];
          }
        });
      },

      deleteControl: (controlId: ControlId) => {
        set((state) => {
          if (!state.event) return;

          // Remove from all courses — trunks AND fork branches
          for (const course of state.event.courses) {
            course.controls = course.controls.filter(
              (cc) => cc.controlId !== controlId,
            );
            deriveCourseControlTypes(course.controls);
            for (const fork of course.variations ?? []) {
              for (const branch of fork.branches) {
                branch.controls = branch.controls.filter(
                  (cc) => cc.controlId !== controlId,
                );
              }
            }
            dropOrphanedForks(course);
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
            // A reorder can push a fork anchor to first/last (no rejoin)
            dropOrphanedForks(course);
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

          const courseControl = makeCourseControl(controlId, 'control', {
            bendPoints: typeof newCCBendPoints !== 'undefined' ? newCCBendPoints : undefined,
          });
          course.controls.splice(atIndex, 0, courseControl);
          deriveCourseControlTypes(course.controls);
          // Keep the fork invariant after any trunk mutation
          dropOrphanedForks(course);
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

      setColumnFText: (id: ControlId, text: string | undefined) => {
        set((state) => {
          const control = state.event?.controls[id];
          if (!control) return;
          control.description.columnFText = text && text.trim() !== '' ? text : undefined;
        });
      },

      addCircleGap: (controlId: ControlId, angleDeg: number) => {
        set((state) => {
          const control = state.event?.controls[controlId];
          if (!control) return;
          control.circleGaps = addGap(control.circleGaps, angleDeg, DEFAULT_CIRCLE_GAP_DEG);
        });
      },

      updateCircleGap: (controlId: ControlId, gapIndex: number, gap: CircleGap) => {
        set((state) => {
          const control = state.event?.controls[controlId];
          if (!control?.circleGaps || gapIndex < 0 || gapIndex >= control.circleGaps.length) return;
          const next = control.circleGaps.map((g, i) => (i === gapIndex ? gap : g));
          const simplified = simplifyGaps(next);
          control.circleGaps = simplified.length ? simplified : undefined;
        });
      },

      removeCircleGap: (controlId: ControlId, gapIndex: number) => {
        set((state) => {
          const control = state.event?.controls[controlId];
          if (!control?.circleGaps) return;
          const next = control.circleGaps.filter((_, i) => i !== gapIndex);
          control.circleGaps = next.length ? next : undefined;
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
          state.activeVariationIndex = 0;
          state.activeLoopTarget = null;
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
            // Guarantee the courseControlId invariant on imported sequences
            forEachCourseControl(course, (cc) => {
              if (!cc.courseControlId) cc.courseControlId = generateCourseControlId();
            });
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

      autoPlaceNumbers: (courseId: CourseId) => {
        set((state) => {
          if (!state.event) return;
          const course = findCourse(state.event, courseId);
          if (!course) return;
          const dpi = state.event.mapFile?.dpi ?? 150;
          const dims = overprintPixelDimensions(
            state.event.settings,
            dpi,
            state.event.mapFile?.scale,
            course.settings.printScale ?? state.event.settings.printScale,
          );
          const offsets = autoNumberOffsets(course, state.event.controls, dims);
          for (const [index, offset] of offsets) {
            const cc = course.controls[index];
            if (cc) cc.numberOffset = offset;
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

      moveAllControls: (dx: number, dy: number) => {
        if (dx === 0 && dy === 0) return;
        set((state) => {
          if (!state.event) return;
          for (const ctrl of Object.values(state.event.controls)) {
            ctrl.position.x += dx;
            ctrl.position.y += dy;
          }
          for (const course of state.event.courses) {
            // Trunk AND fork-branch leg geometry move with the map
            forEachCourseControl(course, (cc) => {
              if (cc.bendPoints) {
                for (const bp of cc.bendPoints) {
                  bp.x += dx;
                  bp.y += dy;
                }
              }
            });
            // Branch entry legs live on the branch, not on a CourseControl
            for (const fork of course.variations ?? []) {
              for (const branch of fork.branches) {
                if (branch.entryBendPoints) {
                  for (const bp of branch.entryBendPoints) {
                    bp.x += dx;
                    bp.y += dy;
                  }
                }
              }
            }
            const pa = course.settings.printArea;
            if (pa) {
              pa.minX += dx;
              pa.maxX += dx;
              pa.minY += dy;
              pa.maxY += dy;
            }
          }
          for (const item of state.event.specialItems) {
            item.position.x += dx;
            item.position.y += dy;
            if ('endPosition' in item && item.endPosition) {
              item.endPosition.x += dx;
              item.endPosition.y += dy;
            }
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
