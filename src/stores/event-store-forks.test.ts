import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from './event-store';
import { auditEvent } from '@/core/validation/event-audit';
import type { OverprintEvent } from '@/core/models/types';
import type { CourseId } from '@/utils/id';

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
  useEventStore.getState().newEvent('Fork test');
  useEventStore.getState().addCourse('Relay');
  for (let i = 0; i < n; i++) {
    useEventStore.getState().addControlToCourse({ x: i * 100, y: 0 });
  }
  return useEventStore.getState().activeCourseId!;
}

function getCourse(courseId: CourseId) {
  return useEventStore.getState().event!.courses.find((c) => c.id === courseId)!;
}

/** Add a fork anchored at trunk[anchorIndex]; returns the fork. */
function addForkAt(courseId: CourseId, anchorIndex: number) {
  const anchor = getCourse(courseId).controls[anchorIndex]!.courseControlId!;
  useEventStore.getState().addFork(courseId, anchor);
  const variations = getCourse(courseId).variations;
  return variations?.[variations.length - 1];
}

/** Add a loop anchored at trunk[anchorIndex]; returns the loop generator. */
function addLoopAt(courseId: CourseId, anchorIndex: number) {
  const anchor = getCourse(courseId).controls[anchorIndex]!.courseControlId!;
  useEventStore.getState().addLoop(courseId, anchor);
  const variations = getCourse(courseId).variations;
  return variations?.[variations.length - 1];
}

describe('fork mutations', () => {
  it('addFork creates two empty branches labelled A and B', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    expect(fork.kind).toBe('fork');
    expect(fork.branches.map((b) => b.label)).toEqual(['A', 'B']);
    expect(fork.branches.every((b) => b.controls.length === 0)).toBe(true);
  });

  it('addFork rejects a first/last anchor (no entry leg / no rejoin)', () => {
    const courseId = setupCourse();
    expect(addForkAt(courseId, 0)).toBeUndefined();
    expect(addForkAt(courseId, 3)).toBeUndefined();
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('removeFork removes the fork and clears empty variations', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    useEventStore.getState().removeFork(courseId, fork.id);
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('addBranch auto-labels with the next free letter', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    useEventStore.getState().addBranch(courseId, fork.id);
    const branches = getCourse(courseId).variations![0]!.branches;
    expect(branches.map((b) => b.label)).toEqual(['A', 'B', 'C']);
  });

  it('removeBranch removes a branch; removing the last branch removes the fork', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    const [a, b] = fork.branches;
    useEventStore.getState().removeBranch(courseId, fork.id, a!.id);
    expect(getCourse(courseId).variations![0]!.branches.map((br) => br.label)).toEqual(['B']);
    useEventStore.getState().removeBranch(courseId, fork.id, b!.id);
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('setBranchLabel updates the label but ignores empty labels', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    useEventStore.getState().setBranchLabel(courseId, fork.id, branchId, ' X ');
    expect(getCourse(courseId).variations![0]!.branches[0]!.label).toBe('X');
    useEventStore.getState().setBranchLabel(courseId, fork.id, branchId, '   ');
    expect(getCourse(courseId).variations![0]!.branches[0]!.label).toBe('X');
  });

  it('addControlToBranch appends a CourseControl with a fresh courseControlId', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    const sharedControlId = getCourse(courseId).controls[2]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, sharedControlId);
    const branch = getCourse(courseId).variations![0]!.branches[0]!;
    expect(branch.controls).toHaveLength(1);
    expect(branch.controls[0]!.controlId).toBe(sharedControlId);
    expect(branch.controls[0]!.type).toBe('control');
    expect(branch.controls[0]!.courseControlId).toBeDefined();
    expect(branch.controls[0]!.courseControlId).not.toBe(
      getCourse(courseId).controls[2]!.courseControlId,
    );
  });

  it('removeControlFromBranch removes the occurrence but keeps a still-shared pool control', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    const sharedControlId = getCourse(courseId).controls[2]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, sharedControlId);
    const ccId = getCourse(courseId).variations![0]!.branches[0]!.controls[0]!.courseControlId!;
    useEventStore.getState().removeControlFromBranch(courseId, fork.id, branchId, ccId);
    expect(getCourse(courseId).variations![0]!.branches[0]!.controls).toHaveLength(0);
    // Still on the trunk — must survive in the pool
    expect(useEventStore.getState().event!.controls[sharedControlId]).toBeDefined();
  });

  it('setBranchEntryBendPoints / setBranchEntryLegGaps store entry-leg geometry', () => {
    const courseId = setupCourse();
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    useEventStore.getState().setBranchEntryBendPoints(courseId, fork.id, branchId, [{ x: 5, y: 6 }]);
    useEventStore.getState().setBranchEntryLegGaps(courseId, fork.id, branchId, [{ startDist: 1, endDist: 2 }]);
    const branch = getCourse(courseId).variations![0]!.branches[0]!;
    expect(branch.entryBendPoints).toEqual([{ x: 5, y: 6 }]);
    expect(branch.entryLegGaps).toEqual([{ startDist: 1, endDist: 2 }]);
  });
});

