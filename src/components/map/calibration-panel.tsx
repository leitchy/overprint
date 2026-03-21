/**
 * Manual calibration panel for non-georeferenced maps.
 *
 * Multi-step flow:
 * 1. Intro modal — explain what calibration does
 * 2. Pick point N on the map → record map pixel coords
 * 3. Enter GPS lat/lon (or use current GPS) for that point
 * 4. Repeat for point 2 (optional point 3)
 * 5. Confirm — show summary, apply transform, enable GPS
 *
 * Renders as a top banner over the map (so the map stays visible for tapping).
 */

import { useState, useCallback, useEffect } from 'react';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import { useGpsStore } from '@/stores/gps-store';
import { useT } from '@/i18n/use-t';
import proj4 from 'proj4';
import { computeAffineTransform, computeResiduals } from '@/core/geometry/affine-calibration';
import type { CalibrationPoint, GeoReference } from '@/core/models/types';

type CalibrationStep =
  | 'intro'
  | 'pick-point'
  | 'enter-coords'
  | 'confirm';

interface PartialPoint {
  mapX: number;
  mapY: number;
  lat: string;
  lon: string;
}

export function CalibrationPanel() {
  const t = useT();
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const mapFile = useEventStore((s) => s.event?.mapFile);

  const [step, setStep] = useState<CalibrationStep>('intro');
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [currentPoint, setCurrentPoint] = useState<PartialPoint | null>(null);
  const [targetCount, setTargetCount] = useState(2);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [residuals, setResiduals] = useState<number[]>([]);

  // GPS position for "Use current GPS" button
  const gpsPosition = useGpsStore((s) => s.position);
  const gpsStatus = useGpsStore((s) => s.status);
  const gpsAvailable = gpsStatus === 'active' || gpsStatus === 'poor-signal';

  const isActive = activeTool.type === 'calibrate' && !!mapFile;

  // --- ALL hooks must be above the early return (Rules of Hooks) ---

  const handleMapTap = useCallback((mapX: number, mapY: number) => {
    setCurrentPoint({ mapX, mapY, lat: '', lon: '' });
    setStep('enter-coords');
  }, []);

  // Bail out of calibration if no map is loaded
  useEffect(() => {
    if (activeTool.type === 'calibrate' && !mapFile) {
      setTool({ type: 'pan' });
    }
  }, [activeTool.type, mapFile, setTool]);

  // Listen for calibration-tap custom events from the map canvas
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (step === 'pick-point') {
        handleMapTap(detail.x, detail.y);
      }
    };
    window.addEventListener('calibration-tap', handler);
    return () => window.removeEventListener('calibration-tap', handler);
  }, [isActive, step, handleMapTap]);

  // --- Early return AFTER all hooks ---
  if (!isActive) return null;

  const pointNumber = points.length + 1;

  const handleCancel = () => {
    setTool({ type: 'pan' });
    setStep('intro');
    setPoints([]);
    setCurrentPoint(null);
    setWarnings([]);
  };

  const handleStartCalibration = () => {
    setStep('pick-point');
    setPoints([]);
    setCurrentPoint(null);
  };

  const handleUseCurrent = () => {
    if (!gpsPosition || !currentPoint) return;
    setCurrentPoint({
      ...currentPoint,
      lat: gpsPosition.lat.toFixed(6),
      lon: gpsPosition.lon.toFixed(6),
    });
  };

  const handleRepick = () => {
    setCurrentPoint(null);
    setStep('pick-point');
  };

  const handleNext = () => {
    if (!currentPoint) return;
    const lat = parseFloat(currentPoint.lat);
    const lon = parseFloat(currentPoint.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const newPoint: CalibrationPoint = {
      mapPoint: { x: currentPoint.mapX, y: currentPoint.mapY },
      lat,
      lon,
    };

    const updated = [...points, newPoint];
    setPoints(updated);
    setCurrentPoint(null);

    if (updated.length < targetCount) {
      setStep('pick-point');
    } else {
      const result = computeAffineTransform(updated);
      setWarnings(result?.warnings ?? []);

      // Compute per-point residuals for 3+ points
      if (result && updated.length >= 3) {
        const projected = updated.map((pt) => {
          const [e, n] = proj4('EPSG:4326', result.projDef, [pt.lon, pt.lat]);
          return { e, n };
        });
        setResiduals(computeResiduals(updated, projected, result.matrix));
      } else {
        setResiduals([]);
      }

      setStep('confirm');
    }
  };

  const handleAddThird = () => {
    setTargetCount(3);
    setStep('pick-point');
  };

  const handleRedo = () => {
    setStep('intro');
    setPoints([]);
    setCurrentPoint(null);
    setTargetCount(2);
    setWarnings([]);
    setResiduals([]);
  };

  const handleApply = () => {
    const result = computeAffineTransform(points);
    if (!result || !mapFile) return;

    const georef: GeoReference = {
      projDef: result.projDef,
      easting: 0,
      northing: 0,
      scale: mapFile.scale,
      grivation: 0,
      source: 'calibration',
      paperUnit: 'hundredths-mm',
      viewBoxOrigin: { x: 0, y: 0 },
      viewBoxHeight: 0,
      renderScale: 1,
      calibrationPoints: points,
    };

    useEventStore.getState().setMapFile({
      ...mapFile,
      georef,
    });

    setTool({ type: 'pan' });
    useGpsStore.getState().setEnabled(true);

    setStep('intro');
    setPoints([]);
    setCurrentPoint(null);
    setWarnings([]);
  };

  // --- Intro step ---
  if (step === 'intro') {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30">
        <div className="mx-4 max-w-[420px] rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-gray-900">{t('calibrateTitle')}</h2>
          <p className="mt-3 text-sm text-gray-600">{t('calibrateExplain')}</p>
          <p className="mt-2 text-sm text-gray-500">{t('calibrateExplainExample')}</p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t('calibrateCancel')}
            </button>
            <button
              onClick={handleStartCalibration}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('calibrateStart')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Pick point step ---
  if (step === 'pick-point') {
    return (
      <div className="absolute top-0 left-0 right-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-900">
              {t('calibratePickPoint').replace('{n}', String(pointNumber)).replace('{total}', String(targetCount))}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Tap the map at a point where you know the GPS coordinates.
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="rounded px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            {t('calibrateCancel')}
          </button>
        </div>

        {/* Show already-picked points as pins */}
        {points.length > 0 && (
          <div className="mt-2 flex gap-2">
            {points.map((p, i) => (
              <span key={i} className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
                Point {i + 1}: {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Enter coordinates step ---
  if (step === 'enter-coords' && currentPoint) {
    const latValid = currentPoint.lat === '' || Number.isFinite(parseFloat(currentPoint.lat));
    const lonValid = currentPoint.lon === '' || Number.isFinite(parseFloat(currentPoint.lon));
    const canProceed = currentPoint.lat !== '' && currentPoint.lon !== '' && latValid && lonValid;

    return (
      <div className="absolute top-0 left-0 right-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-900">{t('calibrateEnterCoords')}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Point {pointNumber} at map position ({Math.round(currentPoint.mapX)}, {Math.round(currentPoint.mapY)})
        </p>

        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600">{t('calibrateLat')}</label>
            <input
              type="number"
              step="any"
              value={currentPoint.lat}
              onChange={(e) => setCurrentPoint({ ...currentPoint, lat: e.target.value })}
              placeholder="-35.3082"
              className={`mt-1 w-full rounded border px-2 py-1.5 text-sm ${latValid ? 'border-gray-300' : 'border-red-400'}`}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600">{t('calibrateLon')}</label>
            <input
              type="number"
              step="any"
              value={currentPoint.lon}
              onChange={(e) => setCurrentPoint({ ...currentPoint, lon: e.target.value })}
              placeholder="149.1244"
              className={`mt-1 w-full rounded border px-2 py-1.5 text-sm ${lonValid ? 'border-gray-300' : 'border-red-400'}`}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2">
            {gpsAvailable && (
              <button
                onClick={handleUseCurrent}
                className="rounded bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-200"
              >
                {t('calibrateUseCurrent')}
              </button>
            )}
            <button
              onClick={handleRepick}
              className="rounded px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              {t('calibrateRepick')}
            </button>
          </div>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t('calibrateNext')}
          </button>
        </div>
      </div>
    );
  }

  // --- Confirm step ---
  if (step === 'confirm') {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30">
        <div className="mx-4 max-w-[420px] rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-gray-900">{t('calibrateComplete')}</h2>

          <div className="mt-4 space-y-2">
            {points.map((p, i) => (
              <div key={i} className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <span className="font-medium">Point {i + 1}:</span>{' '}
                {p.lat.toFixed(6)}, {p.lon.toFixed(6)} → map ({Math.round(p.mapPoint.x)}, {Math.round(p.mapPoint.y)})
                {residuals[i] !== undefined && (
                  <span className={`ml-2 ${residuals[i]! > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                    (error: {residuals[i]!.toFixed(1)}px)
                  </span>
                )}
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="mt-3">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-gray-500">{t('calibrateAccuracyNote')}</p>

          {points.length === 2 && (
            <button
              onClick={handleAddThird}
              className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              {t('calibrateAddThird')}
            </button>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleRedo}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t('calibrateRedo')}
            </button>
            <button
              onClick={handleApply}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('calibrateEnableGps')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
