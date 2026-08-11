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

/**
 * A course fork/loop generator resolved to its trunk anchor and dimension.
 * `dim` is the number of distinct choices at this generator: a fork's branch
 * count, or a loop's `k!` orderings. Produced sorted by `anchorIndex` so the
 * choice-vector indexing and code-string order are deterministic.
 */
export interface ResolvedGenerator {
  fork: CourseFork;
  anchorIndex: number;
  dim: number;
}

export interface ResolveGeneratorsResult {
  /** Usable generators, sorted by trunk anchor index (most-significant first). */
  generators: ResolvedGenerator[];
  /** Generators dropped as unresolvable/first/last/empty/duplicate-anchor/unknown-kind. */
  droppedForkIds: ForkId[];
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

/**
 * Resolve a course's fork/loop generators to their trunk anchors, dropping any
 * that are unusable (defensive — a stale `variations` from an older app degrades
 * gracefully rather than throwing). Returned sorted by anchor index so both the
 * choice-vector indexing (generator 0 = smallest anchor index = most-significant
 * radix) and the concatenated code string are deterministic.
 *
 * Shared by {@link enumerateVariations}, {@link variationCode},
 * {@link choiceVectorToVariation} and the relay-assignment module, so every
 * consumer sees the SAME generator set / dimensions / order.
 */
export function resolveGenerators(course: Course): ResolveGeneratorsResult {
  const trunk = course.controls;
  const droppedForkIds: ForkId[] = [];
  const generators: ResolvedGenerator[] = [];
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
    // At most one generator per anchor — a second would corrupt the dimension
    // count / anchor map. First wins.
    if (takenAnchorIndex.has(anchorIndex)) {
      droppedForkIds.push(fork.id);
      continue;
    }
    takenAnchorIndex.add(anchorIndex);
    // Fork dimension = branch count; loop dimension = k! orderings.
    const dim = fork.kind === 'loop' ? factorial(fork.branches.length) : fork.branches.length;
    generators.push({ fork, anchorIndex, dim });
  }

  generators.sort((a, b) => a.anchorIndex - b.anchorIndex);
  return { generators, droppedForkIds };
}

/**
 * Decode a flat variation index into a per-generator choice vector (mixed radix,
 * generator 0 most-significant). `choice[g] ∈ [0, dims[g])`.
 */
export function decodeChoice(index: number, dims: number[]): number[] {
  const choice = new Array<number>(dims.length);
  let rem = index;
  for (let g = dims.length - 1; g >= 0; g--) {
    choice[g] = rem % dims[g]!;
    rem = Math.floor(rem / dims[g]!);
  }
  return choice;
}

/**
 * The variation code (e.g. 'AB') for a choice vector — the concatenation, in
 * anchor order, of each fork's chosen branch label or each loop's permuted loop
 * labels. `'' `when there are no generators. Byte-identical to the code
 * `enumerateVariations` produces (both call this).
 */
export function variationCode(generators: ResolvedGenerator[], choice: number[]): string {
  let code = '';
  for (let g = 0; g < generators.length; g++) {
    const { fork } = generators[g]!;
    const c = choice[g]!;
    if (fork.kind === 'loop') {
      const order = nthPermutation(fork.branches.length, c);
      code += order.map((li) => fork.branches[li]!.label).join('');
    } else {
      code += fork.branches[c]!.label;
    }
  }
  return code;
}

/**
 * Build the flat linear `CourseControl[]` for a single variation from its choice
 * vector. UNCAPPED (unlike {@link enumerateVariations}, which stops at
 * `MAX_VARIATIONS`), so relay export can resolve any assigned variation's
 * controls even when a course has > 100 combinations.
 *
 * The anchor `CourseControl` is COPIED per occurrence (outgoing-leg geometry
 * replaced by the branch's/loop's entry-leg); all other controls are read-only
 * refs. INVARIANT (as in the enumerator): `courseControlId` is NOT unique within
 * a variation — every loop-hub copy shares the trunk anchor's id.
 */
export function choiceVectorToVariation(
  course: Course,
  generators: ResolvedGenerator[],
  choice: number[],
): CourseControl[] {
  const trunk = course.controls;
  const generatorByAnchor = new Map<number, number>();
  generators.forEach((g, order) => generatorByAnchor.set(g.anchorIndex, order));

  const controls: CourseControl[] = [];
  for (let i = 0; i < trunk.length; i++) {
    const anchorCC = trunk[i]!;
    const order = generatorByAnchor.get(i);
    if (order === undefined) {
      controls.push(anchorCC);
      continue;
    }
    const { fork } = generators[order]!;
    const c = choice[order]!;
    if (fork.kind === 'fork') {
      const branch = fork.branches[c]!;
      // Anchor copy: outgoing leg becomes the branch's entry leg for this variation.
      controls.push({ ...anchorCC, bendPoints: branch.entryBendPoints, legGaps: branch.entryLegGaps });
      // Branch controls (read-only refs); branch-last.bendPoints is the rejoin leg.
      controls.push(...branch.controls);
    } else {
      const loopOrder = nthPermutation(fork.branches.length, c);
      // Run each loop in the chosen order, emitting a hub copy before each. Hub
      // copies carry NO numberOffset/score so the renderer can fan the multiple
      // sequence numbers (an explicit trunk offset would otherwise stack them).
      for (const li of loopOrder) {
        const loop = fork.branches[li]!;
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
    }
  }
  return controls;
}

export function enumerateVariations(course: Course): EnumerationResult {
  const trunk = course.controls;
  const { generators, droppedForkIds } = resolveGenerators(course);

  if (generators.length === 0) {
    return {
      variations: [{ index: 0, code: '', controls: trunk }],
      total: 1,
      truncated: false,
      droppedForkIds,
    };
  }

  const dims = generators.map((g) => g.dim);
  const total = dims.reduce((acc, d) => acc * d, 1);
  const count = Math.min(total, MAX_VARIATIONS);

  const variations: Variation[] = [];
  for (let k = 0; k < count; k++) {
    const choice = decodeChoice(k, dims);
    variations.push({
      index: k,
      code: variationCode(generators, choice),
      controls: choiceVectorToVariation(course, generators, choice),
    });
  }

  return { variations, total, truncated: total > count, droppedForkIds };
}
