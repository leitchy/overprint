import { useRef, useState } from 'react';
import { detectMapFileType } from '@/core/files/detect-file-type';
import { loadRasterImage } from '@/core/files/load-raster';
// loadPdfAsImage is lazy-imported to avoid loading PDF.js at module evaluation
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventName = useEventStore((s) => s.event?.name);
  const [loading, setLoading] = useState(false);

  const handleLoadMap = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = detectMapFileType(file);
    console.log('File selected:', file.name, 'type:', file.type, 'detected:', fileType);

    if (fileType === 'unknown') {
      console.error('Unsupported file type:', file.name);
      return;
    }

    // Create event if none exists
    if (!useEventStore.getState().event) {
      useEventStore.getState().newEvent('Untitled Event');
    }

    setLoading(true);

    try {
      if (fileType === 'raster') {
        const img = await loadRasterImage(file);
        useMapImageStore.getState().setImage(img, img.naturalWidth, img.naturalHeight);
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'raster',
          scale: 15000,
          dpi: 150,
        });
      } else if (fileType === 'pdf') {
        const { loadPdfAsImage } = await import('@/core/files/load-pdf');
        const result = await loadPdfAsImage(file);
        useMapImageStore.getState().setImage(result.canvas, result.width, result.height);
        useMapImageStore.getState().setPdfArrayBuffer(result.arrayBuffer);
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'pdf',
          scale: 15000,
          dpi: 200,
        });
      } else if (fileType === 'ocad') {
        const { loadOcadMap } = await import('@/core/files/load-ocad');
        const result = await loadOcadMap(file);
        useMapImageStore.getState().setImage(result.image, result.width, result.height);
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'ocad',
          scale: result.scale ?? 15000,
          dpi: 150, // SVG rasterized at screen resolution
        });
      }
    } catch (err) {
      console.error('Failed to load map:', err);
    } finally {
      setLoading(false);
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
      <h1 className="text-lg font-semibold text-gray-900">Overprint</h1>
      {eventName && (
        <span className="text-sm text-gray-500">{eventName}</span>
      )}
      <div className="flex-1" />
      <button
        onClick={handleLoadMap}
        disabled={loading}
        className="rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Load Map'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileSelected}
        className="hidden"
      />
    </header>
  );
}
