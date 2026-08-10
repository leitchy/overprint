import { describe, it, expect } from 'vitest';
import { enumerateVariations, hasVariations, MAX_VARIATIONS, factorial, nthPermutation } from './variation-enumerator';
import { makeCourseControl } from './defaults';
import type { Course, CourseControl, CourseFork } from './types';
import { asControlId, asCourseControlId, asCourseId, asForkId, asBranchId } from '@/utils/id';

const cc = (id: string, type: CourseControl['type'] = 'control', ccid?: string): CourseControl => ({
  ...makeCourseControl(asControlId(id), type),
  courseControlId: asCourseControlId(ccid ?? `cc-${id}`),
});

function baseCourse(controls: CourseControl[], variations?: CourseFork[]): Course {
  return { id: asCourseId('co'), name: 'C', courseType: 'normal', controls, settings: {}, variations };
}

/** Trunk: start, anchorA(cc-a), mid(cc-m), finish. */
function trunk(): CourseControl[] {
  return [cc('s', 'start', 'cc-s'), cc('a', 'control', 'cc-a'), cc('m', 'control', 'cc-m'), cc('f', 'finish', 'cc-f')];
}

const fork = (id: string, anchor: string, branches: Array<{ id: string; label: string; controls: CourseControl[] }>): CourseFork => ({
  id: asForkId(id),
  kind: 'fork',
  anchorCourseControlId: asCourseControlId(anchor),
  branches: branches.map((b) => ({ id: asBranchId(b.id), label: b.label, controls: b.controls })),
});

const loop = (id: string, anchor: string, loops: Array<{ id: string; label: string; controls: CourseControl[] }>): CourseFork => ({
  id: asForkId(id),
  kind: 'loop',
  anchorCourseControlId: asCourseControlId(anchor),
  branches: loops.map((b) => ({ id: asBranchId(b.id), label: b.label, controls: b.controls })),
});

