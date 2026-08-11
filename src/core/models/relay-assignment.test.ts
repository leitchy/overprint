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

  it('(4b) cross-team first-loop spreading at the mass start (leg 0)', () => {
    // k=3 butterfly, 12 teams: leg-0 first loops must be spread across teams so a mass
    // start doesn't funnel packs into one loop. Bound = floor(1.17·T/k)+1 (soft term).
    const { course, controls } = build(trunk(), [
      loop('l1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]);
    const teams = 12;
    const result = assignRelayTeams(course, controls, settings(teams, 3));
    const counts = new Map<string, number>();
    for (const team of result.teams) {
      const first = team.legs[0]![0]!;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const bound = Math.floor((1.17 * teams) / 3) + 1; // = 5
    expect(Math.max(...values)).toBeLessThanOrEqual(bound);
    expect(counts.size).toBe(3); // all three first loops used
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
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

/** Settings with fixed-branch pins (branch ids are `${forkId}-${branchIndex}`). */
const pinned = (
  teams: number,
  legs: number,
  fixedBranches: Record<string, number[]>,
): RelaySettings => ({ firstTeamNumber: 1, teams, legs, fixedBranches });

describe('assignRelayTeams — fixed branch→leg pinning (Phase 3b)', () => {
  it('pins force the exact branch on those legs; unpinned legs take the rest', () => {
    // 2-way fork (A=f1-0, B=f1-1), legs=4, A pinned to legs 0,1 → B is the only
    // non-fixed branch, so legs 2,3 are always B.
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, pinned(8, 4, { 'f1-0': [0, 1] }));
    expect(result.issues).toEqual([]);
    for (const team of result.teams) expect(team.legs).toEqual(['A', 'A', 'B', 'B']);
  });

  it('a fully-pinned fork with all legs covered is honoured with no issues', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, pinned(4, 2, { 'f1-0': [0], 'f1-1': [1] }));
    expect(result.issues).toEqual([]);
    for (const team of result.teams) expect(team.legs).toEqual(['A', 'B']);
  });

  it('non-fixed legs balance over the non-fixed branches', () => {
    // 3-branch fork, A pinned to leg 0, legs=5 → legs 1..4 balance over B,C (2 each).
    const { course, controls } = build(trunk(), [
      fork('f1', 'cc-a', [
        { label: 'A', controls: ['x'] },
        { label: 'B', controls: ['y'] },
        { label: 'C', controls: ['z'] },
      ]),
    ]);
    const result = assignRelayTeams(course, controls, pinned(20, 5, { 'f1-0': [0] }));
    expect(result.issues).toEqual([]);
    for (const team of result.teams) {
      expect(team.legs[0]).toBe('A');
      expect(team.legs.filter((c) => c === 'B').length).toBe(2);
      expect(team.legs.filter((c) => c === 'C').length).toBe(2);
    }
  });

  it('contradictory pins (all branches pinned, a leg unpinned) drop the whole fork; output equals the unpinned run', () => {
    const { course, controls } = twoWayFork();
    const unpinnedRun = assignRelayTeams(course, controls, settings(8, 3));
    const pinnedRun = assignRelayTeams(course, controls, pinned(8, 3, { 'f1-0': [0], 'f1-1': [1] }));
    expect(pinnedRun.teams).toEqual(unpinnedRun.teams); // drop-all → identical
    expect(pinnedRun.issues.some((i) => i.kind === 'legUnassignable')).toBe(true);
    // No blank/NaN cells — every code is a real branch label.
    for (const team of pinnedRun.teams) for (const code of team.legs) expect(['A', 'B']).toContain(code);
  });

  it('pinning one fork leaves another fork balanced (independence)', () => {
    // Two 2-way forks; pin only fork 1's A to leg 0. Fork 2 (2nd code char) stays
    // balanced per team over legs.
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
    const result = assignRelayTeams(course, controls, pinned(20, 4, { 'f1-0': [0] }));
    expect(result.issues).toEqual([]);
    for (const team of result.teams) {
      expect(team.legs[0]![0]).toBe('A'); // fork 1 pinned on leg 0
      const c = team.legs.filter((code) => code[1] === 'C').length;
      const d = team.legs.filter((code) => code[1] === 'D').length;
      expect(c).toBe(2); // fork 2 balanced over 4 legs
      expect(d).toBe(2);
    }
  });

  it('an out-of-range pin is dropped with an issue', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, pinned(4, 3, { 'f1-0': [5] }));
    expect(result.issues.some((i) => i.kind === 'legPinnedOutOfRange')).toBe(true);
    // Fork runs unpinned (no valid pins) → both branches appear across teams.
    const allCodes = new Set(result.teams.flatMap((t) => t.legs));
    expect(allCodes.has('A') && allCodes.has('B')).toBe(true);
  });

  it('a pin referencing an unknown branch is dropped with an issue', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, pinned(4, 3, { 'does-not-exist': [0] }));
    expect(result.issues.some((i) => i.kind === 'unknownBranch')).toBe(true);
  });

  it('golden snapshot — 2-way fork with A pinned to legs 0,2 (8 teams × 4 legs)', () => {
    const { course, controls } = twoWayFork();
    const result = assignRelayTeams(course, controls, pinned(8, 4, { 'f1-0': [0, 2] }));
    expect(result.teams.map((t) => `${t.teamNumber}: ${t.legs.join(' ')}`)).toMatchSnapshot();
  });
});
