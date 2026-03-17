type Brand<T, B extends string> = T & { readonly __brand: B };

export type ControlId = Brand<string, 'ControlId'>;
export type CourseId = Brand<string, 'CourseId'>;
export type EventId = Brand<string, 'EventId'>;
export type SpecialItemId = Brand<string, 'SpecialItemId'>;

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
