import { describe, it, expect } from 'vitest';
import { shortenedLeg } from './leg-endpoints';

describe('shortenedLeg', () => {
  it('shortens a horizontal line', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10);
    expect(result).not.toBeNull();
    const [start, end] = result!;
    expect(start.x).toBeCloseTo(10);
    expect(start.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(90);
    expect(end.y).toBeCloseTo(0);
  });

  it('shortens a vertical line', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 0, y: 100 }, 15, 20);
    expect(result).not.toBeNull();
    const [start, end] = result!;
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(15);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(80);
  });

  it('shortens a diagonal line', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 30, y: 40 }, 5, 5);
    expect(result).not.toBeNull();
    // Distance is 50, shorten by 5 each end
    const [start, end] = result!;
    expect(start.x).toBeCloseTo(3);
    expect(start.y).toBeCloseTo(4);
    expect(end.x).toBeCloseTo(27);
    expect(end.y).toBeCloseTo(36);
  });

  it('returns null when controls overlap', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 5, y: 0 }, 10, 10);
    expect(result).toBeNull();
  });

  it('returns null when controls are exactly touching', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 20, y: 0 }, 10, 10);
    expect(result).toBeNull();
  });

  it('handles asymmetric offsets', () => {
    const result = shortenedLeg({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 5);
    expect(result).not.toBeNull();
    const [start, end] = result!;
    expect(start.x).toBeCloseTo(20);
    expect(end.x).toBeCloseTo(95);
  });
});
