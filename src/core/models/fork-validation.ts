/**
 * Fork validation (E10, Phase 1). Pure structural checks over a course's
 * `variations` so the UI and event audit can surface problems without the
 * store having to forbid intermediate editing states.
 *
 * The store deliberately allows "in progress" forks (e.g. a freshly created
 * fork has two branches with no controls yet). Enumeration/export are gated on
 * `courseForkIssues(course)` being empty instead.
 *
 * The anchor-resolution rule here matches the enumerator's drop rule
 * (variation-enumerator.ts): the anchor must resolve to an INTERIOR trunk
 * control — index > 0 (a leg leads into the fork) and index < length-1
 * (a rejoin control exists after it).
 */

import type { Course } from './types';
import type { BranchId, ForkId } from '@/utils/id';
import { isExchangeType } from './course-parts';

export type ForkIssueKind =
  /** Anchor missing from the trunk, or first/last (no entry leg / no rejoin). */
  | 'anchorUnresolved'
  /** Anchor is a mapExchange/mapFlip — a fork cannot diverge at a part boundary. */
  | 'anchorIsExchange'
  /** The rejoin control (anchor's trunk successor) is a mapExchange/mapFlip —
   *  the fork would straddle a part boundary. */
  | 'rejoinAcrossExchange'
  /** A branch contains a mapExchange/mapFlip control. */
  | 'exchangeInBranch'
  /** Forks/loops are not supported on score courses. */
  | 'scoreCourse'
  /** Two branches/loops of the same generator share a label. */
  | 'duplicateLabel'
  /** Branch/loop has no controls yet — the generator is incomplete. */
  | 'emptyBranch'
  /** A loop needs ≥2 loops for a non-trivial ordering. */
  | 'tooFewLoops'
  /** More than one generator anchored at the same control (the second is dropped). */
  | 'duplicateAnchor'
  /** Soft: a loop has >4 loops — the hub circle carries too many numbers to read. */
  | 'tooManyLoops';

export interface ForkIssue {
  forkId: ForkId;
  /** Set for branch-scoped issues (emptyBranch, duplicateLabel, exchangeInBranch). */
  branchId?: BranchId;
  kind: ForkIssueKind;
}

/**
 * Validate every fork on a course. Returns an empty array when the course has
 * no forks or all forks are structurally sound (safe to enumerate/export).
 */
export function courseForkIssues(course: Course): ForkIssue[] {
  const issues: ForkIssue[] = [];
  const forks = course.variations ?? [];
  if (forks.length === 0) return issues;

  const trunk = course.controls;
  const anchorSeen = new Set<string>();

  for (const fork of forks) {
    if (course.courseType === 'score') {
      issues.push({ forkId: fork.id, kind: 'scoreCourse' });
    }

    // A loop needs ≥2 loops; >4 is a soft legibility warning (hub number clutter).
    if (fork.kind === 'loop') {
      if (fork.branches.length < 2) {
        issues.push({ forkId: fork.id, kind: 'tooFewLoops' });
      } else if (fork.branches.length > 4) {
        issues.push({ forkId: fork.id, kind: 'tooManyLoops' });
      }
    }

    const anchorIndex = trunk.findIndex(
      (cc) => cc.courseControlId === fork.anchorCourseControlId,
    );
    if (anchorIndex <= 0 || anchorIndex >= trunk.length - 1) {
      issues.push({ forkId: fork.id, kind: 'anchorUnresolved' });
    } else {
      // Only one generator per anchor — a second is silently dropped by the enumerator.
      const key = String(fork.anchorCourseControlId);
      if (anchorSeen.has(key)) {
        issues.push({ forkId: fork.id, kind: 'duplicateAnchor' });
      }
      anchorSeen.add(key);
      if (isExchangeType(trunk[anchorIndex]!.type)) {
        issues.push({ forkId: fork.id, kind: 'anchorIsExchange' });
      }
      if (isExchangeType(trunk[anchorIndex + 1]!.type)) {
        issues.push({ forkId: fork.id, kind: 'rejoinAcrossExchange' });
      }
    }

    const seenLabels = new Set<string>();
    for (const branch of fork.branches) {
      if (seenLabels.has(branch.label)) {
        issues.push({ forkId: fork.id, branchId: branch.id, kind: 'duplicateLabel' });
      }
      seenLabels.add(branch.label);
      if (branch.controls.length === 0) {
        issues.push({ forkId: fork.id, branchId: branch.id, kind: 'emptyBranch' });
      }
      if (branch.controls.some((cc) => isExchangeType(cc.type))) {
        issues.push({ forkId: fork.id, branchId: branch.id, kind: 'exchangeInBranch' });
      }
    }
  }

  return issues;
}
