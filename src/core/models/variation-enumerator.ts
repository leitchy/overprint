/**
 * Course variation enumerator (E10). Expands a course's fork/loop generators into
 * concrete linear `CourseControl[]` "variations", each of which existing linear
 * consumers (renderer, descriptions, length, exporters) can eat unchanged via the
 * synthetic-course pattern `{ ...course, controls: v.controls, variations: undefined }`
 * — exactly how multi-part courses reuse them (see course-parts.ts).
 *
 * Pure and dependency-light (no geometry/store imports). Length/climb per variation
 * are a caller concern: `calculateCourseLength(v.controls, ...)`.
 *
 * Handles both generator kinds:
 * - `kind:'fork'` (gaffling: pick one branch) → dimension = `branches.length`;
 *   `choice[f]` is the chosen branch index.
 * - `kind:'loop'` (butterfly/phi) → dimension = `k!` where `k = branches.length`;
 *   `choice[f]` is a permutation RANK, decoded by `nthPermutation` into the order the
 *   loops are run. The hub (anchor) is emitted `k+1` times per variation.
 *
 * Determinism & safety:
 * - Generators are ordered by their anchor's trunk index; variation `code` concatenates
 *   the chosen branches' / permuted loops' sticky labels in that order.
 * - Combinations are a mixed-radix odometer (generator 0 most-significant), so the cap
 *   yields a deterministic first-N. A loop rank is always `< k!` (its own radix), so
 *   `nthPermutation` never receives an out-of-range rank.
 * - The anchor `CourseControl` is COPIED per variation (its outgoing-leg geometry
 *   replaced by the branch's/loop's entry-leg); all other controls are passed by
 *   reference and never mutated (store is Immer-frozen). INVARIANT: a variation's
 *   `controls` are read-only, and `courseControlId` is NOT unique within a variation
 *   (every hub copy shares the trunk anchor's id) — never key a flattened variation by it.
 * - A generator is DROPPED into `droppedForkIds` when its anchor is unresolvable /
 *   first / last, when it has no branches, when a loop has < 2 loops, when a second
 *   generator lands on an anchor already taken, or when `kind` is unknown. The
 *   enumerator never throws or splices at -1, so a stale `variations` written by an
 *   older app degrades gracefully.
 */
import type { Course, CourseControl, CourseFork } from './types';
import type { ForkId } from '@/utils/id';

/** Hard cap on enumerated variations; beyond this, `truncated` is set. */
export const MAX_VARIATIONS = 100;

/** n! for small n (loops in practice have k ≤ ~6). Guards n<0 / non-finite. */
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) return 1;
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/**
 * The `rank`-th permutation (lexicographic) of `[0..k-1]` via the factorial number
 * system (Lehmer code). `nthPermutation(k, 0) === [0..k-1]`. Deterministic; `rank`
 * is taken mod `k!` defensively so an out-of-range rank still yields a valid order.
 */
export function nthPermutation(k: number, rank: number): number[] {
  const elements: number[] = [];
  for (let i = 0; i < k; i++) elements.push(i);
  const result: number[] = [];
  let r = ((rank % factorial(k)) + factorial(k)) % factorial(k);
  for (let i = k; i >= 1; i--) {
    const f = factorial(i - 1);
    const idx = Math.floor(r / f);
    r %= f;
    result.push(elements.splice(idx, 1)[0]!);
  }
  return result;
}

export interface Variation {
  index: number;
  /** '' when the course has no (usable) forks, else e.g. 'AB'. */
  code: string;
  /** Flat linear control sequence for this variation. */
  controls: CourseControl[];
}

export interface EnumerationResult {
  variations: Variation[];
  /** Full combination count before the cap. */
  total: number;
  truncated: boolean;
  /** Forks dropped because their anchor was unresolvable / first / last. */
  droppedForkIds: ForkId[];
}

/** True when the course has at least one usable fork variation. */
export function hasVariations(course: Course): boolean {
  return enumerateVariations(course).variations.length > 1;
}

/**
 * Synthetic linear course for one variation — the exact reuse pattern the
 * multi-part exporters use (`{ ...course, controls: <slice> }`).
 *
 * For the no-fork case (`code === ''`) the ORIGINAL course object is returned
 * unchanged, guaranteeing single-variation consumers behave byte-identically
 * to a course without forks. Otherwise the variation code is appended to the
 * course name (e.g. "Course 1 AB") and `variations` is stripped so downstream
 * consumers never re-expand.
 */
export function variationCourse(course: Course, v: Variation): Course {
  if (v.code === '') return course;
  return {
    ...course,
    name: `${course.name} ${v.code}`,
    controls: v.controls,
    variations: undefined,
  };
}

interface ResolvedFork {
  fork: CourseFork;
  anchorIndex: number;
}

