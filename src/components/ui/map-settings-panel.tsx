import { useState } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { pixelsToMetres } from '@/core/geometry/distance';
import { useT } from '@/i18n/use-t';
import { SCALE_PRESETS } from '@/core/models/constants';

export function MapSettingsPanel() {
  const t = useT();
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const setMapScale = useEventStore((s) => s.setMapScale);
  const setMapDpi = useEventStore((s) => s.setMapDpi);
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);

  const [editingDpi, setEditingDpi] = useState(false);
  const [dpiDraft, setDpiDraft] = useState('');
  const [customScale, setCustomScale] = useState(false);
  const [scaleDraft, setScaleDraft] = useState('');

  if (!mapFile) return null;

  const widthMetres = pixelsToMetres(imageWidth, mapFile.scale, mapFile.dpi);
  const heightMetres = pixelsToMetres(imageHeight, mapFile.scale, mapFile.dpi);

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'custom') {
      setCustomScale(true);
      setScaleDraft(String(mapFile.scale));
    } else {
      setCustomScale(false);
      const num = Number(value);
      if (num > 0) setMapScale(num);
    }
  };

  const commitCustomScale = () => {
    const num = Number(scaleDraft);
    if (num >= 1000 && num <= 100000) {
      setMapScale(num);
    }
    setCustomScale(false);
  };

  const commitDpi = () => {
    const num = Number(dpiDraft);
    if (num >= 50 && num <= 2400) {
      setMapDpi(num);
    }
    setEditingDpi(false);
  };

  const isPresetScale = (SCALE_PRESETS as readonly number[]).includes(mapFile.scale);

  return (
    <div className="absolute left-4 top-4 rounded bg-white/90 p-3 text-xs shadow">
      <div className="mb-2 font-medium text-gray-700">{t('mapSettingsTitle')}</div>

      {/* Scale */}
      <label className="mb-1 block text-gray-500">{t('mapScaleLabel')}</label>
      {customScale ? (
        <div className="mb-2 flex gap-1">
          <span className="py-1 text-gray-500">1:</span>
          <input
            autoFocus
            type="number"
            min={1000}
            max={100000}
            value={scaleDraft}
            onChange={(e) => setScaleDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitCustomScale();
              if (e.key === 'Escape') setCustomScale(false);
            }}
            onBlur={commitCustomScale}
            className="w-20 rounded border border-gray-300 px-1 py-0.5 text-xs outline-none focus:border-violet-400"
          />
        </div>
      ) : (
        <select
          value={isPresetScale ? mapFile.scale : 'custom'}
          onChange={handleScaleChange}
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
        >
          {SCALE_PRESETS.map((s) => (
            <option key={s} value={s}>
              1:{s.toLocaleString()}
            </option>
          ))}
          {!isPresetScale && (
            <option value={mapFile.scale}>1:{mapFile.scale.toLocaleString()}</option>
          )}
          <option value="custom">{t('customScale')}</option>
        </select>
      )}

      {/* DPI */}
      <div className="mb-1 space-y-0.5 text-gray-500">
        <div className="flex items-center gap-1">
          <span>DPI:</span>
          {editingDpi ? (
            <input
              autoFocus
              type="number"
              min={50}
              max={2400}
              value={dpiDraft}
              onChange={(e) => setDpiDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitDpi();
                if (e.key === 'Escape') setEditingDpi(false);
              }}
              onBlur={commitDpi}
              className="w-16 rounded border border-gray-300 px-1 py-0 text-xs outline-none focus:border-violet-400"
            />
          ) : (
            <span
              className="cursor-pointer hover:text-violet-600"
              onClick={() => { setEditingDpi(true); setDpiDraft(String(Math.round(mapFile.dpi))); }}
              title={t('clickToEditDpi')}
            >
              {Math.round(mapFile.dpi)}
            </span>
          )}
        </div>
        <div>
          {imageWidth} × {imageHeight} px
        </div>
        <div>
          {(widthMetres / 1000).toFixed(1)} × {(heightMetres / 1000).toFixed(1)} km
        </div>
      </div>
    </div>
  );
}