describe('loop mutations', () => {
  it('addLoop creates a kind:loop generator with two loops A and B', () => {
    const courseId = setupCourse();
    const generator = addLoopAt(courseId, 1)!;
    expect(generator.kind).toBe('loop');
    expect(generator.branches.map((b) => b.label)).toEqual(['A', 'B']);
  });

  it('addLoop and addFork refuse a second generator on the same anchor', () => {
    const courseId = setupCourse();
    addForkAt(courseId, 1);
    const anchor = getCourse(courseId).controls[1]!.courseControlId!;
    useEventStore.getState().addLoop(courseId, anchor);
    expect(getCourse(courseId).variations).toHaveLength(1);
    expect(getCourse(courseId).variations![0]!.kind).toBe('fork');
  });

  it('addBranch/removeBranch act as add/remove loop', () => {
    const courseId = setupCourse();
    const generator = addLoopAt(courseId, 1)!;
    useEventStore.getState().addBranch(courseId, generator.id);
    expect(getCourse(courseId).variations![0]!.branches.map((b) => b.label)).toEqual(['A', 'B', 'C']);
  });

  it('duplicateCourse preserves kind:loop and entry geometry', () => {
    const courseId = setupCourse(4);
    const generator = addLoopAt(courseId, 2)!;
    const branchId = generator.branches[0]!.id;
    useEventStore.getState().addControlToBranch(courseId, generator.id, branchId, getCourse(courseId).controls[1]!.controlId);
    useEventStore.getState().setBranchEntryBendPoints(courseId, generator.id, branchId, [{ x: 3, y: 4 }]);
    useEventStore.getState().duplicateCourse(courseId);
    const copy = useEventStore.getState().event!.courses[1]!;
    expect(copy.variations![0]!.kind).toBe('loop');
    expect(copy.variations![0]!.branches[0]!.entryBendPoints).toEqual([{ x: 3, y: 4 }]);
    // ids regenerated
    expect(copy.variations![0]!.id).not.toBe(generator.id);
  });
});