export function enumerateVariations(course: Course): EnumerationResult {
  const trunk = course.controls;
  const droppedForkIds: ForkId[] = [];

  // Resolve generator anchors to trunk indices; drop anything unusable (defensive).
  const resolved: ResolvedFork[] = [];
  const takenAnchorIndex = new Set<number>();
  for (const fork of course.variations ?? []) {
    // Unknown kind (older/newer/hand-edited file) — drop, never silently ignore.
    if (fork.kind !== 'fork' && fork.kind !== 'loop') {
      droppedForkIds.push(fork.id);
      continue;
    }
    if (!fork.branches?.length) {
      droppedForkIds.push(fork.id);
      continue;
    }
    // A loop needs ≥2 loops to have a non-trivial ordering.
    if (fork.kind === 'loop' && fork.branches.length < 2) {
      droppedForkIds.push(fork.id);
      continue;
    }
    const anchorIndex = trunk.findIndex((cc) => cc.courseControlId === fork.anchorCourseControlId);
    // Anchor must exist and be interior (needs a control before AND a rejoin after).
    if (anchorIndex <= 0 || anchorIndex >= trunk.length - 1) {
      droppedForkIds.push(fork.id);
      continue;
    }
    // At most one generator per anchor — a second would be shadowed by the
    // anchor→generator map below and corrupt the dimension count. First wins.
    if (takenAnchorIndex.has(anchorIndex)) {
      droppedForkIds.push(fork.id);
      continue;
    }
    takenAnchorIndex.add(anchorIndex);
    resolved.push({ fork, anchorIndex });
  }

  if (resolved.length === 0) {
    return {
      variations: [{ index: 0, code: '', controls: trunk }],
      total: 1,
      truncated: false,
      droppedForkIds,
    };
  }

  resolved.sort((a, b) => a.anchorIndex - b.anchorIndex);
  const anchorForkByIndex = new Map<number, ResolvedFork>();
  for (const rf of resolved) anchorForkByIndex.set(rf.anchorIndex, rf);

  // Fork dimension = branch count; loop dimension = k! orderings.
  const dims = resolved.map((rf) =>
    rf.fork.kind === 'loop' ? factorial(rf.fork.branches.length) : rf.fork.branches.length,
  );
  const total = dims.reduce((acc, d) => acc * d, 1);
  const count = Math.min(total, MAX_VARIATIONS);

  const variations: Variation[] = [];
  for (let k = 0; k < count; k++) {
    // Decode k → per-fork branch choice (mixed radix, fork 0 most-significant).
    const choice = new Array<number>(resolved.length);
    let rem = k;
    for (let f = resolved.length - 1; f >= 0; f--) {
      choice[f] = rem % dims[f]!;
      rem = Math.floor(rem / dims[f]!);
    }

    const controls: CourseControl[] = [];
    let code = '';
    for (let i = 0; i < trunk.length; i++) {
      const rf = anchorForkByIndex.get(i);
      const anchorCC = trunk[i]!;
      if (rf && rf.fork.kind === 'fork') {
        const forkOrder = resolved.indexOf(rf);
        const branch = rf.fork.branches[choice[forkOrder]!]!;
        code += branch.label;
        // Anchor copy: outgoing leg becomes the branch's entry leg for this variation.
        controls.push({ ...anchorCC, bendPoints: branch.entryBendPoints, legGaps: branch.entryLegGaps });
        // Branch controls (read-only refs); branch-last.bendPoints is the rejoin leg.
        controls.push(...branch.controls);
      } else if (rf && rf.fork.kind === 'loop') {
        const forkOrder = resolved.indexOf(rf);
        const order = nthPermutation(rf.fork.branches.length, choice[forkOrder]!);
        code += order.map((li) => rf.fork.branches[li]!.label).join('');
        // Run each loop in the chosen order, emitting a hub copy before each. Hub
        // copies carry NO numberOffset/score so the renderer can fan the multiple
        // sequence numbers (an explicit trunk offset would otherwise stack them).
        for (const li of order) {
          const loop = rf.fork.branches[li]!;
          controls.push({
            ...anchorCC,
            numberOffset: undefined,
            score: undefined,
            bendPoints: loop.entryBendPoints,
            legGaps: loop.entryLegGaps,
          });
          // Loop controls (read-only refs); loop-last.bendPoints is the return-to-hub leg.
          controls.push(...loop.controls);
        }
        // Final departure hub: retains the ORIGINAL trunk hub's outgoing geometry
        // (hub → next trunk control). This is the (k+1)th hub occurrence.
        controls.push({ ...anchorCC, numberOffset: undefined, score: undefined });
      } else {
        controls.push(anchorCC);
      }
    }

    variations.push({ index: k, code, controls });
  }

  return { variations, total, truncated: total > count, droppedForkIds };
}
