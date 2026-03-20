import { describe, it, expect } from 'vitest';
import { auditEvent } from './event-audit';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import type { OverprintEvent, Course, Control } from '@/core/models/types';
import type { ControlId } from '@/utils/id';

/** Build a minimal event for testing. */
function buildEvent(
  overrides: Partial<OverprintEvent> = {},
): OverprintEvent {
  const base = createEvent('Test Event');
  return { ...base, ...overrides };
}

/** Build a course with controls already wired up. */
function buildCourseWithControls(
  name: string,
  controlDefs: { code: number; x: number; y: number; type?: 'start' | 'control' | 'finish' }[],
): { course: Course; controls: Record<ControlId, Control> } {
  const course = createCourse(name);
  const controls: Record<ControlId, Control> = {};

  for (const def of controlDefs) {
    const ctrl = createControl(def.code, { x: def.x, y: def.y }, { columnD: '1.1' });
    controls[ctrl.id] = ctrl;
    course.controls.push({
      controlId: ctrl.id,
      type: def.type ?? 'control',
    });
  }

  return { course, controls };
}

describe('auditEvent', () => {
  it('returns empty array for a valid event', () => {
    const { course, controls } = buildCourseWithControls('Course 1', [
      { code: 31, x: 100, y: 100, type: 'start' },
      { code: 32, x: 200, y: 200 },
      { code: 33, x: 400, y: 400, type: 'finish' },
    ]);
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items).toEqual([]);
  });

  it('reports error when no map is loaded', () => {
    const event = buildEvent({ mapFile: null });
    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditNoMap')).toBe(true);
  });

  it('reports error for empty course', () => {
    const course = createCourse('Empty');
    const event = buildEvent({
      courses: [course],
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditEmptyCourse')).toBe(true);
  });

  it('reports error for missing start in normal course', () => {
    const { course, controls } = buildCourseWithControls('No Start', [
      { code: 31, x: 100, y: 100 }, // no type: 'start'
      { code: 32, x: 200, y: 200, type: 'finish' },
    ]);
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditMissingStart')).toBe(true);
  });

  it('reports error for missing finish in normal course', () => {
    const { course, controls } = buildCourseWithControls('No Finish', [
      { code: 31, x: 100, y: 100, type: 'start' },
      { code: 32, x: 200, y: 200 }, // no type: 'finish'
    ]);
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditMissingFinish')).toBe(true);
  });

  it('does not report missing start/finish for score courses', () => {
    const { course, controls } = buildCourseWithControls('Score', [
      { code: 31, x: 100, y: 100 },
      { code: 32, x: 200, y: 200 },
    ]);
    course.courseType = 'score';
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditMissingStart')).toBe(false);
    expect(items.some((i) => i.messageKey === 'auditMissingFinish')).toBe(false);
  });

  it('reports error for duplicate control codes', () => {
    const ctrl1 = createControl(42, { x: 100, y: 100 }, { columnD: '1.1' });
    const ctrl2 = createControl(42, { x: 200, y: 200 }, { columnD: '1.2' });
    const course = createCourse('Dupes');
    course.controls = [
      { controlId: ctrl1.id, type: 'start' },
      { controlId: ctrl2.id, type: 'finish' },
    ];
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl1.id]: ctrl1, [ctrl2.id]: ctrl2 },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditDuplicateCode' && i.messageParams?.code === 42)).toBe(true);
  });

  it('reports warning for missing description (columnD)', () => {
    const ctrl = createControl(31, { x: 100, y: 100 }); // default columnD is ''
    const course = createCourse('Missing Desc');
    course.controls = [{ controlId: ctrl.id, type: 'start' }];
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl.id]: ctrl },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditMissingDescription')).toBe(true);
  });

  it('reports warning for unused controls', () => {
    const ctrl1 = createControl(31, { x: 100, y: 100 }, { columnD: '1.1' });
    const ctrlUnused = createControl(99, { x: 500, y: 500 }, { columnD: '1.2' });
    const course = createCourse('Used');
    course.controls = [{ controlId: ctrl1.id, type: 'start' }];
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl1.id]: ctrl1, [ctrlUnused.id]: ctrlUnused },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditUnusedControl' && i.messageParams?.code === 99)).toBe(true);
  });

  it('reports warning for control outside map bounds', () => {
    const ctrl = createControl(31, { x: -10, y: 100 }, { columnD: '1.1' });
    const course = createCourse('OOB');
    course.controls = [{ controlId: ctrl.id, type: 'start' }];
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl.id]: ctrl },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event, { imgWidth: 1000, imgHeight: 1000 });
    expect(items.some((i) => i.messageKey === 'auditControlOutOfBounds')).toBe(true);
  });

  it('does not report bounds warning without mapContext', () => {
    const ctrl = createControl(31, { x: -10, y: 100 }, { columnD: '1.1' });
    const course = createCourse('OOB');
    course.controls = [{ controlId: ctrl.id, type: 'start' }];
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl.id]: ctrl },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    expect(items.some((i) => i.messageKey === 'auditControlOutOfBounds')).toBe(false);
  });

  it('sorts errors before warnings', () => {
    const ctrl = createControl(31, { x: 100, y: 100 }); // empty description = warning
    const course = createCourse('Mixed');
    // no controls = error (empty course won't trigger, so use missing start)
    course.controls = [{ controlId: ctrl.id, type: 'control' }]; // no start or finish
    const event = buildEvent({
      courses: [course],
      controls: { [ctrl.id]: ctrl },
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });

    const items = auditEvent(event);
    const severities = items.map((i) => i.severity);
    const firstWarningIndex = severities.indexOf('warning');
    const lastErrorIndex = severities.lastIndexOf('error');
    if (firstWarningIndex !== -1 && lastErrorIndex !== -1) {
      expect(lastErrorIndex).toBeLessThan(firstWarningIndex);
    }
  });
});
