import { describe, it, expect } from 'vitest';
import { assignRelayTeams } from './relay-assignment';
import {
  resolveGenerators,
  decodeChoice,
  variationCode,
} from './variation-enumerator';
import { makeCourseControl } from './defaults';
import type { Control, Course, CourseControl, CourseFork, RelaySettings } from './types';
import {
  asControlId,
  asCourseControlId,
  asCourseId,
  asForkId,
  asBranchId,
  type ControlId,
} from '@/utils/id';

const cc = (id: string, type: CourseControl['type'] = 'control'): CourseControl => ({
  ...makeCourseControl(asControlId(id), type),
  courseControlId: asCourseControlId(`cc-${id}`),
});

const fork = (
  id: string,
  anchor: string,
  branches: Array<{ label: string; controls: string[] }>,
): CourseFork => ({
  id: asForkId(id),
  kind: 'fork',
  anchorCourseControlId: asCourseControlId(anchor),
  branches: branches.map((b, i) => ({
    id: asBranchId(`${id}-${i}`),
    label: b.label,
    controls: b.controls.map((c) => cc(c)),
  })),
});

const loop = (
  id: string,
  anchor: string,
  loops: Array<{ label: string; controls: string[] }>,
): CourseFork => ({ ...fork(id, anchor, loops), kind: 'loop' });

/** Build a course + a controls record covering every referenced control id. */
function build(controls: CourseControl[], variations: CourseFork[]): {
  course: Course;
  controls: Record<ControlId, Control>;
} {
  const course: Course = {
    id: asCourseId('co'),
    name: 'C',
    courseType: 'normal',
    controls,
    settings: {},
    variations,
  };
  const map: Record<ControlId, Control> = {};
  let code = 100;
  const register = (id: ControlId) => {
    if (!map[id]) {
      map[id] = {
        id,
        code: code++,
        position: { x: 0, y: 0 },
        description: {},
      } as Control;
    }
  };
  for (const c of controls) register(c.controlId);
  for (const f of variations) for (const b of f.branches) for (const c of b.controls) register(c.controlId);
  return { course, controls: map };
}

/** Trunk: start, a (anchor), b (anchor), finish. */
function trunk(): CourseControl[] {
  return [cc('s', 'start'), cc('a'), cc('b'), cc('f', 'finish')];
}

const settings = (teams: number, legs: number, firstTeamNumber = 1): RelaySettings => ({
  firstTeamNumber,
  teams,
  legs,
});

/** A single 2-way fork at control `a`. */
function twoWayFork() {
  return build(trunk(), [
    fork('f1', 'cc-a', [
      { label: 'A', controls: ['x'] },
      { label: 'B', controls: ['y'] },
    ]),
  ]);
}

