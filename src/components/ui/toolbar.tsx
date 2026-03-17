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
import type { SpecialItemType } from '@/core/models/types';
import { FileMenu } from './file-menu';
import type { MenuEntry } from './file-menu';
import { PreferencesModal } from './preferences-modal';
import { PrintSettingsModal } from './print-settings';
import { useT } from '@/i18n/use-t';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd';

export function Toolbar() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventFileInputRef = useRef<HTMLInputElement>(null);
  const iofXmlInputRef = useRef<HTMLInputElement>(null);
  const event = useEventStore((s) => s.event);
  const eventName = event?.name;
  const viewMode = useEventStore((s) => s.viewMode);
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const descriptionsPanelOpen = useToolStore((s) => s.descriptionsPanelOpen);
  const toggleDescriptionsPanel = useToolStore((s) => s.toggleDescriptionsPanel);
  const hasImage = useMapImageStore((s) => s.image !== null);
  const setEventName = useEventStore((s) => s.setEventName);
  const [loading, setLoading] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [editingEventName, setEditingEventName] = useState(false);
  const [eventNameDraft, setEventNameDraft] = useState('');

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

  const handleExportImage = async (format: 'png' | 'jpeg') => {
    const currentEvent = useEventStore.getState().event;
    const { getStageInstance } = await import('@/components/map/map-canvas');
    const stage = getStageInstance();
    if (!stage) return;

    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const baseName = currentEvent?.name ?? 'export';
    const suggestedName = `${baseName.replace(/[^a-zA-Z0-9-_ ]/g, '')}.${ext}`;

    try {
      // Capture all visible layers at 2× pixel ratio
      const canvas = stage.toCanvas({ pixelRatio: 2 });
      const { generateImageBlob } = await import('@/core/export/image-export');
      const { blob } = await generateImageBlob(canvas, format);

      if ('showSaveFilePicker' in window) {
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const handle = await (window as Window & typeof globalThis).showSaveFilePicker({
          suggestedName,
          types: [{ description: format.toUpperCase(), accept: { [mimeType]: [`.${ext}`] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        await saveBlob(blob, suggestedName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(`${format.toUpperCase()} export failed:`, err);
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

  const specialItemMenuItems: MenuEntry[] = ([
    ['text', t('addText')],
    ['line', t('addLine')],
    ['rectangle', t('addRectangle')],
    null, // separator
    ['outOfBounds', t('outOfBounds')],
    ['dangerousArea', t('dangerousArea')],
    ['waterLocation', t('waterLocation')],
    ['firstAid', t('firstAid')],
    ['forbiddenRoute', t('forbiddenRoute')],
  ] as Array<[SpecialItemType, string] | null>).map((entry): MenuEntry => {
    if (entry === null) return { separator: true };
    const [itemType, label] = entry;
    return {
      label,
      onClick: () => setTool({ type: 'addSpecialItem', itemType }),
    };
  });

  const fileMenuItems: MenuEntry[] = [
    { label: t('openEvent'), onClick: handleOpenEvent },
    { label: t('saveEvent'), onClick: handleSave, disabled: !hasEvent },
    { separator: true },
    { label: t('loadMap'), onClick: handleLoadMap, disabled: loading },
    { separator: true },
    { label: t('exportPdfCourseMap'), onClick: handleExportPdf, disabled: !canExport },
    { label: t('exportPdfDescriptions'), onClick: handleExportDescriptionPdf, disabled: !canExport },
    { label: t('exportIofXml'), onClick: handleExportIofXml, disabled: !canExport },
    { label: t('exportPng'), onClick: () => handleExportImage('png'), disabled: !hasImage },
    { label: t('exportJpeg'), onClick: () => handleExportImage('jpeg'), disabled: !hasImage },
    { separator: true },
    { label: t('importIofXml'), onClick: handleImportIofXml, disabled: !hasEvent },
    { separator: true },
    { label: t('pageSetup'), onClick: () => setPageSetupOpen(true), disabled: !hasEvent },
    { label: t('preferences'), onClick: () => setPreferencesOpen(true) },
    { separator: true },
    { label: t('newEvent'), onClick: handleNewEvent },
  ];

  const toolButton = (tool: Tool, label: string) => {
    const isActive = activeTool.type === tool.type &&
      (tool.type !== 'addSpecialItem' ||
        (activeTool.type === 'addSpecialItem' && activeTool.itemType === tool.itemType));
    return (
      <button
        onClick={() => setTool(tool)}
        className={`rounded px-3 py-1.5 text-sm font-medium ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
      <h1 className="text-lg font-semibold text-gray-900">Overprint</h1>
      {eventName !== undefined && (
        editingEventName ? (
          <input
            autoFocus
            value={eventNameDraft}
            onChange={(e) => setEventNameDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                const trimmed = eventNameDraft.trim();
                if (trimmed) setEventName(trimmed);
                setEditingEventName(false);
              }
              if (e.key === 'Escape') {
                setEditingEventName(false);
              }
            }}
            onBlur={() => {
              const trimmed = eventNameDraft.trim();
              if (trimmed) setEventName(trimmed);
              setEditingEventName(false);
            }}
            className="text-sm text-gray-500 border-b border-violet-400 bg-transparent outline-none px-1"
          />
        ) : (
          <span
            className="text-sm text-gray-500 cursor-pointer hover:text-gray-700"
            onClick={() => { setEditingEventName(true); setEventNameDraft(eventName ?? ''); }}
            title={t('clickToEditEventName')}
          >
            {eventName}
          </span>
        )
      )}

      {/* Tool buttons — only show when a map is loaded */}
      {hasImage && (
        <div className="flex gap-1">
          {toolButton({ type: 'pan' }, t('toolPan'))}
          <button
            onClick={() => setTool({ type: 'addControl' })}
            disabled={viewMode === 'allControls'}
            title={viewMode === 'allControls' ? t('addControlDisabledInAllControls') : undefined}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              activeTool.type === 'addControl'
                ? 'bg-gray-800 text-white'
                : viewMode === 'allControls'
                  ? 'cursor-not-allowed bg-gray-100 text-gray-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('toolAddControl')}
          </button>
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
          {t('toolDescriptions')}
        </button>
      )}

      {hasImage && (
        <FileMenu
          items={specialItemMenuItems}
          label={t('specialItems')}
        />
      )}

      <div className="flex-1" />

      {loading && (
        <span className="text-sm text-gray-400">{t('loadingMap')}</span>
      )}

      <FileMenu items={fileMenuItems} label={t('file')} />

      {preferencesOpen && (
        <PreferencesModal onClose={() => setPreferencesOpen(false)} />
      )}
      {pageSetupOpen && (
        <PrintSettingsModal onClose={() => setPageSetupOpen(false)} />
      )}
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
