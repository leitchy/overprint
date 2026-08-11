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
