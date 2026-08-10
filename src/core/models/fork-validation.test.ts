import { describe, it, expect } from 'vitest';
import { courseForkIssues } from './fork-validation';
import { makeCourseControl } from './defaults';
import type { Course, CourseFork, ForkBranch } from './types';
import type { CourseControlId } from '@/utils/id';
import { asControlId, generateBranchId, generateForkId } from '@/utils/id';

function branch(label: string, nControls = 1): ForkBranch {
  return {
    id: generateBranchId(),
    label,
    controls: Array.from({ length: nControls }, (_, i) =>
      makeCourseControl(asControlId(`b-${label}-${i}`), 'control'),
    ),
  };
}

function fork(anchor: CourseControlId, branches: ForkBranch[]): CourseFork {
  return { id: generateForkId(), kind: 'fork', anchorCourseControlId: anchor, branches };
}

function course(overrides: Partial<Course> = {}): Course {
  const trunk = [
    makeCourseControl(asControlId('c1'), 'start'),
    makeCourseControl(asControlId('c2'), 'control'),
    makeCourseControl(asControlId('c3'), 'control'),
    makeCourseControl(asControlId('c4'), 'finish'),
  ];
  return {
    id: 'course-1' as Course['id'],
    name: 'Test',
    courseType: 'normal',
    controls: trunk,
    settings: {},
    ...overrides,
  };
}

describe('courseForkIssues', () => {
  it('returns no issues for a well-formed fork', () => {
    const c = course();
    c.variations = [fork(c.controls[1]!.courseControlId!, [branch('A'), branch('B')])];
    expect(courseForkIssues(c)).toEqual([]);
  });

  it('returns empty for a course without forks', () => {
    expect(courseForkIssues(course())).toEqual([]);
  });

  it('flags an unresolvable anchor', () => {
    const c = course();
    c.variations = [fork('missing' as CourseControlId, [branch('A'), branch('B')])];
    expect(courseForkIssues(c).map((i) => i.kind)).toContain('anchorUnresolved');
  });

  it('flags first/last anchors (no entry leg / no rejoin)', () => {
    const c = course();
    c.variations = [
      fork(c.controls[0]!.courseControlId!, [branch('A'), branch('B')]),
      fork(c.controls[3]!.courseControlId!, [branch('C'), branch('D')]),
    ];
    expect(courseForkIssues(c).map((i) => i.kind)).toEqual([
      'anchorUnresolved',
      'anchorUnresolved',
    ]);
  });

  it('flags an exchange anchor and a rejoin across an exchange', () => {
    const c = course();
    c.controls[1]!.type = 'mapExchange';
    c.variations = [
      fork(c.controls[1]!.courseControlId!, [branch('A'), branch('B')]), // anchor IS exchange
      // anchor c1? index 0 invalid; use trunk with exchange at rejoin:
    ];
    expect(courseForkIssues(c).map((i) => i.kind)).toContain('anchorIsExchange');

    const c2 = course();
    c2.controls[2]!.type = 'mapFlip';
    c2.variations = [fork(c2.controls[1]!.courseControlId!, [branch('A'), branch('B')])];
    expect(courseForkIssues(c2).map((i) => i.kind)).toContain('rejoinAcrossExchange');
  });

  it('flags exchange controls inside a branch', () => {
    const c = course();
    const bad = branch('B');
    bad.controls[0]!.type = 'mapExchange';
    c.variations = [fork(c.controls[1]!.courseControlId!, [branch('A'), bad])];
    const issues = courseForkIssues(c);
    expect(issues).toEqual([
      { forkId: c.variations[0]!.id, branchId: bad.id, kind: 'exchangeInBranch' },
    ]);
  });

  it('flags score courses', () => {
    const c = course({ courseType: 'score' });
    c.variations = [fork(c.controls[1]!.courseControlId!, [branch('A'), branch('B')])];
    expect(courseForkIssues(c).map((i) => i.kind)).toContain('scoreCourse');
  });

  it('flags duplicate branch labels', () => {
    const c = course();
    c.variations = [fork(c.controls[1]!.courseControlId!, [branch('A'), branch('A')])];
    expect(courseForkIssues(c).map((i) => i.kind)).toContain('duplicateLabel');
  });

  it('flags empty branches as incomplete', () => {
    const c = course();
    c.variations = [fork(c.controls[1]!.courseControlId!, [branch('A'), branch('B', 0)])];
    const issues = courseForkIssues(c);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe('emptyBranch');
    expect(issues[0]!.branchId).toBe(c.variations[0]!.branches[1]!.id);
  });
});
