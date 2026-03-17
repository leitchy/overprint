import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateControlId,
  generateCourseId,
  generateEventId,
  asControlId,
  asCourseId,
  asEventId,
} from './id';

describe('id generation', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('generates valid UUID format', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates branded control IDs', () => {
    const id = generateControlId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates branded course IDs', () => {
    const id = generateCourseId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates branded event IDs', () => {
    const id = generateEventId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('persistence boundary constructors', () => {
  it('converts raw string to ControlId', () => {
    const id = asControlId('test-id');
    expect(id).toBe('test-id');
  });

  it('converts raw string to CourseId', () => {
    const id = asCourseId('test-id');
    expect(id).toBe('test-id');
  });

  it('converts raw string to EventId', () => {
    const id = asEventId('test-id');
    expect(id).toBe('test-id');
  });
});