describe('branch-aware orphan cleanup and audit', () => {
  it('a control referenced ONLY by a branch is not deleted from the pool', () => {
    const courseId = setupCourse(5);
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    // trunk[3] control will become branch-only after trunk removal
    const controlId = getCourse(courseId).controls[3]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, controlId);
    useEventStore.getState().removeControlFromCourse(courseId, controlId);
    // Gone from the trunk, kept in the pool (branch still references it)
    expect(getCourse(courseId).controls.some((cc) => cc.controlId === controlId)).toBe(false);
    expect(useEventStore.getState().event!.controls[controlId]).toBeDefined();
    expect(
      getCourse(courseId).variations![0]!.branches[0]!.controls[0]!.controlId,
    ).toBe(controlId);
  });

  it('a branch-only control is not flagged unused by the event audit', () => {
    const courseId = setupCourse(5);
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    const controlId = getCourse(courseId).controls[3]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, controlId);
    useEventStore.getState().removeControlFromCourse(courseId, controlId);
    const items = auditEvent(useEventStore.getState().event!);
    const unused = items.filter((i) => i.messageKey === 'auditUnusedControl');
    expect(unused.map((i) => i.controlId)).not.toContain(controlId);
  });

  it('deleteControl removes the control from fork branches everywhere', () => {
    const courseId = setupCourse(5);
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    const controlId = getCourse(courseId).controls[3]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, controlId);
    useEventStore.getState().deleteControl(controlId);
    expect(useEventStore.getState().event!.controls[controlId]).toBeUndefined();
    expect(getCourse(courseId).variations![0]!.branches[0]!.controls).toHaveLength(0);
    expect(getCourse(courseId).controls.some((cc) => cc.controlId === controlId)).toBe(false);
  });
});

