/**
 * Course parts utility — computes multi-part course boundaries from
 * mapExchange / mapFlip controls. Parts are never stored; they are
 * derived dynamically from the CourseControl sequence.
 *
 * Convention: the exchange control is the LAST control of part N and
 * the FIRST control of part N+1 (it appears in both adjacent parts).
 */

import type { Course, CourseControl } from './types';

/** Returns true when the control type marks a part boundary. */
function isExchangeType(type: string): boolean {
  return type === 'mapExchange' || type === 'mapFlip';
}

/** Count how many parts a course has. A course with N exchange controls has N+1 parts. */
export function countCourseParts(controls: CourseControl[]): number {
  let exchanges = 0;
  for (const cc of controls) {
    if (isExchangeType(cc.type)) exchanges++;
  }
  return exchanges + 1;
}

/** Convenience predicate — true when the course has 2+ parts. */
export function isMultiPart(course: Course): boolean {
  return countCourseParts(course.controls) > 1;
}

/**
 * Get the inclusive start and end indices in the controls array for a given part.
 *
 * Part boundaries are exchange controls. The exchange control at the end of
 * part N is also the first control of part N+1.
 *
 * Example: controls = [S, A, ME, B, C, F] where ME is mapExchange
 *   Part 0: indices 0..2 (S, A, ME)
 *   Part 1: indices 2..5 (ME, B, C, F)
 */
export function getPartBounds(
  controls: CourseControl[],
  partIndex: number,
): { start: number; end: number } {
  // Find all exchange indices
  const exchangeIndices: number[] = [];
  for (let i = 0; i < controls.length; i++) {
    if (isExchangeType(controls[i]!.type)) exchangeIndices.push(i);
  }

  const totalParts = exchangeIndices.length + 1;
  const clamped = Math.max(0, Math.min(partIndex, totalParts - 1));

  // Start: index 0 for part 0, or the exchange index for subsequent parts
  const start = clamped === 0 ? 0 : exchangeIndices[clamped - 1]!;

  // End: the exchange index for non-final parts, or last index for the final part
  const end = clamped < exchangeIndices.length
    ? exchangeIndices[clamped]!
    : controls.length - 1;

  return { start, end };
}

/**
 * Extract the CourseControl slice for a specific part.
 * The returned array is a shallow copy suitable for rendering.
 */
export function getPartControls(
  course: Course,
  partIndex: number,
): CourseControl[] {
  const { start, end } = getPartBounds(course.controls, partIndex);
  return course.controls.slice(start, end + 1);
}
