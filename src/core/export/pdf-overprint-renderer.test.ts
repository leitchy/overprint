import { describe, it, expect } from 'vitest';
import type { MapPoint } from '@/core/models/types';
import { pdfPolylineToSvgPath } from './pdf-overprint-renderer';

/**
 * Regression guard for the drawSvgPath y-flip bug (bent legs + gapped circles).
 * pdf-lib's drawSvgPath applies an internal scale(1,-1); feeding PDF y-up points
 * with default options rendered them mirrored to -y (off-page). The path string
 * must pre-negate y so the internal flip lands the geometry back on-page.
 */
describe('pdfPolylineToSvgPath', () => {
  it('emits M/L commands with y pre-negated', () => {
    const pts: MapPoint[] = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ];
    expect(pdfPolylineToSvgPath(pts)).toBe('M 10 -20 L 30 -40 L 50 -60');
  });

  it('round-trips: internal flip restores the original on-page y', () => {
    // Points inside a 0..800pt page (all y >= 0 = on-page).
    const pts: MapPoint[] = [
      { x: 100, y: 700 },
      { x: 200, y: 650 },
      { x: 300, y: 720 },
    ];
    const d = pdfPolylineToSvgPath(pts);
    // Parse the y operands from the path string and apply drawSvgPath's flip (negate).
    const yOperands = [...d.matchAll(/[ML] \S+ (\S+)/g)].map((m) => Number(m[1]));
    const restored = yOperands.map((y) => -y); // scale(1,-1)
    expect(restored).toEqual([700, 650, 720]);
    // All restored y are on-page (>= 0); before the fix they would be negative.
    expect(restored.every((y) => y >= 0)).toBe(true);
  });

  it('handles a single-point polyline', () => {
    expect(pdfPolylineToSvgPath([{ x: 5, y: 5 }])).toBe('M 5 -5');
  });
});
