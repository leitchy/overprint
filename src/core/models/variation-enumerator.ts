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
 * Phase 1 handles `kind:'fork'` (gaffling: pick one branch). `kind:'loop'` (Phase 2)
 * slots in by adding to the per-fork choice set below.
 *
 * Determinism & safety:
 * - Forks are ordered by their anchor's trunk index; variation `code` concatenates
 *   the chosen branches' sticky labels in that order (stable under branch reorder).
 * - Combinations are a mixed-radix odometer (fork 0 most-significant), so the cap
 *   yields a deterministic first-N.
 * - The anchor `CourseControl` is COPIED per variation (its outgoing-leg geometry
 *   replaced by the branch's entry-leg); all other controls are passed by reference
 *   and never mutated (store is Immer-frozen).
 * - A fork whose anchor can't be resolved (removed, or first/last — no rejoin) is
 *   DROPPED into `droppedForkIds`; the enumerator never throws or splices at -1, so
 *   a stale `variations` written by an older app degrades gracefully.
 */
import type { Course, CourseControl, CourseFork } from './types';
import type { ForkId } from '@/utils/id';

/** Hard cap on enumerated variations; beyond this, `truncated` is set. */
export const MAX_VARIATIONS = 100;

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

interface ResolvedFork {
  fork: CourseFork;
  anchorIndex: number;
}

export function enumerateVariations(course: Course): EnumerationResult {
  const trunk = course.controls;
  const droppedForkIds: ForkId[] = [];

  // Resolve fork anchors to trunk indices; drop anything unusable (defensive).
  const resolved: ResolvedFork[] = [];
  for (const fork of course.variations ?? []) {
    if (fork.kind !== 'fork' || !fork.branches?.length) {
      // Phase 1: only forks. (loops handled in Phase 2.)
      if (fork.kind !== 'fork') continue;
      droppedForkIds.push(fork.id);
      continue;
    }
    const anchorIndex = trunk.findIndex((cc) => cc.courseControlId === fork.anchorCourseControlId);
    // Anchor must exist and be interior (needs a control before AND a rejoin after).
    if (anchorIndex <= 0 || anchorIndex >= trunk.length - 1) {
      droppedForkIds.push(fork.id);
      continue;
    }
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

  const dims = resolved.map((rf) => rf.fork.branches.length);
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
      if (rf) {
        const forkOrder = resolved.indexOf(rf);
        const branch = rf.fork.branches[choice[forkOrder]!]!;
        code += branch.label;
        // Anchor copy: outgoing leg becomes the branch's entry leg for this variation.
        controls.push({ ...anchorCC, bendPoints: branch.entryBendPoints, legGaps: branch.entryLegGaps });
        // Branch controls (read-only refs); branch-last.bendPoints is the rejoin leg.
        controls.push(...branch.controls);
      } else {
        controls.push(anchorCC);
      }
    }

    variations.push({ index: k, code, controls });
  }

  return { variations, total, truncated: total > count, droppedForkIds };
}
