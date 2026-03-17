import { useRef, useState } from 'react';
import { detectMapFileType } from '@/core/files/detect-file-type';
import { loadRasterImage } from '@/core/files/load-raster';
import { serializeEvent, deserializeEvent } from '@/core/files/overprint-format';
import { saveBlob, saveString } from '@/core/files/download';
// Heavy exporters and format parsers are lazy-imported to keep initial bundle small
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useToolStore } from '@/stores/tool-store';
import type { Tool } from '@/stores/tool-store';
import { FileMenu } from './file-menu';
import type { MenuEntry } from './file-menu';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventFileInputRef = useRef<HTMLInputElement>(null);
  const iofXmlInputRef = useRef<HTMLInputElement>(null);
  const event = useEventStore((s) => s.event);
  const eventName = event?.name;
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const descriptionsPanelOpen = useToolStore((s) => s.descriptionsPanelOpen);
  const toggleDescriptionsPanel = useToolStore((s) => s.toggleDescriptionsPanel);
  const hasImage = useMapImageStore((s) => s.image !== null);
  const [loading, setLoading] = useState(false);

  const handleNewEvent = () => {
    useEventStore.getState().newEvent('Untitled Event');
    useMapImageStore.getState().clear();
  };

  const handleLoadMap = () => {
    fileInputRef.current?.click();
  };

  const handleSave = async () => {
    const currentEvent = useEventStore.getState().event;
    if (!currentEvent) return;
    const json = serializeEvent(currentEvent);
    const suggestedName = `${currentEvent.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.overprint`;
    await saveString(json, suggestedName);
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

    // Create event if none exists — but don't overwrite a loaded event
    if (!useEventStore.getState().event) {
      useEventStore.getState().newEvent('Untitled Event');
    }

    // If event already has mapFile metadata (from .overprint load), use its saved scale/dpi
    const existingMapFile = useEventStore.getState().event?.mapFile;

    setLoading(true);

    try {
      if (fileType === 'raster') {
        const img = await loadRasterImage(file);
        useMapImageStore.getState().setImage(img, img.naturalWidth, img.naturalHeight);
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'raster',
          scale: existingMapFile?.scale ?? 15000,
          dpi: existingMapFile?.dpi ?? 150,
        });
      } else if (fileType === 'pdf') {
        const { loadPdfAsImage } = await import('@/core/files/load-pdf');
        const dpi = existingMapFile?.dpi ?? 200;
        const result = await loadPdfAsImage(file, { dpi });
        useMapImageStore.getState().setImage(result.canvas, result.width, result.height);
        useMapImageStore.getState().setPdfArrayBuffer(result.arrayBuffer);
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'pdf',
          scale: existingMapFile?.scale ?? 15000,
          dpi,
        });
      } else if (fileType === 'ocad') {
        const { loadOcadMap } = await import('@/core/files/load-ocad');
        const result = await loadOcadMap(file);
        useMapImageStore.getState().setImage(result.image, result.width, result.height);
        // For OCAD files the DPI is computed directly from the file's coordinate geometry
        // and must never be overridden by a stale saved value. The scale embedded in the
        // OCAD file is also authoritative; fall back to the saved scale only when OCAD
        // metadata is missing (result.scale === null).
        useEventStore.getState().setMapFile({
          name: file.name,
          type: 'ocad',
          scale: result.scale ?? existingMapFile?.scale ?? 15000,
          dpi: result.dpi,
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

  const hasEvent = !!event;
  const hasCourses = (event?.courses.length ?? 0) > 0;
  const canExport = hasEvent && hasImage && hasCourses;

  const handleExportPdf = async () => {
    const currentEvent = useEventStore.getState().event;
    const mapImage = useMapImageStore.getState().image;
    if (!currentEvent || !mapImage) return;

    try {
      // Open save dialog FIRST to preserve user gesture, then generate PDF
      const { generateCoursePdf } = await import('@/core/export/pdf-course-map');
      const courseName = currentEvent.courses[0]?.name ?? 'Course';
      const suggestedName = `${currentEvent.name} - ${courseName}.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '');

      if ('showSaveFilePicker' in window) {
        // Get file handle while gesture is still valid
        const handle = await window.showSaveFilePicker({ suggestedName });
        const { blob } = await generateCoursePdf(currentEvent, mapImage);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback: generate then auto-download
        const { blob } = await generateCoursePdf(currentEvent, mapImage);
        await saveBlob(blob, suggestedName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('PDF export failed:', err);
    }
  };

  const handleExportDescriptionPdf = async () => {
    const currentEvent = useEventStore.getState().event;
    if (!currentEvent) return;

    try {
      const { generateDescriptionSheetPdf } = await import(
        '@/core/export/pdf-description-sheet'
      );
      const { blob, suggestedName } = await generateDescriptionSheetPdf(currentEvent);

      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({ suggestedName });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        await saveBlob(blob, suggestedName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Description PDF export failed:', err);
    }
  };

  const handleExportIofXml = async () => {
    const currentEvent = useEventStore.getState().event;
    if (!currentEvent) return;

    try {
      const { exportIofXml } = await import('@/core/iof/export-xml');
      const xmlString = exportIofXml(currentEvent);
      const baseName = currentEvent.name.replace(/[^a-zA-Z0-9-_ ]/g, '');
      const suggestedName = `${baseName}.xml`;

      await saveString(xmlString, suggestedName, 'application/xml', [
        { description: 'IOF XML', accept: { 'application/xml': ['.xml'] } },
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('IOF XML export failed:', err);
    }
  };

  const handleImportIofXml = () => {
    iofXmlInputRef.current?.click();
  };

  const handleIofXmlFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentEvent = useEventStore.getState().event;
    const mapFile = currentEvent?.mapFile;

    const dpi = mapFile?.dpi ?? 96;
    const mapImage = useMapImageStore.getState().image;
    const mapHeightPx =
      mapImage instanceof HTMLCanvasElement
        ? mapImage.height
        : mapImage instanceof HTMLImageElement
          ? mapImage.naturalHeight
          : 0;

    try {
      const xmlString = await file.text();
      const { importIofXml } = await import('@/core/iof/import-xml');
      const { controls, courses } = importIofXml(xmlString, dpi, mapHeightPx);

      // Ensure an event exists before importing
      if (!useEventStore.getState().event) {
        useEventStore.getState().newEvent('Imported Event');
      }

      useEventStore.getState().importControlsAndCourses(controls, courses);
    } catch (err) {
      console.error('IOF XML import failed:', err);
    }

    e.target.value = '';
  };

  const fileMenuItems: MenuEntry[] = [
    { label: 'Open Event…', onClick: handleOpenEvent },
    { label: 'Save Event…', onClick: handleSave, disabled: !hasEvent },
    { separator: true },
    { label: 'Load Map…', onClick: handleLoadMap, disabled: loading },
    { separator: true },
    { label: 'Export PDF (Course Map)', onClick: handleExportPdf, disabled: !canExport },
    { label: 'Export PDF (Descriptions)', onClick: handleExportDescriptionPdf, disabled: !canExport },
    { label: 'Export IOF XML', onClick: handleExportIofXml, disabled: !canExport },
    { label: 'Export PNG', onClick: () => {}, disabled: true },
    { label: 'Export JPEG', onClick: () => {}, disabled: true },
    { separator: true },
    { label: 'Import IOF XML…', onClick: handleImportIofXml, disabled: !hasEvent },
    { separator: true },
    { label: 'New Event', onClick: handleNewEvent },
  ];

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

      {loading && (
        <span className="text-sm text-gray-400">Loading map…</span>
      )}

      <FileMenu items={fileMenuItems} />
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
      <input
        ref={iofXmlInputRef}
        type="file"
        accept=".xml,application/xml,text/xml"
        onChange={handleIofXmlFileSelected}
        className="hidden"
      />
    </header>
  );
}
