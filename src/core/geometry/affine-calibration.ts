/**
 * Affine transform computation from manual calibration points.
 *
 * Given GPS ↔ map-pixel calibration point pairs, compute an affine matrix
 * that maps projected CRS coordinates (metres) to map pixel coordinates.
 *
 * - 2 points → similarity transform (4 DOF: translation + rotation + uniform scale)
 * - 3+ points → full affine (6 DOF) via least-squares
 */

import proj4 from 'proj4';
import type { CalibrationPoint, MapPoint } from '@/core/models/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 2D affine matrix [a, b, tx, c, d, ty] where:
 *  pixelX = a * E + b * N + tx
 *  pixelY = c * E + d * N + ty
 */
export interface AffineMatrix {
  a: number;
  b: number;
  tx: number;
  c: number;
  d: number;
  ty: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute an affine transform from calibration points.
 *
 * Each CalibrationPoint links a map pixel position to a WGS84 lat/lon.
 * We first project the GPS coords to a projected CRS (using the first
 * valid UTM zone), then fit an affine to the projected→pixel mapping.
 *
 * @param points - At least 2 calibration points
 * @param projDef - PROJ.4 string or EPSG code for the projected CRS.
 *                  If not provided, auto-detects UTM zone from the first point.
 * @returns The affine matrix, or null if computation fails
 */
export function computeAffineTransform(
  points: CalibrationPoint[],
  projDef?: string | number,
): { matrix: AffineMatrix; projDef: string; warnings: string[] } | null {
  if (points.length < 2) return null;

  const warnings: string[] = [];

  // Resolve or auto-detect projection
  const resolvedProj = projDef
    ? (typeof projDef === 'number' ? `EPSG:${projDef}` : projDef)
    : autoDetectUtmZone(points[0]!.lon, points[0]!.lat);

  if (!resolvedProj) return null;

  // Project all GPS points to CRS (metres)
  const projected: Array<{ e: number; n: number }> = [];
  try {
    for (const pt of points) {
      const [e, n] = proj4('EPSG:4326', resolvedProj, [pt.lon, pt.lat]);
      projected.push({ e, n });
    }
  } catch {
    return null;
  }

  // Warn if baseline between any pair is < 50m
  const minBaseline = computeMinBaseline(projected);
  if (minBaseline < 50) {
    warnings.push(
      `Calibration points are only ${Math.round(minBaseline)}m apart. ` +
      `Spread points at least 50m for accuracy.`,
    );
  }

  // Compute transform
  const mapPoints = points.map((p) => p.mapPoint);
  const matrix =
    points.length === 2
      ? fitSimilarity(projected, mapPoints)
      : fitAffine(projected, mapPoints);

  if (!matrix) return null;

  return { matrix, projDef: resolvedProj, warnings };
}

/**
 * Apply an affine transform to projected coordinates.
 *
 * @param easting - Projected X in metres
 * @param northing - Projected Y in metres
 * @param matrix - The affine matrix
 * @returns Map pixel coordinates
 */
export function applyAffine(
  easting: number,
  northing: number,
  matrix: AffineMatrix,
): MapPoint {
  return {
    x: matrix.a * easting + matrix.b * northing + matrix.tx,
    y: matrix.c * easting + matrix.d * northing + matrix.ty,
  };
}

/**
 * Compute per-point residual errors (in pixels) for 3+ calibration points.
 */
export function computeResiduals(
  points: CalibrationPoint[],
  projected: Array<{ e: number; n: number }>,
  matrix: AffineMatrix,
): number[] {
  return points.map((pt, i) => {
    const { e, n } = projected[i]!;
    const computed = applyAffine(e, n, matrix);
    const dx = computed.x - pt.mapPoint.x;
    const dy = computed.y - pt.mapPoint.y;
    return Math.sqrt(dx * dx + dy * dy);
  });
}

// ---------------------------------------------------------------------------
// Internal: similarity transform (2 points, 4 DOF)
// ---------------------------------------------------------------------------

function fitSimilarity(
  projected: Array<{ e: number; n: number }>,
  mapPoints: MapPoint[],
): AffineMatrix | null {
  const { e: e0, n: n0 } = projected[0]!;
  const { e: e1, n: n1 } = projected[1]!;
  const { x: x0, y: y0 } = mapPoints[0]!;
  const { x: x1, y: y1 } = mapPoints[1]!;

  const dE = e1 - e0;
  const dN = n1 - n0;
  const denom = dE * dE + dN * dN;
  if (denom < 1e-10) return null; // Points are coincident

  const dX = x1 - x0;
  const dY = y1 - y0;

  // Similarity: a = (dX*dE + dY*dN) / denom, b = (dY*dE - dX*dN) / denom
  const a = (dX * dE + dY * dN) / denom;
  const b = (dY * dE - dX * dN) / denom;

  return {
    a,
    b: -b,
    tx: x0 - a * e0 + b * n0,
    c: b,
    d: a,
    ty: y0 - b * e0 - a * n0,
  };
}

// ---------------------------------------------------------------------------
// Internal: full affine (3+ points, 6 DOF) via least-squares
// ---------------------------------------------------------------------------

function fitAffine(
  projected: Array<{ e: number; n: number }>,
  mapPoints: MapPoint[],
): AffineMatrix | null {
  const n = projected.length;

  // Center coordinates to avoid numerical issues with large UTM values.
  // Solve in centered space, then adjust translation.
  let meanE = 0, meanN = 0;
  for (let i = 0; i < n; i++) {
    meanE += projected[i]!.e;
    meanN += projected[i]!.n;
  }
  meanE /= n;
  meanN /= n;

  // Solve two independent systems (in centered coords):
  //   pixelX_i = a * dE_i + b * dN_i + tx'
  //   pixelY_i = c * dE_i + d * dN_i + ty'
  // where dE_i = E_i - meanE, dN_i = N_i - meanN

  let sumE = 0, sumN = 0, sumEE = 0, sumNN = 0, sumEN = 0;
  let sumXE = 0, sumXN = 0, sumX = 0;
  let sumYE = 0, sumYN = 0, sumY = 0;

  for (let i = 0; i < n; i++) {
    const e = projected[i]!.e - meanE;
    const ni = projected[i]!.n - meanN;
    const { x, y } = mapPoints[i]!;
    sumE += e;
    sumN += ni;
    sumEE += e * e;
    sumNN += ni * ni;
    sumEN += e * ni;
    sumXE += x * e;
    sumXN += x * ni;
    sumX += x;
    sumYE += y * e;
    sumYN += y * ni;
    sumY += y;
  }

  // 3x3 normal matrix (symmetric)
  const solveX = solve3x3(
    sumEE, sumEN, sumE,
    sumEN, sumNN, sumN,
    sumE, sumN, n,
    sumXE, sumXN, sumX,
  );

  const solveY = solve3x3(
    sumEE, sumEN, sumE,
    sumEN, sumNN, sumN,
    sumE, sumN, n,
    sumYE, sumYN, sumY,
  );

  if (!solveX || !solveY) return null;

  // Convert back from centered to original coordinates:
  // tx_orig = tx' - a * meanE - b * meanN
  const a = solveX[0], b = solveX[1];
  const c = solveY[0], d = solveY[1];

  return {
    a,
    b,
    tx: solveX[2] - a * meanE - b * meanN,
    c,
    d,
    ty: solveY[2] - c * meanE - d * meanN,
  };
}

/** Solve 3x3 linear system via Cramer's rule. Returns null if singular. */
function solve3x3(
  a11: number, a12: number, a13: number,
  a21: number, a22: number, a23: number,
  a31: number, a32: number, a33: number,
  b1: number, b2: number, b3: number,
): [number, number, number] | null {
  const det =
    a11 * (a22 * a33 - a23 * a32) -
    a12 * (a21 * a33 - a23 * a31) +
    a13 * (a21 * a32 - a22 * a31);

  if (Math.abs(det) < 1e-20) return null;

  const x1 =
    (b1 * (a22 * a33 - a23 * a32) -
     a12 * (b2 * a33 - a23 * b3) +
     a13 * (b2 * a32 - a22 * b3)) / det;

  const x2 =
    (a11 * (b2 * a33 - a23 * b3) -
     b1 * (a21 * a33 - a23 * a31) +
     a13 * (a21 * b3 - b2 * a31)) / det;

  const x3 =
    (a11 * (a22 * b3 - b2 * a32) -
     a12 * (a21 * b3 - b2 * a31) +
     b1 * (a21 * a32 - a22 * a31)) / det;

  return [x1, x2, x3];
}

// ---------------------------------------------------------------------------
// Internal: helpers
// ---------------------------------------------------------------------------

function autoDetectUtmZone(lon: number, lat: number): string {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const south = lat < 0 ? ' +south' : '';
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

function computeMinBaseline(
  projected: Array<{ e: number; n: number }>,
): number {
  let min = Infinity;
  for (let i = 0; i < projected.length; i++) {
    for (let j = i + 1; j < projected.length; j++) {
      const de = projected[i]!.e - projected[j]!.e;
      const dn = projected[i]!.n - projected[j]!.n;
      const dist = Math.sqrt(de * de + dn * dn);
      if (dist < min) min = dist;
    }
  }
  return min;
}
