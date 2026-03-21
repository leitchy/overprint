# GPS-Based Control Placement

## Context

Orienteering course setters work in the field with a phone/tablet. Currently Overprint has no way to use GPS to place controls — you must manually position them on the map. This feature lets the user walk to a feature, tap "Place here", and place a control at their real GPS position on the orienteering map. Requires georeferencing the map (auto from OCAD/OMAP, or manual calibration for raster/PDF).

Full UX spec: [GPS Control Placement UX Spec](../gps-control-placement-ux-spec.md)

---

## Coordinate Transform Pipeline

```
GPS lat/lon (WGS84)
  → proj4(WGS84, projDef) → [easting, northing] (metres)
    → subtract [refPoint.x, refPoint.y] → [dE, dN] (metres)
      → scale to paper: multiply by (100000/scale) for OCAD [1/100mm]
                         or (1000000/scale) for OMAP [1/1000mm]
        → rotate by +grivation (radians): 2D rotation
          → [paperX, paperY] in map paper space (Y-up)
            → pixelX = (paperX - vbMinX) * renderScale
              pixelY = (vbHeight - (paperY - vbMinY)) * renderScale  ← Y-FLIP
```

For manual calibration: GPS → projected CRS → affine transform (from 2+ calibration points) → map-space pixels. Grivation is implicit in the affine.

---

## GeoReference Type

```typescript
interface GeoReference {
  /** EPSG code (number) or PROJ.4 string (string) for projected CRS */
  projDef: number | string;
  easting: number;           // Projected origin X (metres)
  northing: number;          // Projected origin Y (metres)
  scale: number;             // Map scale denominator
  grivation: number;         // Grid-to-magnetic north angle (RADIANS)
  source: 'ocad' | 'omap' | 'calibration';
  /** Paper coord unit — needed for correct scale factor */
  paperUnit: 'hundredths-mm' | 'thousandths-mm';
  /** SVG viewBox origin for paper→pixel mapping */
  viewBoxOrigin: { x: number; y: number };
  /** SVG viewBox height — required for Y-flip */
  viewBoxHeight: number;
  /** SVG-to-pixel render scale factor */
  renderScale: number;
  /** Manual calibration points (for raster/PDF) */
  calibrationPoints?: CalibrationPoint[];
}
```

---

## Phases

### Phase 1 — GeoReference type + OCAD/OMAP extraction

**Modify `src/core/models/types.ts`:** Add `GeoReference`, `CalibrationPoint`, extend `MapFile` with `georef?`.

**Modify `src/core/files/load-ocad.ts`:**
- Call `ocadFile.getCrs()` → extract `easting`, `northing`, `code` (EPSG), `grivation`, `scale`
- Capture all 4 SVG viewBox values (currently only width/height stored — must also capture minX, minY)
- Store `renderScale` (already computed as `TARGET_LONG_SIDE / longestSide`)
- Skip if `crs.code === 0`
- `paperUnit: 'hundredths-mm'`

