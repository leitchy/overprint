import { describe, it, expect } from 'vitest';
import { calculateCourseLength, courseLengthRange } from './course-length';
import type { Control, Course, CourseControl } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { asBranchId, asControlId, asCourseControlId, asCourseId, asForkId } from '@/utils/id';

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

describe('courseLengthRange', () => {
  function forkCourse(): { course: Course; controls: Record<ControlId, Control> } {
    const controls: Record<ControlId, Control> = {
      [asControlId('s')]: makeControl('s', 0, 0),
      [asControlId('a')]: makeControl('a', 150, 0),
      [asControlId('f')]: makeControl('f', 300, 0),
      [asControlId('near')]: makeControl('near', 150, 150),
      [asControlId('far')]: makeControl('far', 150, 600),
    };
    const course: Course = {
      id: asCourseId('co'),
      name: 'Relay',
      courseType: 'normal',
      controls: [
        { courseControlId: asCourseControlId('cc-s'), controlId: asControlId('s'), type: 'start' },
        { courseControlId: asCourseControlId('cc-a'), controlId: asControlId('a'), type: 'control' },
        { courseControlId: asCourseControlId('cc-f'), controlId: asControlId('f'), type: 'finish' },
      ],
      settings: {},
      variations: [{
        id: asForkId('fk1'),
        kind: 'fork',
        anchorCourseControlId: asCourseControlId('cc-a'),
        branches: [
          { id: asBranchId('b1'), label: 'A', controls: [{ courseControlId: asCourseControlId('cc-n'), controlId: asControlId('near'), type: 'control' }] },
          { id: asBranchId('b2'), label: 'B', controls: [{ courseControlId: asCourseControlId('cc-x'), controlId: asControlId('far'), type: 'control' }] },
        ],
      }],
    };
    return { course, controls };
  }

  it('returns min/max lengths across fork variations', () => {
    const { course, controls } = forkCourse();
    const { minM, maxM } = courseLengthRange(course, controls, 10000, 150);
    expect(minM).toBeGreaterThan(0);
    expect(maxM).toBeGreaterThan(minM); // far branch is longer
    // Variation A: 254m + detour via (150,150) and back; sanity-check magnitudes.
    expect(minM).toBeGreaterThan(500);
    expect(maxM).toBeGreaterThan(minM + 1000);
  });

  it('returns equal min/max for a no-fork course', () => {
    const { course, controls } = forkCourse();
    const plain: Course = { ...course, variations: undefined };
    const straight = calculateCourseLength(plain.controls, controls, 10000, 150);
    const { minM, maxM } = courseLengthRange(plain, controls, 10000, 150);
    expect(minM).toBe(straight);
    expect(maxM).toBe(straight);
  });
});
