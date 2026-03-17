import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from './event-store';

beforeEach(() => {
  useEventStore.setState({
    event: null,
    activeCourseId: null,
    selectedControlId: null,
  });
  useEventStore.temporal.getState().clear();
});

describe('event-store basics', () => {
  it('starts with null event', () => {
    expect(useEventStore.getState().event).toBeNull();
  });

  it('creates a new event', () => {
    useEventStore.getState().newEvent('Mt Taylor Sprint');
    const { event } = useEventStore.getState();
    expect(event).not.toBeNull();
    expect(event?.name).toBe('Mt Taylor Sprint');
  });

  it('sets map file', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().setMapFile({
      name: 'mt-taylor.pdf',
      type: 'pdf',
      scale: 10000,
      dpi: 200,
    });
    expect(useEventStore.getState().event?.mapFile?.name).toBe('mt-taylor.pdf');
  });

  it('sets map scale', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().setMapFile({
      name: 'map.png',
      type: 'raster',
      scale: 15000,
      dpi: 150,
    });
    useEventStore.getState().setMapScale(10000);
    expect(useEventStore.getState().event?.mapFile?.scale).toBe(10000);
  });
});

describe('course management', () => {
  it('adds a course', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addCourse('Long');
    const { event, activeCourseId } = useEventStore.getState();
    expect(event?.courses).toHaveLength(1);
    expect(event?.courses[0]?.name).toBe('Long');
    expect(activeCourseId).toBe(event?.courses[0]?.id);
  });
});

describe('addControlToCourse', () => {
  it('auto-creates Course 1 on first control', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    const { event } = useEventStore.getState();
    expect(event?.courses).toHaveLength(1);
    expect(event?.courses[0]?.name).toBe('Course 1');
  });

  it('creates control with code 31', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    const { event } = useEventStore.getState();
    const controls = Object.values(event!.controls);
    expect(controls).toHaveLength(1);
    expect(controls[0]?.code).toBe(31);
  });

  it('auto-increments codes', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    useEventStore.getState().addControlToCourse({ x: 300, y: 400 });
    useEventStore.getState().addControlToCourse({ x: 500, y: 600 });
    const { event } = useEventStore.getState();
    const codes = Object.values(event!.controls).map((c) => c.code).sort();
    expect(codes).toEqual([31, 32, 33]);
  });

  it('sets first control as start, last as finish', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    useEventStore.getState().addControlToCourse({ x: 300, y: 400 });
    useEventStore.getState().addControlToCourse({ x: 500, y: 600 });
    const course = useEventStore.getState().event!.courses[0]!;
    expect(course.controls[0]?.type).toBe('start');
    expect(course.controls[1]?.type).toBe('control');
    expect(course.controls[2]?.type).toBe('finish');
  });

  it('single control is typed as start', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    const course = useEventStore.getState().event!.courses[0]!;
    expect(course.controls).toHaveLength(1);
    // With one control, index 0 check (start) runs before last-index check (finish)
    expect(course.controls[0]?.type).toBe('start');
  });

  it('selects the newly added control', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    const { selectedControlId, event } = useEventStore.getState();
    const controlId = Object.keys(event!.controls)[0];
    expect(selectedControlId).toBe(controlId);
  });
});

describe('removeControlFromCourse', () => {
  it('removes a control from the course', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    useEventStore.getState().addControlToCourse({ x: 300, y: 400 });

    const { event, activeCourseId } = useEventStore.getState();
    const controlId = event!.courses[0]!.controls[0]!.controlId;

    useEventStore.getState().removeControlFromCourse(activeCourseId!, controlId);

    const updated = useEventStore.getState().event!.courses[0]!;
    expect(updated.controls).toHaveLength(1);
  });

  it('re-derives types after removal', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    useEventStore.getState().addControlToCourse({ x: 300, y: 400 });
    useEventStore.getState().addControlToCourse({ x: 500, y: 600 });

    const { event, activeCourseId } = useEventStore.getState();
    // Remove the middle control
    const middleId = event!.courses[0]!.controls[1]!.controlId;
    useEventStore.getState().removeControlFromCourse(activeCourseId!, middleId);

    const course = useEventStore.getState().event!.courses[0]!;
    expect(course.controls[0]?.type).toBe('start');
    expect(course.controls[1]?.type).toBe('finish');
  });
});

describe('moveControlInCourse', () => {
  it('reorders controls', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    useEventStore.getState().addControlToCourse({ x: 300, y: 400 });
    useEventStore.getState().addControlToCourse({ x: 500, y: 600 });

    const { activeCourseId, event } = useEventStore.getState();
    const firstControlId = event!.courses[0]!.controls[0]!.controlId;

    // Move first to last
    useEventStore.getState().moveControlInCourse(activeCourseId!, 0, 2);

    const course = useEventStore.getState().event!.courses[0]!;
    expect(course.controls[2]?.controlId).toBe(firstControlId);
    expect(course.controls[0]?.type).toBe('start');
    expect(course.controls[2]?.type).toBe('finish');
  });
});

describe('updateControlPosition', () => {
  it('updates position', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });
    const controlId = Object.keys(useEventStore.getState().event!.controls)[0]!;
    useEventStore.getState().updateControlPosition(controlId as any, { x: 150, y: 250 });
    expect(useEventStore.getState().event!.controls[controlId as any]?.position).toEqual({
      x: 150,
      y: 250,
    });
  });
});

describe('undo/redo', () => {
  it('undoes addControlToCourse', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });

    expect(Object.keys(useEventStore.getState().event!.controls)).toHaveLength(1);

    useEventStore.temporal.getState().undo();

    expect(Object.keys(useEventStore.getState().event!.controls)).toHaveLength(0);
  });

  it('redoes addControlToCourse', () => {
    useEventStore.getState().newEvent('Test');
    useEventStore.getState().addControlToCourse({ x: 100, y: 200 });

    useEventStore.temporal.getState().undo();
    useEventStore.temporal.getState().redo();

    expect(Object.keys(useEventStore.getState().event!.controls)).toHaveLength(1);
  });
});
