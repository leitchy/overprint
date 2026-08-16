import { describe, it, expect } from 'vitest';
import { applyMapDimming, dimKey, DIM_OPACITY } from './apply-map-dimming';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
  + '<path d="M0 0 L1 1" fill="rgb(0,148,216)" data-cat="blue"/>'
  + '<path d="M0 0 L1 1 Z" fill="rgb(60,158,74)" data-cat="green"/>'
  + '<path d="M0 0 L1 1" stroke="rgb(0,0,0)"/>'
  + '</svg>';

describe('applyMapDimming', () => {
  it('returns the input byte-identical when nothing is dimmed', () => {
    expect(applyMapDimming(SVG, [])).toBe(SVG);
    expect(applyMapDimming(SVG, new Set())).toBe(SVG);
  });

  it('injects a <style> opacity rule for each dimmed group (removes nothing)', () => {
    const out = applyMapDimming(SVG, ['green']);
    expect(out).toContain(`<style>[data-cat="green"]{opacity:${DIM_OPACITY}}</style>`);
    // Every original element survives — dimming fades, never removes.
    expect(out).toContain('data-cat="blue"');
    expect(out).toContain('data-cat="green"');
    expect(out).toContain('stroke="rgb(0,0,0)"');
    // The <style> sits right after the opening <svg …> tag.
    expect(out).toMatch(/<svg\b[^>]*><style>/);
  });

  it('injects one rule per group', () => {
    const out = applyMapDimming(SVG, ['green', 'blue']);
    expect(out).toContain(`[data-cat="green"]{opacity:${DIM_OPACITY}}`);
    expect(out).toContain(`[data-cat="blue"]{opacity:${DIM_OPACITY}}`);
  });

  it('leaves a string with no <svg> tag untouched', () => {
    expect(applyMapDimming('not svg', ['green'])).toBe('not svg');
  });
});

describe('dimKey', () => {
  it('is order-independent', () => {
    expect(dimKey(['green', 'blue'])).toBe(dimKey(['blue', 'green']));
  });
  it('is empty for no groups', () => {
    expect(dimKey([])).toBe('');
  });
});