describe('trunk-mutation fork repair', () => {
  it('removing the anchor control drops the fork', () => {
    const courseId = setupCourse(4);
    addForkAt(courseId, 1);
    const anchorControlId = getCourse(courseId).controls[1]!.controlId;
    useEventStore.getState().removeControlFromCourse(courseId, anchorControlId);
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('deleteControl on the anchor drops the fork', () => {
    const courseId = setupCourse(4);
    addForkAt(courseId, 1);
    useEventStore.getState().deleteControl(getCourse(courseId).controls[1]!.controlId);
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('moving the anchor to the first position drops the fork', () => {
    const courseId = setupCourse(4);
    addForkAt(courseId, 1);
    useEventStore.getState().moveControlInCourse(courseId, 1, 0);
    expect(getCourse(courseId).variations).toBeUndefined();
  });

  it('unrelated trunk edits keep the fork', () => {
    const courseId = setupCourse(5);
    addForkAt(courseId, 1);
    // Remove a non-anchor control and reorder controls after the anchor
    useEventStore.getState().removeControlFromCourse(courseId, getCourse(courseId).controls[3]!.controlId);
    useEventStore.getState().moveControlInCourse(courseId, 2, 3);
    expect(getCourse(courseId).variations).toHaveLength(1);
  });
});

describe('duplicateCourse with forks', () => {
  function setupForkedCourse() {
    const courseId = setupCourse(4);
    const fork = addForkAt(courseId, 2)!;
    const branchId = fork.branches[0]!.id;
    const controlId = getCourse(courseId).controls[1]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, controlId);
    useEventStore.getState().setBranchEntryBendPoints(courseId, fork.id, branchId, [{ x: 1, y: 2 }]);
    return courseId;
  }

  it('regenerates all courseControlIds, ForkIds and BranchIds', () => {
    const courseId = setupForkedCourse();
    useEventStore.getState().duplicateCourse(courseId);
    const source = getCourse(courseId);
    const copy = useEventStore.getState().event!.courses[1]!;
    expect(copy.id).not.toBe(source.id);

    const sourceCCIds = new Set(source.controls.map((cc) => cc.courseControlId));
    for (const cc of copy.controls) {
      expect(cc.courseControlId).toBeDefined();
      expect(sourceCCIds.has(cc.courseControlId)).toBe(false);
    }
    const sFork = source.variations![0]!;
    const cFork = copy.variations![0]!;
    expect(cFork.id).not.toBe(sFork.id);
    expect(cFork.branches[0]!.id).not.toBe(sFork.branches[0]!.id);
    expect(cFork.branches[0]!.controls[0]!.courseControlId).not.toBe(
      sFork.branches[0]!.controls[0]!.courseControlId,
    );
    // Labels and shared Control references are preserved
    expect(cFork.branches.map((b) => b.label)).toEqual(sFork.branches.map((b) => b.label));
    expect(cFork.branches[0]!.controls[0]!.controlId).toBe(sFork.branches[0]!.controls[0]!.controlId);
  });

  it('remaps the fork anchor onto the NEW trunk copy', () => {
    const courseId = setupForkedCourse();
    useEventStore.getState().duplicateCourse(courseId);
    const source = getCourse(courseId);
    const copy = useEventStore.getState().event!.courses[1]!;
    const cFork = copy.variations![0]!;
    // Anchor points at the copy's trunk[2], not the source's
    expect(cFork.anchorCourseControlId).toBe(copy.controls[2]!.courseControlId);
    expect(cFork.anchorCourseControlId).not.toBe(source.variations![0]!.anchorCourseControlId);
  });

  it('deep-copies branch entry geometry (no shared references)', () => {
    const courseId = setupForkedCourse();
    useEventStore.getState().duplicateCourse(courseId);
    const copy = useEventStore.getState().event!.courses[1]!;
    expect(copy.variations![0]!.branches[0]!.entryBendPoints).toEqual([{ x: 1, y: 2 }]);
    // Mutating the copy must not touch the source (deep copy)
    const copyId = copy.id;
    useEventStore.getState().setBranchEntryBendPoints(
      copyId, copy.variations![0]!.id, copy.variations![0]!.branches[0]!.id, [{ x: 9, y: 9 }],
    );
    expect(getCourse(courseId).variations![0]!.branches[0]!.entryBendPoints).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('moveAllControls with forks', () => {
  it('translates branch control bendPoints and branch entryBendPoints', () => {
    const courseId = setupCourse(4);
    const fork = addForkAt(courseId, 1)!;
    const branchId = fork.branches[0]!.id;
    const controlId = getCourse(courseId).controls[2]!.controlId;
    useEventStore.getState().addControlToBranch(courseId, fork.id, branchId, controlId);
    useEventStore.getState().setBranchEntryBendPoints(courseId, fork.id, branchId, [{ x: 10, y: 20 }]);

    // Give the branch control an outgoing-leg bend point (rejoin leg geometry)
    const event: OverprintEvent = JSON.parse(JSON.stringify(useEventStore.getState().event));
    event.courses[0]!.variations![0]!.branches[0]!.controls[0]!.bendPoints = [{ x: 30, y: 40 }];
    // Trunk bend point for comparison
    event.courses[0]!.controls[0]!.bendPoints = [{ x: 50, y: 60 }];
    useEventStore.setState({ event });

    useEventStore.getState().moveAllControls(7, -3);

    const course = getCourse(courseId);
    expect(course.controls[0]!.bendPoints).toEqual([{ x: 57, y: 57 }]);
    const branch = course.variations![0]!.branches[0]!;
    expect(branch.entryBendPoints).toEqual([{ x: 17, y: 17 }]);
    expect(branch.controls[0]!.bendPoints).toEqual([{ x: 37, y: 37 }]);
  });
});

describe('activeVariationIndex UI state', () => {
  it('defaults to 0 and updates via setActiveVariationIndex', () => {
    expect(useEventStore.getState().activeVariationIndex).toBe(0);
    useEventStore.getState().setActiveVariationIndex(3);
    expect(useEventStore.getState().activeVariationIndex).toBe(3);
    useEventStore.getState().setActiveVariationIndex(-1);
    expect(useEventStore.getState().activeVariationIndex).toBe(0);
  });

  it('resets to 0 on course switch', () => {
    const courseId = setupCourse(3);
    useEventStore.getState().addCourse('Other');
    useEventStore.getState().setActiveVariationIndex(5);
    useEventStore.getState().setActiveCourse(courseId);
    expect(useEventStore.getState().activeVariationIndex).toBe(0);
  });

  it('is not part of the undoable partialized state', () => {
    setupCourse(2);
    useEventStore.getState().setActiveVariationIndex(4);
    const partialized = useEventStore.temporal.getState().pastStates.at(-1);
    expect(partialized).toBeDefined();
    expect(partialized && 'activeVariationIndex' in partialized).toBe(false);
  });
});
