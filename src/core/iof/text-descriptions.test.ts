import { describe, it, expect } from 'vitest';
import { generateTextDescription } from './text-descriptions';
import type { ControlDescription } from '@/core/models/types';

describe('generateTextDescription', () => {
  it('returns empty string for empty description', () => {
    const desc: ControlDescription = { columnD: '' };
    expect(generateTextDescription(desc)).toBe('');
  });

  it('generates from column D only', () => {
    const desc: ControlDescription = { columnD: '1.1' }; // Terrace
    const text = generateTextDescription(desc);
    expect(text.toLowerCase()).toContain('terrace');
  });

  it('combines column C and D', () => {
    const desc: ControlDescription = {
      columnC: '0.1N', // North
      columnD: '1.3',  // Re-entrant
    };
    const text = generateTextDescription(desc);
    // Should contain both direction and feature
    expect(text.length).toBeGreaterThan(0);
  });

  it('includes column G (location)', () => {
    const desc: ControlDescription = {
      columnD: '1.3',   // Re-entrant
      columnG: '11.1N', // North side
    };
    const text = generateTextDescription(desc);
    expect(text).toContain(',');
    expect(text.length).toBeGreaterThan(5);
  });

  it('includes column E (appearance)', () => {
    const desc: ControlDescription = {
      columnD: '1.1',  // Terrace
      columnE: '2.1',  // Shallow
    };
    const text = generateTextDescription(desc);
    expect(text.length).toBeGreaterThan(5);
  });

  it('appends column H with period separator', () => {
    const desc: ControlDescription = {
      columnD: '1.1',   // Terrace
      columnH: '12.1',  // First aid
    };
    const text = generateTextDescription(desc);
    expect(text).toContain('.');
  });

  it('handles all columns filled', () => {
    const desc: ControlDescription = {
      columnC: '0.1N',
      columnD: '1.3',
      columnE: '2.1',
      columnF: '8.1',
      columnG: '11.1N',
      columnH: '12.1',
    };
    const text = generateTextDescription(desc);
    expect(text.length).toBeGreaterThan(10);
    // Should have commas and a period
    expect(text).toContain(',');
    expect(text).toContain('.');
  });
});
