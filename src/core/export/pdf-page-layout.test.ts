import { describe, it, expect } from 'vitest';
import { computeCourseBounds, computeMapViewport, computePageLayout, computeMultiPageViewports } from './pdf-page-layout';
import type { Course, Control } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { DEFAULT_PAGE_SETUP } from '@/core/models/defaults';

// Helpers to create test data
const cid = (s: string) => s as ControlId;
const ccid = (s: string) => s as CourseId;

function makeControl(id: string, x: number, y: number): Control {
  return {
    id: cid(id),
    code: 31,
    position: { x, y },
    description: { columnD: '' },
  };
}

function makeCourse(controlIds: string[]): Course {
  return {
    id: ccid('course-1'),
    name: 'Test Course',
    courseType: 'normal',
    controls: controlIds.map((id, i) => ({
      controlId: cid(id),
      type: i === 0 ? 'start' as const : i === controlIds.length - 1 ? 'finish' as const : 'control' as const,
    })),
    settings: {},
  };
}

describe('computeCourseBounds', () => {
  it('returns bounding box for controls in a course', () => {
    const controls: Record<ControlId, Control> = {
      [cid('a')]: makeControl('a', 100, 200),
      [cid('b')]: makeControl('b', 500, 300),
      [cid('c')]: makeControl('c', 300, 600),
    };
    const course = makeCourse(['a', 'b', 'c']);

    const bounds = computeCourseBounds(course, controls);
    expect(bounds).toEqual({ minX: 100, minY: 200, maxX: 500, maxY: 600 });
  });

  it('returns null when course has no resolvable controls', () => {
    const controls: Record<ControlId, Control> = {};
    const course = makeCourse(['missing']);

    expect(computeCourseBounds(course, controls)).toBeNull();
  });

  it('handles single control', () => {
    const controls: Record<ControlId, Control> = {
      [cid('a')]: makeControl('a', 250, 400),
    };
    const course = makeCourse(['a']);

    const bounds = computeCourseBounds(course, controls);
    expect(bounds).toEqual({ minX: 250, minY: 400, maxX: 250, maxY: 400 });
  });
});

describe('computeMultiPageViewports — fit to page', () => {
  const layout = computePageLayout(DEFAULT_PAGE_SETUP); // A4 portrait, 10mm margins
  // A print area far bigger than one page at 1:3000 (would tile).
  const bigArea = { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };

  it('tiles into multiple pages when fit-to-page is OFF', () => {
    const r = computeMultiPageViewports(
      layout, 3000, 3000, 300, 8000, 6000, bigArea, 30, 15, bigArea, false,
    );
    expect(r.viewports.length).toBeGreaterThan(1);
    expect(r.effectivePrintScale).toBe(3000); // unchanged
  });

  it('shrinks to ONE page when fit-to-page is ON, and reports the fitted scale', () => {
    const r = computeMultiPageViewports(
      layout, 3000, 3000, 300, 8000, 6000, bigArea, 30, 15, bigArea, true,
    );
    expect(r.viewports.length).toBe(1);
    expect(r.effectivePrintScale).toBeGreaterThan(3000); // shrunk (larger denominator)
    expect(r.effectivePrintScale % 50).toBe(0); // rounded up to a nice value
  });

  it('never enlarges — content that already fits keeps the requested scale', () => {
    const smallArea = { minX: 0, minY: 0, maxX: 500, maxY: 400 };
    const r = computeMultiPageViewports(
      layout, 3000, 3000, 300, 8000, 6000, smallArea, 30, 15, smallArea, true,
    );
    expect(r.viewports.length).toBe(1);
    expect(r.effectivePrintScale).toBe(3000); // shrink-only: unchanged
  });
});

describe('computeMapViewport', () => {
  // A4 portrait with 10mm margins
  const layout = computePageLayout(DEFAULT_PAGE_SETUP);

  it('computes correct effectivePPP for same map and print scale', () => {
    const viewport = computeMapViewport(
      layout, 15000, 15000, 150, 4000, 3000,
      { minX: 1500, minY: 1000, maxX: 2500, maxY: 2000 },
    );
    // 72/150 * 15000/15000 = 0.48
    expect(viewport.effectivePPP).toBeCloseTo(0.48, 4);
  });

  it('computes correct effectivePPP for different scales', () => {
    // 1:10000 map printed at 1:15000 → more map fits on page
    const viewport = computeMapViewport(
      layout, 10000, 15000, 150, 4000, 3000,
      { minX: 1500, minY: 1000, maxX: 2500, maxY: 2000 },
    );
    // 72/150 * 10000/15000 = 0.32
    expect(viewport.effectivePPP).toBeCloseTo(0.32, 4);
  });

  it('viewport size matches printable area at correct scale', () => {
    const viewport = computeMapViewport(
      layout, 15000, 15000, 150, 4000, 3000,
      { minX: 1500, minY: 1000, maxX: 2500, maxY: 2000 },
    );
    // Printable width (A4 portrait - 20mm margins) ≈ 538.58pt
    // viewport.widthPx * effectivePPP should equal printable width
    expect(viewport.widthPx * viewport.effectivePPP).toBeCloseTo(layout.printableWidth, 1);
    expect(viewport.heightPx * viewport.effectivePPP).toBeCloseTo(layout.printableHeight, 1);
  });

  it('centers viewport on course center', () => {
    // Big image, course in the middle
    const viewport = computeMapViewport(
      layout, 15000, 15000, 150, 8000, 6000,
      { minX: 3000, minY: 2000, maxX: 5000, maxY: 4000 },
    );
    const courseCenter = { x: 4000, y: 3000 };
    const vpCenter = { x: viewport.left + viewport.widthPx / 2, y: viewport.top + viewport.heightPx / 2 };
    expect(vpCenter.x).toBeCloseTo(courseCenter.x, 0);
    expect(vpCenter.y).toBeCloseTo(courseCenter.y, 0);
  });

  it('clamps viewport to map edge when course is near corner', () => {
    // Course near top-left
    const viewport = computeMapViewport(
      layout, 15000, 15000, 150, 4000, 3000,
      { minX: 50, minY: 50, maxX: 150, maxY: 150 },
    );
    // Should clamp: left and top should be 0 (can't scroll past edge)
    expect(viewport.left).toBe(0);
    expect(viewport.top).toBe(0);
  });

  it('centers image when viewport is larger than map', () => {
    // Very small image, high DPI — viewport will be larger than image
    const viewport = computeMapViewport(
      layout, 15000, 15000, 300, 500, 400,
      { minX: 200, minY: 150, maxX: 300, maxY: 250 },
    );
    // Viewport wider than image → left should be negative (image centered)
    if (viewport.widthPx > 500) {
      expect(viewport.left).toBeLessThan(0);
    }
    if (viewport.heightPx > 400) {
      expect(viewport.top).toBeLessThan(0);
    }
  });
});
