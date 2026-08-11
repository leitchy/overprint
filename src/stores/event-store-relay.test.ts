import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from './event-store';
import { serializeEvent, deserializeEvent } from '@/core/files/overprint-format';
import type { CourseId } from '@/utils/id';

beforeEach(() => {
  useEventStore.setState({
    event: null,
    activeCourseId: null,
    selectedControlId: null,
    activeVariationIndex: 0,
  });
  useEventStore.temporal.getState().clear();
});

function setupCourse(n = 4): CourseId {
  useEventStore.getState().newEvent('Relay test');
  useEventStore.getState().addCourse('Relay');
  for (let i = 0; i < n; i++) {
    useEventStore.getState().addControlToCourse({ x: i * 100, y: 0 });
  }
  return useEventStore.getState().activeCourseId!;
}

function getCourse(courseId: CourseId) {
  return useEventStore.getState().event!.courses.find((c) => c.id === courseId)!;
}

/** Add a 2-branch fork at the interior control index 1; return its ids. */
function addForkAndGetIds(courseId: CourseId) {
  const anchor = getCourse(courseId).controls[1]!.courseControlId!;
  useEventStore.getState().addFork(courseId, anchor);
  const fork = getCourse(courseId).variations![0]!;
  return { forkId: fork.id, branchA: fork.branches[0]!.id, branchB: fork.branches[1]!.id };
}

describe('setRelaySettings', () => {
  it('sets settings with defaults and clamps inputs', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 12 });
    expect(getCourse(courseId).relay).toEqual({ firstTeamNumber: 1, teams: 12, legs: 1 });

    useEventStore.getState().setRelaySettings(courseId, { legs: 3.9, firstTeamNumber: -5 });
    expect(getCourse(courseId).relay).toEqual({ firstTeamNumber: 0, teams: 12, legs: 3 });
  });

  it('clears relay when teams set to 0', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 8, legs: 3 });
    expect(getCourse(courseId).relay).toBeDefined();
    useEventStore.getState().setRelaySettings(courseId, { teams: 0 });
    expect(getCourse(courseId).relay).toBeUndefined();
  });

  it('produces an undo entry and does not throw', () => {
    const courseId = setupCourse();
    const before = useEventStore.temporal.getState().pastStates.length;
    useEventStore.getState().setRelaySettings(courseId, { teams: 6, legs: 2 });
    const after = useEventStore.temporal.getState().pastStates.length;
    expect(after).toBeGreaterThan(before);
  });
});

describe('duplicateCourse copies relay', () => {
  it('copies relay settings onto the clone (deep, independent)', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 10, legs: 3, firstTeamNumber: 64 });
    useEventStore.getState().duplicateCourse(courseId);
    const clone = useEventStore.getState().event!.courses.find((c) => c.name === 'Relay (copy)')!;
    expect(clone.relay).toEqual({ teams: 10, legs: 3, firstTeamNumber: 64 });
    // Independent object — mutating the source doesn't touch the clone.
    useEventStore.getState().setRelaySettings(courseId, { teams: 20 });
    expect(clone.relay!.teams).toBe(10);
  });
});

describe('.overprint round-trip preserves relay', () => {
  it('serialize → deserialize keeps relay settings', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 15, legs: 4, firstTeamNumber: 1 });
    const json = serializeEvent(useEventStore.getState().event!);
    const { event } = deserializeEvent(json);
    const course = event.courses.find((c) => c.id === courseId)!;
    expect(course.relay).toEqual({ teams: 15, legs: 4, firstTeamNumber: 1 });
  });
});

describe('toggleRelayFixedLeg (Phase 3b)', () => {
  it('toggles a pin, enforces one branch per leg per fork, and prunes empties', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 6, legs: 3 });
    const { forkId, branchA, branchB } = addForkAndGetIds(courseId);

    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 0);
    expect(getCourse(courseId).relay!.fixedBranches).toEqual({ [branchA]: [0] });

    // Pinning leg 0 to B moves it off A (one branch per leg per fork).
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchB, 0);
    expect(getCourse(courseId).relay!.fixedBranches).toEqual({ [branchB]: [0] });

    // Toggling the same cell off clears the pin and prunes the record.
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchB, 0);
    expect(getCourse(courseId).relay!.fixedBranches).toBeUndefined();
  });

  it('is a no-op when the course has no relay', () => {
    const courseId = setupCourse();
    const { forkId, branchA } = addForkAndGetIds(courseId);
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 0);
    expect(getCourse(courseId).relay).toBeUndefined();
  });

  it('reducing then increasing legs does not resurrect out-of-range pins', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 6, legs: 4 });
    const { forkId, branchA } = addForkAndGetIds(courseId);
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 3);

    useEventStore.getState().setRelaySettings(courseId, { legs: 2 }); // drops leg-3 pin
    expect(getCourse(courseId).relay!.fixedBranches).toBeUndefined();
    useEventStore.getState().setRelaySettings(courseId, { legs: 4 }); // must NOT resurrect
    expect(getCourse(courseId).relay!.fixedBranches).toBeUndefined();
  });

  it('removeBranch drops that branch’s pins', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 6, legs: 3 });
    const { forkId, branchA } = addForkAndGetIds(courseId);
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 0);
    useEventStore.getState().removeBranch(courseId, forkId, branchA);
    expect(getCourse(courseId).relay!.fixedBranches).toBeUndefined();
  });

  it('.overprint round-trip preserves fixed pins', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 8, legs: 3 });
    const { forkId, branchA } = addForkAndGetIds(courseId);
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 1);

    const json = serializeEvent(useEventStore.getState().event!);
    const { event } = deserializeEvent(json);
    const course = event.courses.find((c) => c.id === courseId)!;
    expect(course.relay!.fixedBranches).toEqual({ [branchA]: [1] });
  });
});

describe('duplicateCourse remaps fixed pins (Phase 3b)', () => {
  it('keys the clone’s pins by the clone’s new BranchIds, independently of the source', () => {
    const courseId = setupCourse();
    useEventStore.getState().setRelaySettings(courseId, { teams: 8, legs: 3 });
    const { forkId, branchA } = addForkAndGetIds(courseId);
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 0);

    useEventStore.getState().duplicateCourse(courseId);
    const cloneBranchA = () =>
      useEventStore.getState().event!.courses.find((c) => c.name === 'Relay (copy)')!.variations![0]!
        .branches[0]!.id;
    const cloneRelay = () =>
      useEventStore.getState().event!.courses.find((c) => c.name === 'Relay (copy)')!.relay!;

    // Pin is remapped onto the clone's regenerated BranchId (not the source's).
    expect(cloneRelay().fixedBranches).toEqual({ [cloneBranchA()]: [0] });
    expect(cloneBranchA()).not.toBe(branchA);

    // Mutating the source's pins does not touch the clone.
    useEventStore.getState().toggleRelayFixedLeg(courseId, forkId, branchA, 1);
    expect(cloneRelay().fixedBranches).toEqual({ [cloneBranchA()]: [0] });
  });
});
