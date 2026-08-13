/**
 * loadOcadMap real-fixture harness — brings OCAD loading to the OMAP-harness standard.
 * OCAD rendering is delegated to ocad2geojson; our code post-processes (rectangle-symbol
 * injection, upper-ink tagging, viewBox/scale/dpi derivation, font normalisation). All of
 * that is exercised here against a real .ocd file; only the final canvas rasterise (which
 * jsdom can't do) is mocked out.
 */
import { vi, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// load-ocad.ts imports the browser `buffer` polyfill, but ocad2geojson's
// `Buffer.isBuffer` uses Node's native Buffer in this env — force the two to agree.
vi.mock('buffer', () => ({ Buffer: (globalThis as unknown as { Buffer: unknown }).Buffer }));

vi.mock('./rasterize-svg', () => ({
  rasterizeSvgToImage: vi.fn(
    async (_svg: string, w: number, h: number) =>
      ({ naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement,
  ),
}));

import { loadOcadMap } from './load-ocad';

function ocadFile(name: string): File {
  const bytes = readFileSync(join(process.cwd(), 'tests/fixtures/maps', name));
  return new File([bytes], name, { type: '' });
}

const FIXTURE = 'MtTaylor 5000 2025.ocd';

describe('loadOcadMap — real fixture (rasterise mocked)', () => {
  it('derives scale, dpi, viewBox and renderScale', async () => {
    const r = await loadOcadMap(ocadFile(FIXTURE));
    expect(r.scale).toBe(5000); // OCAD parameter string 1039 (ScalePar)
    expect(r.dpi).toBeGreaterThan(0);
    expect(Number.isFinite(r.dpi)).toBe(true);
    expect(r.viewBox.width).toBeGreaterThan(0);
    expect(r.viewBox.height).toBeGreaterThan(0);
    expect(r.renderScale).toBeGreaterThan(0);
    // renderScale maps the longest viewBox side to the base raster long side.
    expect(Math.max(r.viewBox.width, r.viewBox.height) * r.renderScale).toBeCloseTo(4000, 0);
  });

  it('produces an SVG with normalised fonts and IOF upper-ink tagging', async () => {
    const r = await loadOcadMap(ocadFile(FIXTURE));
    expect(r.svg).toContain('<svg');
    expect(r.svg).toContain('viewBox');
    // font-family declarations are all rewritten to sans-serif (data-URL SVG can't
    // resolve system fonts).
    for (const m of r.svg.match(/font-family="[^"]*"/g) ?? []) {
      expect(m).toBe('font-family="sans-serif"');
    }
    // A real orienteering map has 100% black/brown/blue linework → tagged for colour order.
    expect(r.svg).toContain('data-ink="upper"');
  });

  it('is deterministic (same file → identical svg + viewBox)', async () => {
    const a = await loadOcadMap(ocadFile(FIXTURE));
    const b = await loadOcadMap(ocadFile(FIXTURE));
    expect(a.svg).toBe(b.svg);
    expect(a.viewBox).toEqual(b.viewBox);
    expect(a.scale).toBe(b.scale);
  });
});
