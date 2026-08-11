import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import { exportGpx } from './export-gpx';
import { exportIofXml } from '@/core/iof/export-xml';
import type { GeoReference, OverprintEvent } from '@/core/models/types';
import { createEvent, createCourse, createControl } from '@/core/models/defaults';
import { gpsToMapPixels } from '@/core/geometry/geo-transform';

const UTM55S_PROJ =
  '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const REF_LON = 149.1244;
const REF_LAT = -35.3082;
const [REF_EASTING, REF_NORTHING] = proj4('EPSG:4326', UTM55S_PROJ, [REF_LON, REF_LAT]);

function makeGeoRef(): GeoReference {
  return {
    projDef: UTM55S_PROJ,
    easting: REF_EASTING,
    northing: REF_NORTHING,
    scale: 10000,
    grivation: 0,
    source: 'omap',
    paperUnit: 'thousandths-mm',
    viewBoxOrigin: { x: -50000, y: -40000 },
    viewBoxHeight: 80000,
    renderScale: 0.05,
  };
}

/** Event with two georeferenced controls placed at known GPS points. */
function makeGeoEvent(withGeoref = true): OverprintEvent {
  const event = createEvent('Geo Event');
  const georef = makeGeoRef();
  event.mapFile = {
    name: 'm.omap',
    type: 'omap',
    scale: 10000,
    dpi: 96,
    georef: withGeoref ? georef : undefined,
  };

  // Place the reference point and a second point 100 m east of it.
  const p0 = gpsToMapPixels(REF_LON, REF_LAT, georef)!;
  const [lon2, lat2] = proj4(UTM55S_PROJ, 'EPSG:4326', [REF_EASTING + 100, REF_NORTHING]);
  const p1 = gpsToMapPixels(lon2, lat2, georef)!;

  const start = createControl(101, { x: p0.x, y: p0.y });
  const c1 = createControl(45, { x: p1.x, y: p1.y });
  const finish = createControl(102, { x: p0.x, y: p0.y });
  for (const c of [start, c1, finish]) event.controls[c.id] = c;

  const course = createCourse('Blue');
  course.controls = [
    { controlId: start.id, type: 'start' },
    { controlId: c1.id, type: 'control' },
    { controlId: finish.id, type: 'finish' },
  ];
  event.courses.push(course);
  return event;
}

describe('exportGpx', () => {
  it('returns null when the map is not georeferenced', () => {
    expect(exportGpx(makeGeoEvent(false))).toBeNull();
  });

  it('emits a waypoint per unique control at the correct GPS position', () => {
    const gpx = exportGpx(makeGeoEvent())!;
    const doc = new DOMParser().parseFromString(gpx, 'application/xml');
    expect(doc.getElementsByTagName('parsererror').length).toBe(0);

    const wpts = Array.from(doc.getElementsByTagName('wpt'));
    // start + finish share a position (both key on distinct control ids) → 3 controls
    expect(wpts.length).toBe(3);

    // Control 45 sits at REF + 100 m east — check its coordinates round-trip.
    const c45 = wpts.find((w) => w.getElementsByTagName('name')[0]?.textContent === '45')!;
    expect(parseFloat(c45.getAttribute('lat')!)).toBeCloseTo(REF_LAT, 3);
    expect(parseFloat(c45.getAttribute('lon')!)).toBeGreaterThan(REF_LON);
  });

  it('names start/finish waypoints', () => {
    const gpx = exportGpx(makeGeoEvent())!;
    expect(gpx).toContain('<name>Start</name>');
    expect(gpx).toContain('<name>Finish</name>');
  });

  it('includes controls that live only inside a fork/loop branch', () => {
    const event = makeGeoEvent();
    // A branch-only control at a fresh georeferenced position.
    const [lon3, lat3] = proj4(UTM55S_PROJ, 'EPSG:4326', [REF_EASTING + 200, REF_NORTHING + 50]);
    const p = gpsToMapPixels(lon3, lat3, makeGeoRef())!;
    const branchCtrl = createControl(77, { x: p.x, y: p.y });
    event.controls[branchCtrl.id] = branchCtrl;
    const course = event.courses[0]!;
    course.controls[1]!.courseControlId = 'cc-anchor' as never;
    course.variations = [{
      id: 'lp1' as never,
      kind: 'loop',
      anchorCourseControlId: 'cc-anchor' as never,
      branches: [
        { id: 'a' as never, label: 'A', controls: [{ controlId: branchCtrl.id, type: 'control', courseControlId: 'cc-77' as never }] },
        { id: 'b' as never, label: 'B', controls: [{ controlId: event.courses[0]!.controls[1]!.controlId, type: 'control', courseControlId: 'cc-45b' as never }] },
      ],
    }];
    const gpx = exportGpx(event)!;
    // Control 77 exists ONLY in a loop branch — must still get a waypoint.
    expect(gpx).toContain('<name>77</name>');
  });
});

describe('exportIofXml — geo Position', () => {
  const NS = 'http://www.orienteering.org/datastandard/3.0';

  it('emits <Position lng lat> before <MapPosition> when georeferenced', () => {
    const xml = exportIofXml(makeGeoEvent());
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const controlDefs = Array.from(doc.getElementsByTagNameNS(NS, 'RaceCourseData')[0]!.childNodes)
      .filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === 'Control');
    const withPos = controlDefs.find((c) => c.getElementsByTagNameNS(NS, 'Position').length > 0)!;
    expect(withPos).toBeTruthy();

    const names = Array.from(withPos.childNodes)
      .filter((n): n is Element => n.nodeType === 1)
      .map((n) => n.localName);
    // schema order: Id → Position → MapPosition
    expect(names.indexOf('Position')).toBeLessThan(names.indexOf('MapPosition'));

    const pos = withPos.getElementsByTagNameNS(NS, 'Position')[0]!;
    expect(pos.getAttribute('lat')).toBeTruthy();
    expect(pos.getAttribute('lng')).toBeTruthy();
  });

  it('omits <Position> when the map has no georef', () => {
    const xml = exportIofXml(makeGeoEvent(false));
    expect(xml).not.toContain('<Position');
  });
});
