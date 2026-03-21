/**
 * GPS ↔ map-pixel coordinate transform pipeline.
 *
 * Transform chain (forward — GPS to pixels):
 *   GPS lat/lon (WGS84)
 *     → proj4(WGS84, projDef) → [easting, northing] (metres)
 *       → subtract refPoint → [dE, dN] (metres from map origin)
 *         → scale to paper units (hundredths-mm or thousandths-mm)
 *           → rotate by +grivation (2D rotation, radians)
 *             → [paperX, paperY] in map paper space (Y-up)
 *               → pixel coords via viewBox + renderScale (Y-flip)
 */

import proj4 from 'proj4';
import type { GeoReference, MapPoint } from '@/core/models/types';
import { computeAffineTransform, applyAffine } from './affine-calibration';

// ---------------------------------------------------------------------------
// EPSG registration for common Australian CRS codes
// ---------------------------------------------------------------------------

/** GDA94 MGA zones 49–56 (EPSG:28349–28356) */
const GDA94_PROJ =
  '+proj=utm +ellps=GRS80 +towgs84=-0.08,0.46,0.60,-0.4790,-0.0835,-0.5916,0.00036';
/** GDA2020 MGA zones 49–56 (EPSG:7849–7856) */
const GDA2020_PROJ =
  '+proj=utm +ellps=GRS80 +towgs84=0,0,0,0,0,0,0';

function registerAustralianEpsg(): void {
  for (let zone = 49; zone <= 56; zone++) {
    const south = ' +south +units=m +no_defs';
    const zoneStr = ` +zone=${zone}`;
    // GDA94 MGA (283xx)
    const gda94Code = `EPSG:${28300 + zone}`;
    proj4.defs(gda94Code, GDA94_PROJ + zoneStr + south);
    // GDA2020 MGA (78xx)
    const gda2020Code = `EPSG:${7800 + zone}`;
    proj4.defs(gda2020Code, GDA2020_PROJ + zoneStr + south);
  }
}

registerAustralianEpsg();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the proj4 definition string for a GeoReference's projDef.
 * Returns null if the CRS cannot be resolved.
 */
function resolveProjection(projDef: number | string): string | null {
  if (typeof projDef === 'string') {
    // PROJ.4 string — use directly
    return projDef;
  }
  // Numeric EPSG code
  const epsgKey = `EPSG:${projDef}`;
  try {
    // proj4.defs() returns the definition if it's registered
    const def = proj4.defs(epsgKey);
    if (def) return epsgKey;
  } catch {
    // Not registered
  }
  return null;
}

/**
 * Paper-unit multiplier: how many paper units per metre of ground distance.
 *
 * OCAD: 1/100 mm → 100,000 units per metre on paper → (100000 / scale)
 * OMAP: 1/1000 mm → 1,000,000 units per metre on paper → (1000000 / scale)
 */
function paperUnitsPerMetre(georef: GeoReference): number {
  const factor = georef.paperUnit === 'hundredths-mm' ? 100_000 : 1_000_000;
  return factor / georef.scale;
}

// ---------------------------------------------------------------------------
// Forward: GPS → map pixels
// ---------------------------------------------------------------------------

/**
 * Convert WGS84 GPS coordinates to map pixel coordinates.
 *
 * For OCAD/OMAP: uses the paper-coordinate pipeline (proj4 → paper units → viewBox).
 * For calibration: uses the affine transform computed from calibration points.
 *
 * @param lon - Longitude in degrees (WGS84)
 * @param lat - Latitude in degrees (WGS84)
 * @param georef - Georeferencing data from the map file
 * @returns Map pixel coordinates, or null if the transform fails
 */
export function gpsToMapPixels(
  lon: number,
  lat: number,
  georef: GeoReference,
): MapPoint | null {
  if (georef.source === 'calibration' && georef.calibrationPoints?.length) {
    return gpsToMapPixelsCalibration(lon, lat, georef);
  }
  return gpsToMapPixelsProjected(lon, lat, georef);
}

/** Calibration path: GPS → proj4 → affine → pixels.
 *
 * For exactly 2 points, uses independent axis mapping (not similarity transform)
 * to avoid rotation ambiguity with axis-aligned raster maps.
 * For 3+ points, uses full affine least-squares.
 */
