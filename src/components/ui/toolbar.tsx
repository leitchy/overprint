import { useRef, useState } from 'react';
import { detectMapFileType } from '@/core/files/detect-file-type';
import { loadRasterImage } from '@/core/files/load-raster';
import { serializeEvent, deserializeEvent } from '@/core/files/overprint-format';
import { downloadString } from '@/core/files/download';
// loadPdfAsImage and loadOcadMap are lazy-imported to avoid loading at module evaluation
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useToolStore } from '@/stores/tool-store';
import type { Tool } from '@/stores/tool-store';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventFileInputRef = useRef<HTMLInputElement>(null);
  const event = useEventStore((s) => s.event);
  const eventName = event?.name;
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const descriptionsPanelOpen = useToolStore((s) => s.descriptionsPanelOpen);
  const toggleDescriptionsPanel = useToolStore((s) => s.toggleDescriptionsPanel);
  const hasImage = useMapImageStore((s) => s.image !== null);
  const [loading, setLoading] = useState(false);

  const handleLoadMap = () => {
    fileInputRef.current?.click();
  };

  const handleSave = () => {
    const currentEvent = useEventStore.getState().event;
    if (!currentEvent) return;
    const json = serializeEvent(currentEvent);
    const filename = `${currentEvent.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.overprint`;
    downloadString(json, filename);
  };

  const handleOpenEvent = () => {
    eventFileInputRef.current?.click();
  };

  const handleEventFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const loadedEvent = deserializeEvent(text);
      useEventStore.getState().loadEvent(loadedEvent);

      if (loadedEvent.mapFile) {
        console.log(
          `Event loaded. Please load the map file: ${loadedEvent.mapFile.name}`,
        );
      }
    } catch (err) {
      console.error('Failed to open event:', err);
    }

    e.target.value = '';
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
          dpi: 150,
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

  const toolButton = (tool: Tool, label: string) => (
    <button
      onClick={() => setTool(tool)}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        activeTool === tool
          ? 'bg-gray-800 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
      <h1 className="text-lg font-semibold text-gray-900">Overprint</h1>
      {eventName && (
        <span className="text-sm text-gray-500">{eventName}</span>
      )}

      {/* Tool buttons — only show when a map is loaded */}
      {hasImage && (
        <div className="flex gap-1">
          {toolButton('pan', 'Pan')}
          {toolButton('addControl', 'Add Control')}
        </div>
      )}

      {hasImage && (
        <button
          onClick={toggleDescriptionsPanel}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            descriptionsPanelOpen
              ? 'bg-violet-100 text-violet-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Descriptions
        </button>
      )}

      <div className="flex-1" />

      {/* File operations */}
      <div className="flex gap-1">
        <button
          onClick={handleOpenEvent}
          className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Open
        </button>
        {event && (
          <button
            onClick={handleSave}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Save
          </button>
        )}
        <button
          onClick={handleLoadMap}
          disabled={loading}
          className="rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load Map'}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={eventFileInputRef}
        type="file"
        accept=".overprint"
        onChange={handleEventFileSelected}
        className="hidden"
      />
    </header>
  );
}
