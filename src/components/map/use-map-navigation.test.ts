import { describe, it, expect } from 'vitest';
import { fitToView } from './use-map-navigation';

describe('fitToView', () => {
  it('fits a landscape image into a square container', () => {
    const result = fitToView(2000, 1000, 800, 800);
    // Available: 800 - 40 = 760 in each direction
    // Scale by width: 760/2000 = 0.38
    // Scale by height: 760/1000 = 0.76
    // min = 0.38
    expect(result.zoom).toBeCloseTo(0.38, 2);
  });

  it('fits a portrait image into a wide container', () => {
    const result = fitToView(1000, 2000, 1200, 800);
    // Available: 1160 x 760
    // By width: 1160/1000 = 1.16
    // By height: 760/2000 = 0.38
    // min = 0.38
    expect(result.zoom).toBeCloseTo(0.38, 2);
  });

  it('centers the image in the container', () => {
    const result = fitToView(1000, 1000, 800, 800);
    // zoom = 760/1000 = 0.76
    // panX = (800 - 1000*0.76) / 2 = (800-760)/2 = 20
    expect(result.panX).toBeCloseTo(20, 0);
    expect(result.panY).toBeCloseTo(20, 0);
  });

  it('handles zero dimensions gracefully', () => {
    expect(fitToView(0, 0, 800, 800)).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(fitToView(100, 100, 0, 0)).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it('respects custom padding', () => {
    const result = fitToView(1000, 1000, 800, 800, 0);
    // No padding: zoom = 800/1000 = 0.8
    expect(result.zoom).toBeCloseTo(0.8, 2);
  });

  it('clamps zoom to minimum', () => {
    // Very large image in tiny container
    const result = fitToView(100000, 100000, 100, 100);
    expect(result.zoom).toBe(0.1); // MIN_ZOOM
  });
});
