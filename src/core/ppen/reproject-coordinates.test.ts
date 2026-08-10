import { describe, it, expect } from 'vitest';
import { reprojectPpenCoordinates, rectFromCorners } from './reproject-coordinates';
import type { OverprintEvent } from '@/core/models/types';
import type { ViewBoxParams } from './import-ppen';
import type { CourseId, EventId } from '@/utils/id';

describe('rectFromCorners', () => {
  it('derives axis-aligned min/max from Y-flipped corners', () => {
    // a is bottom-right in pixel space, b is top-left (as an OMAP Y-flip produces)
    const r = rectFromCorners({ x: 300, y: 500 }, { x: 100, y: 200 });
    expect(r).toEqual({ minX: 100, minY: 200, maxX: 300, maxY: 500 });
  });
});

describe('reprojectPpenCoordinates — print area', () => {
  function eventWithPrintArea(): OverprintEvent {
    return {
      id: 'e1' as EventId,
      name: 'T',
      controls: {},
      courses: [{
        id: 'c1' as CourseId,
        name: 'C1',
        courseType: 'normal',
        controls: [],
        settings: { printArea: { minX: 10, minY: 20, maxX: 110, maxY: 90 } },
      }],
      specialItems: [],
      settings: {} as OverprintEvent['settings'],
      mapFile: { name: 'm.omap', type: 'omap', scale: 3000, dpi: 300 },
    } as unknown as OverprintEvent;
  }

  it('keeps minY <= maxY after an OMAP (Y-flipping) reprojection', () => {
    // OMAP viewBox: mmToUnits=1000 → reprojectPoint flips Y.
    const viewBox: ViewBoxParams = {
      viewBox: { x: 0, y: 0, width: 100000, height: 80000 },
      renderScale: 0.02,
      mmToUnits: 1000,
    };
    const out = reprojectPpenCoordinates(eventWithPrintArea(), 300, 2000, viewBox);
    const pa = out.courses[0]!.settings.printArea!;
    expect(pa.minX).toBeLessThanOrEqual(pa.maxX);
    expect(pa.minY).toBeLessThanOrEqual(pa.maxY); // regression: was inverted before the fix
    expect(pa.maxX - pa.minX).toBeGreaterThan(0);
    expect(pa.maxY - pa.minY).toBeGreaterThan(0);
  });
});