describe('assignRelayTeams', () => {
  it('(1) golden snapshot — 2-way fork, 8 teams × 3 legs', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, settings(8, 3));
    expect(result.teams.map((t) => `${t.teamNumber}: ${t.legs.join(' ')}`)).toMatchSnapshot();
  });

  it('(1) golden snapshot — single 3-loop, 6 teams × 3 legs', () => {
    const { course, controls } = build(trunk(), [
      loop('l1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]);
    const result = assignRelayTeams(course, controls, settings(6, 3));
    expect(result.teams.map((t) => `${t.teamNumber}: ${t.legs.join(' ')}`)).toMatchSnapshot();
  });

  it('(1) golden snapshot — fork + loop combined, 8 teams × 4 legs', () => {
    const { course, controls } = build(trunk(), [
      fork('f1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
      ]),
      loop('l1', 'cc-b', [
        { label: 'C', controls: ['p'] },
        { label: 'D', controls: ['q'] },
      ]),
    ]);
    const result = assignRelayTeams(course, controls, settings(8, 4));
    expect(result.teams.map((t) => `${t.teamNumber}: ${t.legs.join(' ')}`)).toMatchSnapshot();
  });

  it('(2) determinism — two calls are deeply equal', () => {
    const { course, controls } = twoWayFork();
    const a = assignRelayTeams(course, controls, settings(20, 3));
    const b = assignRelayTeams(course, controls, settings(20, 3));
    expect(a).toEqual(b);
  });

  it('(2) determinism — unaffected by an unrelated control-code edit', () => {
    const { course, controls } = twoWayFork();
    const before = assignRelayTeams(course, controls, settings(12, 3));
    // Rename a control code (unrelated to structure).
    const anyId = Object.keys(controls)[0] as ControlId;
    controls[anyId]!.code = 999;
    const after = assignRelayTeams(course, controls, settings(12, 3));
    expect(after.teams).toEqual(before.teams);
  });

  it('(3) hard within-team fork balance — usage(b) = floor(L/k)+(b<L%k)', () => {
    const { course, controls } = twoWayFork(); // k=2
    const legs = 5;
    const result = assignRelayTeams(course, controls, settings(30, legs));
    for (const team of result.teams) {
      const a = team.legs.filter((c) => c === 'A').length;
      const b = team.legs.filter((c) => c === 'B').length;
      expect(a).toBe(Math.floor(legs / 2) + (0 < legs % 2 ? 1 : 0)); // 3
      expect(b).toBe(Math.floor(legs / 2)); // 2
    }
  });

  it('(4) loop first-loop distinctness across first k legs of a team', () => {
    const { course, controls } = build(trunk(), [
      loop('l1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]); // k=3
    const result = assignRelayTeams(course, controls, settings(6, 3));
    for (const team of result.teams) {
      const firstLoops = team.legs.slice(0, 3).map((code) => code[0]);
      expect(new Set(firstLoops).size).toBe(3); // all distinct
    }
  });

  it('(6) no duplicate teams when teams ≤ totalVariations', () => {
    // Two 2-way forks → 4 variations. 4 teams × 2 legs.
    const { course, controls } = build(trunk(), [
      fork('f1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
      ]),
      fork('f2', 'cc-b', [
        { label: 'C', controls: ['p'] },
        { label: 'D', controls: ['q'] },
      ]),
    ]);
    const result = assignRelayTeams(course, controls, settings(4, 2));
    const signatures = result.teams.map((t) => t.legs.join('|'));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('(6) within-team distinct legs — single k=3 fork, L=3 (multiset forces a permutation)', () => {
    // With one k-branch fork and L=k legs, the branch multiset is exactly one of
    // each, so every team's legs are a permutation of the branches → all distinct.
    const { course, controls } = build(trunk(), [
      fork('f1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]);
    const result = assignRelayTeams(course, controls, settings(10, 3));
    for (const team of result.teams) {
      expect(new Set(team.legs).size).toBe(3);
      expect([...team.legs].sort()).toEqual(['A', 'B', 'C']);
    }
  });

  it('(7) code fidelity — every cell code is in the uncapped enumeration set (total > 100)', () => {
    // 4-loop (24) × 3-loop (6) = 144 variations > MAX_VARIATIONS.
    const { course, controls } = build(
      [cc('s', 'start'), cc('a'), cc('b'), cc('f', 'finish')],
      [
        loop('l1', 'cc-a', [
          { label: 'A', controls: ['w'] },
          { label: 'B', controls: ['x'] },
          { label: 'C', controls: ['y'] },
          { label: 'D', controls: ['z'] },
        ]),
        loop('l2', 'cc-b', [
          { label: 'E', controls: ['p'] },
          { label: 'F', controls: ['q'] },
          { label: 'G', controls: ['r'] },
        ]),
      ],
    );
    const result = assignRelayTeams(course, controls, settings(10, 3));
    expect(result.totalVariations).toBe(144);

    // Build the full uncapped code set.
    const { generators } = resolveGenerators(course);
    const dims = generators.map((g) => g.dim);
    const total = dims.reduce((a, d) => a * d, 1);
    const allCodes = new Set<string>();
    for (let k = 0; k < total; k++) allCodes.add(variationCode(generators, decodeChoice(k, dims)));

    for (const team of result.teams) {
      for (const code of team.legs) expect(allCodes.has(code)).toBe(true);
    }
  });

  it('(8) uneven-division warning — fork k=2, L=5', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, settings(4, 5));
    expect(result.warnings).toHaveLength(1);
    const w = result.warnings[0]!;
    expect(w.moreLegs).toBe(3);
    expect(w.moreLabels).toEqual(['A']);
    expect(w.lessLegs).toBe(2);
    expect(w.lessLabels).toEqual(['B']);
  });

  it('(8) loops never warn even when L ∤ k! and L ∤ k', () => {
    const { course, controls } = build(trunk(), [
      loop('l1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]); // k=3, k!=6
    const result = assignRelayTeams(course, controls, settings(4, 4)); // 4%6≠0, 4%3≠0
    expect(result.warnings).toHaveLength(0);
  });

  it('(9) edge — no generators → all empty codes', () => {
    const { course, controls } = build(trunk(), []);
    const result = assignRelayTeams(course, controls, settings(3, 2));
    expect(result.teams).toHaveLength(3);
    for (const team of result.teams) expect(team.legs).toEqual(['', '']);
  });

  it('(9) edge — teams = 0 → empty team list', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, settings(0, 3));
    expect(result.teams).toEqual([]);
  });

  it('(9) edge — legs = 1 does not throw and fills one code', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, settings(5, 1));
    for (const team of result.teams) expect(team.legs).toHaveLength(1);
  });

  it('(9) edge — teams > totalVariations does not throw', () => {
    const { course, controls } = twoWayFork(); // total = 2
    expect(() => assignRelayTeams(course, controls, settings(10, 2))).not.toThrow();
  });

  it('firstTeamNumber offsets team numbering', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, settings(3, 2, 64));
    expect(result.teams.map((t) => t.teamNumber)).toEqual([64, 65, 66]);
  });
});
