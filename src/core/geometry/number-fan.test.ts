import { describe, it, expect } from 'vitest';
import { computeNumberFanOffsets } from './number-fan';
import { asControlId } from '@/utils/id';

const e = (id: string, numberOffset?: { x: number; y: number }) => ({
  controlId: asControlId(id),
  numberOffset,
});

describe('computeNumberFanOffsets', () => {
  it('passes single occurrences through unchanged', () => {
    const out = computeNumberFanOffsets([e('a'), e('b', { x: 3, y: 4 })], 20);
    expect(out[0]).toBeUndefined();
    expect(out[1]).toEqual({ x: 3, y: 4 });
  });

  it('fans a group of 3 co-located occurrences into 3 distinct offsets', () => {
    const out = computeNumberFanOffsets([e('h'), e('h'), e('h')], 20);
    // first slot is the default direction → zero delta
    expect(out[0]!.x).toBeCloseTo(0);
    expect(out[0]!.y).toBeCloseTo(0);
    // three distinct positions
    const uniq = new Set(out.map((o) => `${o!.x.toFixed(3)},${o!.y.toFixed(3)}`));
    expect(uniq.size).toBe(3);
    // each fanned label sits ~radius from the circle centre (base + delta = point on circle)
    const baseX = 20 * Math.cos(-Math.PI / 4);
    const baseY = 20 * Math.sin(-Math.PI / 4);
    for (const o of out) {
      const dist = Math.hypot(o!.x + baseX, o!.y + baseY);
      expect(dist).toBeCloseTo(20);
    }
  });

  it('keeps an explicit offset within a fanned group; others still fan', () => {
    const out = computeNumberFanOffsets([e('h'), e('h', { x: 99, y: 99 }), e('h')], 20);
    expect(out[1]).toEqual({ x: 99, y: 99 }); // explicit wins
    expect(out[0]).not.toEqual(out[2]); // the two auto slots differ
  });

  it('does not conflate different controls that happen to be adjacent', () => {
    const out = computeNumberFanOffsets([e('a'), e('b'), e('a')], 20);
    // 'a' appears twice → fanned; 'b' once → passthrough undefined
    expect(out[1]).toBeUndefined();
    expect(out[0]).not.toBeUndefined();
    expect(out[2]).not.toBeUndefined();
  });
});
