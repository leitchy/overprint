/**
 * Course-control traversal (E10). A course's controls live in TWO places once
 * forks exist: the trunk (`course.controls`) and each fork branch
 * (`course.variations[].branches[].controls`). Any scan that asks "does this
 * course reference control X?" or "touch every leg geometry" MUST walk both,
 * or branch data is silently missed/corrupted (wrong orphan deletion, stale
 * branch bend points after a map re-anchor, false "unused control" audits).
 *
 * Use `forEachCourseControl` for those scans instead of iterating
 * `course.controls` directly.
 */

import type { Course, CourseControl, CourseFork, ForkBranch } from './types';

export interface CourseControlContext {
  /** Set when the control lives inside a fork branch (undefined on the trunk). */
  fork?: CourseFork;
  branch?: ForkBranch;
}

/**
 * Visit every CourseControl a course references: all trunk controls, then all
 * controls of every fork branch. Branch entry-leg geometry
 * (`branch.entryBendPoints` / `entryLegGaps`) lives on the branch, not on any
 * CourseControl — callers that translate geometry must handle it separately
 * (the context makes each branch visible exactly once per contained control).
 */
export function forEachCourseControl(
  course: Course,
  fn: (cc: CourseControl, context: CourseControlContext) => void,
): void {
  const trunkContext: CourseControlContext = {};
  for (const cc of course.controls) {
    fn(cc, trunkContext);
  }
  for (const fork of course.variations ?? []) {
    for (const branch of fork.branches) {
      for (const cc of branch.controls) {
        fn(cc, { fork, branch });
      }
    }
  }
}

/** True when any control in the course (trunk or branch) references `controlId`. */
export function courseReferencesControl(course: Course, controlId: string): boolean {
  let found = false;
  forEachCourseControl(course, (cc) => {
    if (cc.controlId === controlId) found = true;
  });
  return found;
}