describe('enumerateVariations', () => {
  it('returns a single empty-code variation for a course with no forks', () => {
    const course = baseCourse(trunk());
    const r = enumerateVariations(course);
    expect(r.variations).toHaveLength(1);
    expect(r.variations[0]!.code).toBe('');
    expect(r.variations[0]!.controls).toBe(course.controls); // same ref, no copy
    expect(r.total).toBe(1);
    expect(hasVariations(course)).toBe(false);
  });

  it('enumerates one fork with two branches → 2 variations A/B', () => {
    const course = baseCourse(trunk(), [
      fork('f1', 'cc-a', [
        { id: 'b1', label: 'A', controls: [cc('x', 'control', 'cc-x')] },
        { id: 'b2', label: 'B', controls: [cc('y', 'control', 'cc-y')] },
      ]),
    ]);
    const r = enumerateVariations(course);
    expect(r.variations.map((v) => v.code)).toEqual(['A', 'B']);
    // Variation A: start, anchor-copy, x, mid, finish
    const codes = r.variations[0]!.controls.map((c) => c.controlId);
    expect(codes).toEqual(['s', 'a', 'x', 'm', 'f']);
    expect(r.variations[1]!.controls.map((c) => c.controlId)).toEqual(['s', 'a', 'y', 'm', 'f']);
    expect(hasVariations(course)).toBe(true);
  });

  it('cartesian-products two forks deterministically (AA,AB,BA,BB)', () => {
    const course = baseCourse(
      [cc('s', 'start', 'cc-s'), cc('a', 'control', 'cc-a'), cc('b', 'control', 'cc-b'), cc('f', 'finish', 'cc-f')],
      [
        fork('f1', 'cc-a', [
          { id: 'b1', label: 'A', controls: [cc('x', 'control', 'cc-x')] },
          { id: 'b2', label: 'B', controls: [cc('y', 'control', 'cc-y')] },
        ]),
        fork('f2', 'cc-b', [
          { id: 'b3', label: 'A', controls: [cc('p', 'control', 'cc-p')] },
          { id: 'b4', label: 'B', controls: [cc('q', 'control', 'cc-q')] },
        ]),
      ],
    );
    const r = enumerateVariations(course);
    expect(r.total).toBe(4);
    expect(r.variations.map((v) => v.code)).toEqual(['AA', 'AB', 'BA', 'BB']);
  });

  it('copies the anchor and never mutates the trunk (entry-leg on branch)', () => {
    const t = trunk();
    const anchor = t[1]!;
    const course = baseCourse(t, [
      fork('f1', 'cc-a', [
        { id: 'b1', label: 'A', controls: [cc('x')], },
      ]),
    ]);
    // give the branch an entry leg
    course.variations![0]!.branches[0]!.entryBendPoints = [{ x: 5, y: 5 }];
    const r = enumerateVariations(course);
    const flatAnchor = r.variations[0]!.controls[1]!;
    expect(flatAnchor.controlId).toBe('a');
    expect(flatAnchor).not.toBe(anchor);                 // copied, not the trunk object
    expect(flatAnchor.bendPoints).toEqual([{ x: 5, y: 5 }]); // uses branch entry leg
    expect(anchor.bendPoints).toBeUndefined();           // trunk anchor untouched
  });

  it('drops forks with an unresolvable, first, or last anchor (defensive, no throw)', () => {
    const course = baseCourse(trunk(), [
      fork('bad-missing', 'cc-nope', [{ id: 'b1', label: 'A', controls: [cc('x')] }]),
      fork('bad-first', 'cc-s', [{ id: 'b2', label: 'A', controls: [cc('x')] }]),
      fork('bad-last', 'cc-f', [{ id: 'b3', label: 'A', controls: [cc('x')] }]),
    ]);
    const r = enumerateVariations(course);
    expect(r.variations).toHaveLength(1);
    expect(r.variations[0]!.code).toBe('');
    expect(r.droppedForkIds).toHaveLength(3);
  });

  it('caps the combination explosion and flags truncated', () => {
    // 3 forks × 5 branches = 125 > 100.
    const branches5 = (p: string) => Array.from({ length: 5 }, (_, i) => ({ id: `${p}${i}`, label: String.fromCharCode(65 + i), controls: [cc(`${p}${i}`)] }));
    const course = baseCourse(
      [cc('s', 'start', 'cc-s'), cc('a', 'control', 'cc-a'), cc('b', 'control', 'cc-b'), cc('c', 'control', 'cc-c'), cc('f', 'finish', 'cc-f')],
      [fork('f1', 'cc-a', branches5('a')), fork('f2', 'cc-b', branches5('b')), fork('f3', 'cc-c', branches5('c'))],
    );
    const r = enumerateVariations(course);
    expect(r.total).toBe(125);
    expect(r.variations).toHaveLength(MAX_VARIATIONS);
    expect(r.truncated).toBe(true);
  });

  it('composes with map-exchange parts (exchange stays in the flattened trunk)', () => {
    const t = [cc('s', 'start', 'cc-s'), cc('a', 'control', 'cc-a'), cc('e', 'mapExchange', 'cc-e'), cc('f', 'finish', 'cc-f')];
    const course = baseCourse(t, [
      fork('f1', 'cc-a', [{ id: 'b1', label: 'A', controls: [cc('x')] }, { id: 'b2', label: 'B', controls: [cc('y')] }]),
    ]);
    const r = enumerateVariations(course);
    // exchange control survives in each flattened variation → part loop can run on it.
    for (const v of r.variations) {
      expect(v.controls.some((c) => c.type === 'mapExchange')).toBe(true);
    }
  });

  it('drops a second generator that lands on an anchor already taken', () => {
    const course = baseCourse(trunk(), [
      fork('f1', 'cc-a', [{ id: 'b1', label: 'A', controls: [cc('x')] }, { id: 'b2', label: 'B', controls: [cc('y')] }]),
      loop('l1', 'cc-a', [{ id: 'l1a', label: 'A', controls: [cc('p')] }, { id: 'l1b', label: 'B', controls: [cc('q')] }]),
    ]);
    const r = enumerateVariations(course);
    expect(r.total).toBe(2); // only the fork counts; the loop was dropped (no k! multiply)
    expect(r.droppedForkIds.map(String)).toContain('l1');
  });

  it('drops a generator with an unknown kind', () => {
    const bogus = { ...fork('weird', 'cc-a', [{ id: 'b1', label: 'A', controls: [cc('x')] }]), kind: 'butterflyX' } as unknown as CourseFork;
    const r = enumerateVariations(baseCourse(trunk(), [bogus]));
    expect(r.variations).toHaveLength(1);
    expect(r.droppedForkIds.map(String)).toContain('weird');
  });
});