function gpsToMapPixelsCalibration(
  lon: number,
  lat: number,
  georef: GeoReference,
): MapPoint | null {
  const points = georef.calibrationPoints!;

  try {
    const projStr = resolveProjection(georef.projDef);
    if (!projStr) return null;

    const [easting, northing] = proj4('EPSG:4326', projStr, [lon, lat]);

    if (points.length === 2) {
      // Independent axis linear interpolation — avoids rotation ambiguity.
      // Project both calibration points to the same CRS, then interpolate
      // easting→pixelX and northing→pixelY independently.
      const [e0, n0] = proj4('EPSG:4326', projStr, [points[0]!.lon, points[0]!.lat]);
      const [e1, n1] = proj4('EPSG:4326', projStr, [points[1]!.lon, points[1]!.lat]);

      const dE = e1 - e0;
      const dN = n1 - n0;
      if (Math.abs(dE) < 1e-6 || Math.abs(dN) < 1e-6) return null;

      const tE = (easting - e0) / dE;
      const tN = (northing - n0) / dN;

      const px0 = points[0]!.mapPoint;
      const px1 = points[1]!.mapPoint;

      return {
        x: px0.x + tE * (px1.x - px0.x),
        y: px0.y + tN * (px1.y - px0.y),
      };
    }

    // 3+ points: full affine
    const result = computeAffineTransform(points, georef.projDef);
    if (!result) return null;

    return applyAffine(easting, northing, result.matrix);
  } catch {
    return null;
  }
}

/** OCAD/OMAP path: GPS → proj4 → paper units → grivation → viewBox → pixels */
function gpsToMapPixelsProjected(
  lon: number,
  lat: number,
  georef: GeoReference,
): MapPoint | null {
  const projStr = resolveProjection(georef.projDef);
  if (!projStr) return null;

  try {
    // Step 1: WGS84 → projected CRS (metres)
    const [easting, northing] = proj4('EPSG:4326', projStr, [lon, lat]);

    // Step 2: Subtract reference point → delta in metres
    const dE = easting - georef.easting;
    const dN = northing - georef.northing;

    // Step 3: Scale to paper units
    const scale = paperUnitsPerMetre(georef);
    const paperE = dE * scale;
    const paperN = dN * scale;

    // Step 4: Rotate by +grivation (grid north → magnetic north)
    const cos = Math.cos(georef.grivation);
    const sin = Math.sin(georef.grivation);
    const paperX = paperE * cos - paperN * sin;
    const paperY = paperE * sin + paperN * cos;

    // Step 5: Paper space → pixel space (Y-flip)
    const { x: vbMinX, y: vbMinY } = georef.viewBoxOrigin;
    const pixelX = (paperX - vbMinX) * georef.renderScale;
    const pixelY = (georef.viewBoxHeight - (paperY - vbMinY)) * georef.renderScale;

    return { x: pixelX, y: pixelY };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reverse: map pixels → GPS
// ---------------------------------------------------------------------------

/**
 * Convert map pixel coordinates back to WGS84 GPS coordinates.
 * Useful for debugging and verification.
 *
 * @param point - Map pixel coordinates
 * @param georef - Georeferencing data from the map file
 * @returns { lon, lat } in degrees, or null if the transform fails
 */
export function mapPixelsToGps(
  point: MapPoint,
  georef: GeoReference,
): { lon: number; lat: number } | null {
  const projStr = resolveProjection(georef.projDef);
  if (!projStr) return null;

  try {
    // Reverse step 5: pixel → paper space
    const { x: vbMinX, y: vbMinY } = georef.viewBoxOrigin;
    const paperX = point.x / georef.renderScale + vbMinX;
    const paperY = georef.viewBoxHeight - point.y / georef.renderScale + vbMinY;

    // Reverse step 4: rotate by -grivation
    const cos = Math.cos(-georef.grivation);
    const sin = Math.sin(-georef.grivation);
    const paperE = paperX * cos - paperY * sin;
    const paperN = paperX * sin + paperY * cos;

    // Reverse step 3: paper units → metres
    const scale = paperUnitsPerMetre(georef);
    const dE = paperE / scale;
    const dN = paperN / scale;

    // Reverse step 2: add reference point
    const easting = dE + georef.easting;
    const northing = dN + georef.northing;

    // Reverse step 1: projected CRS → WGS84
    const [lon, lat] = proj4(projStr, 'EPSG:4326', [easting, northing]);

    return { lon, lat };
  } catch {
    return null;
  }
}