**Modify `src/core/files/load-omap.ts`:**
- Parse `<georeferencing>` element fully:
  - `<spec language="PROJ.4">` → store as `projDef` string (NOT the `id` attribute — it's a label, not EPSG)
  - `<ref_point x="..." y="...">` → easting/northing
  - `grivation` attribute (degrees → convert to **radians** in extractor)
- Capture viewBox origin and renderScale
- `paperUnit: 'thousandths-mm'`

**Modify `src/core/files/load-map-file.ts`:** Thread `georef` into `setMapFile()`.

Georef persists automatically in `.overprint` JSON format.

---

### Phase 2 — Coordinate transform module + proj4js

proj4 v2.20.4 is already installed. Verify it's in `package.json`; if not, `pnpm add proj4 @types/proj4`.

**proj4 EPSG registration issue:** proj4 ships WGS84 UTM zones (326xx/327xx) but NOT GDA94 (283xx) or GDA2020 (78xx). Fix:
- When `projDef` is a string (PROJ.4), pass directly to proj4 — works for OMAP maps
- When `projDef` is a number, try `proj4('EPSG:' + projDef)` — works for UTM zones
- Register GDA94/GDA2020 UTM zone definitions for common Australian EPSG codes as fallback
- If proj4 lookup fails → set `georef = null`, triggering calibration prompt

**New file: `src/core/geometry/geo-transform.ts`**
- `gpsToMapPixels(lon, lat, georef): MapPoint | null`
- `mapPixelsToGps(point, georef): { lon, lat } | null` (reverse, for debugging)
- For OCAD: can also use `crs.toMapCoord()` directly since it handles the grivation rotation correctly

**New file: `src/core/geometry/affine-calibration.ts`**
- `computeAffineTransform(points: CalibrationPoint[]): AffineMatrix`
- 2 points → similarity transform (4 DOF: translation + rotation + uniform scale)
- 3+ points → full affine (6 DOF) via least-squares
- Warn if baseline between points < 50m ground distance

**Tests:** Round-trip with known Canberra coords (MGA2020 Zone 55, EPSG:7855 / UTM 32755).

---

### Phase 3 — GPS position hook

**New file: `src/hooks/use-gps-position.ts`**

```typescript
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,    // 1s — tight for walking speed
  timeout: 30000,      // 30s — avoid spurious timeout under canopy
};
```

- Status: `'inactive' | 'acquiring' | 'active' | 'denied' | 'unavailable' | 'timeout'`
- **Permissions pre-check**: `navigator.permissions.query({ name: 'geolocation' })` before calling `watchPosition`. Listen for `change` event to auto-resume if user re-enables in Settings.
- **Error handling**: Only `PERMISSION_DENIED` calls `clearWatch`. `TIMEOUT` and `POSITION_UNAVAILABLE` keep the watch alive (canopy dropout is transient).
- **Page Visibility**: `clearWatch` on `visibilitychange: hidden`, restart on `visible`.
- Cleanup on unmount.

---

### Phase 4 — GPS store

**New file: `src/stores/gps-store.ts`**

State: `enabled`, `position`, `status`, `mapPoint`, `accuracyRadius`
Ephemeral — not saved, not undoable, separate from event store.

---

### Phase 5 — GPS UI

**GPS toggle button:**
- **Desktop toolbar**: Zone 3, after "Add Control", icon-only (📍), 40×40px
- **Mobile compact toolbar**: between tool buttons (✋/⊕) and undo/redo
- Only **visible** when `navigator.geolocation` exists
- Only **enabled** when `mapFile.georef` is set (map is georeferenced)
- Disabled tooltip: "Load a georeferenced map or calibrate to enable GPS"

**GPS indicator on canvas:**
- **New file: `src/components/map/gps-indicator.tsx`** — Konva Group:
  - Blue dot (4px) at GPS map coords
  - Semi-transparent blue accuracy circle (always visible, scales with zoom)
  - Rendered above map layer, below overprint layer

**GPS bridge:**
- **New file: `src/components/map/gps-bridge.tsx`** — non-rendering component:
  - Subscribes to `useGpsPosition()` hook
  - Reads `georef` from event store
  - Calls `gpsToMapPixels()` → updates gps-store with map point + accuracy radius
  - Accuracy radius in pixels: `accuracyMetres / scale * 1000 / 25.4 * dpi`

**Control placement:**
- **Phone**: existing center-reticle switches to GPS mode — crosshair tracks GPS position, "Place here" label changes to "Place at GPS"
- **Tablet/desktop**: blue dot visible on canvas, floating "Place at GPS" pill button appears (bottom-center) when GPS active + addControl tool
- **Placement uses fresh `getCurrentPosition({ maximumAge: 0 })` for best fix** at the moment of placement, not the last watch position
- Block placement if `accuracy > 50m` ("Signal too weak")

**Auto-follow:**
- Map auto-pans to keep GPS dot centered
- Manual pan suspends auto-follow for 8 seconds
- Small "Follow GPS" chip appears to re-engage follow

**Status indicators:**
- Acquiring: pulsing blue ring at last known position (or center if no position yet)
- Active + good (<10m): solid blue dot, green accuracy text "±Xm"
- Active + marginal (10–20m): amber accuracy text
- Active + poor (>20m): red accuracy text + warning
- Lost/timeout: grey dot, "Signal lost" chip

---

### Phase 6 — Manual calibration UI

**New tool type:** `{ type: 'calibrate' }` in tool-store.

**New file: `src/components/map/calibration-panel.tsx`** — bottom sheet (so map stays visible):
1. "Tap a known point on the map" → record map pixel coords
2. "Enter GPS coordinates" — type lat/lon OR **"Use current GPS"** button
3. Minimum 2 points (similarity transform). Encourage 3+ for full affine.
4. Show per-point residual error with 3+ points
5. Warn if baseline < 50m ground distance
6. "Apply" stores calibration in `MapFile.georef`

---

### Phase 7 — Polish

- No-georef warning toast when enabling GPS on uncalibrated map + link to calibration
- Permission denial message with platform-specific settings instructions
- **Screen Wake Lock** (`navigator.wakeLock.request('screen')`) — iOS 16.4+, Android Chrome 84+ — keeps screen on during field use
- A-GPS warm-up guidance: "Enable GPS before going into the forest for faster signal lock"
- Translation keys for all 8 languages
- Battery: stop GPS on page hidden, restart on visible

---

## New Files

| File | Purpose |
|------|---------|
| `src/core/geometry/geo-transform.ts` | GPS ↔ map-pixel transform pipeline |
| `src/core/geometry/affine-calibration.ts` | Affine transform from calibration points |
| `src/hooks/use-gps-position.ts` | Geolocation API hook with permission pre-check |
| `src/stores/gps-store.ts` | Ephemeral GPS state |
| `src/components/map/gps-indicator.tsx` | Konva GPS dot + accuracy circle |
| `src/components/map/gps-bridge.tsx` | GPS → map coords bridge |
| `src/components/map/calibration-panel.tsx` | Manual calibration UI |

## Critical Modified Files

| File | Changes |
|------|---------|
| `src/core/models/types.ts` | GeoReference, CalibrationPoint, extend MapFile |
| `src/core/files/load-ocad.ts` | Extract georef + all 4 viewBox values |
| `src/core/files/load-omap.ts` | Extract full georef from XML |
| `src/core/files/load-map-file.ts` | Thread georef |
| `src/components/map/center-reticle.tsx` | GPS mode: crosshair tracks GPS position |
| `src/components/map/map-canvas.tsx` | Mount GPS components, auto-pan, GPS indicator layer |
| `src/components/ui/toolbar.tsx` | GPS toggle button (both desktop + compact) |
| `src/i18n/translations.ts` | GPS strings for all 8 languages |

## Verification

1. **Desktop regression**: `pnpm test` — all pass, typecheck clean
2. **OCAD georef**: Load georeferenced OCAD → `mapFile.georef` populated
3. **OMAP georef**: Load Mt Taylor 2024.omap → georef with UTM55S, correct easting/northing
4. **Transform round-trip**: GPS→pixels→GPS within 0.1m tolerance
5. **GPS on iPhone**: Enable GPS with OCAD map, walk 50m, verify dot tracks correctly
6. **GPS accuracy circle**: visible and scales correctly with zoom
7. **Calibration**: Load raster PNG, calibrate 2 points, enable GPS, verify position
8. **Placement**: "Place at GPS" with fresh `getCurrentPosition`, verify position on map
9. **Permission denied**: deny GPS → see helpful message, no crash
10. **Canopy dropout**: walk under tree → status goes to timeout, watch stays alive, recovers