describe('factorial / nthPermutation', () => {
  it('factorial base cases', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(3)).toBe(6);
    expect(factorial(5)).toBe(120);
    expect(factorial(-2)).toBe(1); // guarded
  });

  it('nthPermutation(3, 0..5) yields the 6 lexicographic permutations', () => {
    const perms = Array.from({ length: 6 }, (_, r) => nthPermutation(3, r));
    expect(perms).toEqual([
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ]);
  });

  it('nthPermutation(k, 0) is the identity order', () => {
    expect(nthPermutation(4, 0)).toEqual([0, 1, 2, 3]);
  });

  it('nthPermutation wraps an out-of-range rank mod k!', () => {
    expect(nthPermutation(3, 6)).toEqual(nthPermutation(3, 0));
  });
});

describe('enumerateVariations — loops', () => {
  /** Trunk: start, hub(cc-h), mid(cc-m), finish. */
  const loopTrunk = () => [
    cc('s', 'start', 'cc-s'), cc('h', 'control', 'cc-h'), cc('m', 'control', 'cc-m'), cc('f', 'finish', 'cc-f'),
  ];

  it('2 loops A/B → 2 variations, codes AB and BA', () => {
    const course = baseCourse(loopTrunk(), [
      loop('l1', 'cc-h', [
        { id: 'la', label: 'A', controls: [cc('a1', 'control', 'cc-a1')] },
        { id: 'lb', label: 'B', controls: [cc('b1', 'control', 'cc-b1')] },
      ]),
    ]);
    const r = enumerateVariations(course);
    expect(r.total).toBe(2);
    expect(r.variations.map((v) => v.code)).toEqual(['AB', 'BA']);
    // Variation AB: start, hub, A1, hub, B1, hub, mid, finish  → hub appears 3× (k+1)
    expect(r.variations[0]!.controls.map((c) => c.controlId)).toEqual(
      ['s', 'h', 'a1', 'h', 'b1', 'h', 'm', 'f'],
    );
    expect(r.variations[1]!.controls.map((c) => c.controlId)).toEqual(
      ['s', 'h', 'b1', 'h', 'a1', 'h', 'm', 'f'],
    );
  });

  it('3 loops → 6 variations (k!) with deterministic lexicographic codes', () => {
    const course = baseCourse(loopTrunk(), [
      loop('l1', 'cc-h', [
        { id: 'la', label: 'A', controls: [cc('a1', 'control', 'cc-a1')] },
        { id: 'lb', label: 'B', controls: [cc('b1', 'control', 'cc-b1')] },
        { id: 'lc', label: 'C', controls: [cc('c1', 'control', 'cc-c1')] },
      ]),
    ]);
    const r = enumerateVariations(course);
    expect(r.total).toBe(6);
    expect(r.variations.map((v) => v.code)).toEqual(['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA']);
  });

  it('hub appears k+1 times and hub copies carry no numberOffset', () => {
    const t = loopTrunk();
    // give the trunk hub an explicit numberOffset — it MUST NOT leak onto the copies.
    t[1] = { ...t[1]!, numberOffset: { x: 9, y: 9 } };
    const course = baseCourse(t, [
      loop('l1', 'cc-h', [
        { id: 'la', label: 'A', controls: [cc('a1', 'control', 'cc-a1')] },
        { id: 'lb', label: 'B', controls: [cc('b1', 'control', 'cc-b1')] },
      ]),
    ]);
    const v = enumerateVariations(course).variations[0]!;
    const hubCopies = v.controls.filter((c) => c.controlId === 'h');
    expect(hubCopies).toHaveLength(3);
    for (const h of hubCopies) expect(h.numberOffset).toBeUndefined();
    expect(t[1]!.numberOffset).toEqual({ x: 9, y: 9 }); // trunk untouched
  });

  it('composes loop leg geometry: entry per loop, return on loop-last, exit on final hub', () => {
    const t = loopTrunk();
    t[1] = { ...t[1]!, bendPoints: [{ x: 100, y: 100 }] }; // hub → next-trunk (exit) leg
    const course = baseCourse(t, [
      loop('l1', 'cc-h', [
        { id: 'la', label: 'A', controls: [{ ...cc('a1', 'control', 'cc-a1'), bendPoints: [{ x: 1, y: 1 }] }] },
        { id: 'lb', label: 'B', controls: [{ ...cc('b1', 'control', 'cc-b1'), bendPoints: [{ x: 2, y: 2 }] }] },
      ]),
    ]);
    course.variations![0]!.branches[0]!.entryBendPoints = [{ x: 10, y: 10 }];
    course.variations![0]!.branches[1]!.entryBendPoints = [{ x: 20, y: 20 }];
    const v = enumerateVariations(course).variations[0]!; // order A,B
    // controls: [s, hub0, a1, hub1, b1, hub2(final), m, f]
    expect(v.controls[1]!.bendPoints).toEqual([{ x: 10, y: 10 }]); // hub0 → loop A entry
    expect(v.controls[2]!.bendPoints).toEqual([{ x: 1, y: 1 }]);   // a1 → hub (return)
    expect(v.controls[3]!.bendPoints).toEqual([{ x: 20, y: 20 }]); // hub1 → loop B entry
    expect(v.controls[4]!.bendPoints).toEqual([{ x: 2, y: 2 }]);   // b1 → hub (return)
    expect(v.controls[5]!.bendPoints).toEqual([{ x: 100, y: 100 }]); // final hub → next-trunk (exit)
    expect(v.controls[5]!.controlId).toBe('h');
  });

  it('drops a loop with fewer than 2 loops', () => {
    const course = baseCourse(loopTrunk(), [
      loop('l1', 'cc-h', [{ id: 'la', label: 'A', controls: [cc('a1', 'control', 'cc-a1')] }]),
    ]);
    const r = enumerateVariations(course);
    expect(r.variations).toHaveLength(1);
    expect(r.variations[0]!.code).toBe('');
    expect(r.droppedForkIds.map(String)).toContain('l1');
  });

  it('a 5-loop butterfly (120 orderings) truncates at the cap', () => {
    const loops5 = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`, label: String.fromCharCode(65 + i), controls: [cc(`x${i}`, 'control', `cc-x${i}`)],
    }));
    const course = baseCourse(loopTrunk(), [loop('l1', 'cc-h', loops5)]);
    const r = enumerateVariations(course);
    expect(r.total).toBe(120);
    expect(r.variations).toHaveLength(MAX_VARIATIONS);
    expect(r.truncated).toBe(true);
  });

  it('loop + fork coexist; codes concatenate in anchor-index order', () => {
    // trunk: start, fork@cc-a, loop@cc-b, finish
    const t = [cc('s', 'start', 'cc-s'), cc('a', 'control', 'cc-a'), cc('b', 'control', 'cc-b'), cc('f', 'finish', 'cc-f')];
    const course = baseCourse(t, [
      fork('f1', 'cc-a', [
        { id: 'b1', label: 'A', controls: [cc('x', 'control', 'cc-x')] },
        { id: 'b2', label: 'B', controls: [cc('y', 'control', 'cc-y')] },
      ]),
      loop('l1', 'cc-b', [
        { id: 'la', label: 'P', controls: [cc('p', 'control', 'cc-p')] },
        { id: 'lb', label: 'Q', controls: [cc('q', 'control', 'cc-q')] },
      ]),
    ]);
    const r = enumerateVariations(course);
    expect(r.total).toBe(4); // 2 branches × 2! orderings
    // fork (anchor idx 1) code first, then loop (anchor idx 2) permutation code.
    expect(r.variations.map((v) => v.code)).toEqual(['APQ', 'AQP', 'BPQ', 'BQP']);
  });
});
