import { useRef, useState } from 'react';
import { loadMapFile, loadEventFile, importIofXmlFile } from '@/core/files/load-map-file';
import { serializeEvent } from '@/core/files/overprint-format';
import { saveBlob, saveString } from '@/core/files/download';
// Heavy exporters and format parsers are lazy-imported to keep initial bundle small
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useToolStore } from '@/stores/tool-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import type { Tool } from '@/stores/tool-store';
import type { SpecialItemType } from '@/core/models/types';
import { FileMenu } from './file-menu';
import type { MenuEntry } from './file-menu';
import { PreferencesModal } from './preferences-modal';
import { PrintSettingsModal } from './print-settings';
import { ShortcutsModal } from './shortcuts-modal';
import { GettingStartedDrawer } from './getting-started-drawer';
import { useT } from '@/i18n/use-t';
import { fitToView } from '@/components/map/use-map-navigation';

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd,.omap,.xmap';

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
  const shortcutsModalOpen = useToolStore((s) => s.shortcutsModalOpen);
  const gettingStartedOpen = useToolStore((s) => s.gettingStartedOpen);
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

  const handleCloseMap = () => {
    useMapImageStore.getState().clear();
    useViewportStore.getState().resetView();
  };

  const handleLoadMap = () => {
    fileInputRef.current?.click();
  };

  const handleSave = async () => {
    const currentEvent = useEventStore.getState().event;
    if (!currentEvent) return;
    const suggestedName = `${currentEvent.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.overprint`;
    try {
      if ('showSaveFilePicker' in window) {
        // Open save dialog FIRST to preserve user gesture
        const handle = await window.showSaveFilePicker({ suggestedName });
        const json = serializeEvent(currentEvent);
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
      } else {
        const json = serializeEvent(currentEvent);
        await saveString(json, suggestedName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Save failed:', err);
    }
  };

  const handleOpenEvent = () => {
    eventFileInputRef.current?.click();
  };

  const handleEventFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadEventFile(file);
    e.target.value = '';
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      await loadMapFile(file);
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

  const handleExportAllPdf = async () => {
    const currentEvent = useEventStore.getState().event;
    const mapImage = useMapImageStore.getState().image;
    if (!currentEvent || !mapImage) return;

    try {
      const { generateCoursePdf } = await import('@/core/export/pdf-course-map');
      const courseIndices = currentEvent.courses.map((_: unknown, i: number) => i);
      const suggestedName = `${currentEvent.name} - All Courses.pdf`.replace(/[^a-zA-Z0-9-_ .]/g, '');

      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({ suggestedName });
        const { blob } = await generateCoursePdf(currentEvent, mapImage, { courseIndices });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const { blob } = await generateCoursePdf(currentEvent, mapImage, { courseIndices });
        await saveBlob(blob, suggestedName);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('PDF export all courses failed:', err);
    }
  };

  const handleExportBatchPdf = async () => {
    const currentEvent = useEventStore.getState().event;
    const mapImage = useMapImageStore.getState().image;
    if (!currentEvent || !mapImage) return;

    try {
      const { generateCoursePdf } = await import('@/core/export/pdf-course-map');

      if (window.showDirectoryPicker) {
        // Chrome/Edge: pick folder, write all course PDFs there
        const dirHandle = await window.showDirectoryPicker();
        for (let i = 0; i < currentEvent.courses.length; i++) {
          const { blob, suggestedName } = await generateCoursePdf(currentEvent, mapImage, { courseIndex: i });
          const fileHandle = await dirHandle.getFileHandle(suggestedName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        }
      } else {
        // Fallback: sequential auto-downloads
        for (let i = 0; i < currentEvent.courses.length; i++) {
          const { blob, suggestedName } = await generateCoursePdf(currentEvent, mapImage, { courseIndex: i });
          await saveBlob(blob, suggestedName);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Batch PDF export failed:', err);
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
    await importIofXmlFile(file);
    e.target.value = '';
  };

  // --- Menu item arrays ---

  const fileMenuItems: MenuEntry[] = [
    { label: t('newEvent'), onClick: handleNewEvent },
    { separator: true },
    { label: t('openEvent'), onClick: handleOpenEvent },
    { label: t('saveEvent'), onClick: handleSave, disabled: !hasEvent },
    { separator: true },
    { label: t('loadMap'), onClick: handleLoadMap, disabled: loading },
    { label: t('closeMap'), onClick: handleCloseMap, disabled: !hasImage },
    { separator: true },
    {
      label: t('exportPdf'),
      disabled: !canExport,
      children: [
        { label: t('exportPdfCourseMap'), onClick: handleExportPdf },
        { label: t('exportAllCoursesPdf'), onClick: handleExportAllPdf },
        { label: t('exportPdfEachCourse'), onClick: handleExportBatchPdf },
        { separator: true },
        { label: t('exportPdfDescriptions'), onClick: handleExportDescriptionPdf },
      ],
    },
    { label: t('exportIofXml'), onClick: handleExportIofXml, disabled: !canExport },
    { label: t('exportPng'), onClick: () => handleExportImage('png'), disabled: !hasImage },
    { label: t('exportJpeg'), onClick: () => handleExportImage('jpeg'), disabled: !hasImage },
    { separator: true },
    { label: t('importIofXml'), onClick: handleImportIofXml, disabled: !hasEvent },
  ];

  const editMenuItems: MenuEntry[] = [
    {
      label: t('undo'),
      shortcut: '⌘Z',
      onClick: () => useEventStore.temporal.getState().undo(),
    },
    {
      label: t('redo'),
      shortcut: '⇧⌘Z',
      onClick: () => useEventStore.temporal.getState().redo(),
    },
  ];

  const viewMenuItems: MenuEntry[] = [
    {
      label: t('toolDescriptions'),
      onClick: toggleDescriptionsPanel,
      disabled: !hasImage,
    },
    {
      label: t('showPrintBoundary'),
      onClick: () => {
        const current = useAppSettingsStore.getState().showPrintBoundary;
        useAppSettingsStore.getState().setShowPrintBoundary(!current);
      },
      disabled: !hasEvent,
    },
    { separator: true },
    { label: t('pageSetup'), onClick: () => setPageSetupOpen(true), disabled: !hasEvent },
    { label: t('preferences'), onClick: () => setPreferencesOpen(true) },
    { separator: true },
    {
      label: t('zoomIn'),
      shortcut: '⌘+',
      onClick: () => {
        const { zoom, setZoom } = useViewportStore.getState();
        setZoom(zoom * 1.25);
      },
    },
    {
      label: t('zoomOut'),
      shortcut: '⌘-',
      onClick: () => {
        const { zoom, setZoom } = useViewportStore.getState();
        setZoom(zoom / 1.25);
      },
    },
    {
      label: t('fitToWindow'),
      onClick: () => {
        const { imageWidth, imageHeight } = useMapImageStore.getState();
        // Find the map canvas container to get its dimensions
        const container = document.querySelector('[data-map-container]');
        if (container && imageWidth > 0 && imageHeight > 0) {
          const { width, height } = container.getBoundingClientRect();
          const fit = fitToView(imageWidth, imageHeight, width, height);
          useViewportStore.getState().setViewport(fit);
        }
      },
      disabled: !hasImage,
    },
  ];

  const insertMenuItems: MenuEntry[] = [
    {
      label: t('toolAddControl'),
      onClick: () => setTool({ type: 'addControl' }),
      disabled: viewMode === 'allControls',
    },
    { separator: true },
    {
      label: t('addDescriptionBox'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'descriptionBox' as SpecialItemType }),
      disabled: viewMode === 'allControls' || !hasCourses,
    },
    { separator: true },
    {
      label: t('addText'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'text' as SpecialItemType }),
    },
    {
      label: t('addLine'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'line' as SpecialItemType }),
    },
    {
      label: t('addRectangle'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'rectangle' as SpecialItemType }),
    },
    { separator: true },
    {
      label: t('outOfBounds'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'outOfBounds' as SpecialItemType }),
    },
    {
      label: t('dangerousArea'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'dangerousArea' as SpecialItemType }),
    },
    {
      label: t('waterLocation'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'waterLocation' as SpecialItemType }),
    },
    {
      label: t('firstAid'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'firstAid' as SpecialItemType }),
    },
    {
      label: t('forbiddenRoute'),
      onClick: () => setTool({ type: 'addSpecialItem', itemType: 'forbiddenRoute' as SpecialItemType }),
    },
  ];

  const helpMenuItems: MenuEntry[] = [
    { label: t('gettingStarted'), onClick: () => useToolStore.getState().toggleGettingStarted() },
    { label: t('keyboardShortcuts'), onClick: () => useToolStore.getState().toggleShortcutsModal(), shortcut: '?' },
    { separator: true },
    { label: t('whatsNew'), onClick: () => window.open(`https://github.com/leitchy/overprint/releases/tag/v${__APP_VERSION__}`, '_blank') },
    { label: t('reportIssue'), onClick: () => window.open('https://github.com/leitchy/overprint/issues/new', '_blank') },
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
            ? 'bg-violet-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <header className="flex items-center gap-1 border-b border-gray-200 bg-white px-2 py-1.5">

      {/* Brand */}
      <span className="text-sm font-semibold text-gray-900">Overprint</span>
      <span className="text-[10px] text-gray-400 ml-0.5 mr-1">v{__APP_VERSION__}</span>

      {/* Zone 1 — Menu bar */}
      <nav className="flex items-center">
        <FileMenu items={fileMenuItems} label={t('file')} variant="menubar" />
        <FileMenu items={editMenuItems} label={t('edit')} variant="menubar" />
        <FileMenu items={viewMenuItems} label={t('view')} variant="menubar" />
        {hasImage && (
          <FileMenu items={insertMenuItems} label={t('insert')} variant="menubar" />
        )}
        <FileMenu items={helpMenuItems} label={t('help')} variant="menubar" />
      </nav>

      {/* Separator between menus and event name */}
      <div className="mx-1 h-5 w-px bg-gray-200" />

      {/* Zone 2 — Event name */}
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
            className="group flex items-center gap-1 text-sm text-gray-500 cursor-pointer hover:text-gray-700"
            onClick={() => { setEditingEventName(true); setEventNameDraft(eventName ?? ''); }}
            title={t('clickToEditEventName')}
          >
            {eventName}
            <span className="opacity-0 group-hover:opacity-50 text-xs">&#9998;</span>
          </span>
        )
      )}

      {/* Zone 3 + 4 — Tool buttons and descriptions toggle */}
      {hasImage && (
        <>
          <div className="mx-1 h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-1">
            {toolButton({ type: 'pan' }, t('toolPan'))}
            <button
              onClick={() => setTool({ type: 'addControl' })}
              disabled={viewMode === 'allControls'}
              title={viewMode === 'allControls' ? t('addControlDisabledInAllControls') : undefined}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                activeTool.type === 'addControl'
                  ? 'bg-violet-600 text-white'
                  : viewMode === 'allControls'
                    ? 'cursor-not-allowed bg-gray-100 text-gray-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('toolAddControl')}
            </button>
            {hasEvent && event?.courses && event.courses.length > 0 && viewMode === 'course' && (
              <>
                <div className="h-5 w-px bg-gray-200" />
                <button
                  onClick={() => setTool({ type: 'setPrintArea' })}
                  title={t('setPrintArea')}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    activeTool.type === 'setPrintArea'
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('setPrintArea')}
                </button>
              </>
            )}
          </div>

          {/* Zone 4 — Descriptions toggle */}
          <div className="mx-1 h-5 w-px bg-gray-200" />
          <button
            onClick={toggleDescriptionsPanel}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              descriptionsPanelOpen
                ? 'bg-violet-100 text-violet-700'
                : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-violet-200 hover:bg-gray-200'
            }`}
          >
            {t('toolDescriptions')}
          </button>
        </>
      )}

      {/* Zone 5 — Right side spacer + loading */}
      <div className="flex-1" />

      {loading && (
        <span className="text-sm text-gray-400">{t('loadingMap')}</span>
      )}

      {preferencesOpen && (
        <PreferencesModal onClose={() => setPreferencesOpen(false)} />
      )}
      {pageSetupOpen && (
        <PrintSettingsModal onClose={() => setPageSetupOpen(false)} />
      )}
      {shortcutsModalOpen && (
        <ShortcutsModal onClose={() => useToolStore.getState().toggleShortcutsModal()} />
      )}
      {gettingStartedOpen && (
        <GettingStartedDrawer onClose={() => useToolStore.getState().toggleGettingStarted()} />
      )}
      <input
        ref={fileInputRef}
        data-load-map
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
