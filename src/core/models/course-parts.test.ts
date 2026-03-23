import { describe, it, expect } from 'vitest';
import { countCourseParts, isMultiPart, getPartBounds, getPartControls } from './course-parts';
import type { Course, CourseControl } from './types';
import type { ControlId, CourseId } from '@/utils/id';

function cc(type: CourseControl['type'], id = 'c' as ControlId): CourseControl {
  return { controlId: id, type };
}

function makeCourse(controls: CourseControl[]): Course {
  return {
    id: 'test' as CourseId,
    name: 'Test',
    courseType: 'normal',
    controls,
    settings: {},
  };
}

describe('countCourseParts', () => {
  it('returns 1 for a course with no exchanges', () => {
    expect(countCourseParts([cc('start'), cc('control'), cc('finish')])).toBe(1);
  });

  it('returns 2 for a course with one mapExchange', () => {
    expect(countCourseParts([
      cc('start'), cc('control'), cc('mapExchange'), cc('control'), cc('finish'),
    ])).toBe(2);
  });

  it('returns 2 for a course with one mapFlip', () => {
    expect(countCourseParts([
      cc('start'), cc('control'), cc('mapFlip'), cc('control'), cc('finish'),
    ])).toBe(2);
  });

  it('returns 3 for two exchanges', () => {
    expect(countCourseParts([
      cc('start'), cc('mapExchange'), cc('control'), cc('mapFlip'), cc('finish'),
    ])).toBe(3);
  });

  it('returns 1 for empty controls', () => {
    expect(countCourseParts([])).toBe(1);
  });
});

describe('isMultiPart', () => {
  it('returns false for single-part course', () => {
    expect(isMultiPart(makeCourse([cc('start'), cc('finish')]))).toBe(false);
  });

  it('returns true when course has an exchange', () => {
    expect(isMultiPart(makeCourse([
      cc('start'), cc('mapExchange'), cc('finish'),
    ]))).toBe(true);
  });
});

describe('getPartBounds', () => {
  // S(0), A(1), ME(2), B(3), C(4), F(5)
  const controls = [
    cc('start'), cc('control'), cc('mapExchange'), cc('control'), cc('control'), cc('finish'),
  ];

  it('part 0 spans from start to exchange (inclusive)', () => {
    expect(getPartBounds(controls, 0)).toEqual({ start: 0, end: 2 });
  });

  it('part 1 spans from exchange to finish (inclusive)', () => {
    expect(getPartBounds(controls, 1)).toEqual({ start: 2, end: 5 });
  });

  it('clamps out-of-range part index to last part', () => {
    expect(getPartBounds(controls, 99)).toEqual({ start: 2, end: 5 });
  });

  it('clamps negative part index to 0', () => {
    expect(getPartBounds(controls, -1)).toEqual({ start: 0, end: 2 });
  });

  // S(0), ME1(1), A(2), ME2(3), F(4) — 3 parts
  const threePartControls = [
    cc('start'), cc('mapExchange'), cc('control'), cc('mapFlip'), cc('finish'),
  ];

  it('3-part course: part 0', () => {
    expect(getPartBounds(threePartControls, 0)).toEqual({ start: 0, end: 1 });
  });

  it('3-part course: part 1', () => {
    expect(getPartBounds(threePartControls, 1)).toEqual({ start: 1, end: 3 });
  });

  it('3-part course: part 2', () => {
    expect(getPartBounds(threePartControls, 2)).toEqual({ start: 3, end: 4 });
  });
});

describe('getPartControls', () => {
  const c0 = cc('start', 'c0' as ControlId);
  const c1 = cc('control', 'c1' as ControlId);
  const c2 = cc('mapExchange', 'c2' as ControlId);
  const c3 = cc('control', 'c3' as ControlId);
  const c4 = cc('finish', 'c4' as ControlId);
  const course = makeCourse([c0, c1, c2, c3, c4]);

  it('returns part 0 controls (start through exchange)', () => {
    const part = getPartControls(course, 0);
    expect(part.map((c) => c.controlId)).toEqual(['c0', 'c1', 'c2']);
  });

  it('returns part 1 controls (exchange through finish)', () => {
    const part = getPartControls(course, 1);
    expect(part.map((c) => c.controlId)).toEqual(['c2', 'c3', 'c4']);
  });

  it('exchange control appears in both parts', () => {
    const part0 = getPartControls(course, 0);
    const part1 = getPartControls(course, 1);
    expect(part0[part0.length - 1]!.controlId).toBe('c2');
    expect(part1[0]!.controlId).toBe('c2');
  });
});
