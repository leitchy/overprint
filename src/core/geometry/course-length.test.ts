import { describe, it, expect } from 'vitest';
import { calculateCourseLength } from './course-length';
import type { Control, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { asControlId } from '@/utils/id';

function makeControl(id: string, x: number, y: number): Control {
  return {
    id: asControlId(id),
    code: 31,
    position: { x, y },
    description: { columnD: '' },
  };
}

function makeCourseControl(id: string): CourseControl {
  return { controlId: asControlId(id), type: 'control' };
}

describe('calculateCourseLength', () => {
  it('returns 0 for empty course', () => {
    expect(calculateCourseLength([], {}, 10000, 150)).toBe(0);
  });

  it('returns 0 for single control', () => {
    const controls: Record<ControlId, Control> = {
      [asControlId('a')]: makeControl('a', 0, 0),
    };
    expect(
      calculateCourseLength([makeCourseControl('a')], controls, 10000, 150),
    ).toBe(0);
  });

  it('calculates two-control course', () => {
    const controls: Record<ControlId, Control> = {
      [asControlId('a')]: makeControl('a', 0, 0),
      [asControlId('b')]: makeControl('b', 150, 0),
    };
    // 150px at 150 DPI = 1 inch = 25.4mm; at 1:10000 = 254m
    const length = calculateCourseLength(
      [makeCourseControl('a'), makeCourseControl('b')],
      controls,
      10000,
      150,
    );
    expect(length).toBeCloseTo(254, 0);
  });

  it('sums multiple legs', () => {
    const controls: Record<ControlId, Control> = {
      [asControlId('a')]: makeControl('a', 0, 0),
      [asControlId('b')]: makeControl('b', 150, 0),
      [asControlId('c')]: makeControl('c', 150, 150),
    };
    const length = calculateCourseLength(
      [makeCourseControl('a'), makeCourseControl('b'), makeCourseControl('c')],
      controls,
      10000,
      150,
    );
    // Leg 1: 150px = 254m, Leg 2: 150px = 254m, Total = 508m
    expect(length).toBeCloseTo(508, 0);
  });
});
