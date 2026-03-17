import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { pixelsToMetres } from '@/core/geometry/distance';

const COMMON_SCALES = [4000, 5000, 7500, 10000, 15000];

export function MapSettingsPanel() {
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);

  if (!mapFile) return null;

  const widthMetres = pixelsToMetres(imageWidth, mapFile.scale, mapFile.dpi);
  const heightMetres = pixelsToMetres(imageHeight, mapFile.scale, mapFile.dpi);

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(e.target.value);
    if (value > 0) {
      useEventStore.getState().setMapScale(value);
    }
  };

  return (
    <div className="absolute left-4 top-4 rounded bg-white/90 p-3 text-xs shadow">
      <div className="mb-2 font-medium text-gray-700">Map Settings</div>

      <label className="mb-1 block text-gray-500">Scale</label>
      <select
        value={mapFile.scale}
        onChange={handleScaleChange}
        className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
      >
        {COMMON_SCALES.map((s) => (
          <option key={s} value={s}>
            1:{s.toLocaleString()}
          </option>
        ))}
      </select>

      <div className="space-y-0.5 text-gray-500">
        <div>DPI: {mapFile.dpi}</div>
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
