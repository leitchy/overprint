import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import { gpsToMapPixels, mapPixelsToGps } from './geo-transform';
import type { GeoReference } from '@/core/models/types';

/**
 * Test georef based on a realistic Canberra orienteering map.
 *
 * We compute the exact projected easting/northing for a known GPS point
 * so the reference point is exact, making forward transform assertions reliable.
 */

// UTM Zone 55S PROJ.4 string (GDA2020)
const UTM55S_PROJ =
  '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Parliament House, Canberra
const REF_LON = 149.1244;
const REF_LAT = -35.3082;

// Compute exact projected coords for the reference point
const [REF_EASTING, REF_NORTHING] = proj4('EPSG:4326', UTM55S_PROJ, [REF_LON, REF_LAT]);

function makeGeoRef(overrides?: Partial<GeoReference>): GeoReference {
  return {
    projDef: UTM55S_PROJ,
    easting: REF_EASTING,
    northing: REF_NORTHING,
    scale: 10000,
    grivation: 0, // Zero grivation for simpler testing
    source: 'omap',
    paperUnit: 'thousandths-mm',
    // 1/1000mm paper units at 1:10000 → 100 units/m ground
    // viewBox: 1000m × 800m map area → 100000 × 80000 paper units
    viewBoxOrigin: { x: -50000, y: -40000 },
    viewBoxHeight: 80000,
    renderScale: 0.05, // 80000 * 0.05 = 4000px
    ...overrides,
  };
}

describe('gpsToMapPixels', () => {
  it('maps the reference point to the expected pixel position', () => {
    const georef = makeGeoRef();
    const result = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(result).not.toBeNull();
    // Reference point → (0,0) paper-relative coords
    // pixelX = (0 - (-50000)) * 0.05 = 2500
    // pixelY = (80000 - (0 - (-40000))) * 0.05 = 2000
    expect(result!.x).toBeCloseTo(2500, 0);
    expect(result!.y).toBeCloseTo(2000, 0);
  });

  it('returns null for unresolvable projection', () => {
    const georef = makeGeoRef({ projDef: 99999 });
    const result = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(result).toBeNull();
  });

  it('works with EPSG numeric code for GDA2020 Zone 55', () => {
    // Use EPSG:7855 (registered in geo-transform.ts)
    const georef = makeGeoRef({ projDef: 7855 });
    const result = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(result).not.toBeNull();
    // GDA2020 and WGS84 are near-identical, so result should be very close
    expect(result!.x).toBeCloseTo(2500, -1);
    expect(result!.y).toBeCloseTo(2000, -1);
  });

  it('works with OCAD paper units (hundredths-mm)', () => {
    const georef = makeGeoRef({
      paperUnit: 'hundredths-mm',
      // OCAD uses 1/100mm → viewBox values are 10x smaller for same map area
      viewBoxOrigin: { x: -5000, y: -4000 },
      viewBoxHeight: 8000,
      renderScale: 0.5, // 8000 * 0.5 = 4000px
    });
    const result = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(result).not.toBeNull();
    // Same pixel result: (0 - (-5000)) * 0.5 = 2500, (8000 - (0 - (-4000))) * 0.5 = 2000
    expect(result!.x).toBeCloseTo(2500, 0);
    expect(result!.y).toBeCloseTo(2000, 0);
  });

  it('applies grivation rotation correctly', () => {
    const noGriv = makeGeoRef({ grivation: 0 });
    const withGriv = makeGeoRef({ grivation: (1 * Math.PI) / 180 });

    // A point ~500m east of the reference
    const lon = 149.1305;
    const resultNoGriv = gpsToMapPixels(lon, REF_LAT, noGriv);
    const resultWithGriv = gpsToMapPixels(lon, REF_LAT, withGriv);

    expect(resultNoGriv).not.toBeNull();
    expect(resultWithGriv).not.toBeNull();
    // With grivation, x should be slightly different
    expect(resultWithGriv!.x).not.toBeCloseTo(resultNoGriv!.x, 0);
  });

  it('moves a point east of reference to the right in pixel space', () => {
    const georef = makeGeoRef();
    const eastPoint = gpsToMapPixels(149.130, REF_LAT, georef);
    const refPoint = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(eastPoint).not.toBeNull();
    expect(refPoint).not.toBeNull();
    // East in GPS → larger easting → larger pixelX
    expect(eastPoint!.x).toBeGreaterThan(refPoint!.x);
  });

  it('moves a point north of reference upward (lower pixelY)', () => {
    const georef = makeGeoRef();
    const northPoint = gpsToMapPixels(REF_LON, -35.305, georef);
    const refPoint = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(northPoint).not.toBeNull();
    expect(refPoint).not.toBeNull();
    // North in GPS → larger northing → smaller pixelY (Y-flip)
    expect(northPoint!.y).toBeLessThan(refPoint!.y);
  });
});

describe('mapPixelsToGps (round-trip)', () => {
  it('round-trips within 0.1m tolerance for reference point', () => {
    const georef = makeGeoRef();
    const pixels = gpsToMapPixels(REF_LON, REF_LAT, georef);
    expect(pixels).not.toBeNull();

    const gps = mapPixelsToGps(pixels!, georef);
    expect(gps).not.toBeNull();

    // 0.1m at Canberra ≈ ~0.000001° lon
    expect(gps!.lon).toBeCloseTo(REF_LON, 5);
    expect(gps!.lat).toBeCloseTo(REF_LAT, 5);
  });

  it('round-trips with grivation applied', () => {
    const georef = makeGeoRef({ grivation: (2.5 * Math.PI) / 180 });
    const lon = 149.130;
    const lat = -35.310;

    const pixels = gpsToMapPixels(lon, lat, georef);
    expect(pixels).not.toBeNull();

    const gps = mapPixelsToGps(pixels!, georef);
    expect(gps).not.toBeNull();

    expect(gps!.lon).toBeCloseTo(lon, 5);
    expect(gps!.lat).toBeCloseTo(lat, 5);
  });

  it('round-trips with OCAD paper units', () => {
    const georef = makeGeoRef({
      paperUnit: 'hundredths-mm',
      viewBoxOrigin: { x: -5000, y: -4000 },
      viewBoxHeight: 8000,
      renderScale: 0.5,
    });
    const lon = 149.120;
    const lat = -35.305;

    const pixels = gpsToMapPixels(lon, lat, georef);
    expect(pixels).not.toBeNull();

    const gps = mapPixelsToGps(pixels!, georef);
    expect(gps).not.toBeNull();

    expect(gps!.lon).toBeCloseTo(lon, 5);
    expect(gps!.lat).toBeCloseTo(lat, 5);
  });

  it('round-trips for a point 1km from reference', () => {
    const georef = makeGeoRef();
    const lon = 149.135;
    const lat = -35.300;

    const pixels = gpsToMapPixels(lon, lat, georef);
    expect(pixels).not.toBeNull();

    const gps = mapPixelsToGps(pixels!, georef);
    expect(gps).not.toBeNull();

    expect(gps!.lon).toBeCloseTo(lon, 5);
    expect(gps!.lat).toBeCloseTo(lat, 5);
  });
});
