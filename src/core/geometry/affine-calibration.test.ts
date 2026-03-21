import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import { computeAffineTransform, applyAffine, computeResiduals } from './affine-calibration';
import type { CalibrationPoint } from '@/core/models/types';

describe('computeAffineTransform', () => {
  it('returns null with fewer than 2 points', () => {
    const result = computeAffineTransform([]);
    expect(result).toBeNull();
  });

  it('computes similarity transform from 2 points', () => {
    // Two points ~500m apart in Canberra
    const points: CalibrationPoint[] = [
      { mapPoint: { x: 1000, y: 2000 }, lon: 149.1244, lat: -35.3082 },
      { mapPoint: { x: 1500, y: 2500 }, lon: 149.1305, lat: -35.3037 },
    ];

    const result = computeAffineTransform(points);
    expect(result).not.toBeNull();
    expect(result!.matrix).toBeDefined();
    expect(result!.projDef).toContain('+proj=utm');

    // Verify the transform maps the input points correctly
    const [e0, n0] = proj4('EPSG:4326', result!.projDef, [points[0]!.lon, points[0]!.lat]);
    const [e1, n1] = proj4('EPSG:4326', result!.projDef, [points[1]!.lon, points[1]!.lat]);

    const p0 = applyAffine(e0, n0, result!.matrix);
    const p1 = applyAffine(e1, n1, result!.matrix);

    expect(p0.x).toBeCloseTo(1000, 1);
    expect(p0.y).toBeCloseTo(2000, 1);
    expect(p1.x).toBeCloseTo(1500, 1);
    expect(p1.y).toBeCloseTo(2500, 1);
  });

  it('computes full affine from 3 points', () => {
    // Three points spread across the map
    const points: CalibrationPoint[] = [
      { mapPoint: { x: 500, y: 500 }, lon: 149.120, lat: -35.310 },
      { mapPoint: { x: 2000, y: 500 }, lon: 149.135, lat: -35.310 },
      { mapPoint: { x: 500, y: 2000 }, lon: 149.120, lat: -35.295 },
    ];

    const result = computeAffineTransform(points);
    expect(result).not.toBeNull();

    // Verify all 3 points map correctly
    for (const pt of points) {
      const [e, n] = proj4('EPSG:4326', result!.projDef, [pt.lon, pt.lat]);
      const mapped = applyAffine(e, n, result!.matrix);
      expect(mapped.x).toBeCloseTo(pt.mapPoint.x, 0);
      expect(mapped.y).toBeCloseTo(pt.mapPoint.y, 0);
    }
  });

  it('warns when baseline is less than 50m', () => {
    // Two points very close together (~10m)
    const points: CalibrationPoint[] = [
      { mapPoint: { x: 100, y: 200 }, lon: 149.1244, lat: -35.3082 },
      { mapPoint: { x: 110, y: 210 }, lon: 149.12445, lat: -35.30818 },
    ];

    const result = computeAffineTransform(points);
    expect(result).not.toBeNull();
    expect(result!.warnings.length).toBeGreaterThan(0);
    expect(result!.warnings[0]).toContain('50m');
  });

  it('uses provided PROJ.4 string when given', () => {
    const projDef = '+proj=utm +zone=55 +south +datum=WGS84 +units=m +no_defs';
    const points: CalibrationPoint[] = [
      { mapPoint: { x: 1000, y: 2000 }, lon: 149.1244, lat: -35.3082 },
      { mapPoint: { x: 1500, y: 2500 }, lon: 149.1305, lat: -35.3037 },
    ];

    const result = computeAffineTransform(points, projDef);
    expect(result).not.toBeNull();
    expect(result!.projDef).toBe(projDef);
  });
});

describe('computeResiduals', () => {
  it('returns zero residuals for exact 3-point fit', () => {
    const points: CalibrationPoint[] = [
      { mapPoint: { x: 500, y: 500 }, lon: 149.120, lat: -35.310 },
      { mapPoint: { x: 2000, y: 500 }, lon: 149.135, lat: -35.310 },
      { mapPoint: { x: 500, y: 2000 }, lon: 149.120, lat: -35.295 },
    ];

    const result = computeAffineTransform(points);
    expect(result).not.toBeNull();

    const projected = points.map((pt) => {
      const [e, n] = proj4('EPSG:4326', result!.projDef, [pt.lon, pt.lat]);
      return { e, n };
    });

    const residuals = computeResiduals(points, projected, result!.matrix);
    for (const r of residuals) {
      expect(r).toBeCloseTo(0, 1);
    }
  });
});
