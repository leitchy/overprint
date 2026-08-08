import { describe, it, expect } from 'vitest';
import { exportCourseToOmap, suggestedOmapFilename } from './export-omap';
import { parseOmapXml } from './load-omap';
import type { OmapObject } from './load-omap';
import { createControl, createCourse, createEvent } from '@/core/models/defaults';
import type { MapFile, MapPoint, OverprintEvent } from '@/core/models/types';
import { overprintDims } from '@/core/models/constants';

// Symbol ids emitted by the exporter (see export-omap.ts)
const SYM_START = 0;
const SYM_CONTROL = 1;
const SYM_LINE = 2;
const SYM_FINISH = 3;
const SYM_NUMBER = 4;

/** OMAP-source map frame matching what load-omap.ts produces. */
const OMAP_MAP_FILE: MapFile = {
  name: 'test.omap',
  type: 'omap',
  scale: 10000,
  dpi: 508, // 0.02 px per 1/1000mm → 20 px/mm → dpi = 20 × 25.4
  viewBox: { x: -10000, y: -20000, width: 200000, height: 150000 },
  renderScale: 0.02,
};

/** Loader transform: OMAP units → pixels (the exporter's inverse). */
function unitsToPixels(x: number, y: number, mapFile: MapFile): MapPoint {
  return {
    x: (x - mapFile.viewBox!.x) * mapFile.renderScale!,
    y: (y - mapFile.viewBox!.y) * mapFile.renderScale!,
  };
}

interface BuiltEvent {
  event: OverprintEvent;
  positions: MapPoint[]; // pixel positions: start, c1, c2, finish
}

function buildEvent(mapFile: MapFile = OMAP_MAP_FILE): BuiltEvent {
  const event = createEvent('Test Event');
  event.mapFile = mapFile;

  const positions: MapPoint[] = [
    { x: 500, y: 600 },   // start
    { x: 900, y: 600 },   // control 31
    { x: 900, y: 1000 },  // control 32
    { x: 500, y: 1000 },  // finish
  ];
  const start = createControl(0, positions[0]!);
  const c1 = createControl(31, positions[1]!);
  const c2 = createControl(32, positions[2]!);
  const finish = createControl(0, positions[3]!);
  for (const c of [start, c1, c2, finish]) event.controls[c.id] = c;

  const course = createCourse('Course 1');
  course.controls = [
    { controlId: start.id, type: 'start' },
    { controlId: c1.id, type: 'control' },
    { controlId: c2.id, type: 'control' },
    { controlId: finish.id, type: 'finish' },
  ];
  event.courses = [course];
  return { event, positions };
}

function pointObjects(objects: OmapObject[], symbolId: number): OmapObject[] {
  return objects.filter((o) => o.type === 0 && o.symbolId === symbolId);
}

