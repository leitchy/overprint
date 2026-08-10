type Brand<T, B extends string> = T & { readonly __brand: B };

export type ControlId = Brand<string, 'ControlId'>;
export type CourseId = Brand<string, 'CourseId'>;
export type EventId = Brand<string, 'EventId'>;
export type SpecialItemId = Brand<string, 'SpecialItemId'>;
/** Stable per-occurrence id for a CourseControl (an entry in a course's control
 *  sequence). Distinct from ControlId — the same control can appear more than once
 *  (loops, shared across branches). Forks anchor by this, not by ControlId. */
export type CourseControlId = Brand<string, 'CourseControlId'>;
export type ForkId = Brand<string, 'ForkId'>;
export type BranchId = Brand<string, 'BranchId'>;

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateControlId(): ControlId {
  return generateId() as ControlId;
}

export function generateCourseId(): CourseId {
  return generateId() as CourseId;
}

export function generateEventId(): EventId {
  return generateId() as EventId;
}

export function generateSpecialItemId(): SpecialItemId {
  return generateId() as SpecialItemId;
}

export function generateCourseControlId(): CourseControlId {
  return generateId() as CourseControlId;
}

export function generateForkId(): ForkId {
  return generateId() as ForkId;
}

export function generateBranchId(): BranchId {
  return generateId() as BranchId;
}

// Persistence boundary constructors — use only when deserializing from JSON/XML
export function asControlId(raw: string): ControlId {
  return raw as ControlId;
}

export function asCourseId(raw: string): CourseId {
  return raw as CourseId;
}

export function asEventId(raw: string): EventId {
  return raw as EventId;
}

export function asSpecialItemId(raw: string): SpecialItemId {
  return raw as SpecialItemId;
}

export function asCourseControlId(raw: string): CourseControlId {
  return raw as CourseControlId;
}

export function asForkId(raw: string): ForkId {
  return raw as ForkId;
}

export function asBranchId(raw: string): BranchId {
  return raw as BranchId;
}
