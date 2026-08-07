import { describe, it, expect } from 'vitest';
import { buildDescRows, formatLengthKm, formatClimb } from './desc-rows';
import type { Control, Course } from '@/core/models/types';
import { createCourse, createControl } from '@/core/models/defaults';
import type { ControlId } from '@/utils/id';

function scenario(): { course: Course; controls: Record<ControlId, Control> } {
  const start = createControl(101, { x: 0, y: 0 });
  const c1 = createControl(31, { x: 100, y: 0 });
  const c2 = createControl(32, { x: 200, y: 0 });
  const finish = createControl(102, { x: 300, y: 0 });
  const controls: Record<ControlId, Control> = {};
  for (const c of [start, c1, c2, finish]) controls[c.id] = c;
  const course = createCourse('Blue');
  course.controls = [
    { controlId: start.id, type: 'start' },
    { controlId: c1.id, type: 'control' },
    { controlId: c2.id, type: 'control' },
    { controlId: finish.id, type: 'finish' },
  ];
  return { course, controls };
}

describe('formatLengthKm', () => {
  it('formats metres as km with one decimal', () => {
    expect(formatLengthKm(4300)).toBe('4.3 km');
    expect(formatLengthKm(0)).toBe('0.0 km');
  });
});

describe('formatClimb', () => {
  it('rounds to the nearest 5 m', () => {
    expect(formatClimb(73)).toBe('75 m');
    expect(formatClimb(12)).toBe('10 m');
  });
  it('returns empty for absent or negative climb', () => {
    expect(formatClimb(undefined)).toBe('');
    expect(formatClimb(-1)).toBe('');
  });
});

describe('buildDescRows', () => {
  it('produces header, split-info and start/finish directives', () => {
    const { course, controls } = scenario();
    const { headerRows, bodyRows } = buildDescRows(course, controls, {
      eventName: 'Test Event',
      scale: 10000,
      headerFontSize: 10,
    });

    expect(headerRows[0]).toMatchObject({ kind: 'header', text: 'Test Event' });
    expect(headerRows.some((r) => r.kind === 'splitInfo')).toBe(true);
    expect(headerRows.some((r) => r.kind === 'directive' && r.leftSymbol === 'start')).toBe(true);
    expect(bodyRows.some((r) => r.kind === 'directive' && r.leftSymbol === 'finish')).toBe(true);
  });

  it('numbers only the non-start/finish controls', () => {
    const { course, controls } = scenario();
    const { bodyRows } = buildDescRows(course, controls, {
      eventName: 'E',
      scale: 10000,
      headerFontSize: 10,
    });
    const controlRows = bodyRows.filter((r) => r.kind === 'control') as Extract<
      (typeof bodyRows)[number],
      { kind: 'control' }
    >[];
    expect(controlRows.map((r) => r.seqNumber)).toEqual([null, 1, 2, null]);
  });

  it('all-controls mode: split-info "All controls" and no sequence numbers', () => {
    const { course, controls } = scenario();
    const { headerRows, bodyRows } = buildDescRows(course, controls, {
      eventName: 'All',
      scale: 10000,
      isAllControls: true,
      headerFontSize: 10,
    });
    const split = headerRows.find((r) => r.kind === 'splitInfo');
    expect(split && split.kind === 'splitInfo' && split.sections[0]).toBe('All controls');
    const controlRows = bodyRows.filter((r) => r.kind === 'control') as Extract<
      (typeof bodyRows)[number],
      { kind: 'control' }
    >[];
    expect(controlRows.every((r) => r.seqNumber === null)).toBe(true);
  });
});
