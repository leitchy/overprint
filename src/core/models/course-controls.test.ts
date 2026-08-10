import { describe, it, expect } from 'vitest';
import { forEachCourseControl, courseReferencesControl } from './course-controls';
import { makeCourseControl } from './defaults';
import type { Course, CourseFork } from './types';
import { asControlId, generateBranchId, generateForkId } from '@/utils/id';

function buildForkedCourse(): { course: Course; fork: CourseFork } {
  const trunk = [
    makeCourseControl(asControlId('c-start'), 'start'),
    makeCourseControl(asControlId('c-anchor'), 'control'),
    makeCourseControl(asControlId('c-finish'), 'finish'),
  ];
  const fork: CourseFork = {
    id: generateForkId(),
    kind: 'fork',
    anchorCourseControlId: trunk[1]!.courseControlId!,
    branches: [
      {
        id: generateBranchId(),
        label: 'A',
        controls: [makeCourseControl(asControlId('c-branch-a'), 'control')],
      },
      {
        id: generateBranchId(),
        label: 'B',
        controls: [
          makeCourseControl(asControlId('c-branch-b1'), 'control'),
          makeCourseControl(asControlId('c-branch-b2'), 'control'),
        ],
      },
    ],
  };
  const course: Course = {
    id: 'course-1' as Course['id'],
    name: 'Forked',
    courseType: 'normal',
    controls: trunk,
    settings: {},
    variations: [fork],
  };
  return { course, fork };
}

describe('forEachCourseControl', () => {
  it('visits every trunk control and every branch control', () => {
    const { course } = buildForkedCourse();
    const visited: string[] = [];
    forEachCourseControl(course, (cc) => visited.push(cc.controlId));
    expect(visited).toEqual([
      'c-start', 'c-anchor', 'c-finish',
      'c-branch-a', 'c-branch-b1', 'c-branch-b2',
    ]);
  });

  it('provides fork/branch context for branch controls only', () => {
    const { course, fork } = buildForkedCourse();
    forEachCourseControl(course, (cc, ctx) => {
      if (cc.controlId.startsWith('c-branch')) {
        expect(ctx.fork).toBe(fork);
        expect(ctx.branch).toBeDefined();
      } else {
        expect(ctx.fork).toBeUndefined();
        expect(ctx.branch).toBeUndefined();
      }
    });
  });

  it('handles courses without variations', () => {
    const { course } = buildForkedCourse();
    course.variations = undefined;
    const visited: string[] = [];
    forEachCourseControl(course, (cc) => visited.push(cc.controlId));
    expect(visited).toEqual(['c-start', 'c-anchor', 'c-finish']);
  });
});

describe('courseReferencesControl', () => {
  it('finds branch-only references', () => {
    const { course } = buildForkedCourse();
    expect(courseReferencesControl(course, 'c-branch-b2')).toBe(true);
    expect(courseReferencesControl(course, 'c-anchor')).toBe(true);
    expect(courseReferencesControl(course, 'c-nowhere')).toBe(false);
  });
});
