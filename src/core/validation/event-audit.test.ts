import { describe, it, expect } from 'vitest';
import { auditEvent } from './event-audit';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import type { OverprintEvent, Course, Control } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { asBranchId, asCourseControlId, asForkId } from '@/utils/id';

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

  it('reports controls too close with the same feature', () => {
    // (100,100) and (110,110) at 1:10000/150dpi ≈ 24m apart, same feature 1.1
    const { course, controls } = buildCourseWithControls('Course 1', [
      { code: 31, x: 100, y: 100, type: 'start' },
      { code: 32, x: 110, y: 110 },
      { code: 33, x: 900, y: 900, type: 'finish' },
    ]);
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });
    expect(auditEvent(event).some((i) => i.messageKey === 'auditCloseControlsSameFeature')).toBe(true);
  });

  it('reports legs run in opposite directions across courses', () => {
    const a = createControl(31, { x: 100, y: 100 }, { columnD: '1.1' });
    const b = createControl(32, { x: 500, y: 500 }, { columnD: '1.2' });
    const controls: Record<ControlId, Control> = { [a.id]: a, [b.id]: b };
    const c1 = createCourse('Course 1');
    c1.controls = [{ controlId: a.id, type: 'control' }, { controlId: b.id, type: 'control' }];
    const c2 = createCourse('Course 2');
    c2.controls = [{ controlId: b.id, type: 'control' }, { controlId: a.id, type: 'control' }];
    const event = buildEvent({
      courses: [c1, c2],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });
    const opp = auditEvent(event).filter((i) => i.messageKey === 'auditOppositeLegs');
    expect(opp).toHaveLength(1); // reported once per unordered pair
  });

  it('reports consecutive duplicate controls', () => {
    const a = createControl(31, { x: 100, y: 100 }, { columnD: '1.1' });
    const controls: Record<ControlId, Control> = { [a.id]: a };
    const course = createCourse('Course 1');
    course.controls = [
      { controlId: a.id, type: 'control' },
      { controlId: a.id, type: 'control' },
    ];
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });
    const items = auditEvent(event);
    const dup = items.find((i) => i.messageKey === 'auditConsecutiveDuplicate');
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe('error');
  });
});

describe('auditEvent — fork variations (E10.4)', () => {
  /** Fork course "Relay": S(0,0) → anchor(300,0) → M(600,0) → F(900,0), branches A/B. */
  function buildForkEvent(opts: {
    branchAPos?: { x: number; y: number };
    emptyBranchB?: boolean;
    dropFinish?: boolean;
  } = {}): OverprintEvent {
    const { course, controls } = buildCourseWithControls('Relay', [
      { code: 31, x: 0, y: 0, type: 'start' },
      { code: 32, x: 300, y: 0 },
      { code: 33, x: 600, y: 0 },
      { code: 34, x: 900, y: 0, type: 'finish' },
    ]);
    if (opts.dropFinish) course.controls.pop();
    course.controls.forEach((cc, i) => {
      cc.courseControlId = asCourseControlId(`cc-${i}`);
    });
    const bA = createControl(41, opts.branchAPos ?? { x: 300, y: 300 }, { columnD: '2.1' });
    const bB = createControl(42, { x: 300, y: -300 }, { columnD: '3.1' });
    const controlsAll = { ...controls, [bA.id]: bA, [bB.id]: bB };
    course.variations = [{
      id: asForkId('fk1'),
      kind: 'fork',
      anchorCourseControlId: asCourseControlId('cc-1'),
      branches: [
        { id: asBranchId('brA'), label: 'A', controls: [{ courseControlId: asCourseControlId('cc-bA'), controlId: bA.id, type: 'control' }] },
        {
          id: asBranchId('brB'), label: 'B',
          controls: opts.emptyBranchB
            ? []
            : [{ courseControlId: asCourseControlId('cc-bB'), controlId: bB.id, type: 'control' }],
        },
      ],
    }];
    return buildEvent({
      courses: [course],
      controls: controlsAll,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });
  }

  it('labels a branch-specific short leg with the variation code', () => {
    // Branch A control 10px (~17m) from the anchor → short leg only in variation A.
    const event = buildForkEvent({ branchAPos: { x: 310, y: 0 } });
    const items = auditEvent(event);
    const shortLegs = items.filter((i) => i.messageKey === 'auditShortLeg');
    expect(shortLegs).toHaveLength(1);
    expect(shortLegs[0]!.messageParams?.name).toBe('Relay A');
  });

  it('reports a trunk-level finding once, under the plain course name', () => {
    const event = buildForkEvent({ dropFinish: true });
    const items = auditEvent(event);
    const missing = items.filter((i) => i.messageKey === 'auditMissingFinish');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.messageParams?.name).toBe('Relay');
  });

  it('surfaces structural fork issues (empty branch) as errors', () => {
    const event = buildForkEvent({ emptyBranchB: true });
    const items = auditEvent(event);
    const forkIssue = items.find((i) => i.messageKey === 'auditForkEmptyBranch');
    expect(forkIssue).toBeDefined();
    expect(forkIssue?.severity).toBe('error');
  });

  it('produces no fork findings for a fork-free course', () => {
    const { course, controls } = buildCourseWithControls('Plain', [
      { code: 31, x: 0, y: 0, type: 'start' },
      { code: 32, x: 300, y: 0 },
      { code: 33, x: 600, y: 0, type: 'finish' },
    ]);
    const event = buildEvent({
      courses: [course],
      controls,
      mapFile: { name: 'test.pdf', type: 'pdf', scale: 10000, dpi: 150 },
    });
    expect(auditEvent(event)).toEqual([]);
  });
});

