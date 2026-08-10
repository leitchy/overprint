import { describe, it, expect } from 'vitest';
import { enumerateVariations, hasVariations, MAX_VARIATIONS } from './variation-enumerator';
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
});