describe('exportCourseToOmap', () => {
  it('produces well-formed XML (no parsererror)', () => {
    const { event } = buildEvent();
    const xml = exportCourseToOmap(event, 0);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.localName).toBe('map');
  });

  it('round-trips through the real load-omap parsing path', () => {
    const { event, positions } = buildEvent();
    const xml = exportCourseToOmap(event, 0);
    const parsed = parseOmapXml(xml);

    // --- Colour table: one purple spot colour ---
    const purple = parsed.colors.get(0);
    expect(purple).toBeDefined();
    // #BB29BB = rgb(187, 41, 187)
    expect(purple!.r).toBeCloseTo(187, 0);
    expect(purple!.g).toBeCloseTo(41, 0);
    expect(purple!.b).toBeCloseTo(187, 0);

    // --- Symbols: 701/703/705/706 course symbols + number text ---
    expect(parsed.symbols.get(SYM_START)?.type).toBe(1);
    expect(parsed.symbols.get(SYM_CONTROL)?.type).toBe(1);
    expect(parsed.symbols.get(SYM_LINE)?.type).toBe(2);
    expect(parsed.symbols.get(SYM_FINISH)?.type).toBe(1);
    expect(parsed.symbols.get(SYM_NUMBER)?.type).toBe(8);
    // Line symbols carry the IOF 0.35mm width (350 units) in purple (colour 0)
    expect(parsed.symbols.get(SYM_LINE)?.lineWidth).toBe(350);
    expect(parsed.symbols.get(SYM_LINE)?.colorIndex).toBe(0);

    // --- Objects: 1 start + 2 controls + 1 finish + 3 legs + 2 numbers = 9 ---
    expect(parsed.objects).toHaveLength(9);
    const starts = pointObjects(parsed.objects, SYM_START);
    const controls = pointObjects(parsed.objects, SYM_CONTROL);
    const finishes = pointObjects(parsed.objects, SYM_FINISH);
    const legs = parsed.objects.filter((o) => o.type === 1 && o.symbolId === SYM_LINE);
    const numbers = parsed.objects.filter((o) => o.type === 4 && o.symbolId === SYM_NUMBER);
    expect(starts).toHaveLength(1);
    expect(controls).toHaveLength(2);
    expect(finishes).toHaveLength(1);
    expect(legs).toHaveLength(3);
    expect(numbers).toHaveLength(2);
    expect(numbers.map((n) => n.text)).toEqual(['2', '3']);

    // --- Coordinates round-trip to the original pixel positions ---
    // Coords are rounded to integer OMAP units; 1 unit = 0.02 px here.
    const tol = 0.05;
    const shapePixels = [starts[0]!, controls[0]!, controls[1]!, finishes[0]!].map((o) =>
      unitsToPixels(o.coords[0]!.x, o.coords[0]!.y, OMAP_MAP_FILE),
    );
    for (let i = 0; i < positions.length; i++) {
      expect(shapePixels[i]!.x).toBeCloseTo(positions[i]!.x, 1);
      expect(Math.abs(shapePixels[i]!.x - positions[i]!.x)).toBeLessThan(tol);
      expect(Math.abs(shapePixels[i]!.y - positions[i]!.y)).toBeLessThan(tol);
    }

    // --- Legs are shortened by the shape offsets (IOF gap between line and shape) ---
    const std = overprintDims(event.settings.mapStandard);
    const lineWidthMm = event.settings.lineWidth;
    const pxPerMm = 1000 * OMAP_MAP_FILE.renderScale!; // 20 px/mm
    // Leg 1: start → c1 (horizontal). Start offset = triangle circumradius + gap + lw/2.
    const startOffsetPx = (std.startTriangleSide / Math.sqrt(3) + std.circleGap + lineWidthMm / 2) * pxPerMm;
    const circleOffsetPx = (event.settings.controlCircleDiameter / 2 + std.circleGap + lineWidthMm / 2) * pxPerMm;
    const leg1 = legs[0]!;
    const legStart = unitsToPixels(leg1.coords[0]!.x, leg1.coords[0]!.y, OMAP_MAP_FILE);
    const legEnd = unitsToPixels(leg1.coords[leg1.coords.length - 1]!.x, leg1.coords[leg1.coords.length - 1]!.y, OMAP_MAP_FILE);
    expect(legStart.x).toBeCloseTo(positions[0]!.x + startOffsetPx, 1);
    expect(legStart.y).toBeCloseTo(positions[0]!.y, 1);
    expect(legEnd.x).toBeCloseTo(positions[1]!.x - circleOffsetPx, 1);
    expect(legEnd.y).toBeCloseTo(positions[1]!.y, 1);
  });

  it('preserves the source georeferencing (scale, grivation, PROJ string)', () => {
    const { event } = buildEvent({
      ...OMAP_MAP_FILE,
      georef: {
        projDef: '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs',
        easting: 689345.67,
        northing: 6077123.45,
        scale: 10000,
        grivation: (12.5 * Math.PI) / 180,
        source: 'omap',
        paperUnit: 'thousandths-mm',
        viewBoxOrigin: { x: -10000, y: -20000 },
        viewBoxHeight: 150000,
        renderScale: 0.02,
      },
    });
    const xml = exportCourseToOmap(event, 0);
    const parsed = parseOmapXml(xml);
    expect(parsed.scale).toBe(10000);

    const geo = parsed.doc.getElementsByTagName('georeferencing')[0]!;
    expect(Number(geo.getAttribute('grivation'))).toBeCloseTo(12.5, 6);
    const spec = geo.getElementsByTagName('spec')[0]!;
    expect(spec.textContent).toContain('+proj=utm +zone=55 +south');
  });

  it('exports raster maps in the DPI-derived paper frame (1 px = 25.4/dpi mm)', () => {
    // dpi 254 → 10 px per mm → 0.01 px per 1/1000mm unit
    const raster: MapFile = { name: 'map.png', type: 'raster', scale: 10000, dpi: 254 };
    const { event, positions } = buildEvent(raster);
    const xml = exportCourseToOmap(event, 0);
    const parsed = parseOmapXml(xml);

    const start = pointObjects(parsed.objects, SYM_START)[0]!;
    // px 500 at 10 px/mm = 50mm = 50000 units
    expect(start.coords[0]!.x).toBeCloseTo(positions[0]!.x * 100, 0);
    expect(start.coords[0]!.y).toBeCloseTo(positions[0]!.y * 100, 0);
  });

  it('converts OCAD hundredths-mm frames to OMAP thousandths-mm', () => {
    // OCAD paper frame: units are 1/100mm; same paper position must come out ×10.
    const ocad: MapFile = {
      name: 'map.ocd',
      type: 'ocad',
      scale: 10000,
      dpi: 508,
      viewBox: { x: -1000, y: -2000, width: 20000, height: 15000 },
      renderScale: 0.2, // px per 1/100mm (same 20 px/mm as the omap fixture)
    };
    const { event, positions } = buildEvent(ocad);
    const parsed = parseOmapXml(exportCourseToOmap(event, 0));
    const start = pointObjects(parsed.objects, SYM_START)[0]!;
    // px → source units: 500 / 0.2 + (-1000) = 1500 (1/100mm) → ×10 = 15000 (1/1000mm)
    expect(start.coords[0]!.x).toBeCloseTo((positions[0]!.x / 0.2 - 1000) * 10, 0);
    expect(start.coords[0]!.y).toBeCloseTo((positions[0]!.y / 0.2 - 2000) * 10, 0);
  });

  it('throws without a map file or with a bad course index', () => {
    const { event } = buildEvent();
    expect(() => exportCourseToOmap(event, 5)).toThrow(/course/i);
    event.mapFile = null;
    expect(() => exportCourseToOmap(event, 0)).toThrow(/map/i);
  });
});

describe('suggestedOmapFilename', () => {
  it('combines event and course names', () => {
    const { event } = buildEvent();
    expect(suggestedOmapFilename(event, 0)).toBe('Test Event - Course 1.omap');
  });
});