describe('auditEvent — loop-length imbalance (E10)', () => {
  /** Course: start, hub (interior), finish, plus a loop generator with two loops
   *  whose controls sit at `loopADist` / `loopBDist` pixels from the hub. */
  function butterflyEvent(loopADist: number, loopBDist: number): OverprintEvent {
    const start = createControl(31, { x: 1000, y: 500 }, { columnD: '1.1' });
    const hub = createControl(32, { x: 1000, y: 1000 }, { columnD: '1.1' });
    const finish = createControl(33, { x: 1000, y: 3000 }, { columnD: '1.1' });
    const la = createControl(41, { x: 1000, y: 1000 + loopADist }, { columnD: '1.1' });
    const lb = createControl(42, { x: 1000 - loopBDist, y: 1000 }, { columnD: '1.1' });
    const controls: Record<ControlId, Control> = {
      [start.id]: start, [hub.id]: hub, [finish.id]: finish, [la.id]: la, [lb.id]: lb,
    };
    const course = createCourse('Butterfly');
    course.controls = [
      { controlId: start.id, type: 'start', courseControlId: asCourseControlId('cc-s') },
      { controlId: hub.id, type: 'control', courseControlId: asCourseControlId('cc-h') },
      { controlId: finish.id, type: 'finish', courseControlId: asCourseControlId('cc-f') },
    ];
    course.variations = [
      {
        id: asForkId('l1'),
        kind: 'loop',
        anchorCourseControlId: asCourseControlId('cc-h'),
        branches: [
          { id: asBranchId('b1'), label: 'A', controls: [{ controlId: la.id, type: 'control', courseControlId: asCourseControlId('cc-la') }] },
          { id: asBranchId('b2'), label: 'B', controls: [{ controlId: lb.id, type: 'control', courseControlId: asCourseControlId('cc-lb') }] },
        ],
      },
    ];
    return buildEvent({ courses: [course], controls, mapFile: { name: 'm.pdf', type: 'pdf', scale: 10000, dpi: 150 } });
  }

  it('warns when butterfly loops differ too much in length', () => {
    const items = auditEvent(butterflyEvent(100, 500)); // 5× imbalance
    const w = items.find((i) => i.messageKey === 'auditLoopImbalance');
    expect(w).toBeDefined();
    expect(w!.severity).toBe('warning');
    expect(w!.messageParams?.code).toBe(32); // hub control code
  });

  it('does not warn when loops are balanced', () => {
    const items = auditEvent(butterflyEvent(120, 120)); // equal round trips
    expect(items.some((i) => i.messageKey === 'auditLoopImbalance')).toBe(false);
  });

  it('does not warn for a fork (gaffle) — only loops are length-audited', () => {
    // Same geometry but a fork instead of a loop: branches are meant to differ.
    const event = butterflyEvent(100, 500);
    event.courses[0]!.variations![0]!.kind = 'fork';
    expect(auditEvent(event).some((i) => i.messageKey === 'auditLoopImbalance')).toBe(false);
  });

  it('does not warn when the absolute difference is below the floor (tiny loops)', () => {
    // 30px vs 50px from hub → ~102 m vs ~169 m round trips: ratio ~1.66 but Δ ~67 m < 100 m.
    expect(auditEvent(butterflyEvent(30, 50)).some((i) => i.messageKey === 'auditLoopImbalance')).toBe(false);
  });

  it('does not warn (or crash) when a loop is still empty', () => {
    const event = butterflyEvent(100, 500);
    event.courses[0]!.variations![0]!.branches[1]!.controls = []; // loop B incomplete
    expect(auditEvent(event).some((i) => i.messageKey === 'auditLoopImbalance')).toBe(false);
  });
});
