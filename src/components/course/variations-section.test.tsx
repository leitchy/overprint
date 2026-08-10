import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEventStore } from '@/stores/event-store';
import type { CourseId } from '@/utils/id';
import { VariationsSection } from './variations-section';

beforeEach(() => {
  useEventStore.setState({
    event: null,
    activeCourseId: null,
    selectedControlId: null,
    activeVariationIndex: 0,
  });
  useEventStore.temporal.getState().clear();
});

/** Create an event with one course of `n` trunk controls; returns the course id. */
function setupCourse(n = 4): CourseId {
  useEventStore.getState().newEvent('Fork UI test');
  useEventStore.getState().addCourse('Relay');
  for (let i = 0; i < n; i++) {
    useEventStore.getState().addControlToCourse({ x: i * 100, y: 0 });
  }
  return useEventStore.getState().activeCourseId!;
}

function getCourse(courseId: CourseId) {
  return useEventStore.getState().event!.courses.find((c) => c.id === courseId)!;
}

/** Add a fork at trunk[1] and put one (shared) control into each branch. */
function addPopulatedFork(courseId: CourseId) {
  const course = getCourse(courseId);
  const anchor = course.controls[1]!.courseControlId!;
  useEventStore.getState().addFork(courseId, anchor);
  const fork = getCourse(courseId).variations![0]!;
  const store = useEventStore.getState();
  store.addControlToBranch(courseId, fork.id, fork.branches[0]!.id, course.controls[1]!.controlId);
  store.addControlToBranch(courseId, fork.id, fork.branches[1]!.id, course.controls[2]!.controlId);
  return getCourse(courseId).variations![0]!;
}

/** Render the section (fresh course snapshot from the store) and expand it. */
function renderOpenSection(courseId: CourseId, selectedControlId: ReturnType<typeof getCourse>['controls'][number]['controlId'] | null = null) {
  const event = useEventStore.getState().event!;
  const result = render(
    <VariationsSection
      course={getCourse(courseId)}
      controls={event.controls}
      courseId={courseId}
      selectedControlId={selectedControlId}
    />,
  );
  fireEvent.click(screen.getByText('Variations'));
  return result;
}

describe('VariationsSection', () => {
  it('shows one variation per branch of a 2-branch fork', () => {
    const courseId = setupCourse();
    addPopulatedFork(courseId);
    renderOpenSection(courseId);

    const picker = screen.getByRole('combobox', { name: 'Variation' });
    const options = Array.from(picker.querySelectorAll('option'));
    expect(options).toHaveLength(2);
    // No mapFile → labels are the bare variation codes
    expect(options.map((o) => o.textContent)).toEqual(['A', 'B']);
  });

  it('clamps a stale activeVariationIndex to the last variation', () => {
    const courseId = setupCourse();
    addPopulatedFork(courseId);
    useEventStore.getState().setActiveVariationIndex(99);
    renderOpenSection(courseId);

    const picker = screen.getByRole('combobox', { name: 'Variation' }) as HTMLSelectElement;
    expect(picker.value).toBe('1');
  });

  it('changing the picker drives setActiveVariationIndex', () => {
    const courseId = setupCourse();
    addPopulatedFork(courseId);
    renderOpenSection(courseId);

    const picker = screen.getByRole('combobox', { name: 'Variation' });
    fireEvent.change(picker, { target: { value: '1' } });
    expect(useEventStore.getState().activeVariationIndex).toBe(1);
  });

  it('warns inline about empty branches', () => {
    const courseId = setupCourse();
    const anchor = getCourse(courseId).controls[1]!.courseControlId!;
    useEventStore.getState().addFork(courseId, anchor);
    renderOpenSection(courseId);

    expect(screen.getByText(/Branch A has no controls yet/)).toBeInTheDocument();
    expect(screen.getByText(/Branch B has no controls yet/)).toBeInTheDocument();
  });

  it('disables "add fork" for a start control, enables it for an interior control', () => {
    const courseId = setupCourse();
    const trunk = getCourse(courseId).controls;

    const first = renderOpenSection(courseId, trunk[0]!.controlId);
    expect(screen.getByText('Add fork at selected control')).toBeDisabled();
    first.unmount();

    renderOpenSection(courseId, trunk[1]!.controlId);
    const button = screen.getByText('Add fork at selected control');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(getCourse(courseId).variations).toHaveLength(1);
  });

  it('hides the variation picker for a no-fork course', () => {
    const courseId = setupCourse();
    renderOpenSection(courseId);
    expect(screen.queryByRole('combobox', { name: 'Variation' })).toBeNull();
  });
});
