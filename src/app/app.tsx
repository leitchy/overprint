import { useRef, useState } from 'react';
import { useStrictMode } from 'react-konva';
import { MapCanvas } from '@/components/map/map-canvas';
import { Toolbar } from '@/components/ui/toolbar';
import { DescriptionPanel } from '@/components/descriptions/description-panel';
import { useMapImageStore } from '@/stores/map-image-store';
import { useEventStore } from '@/stores/event-store';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { detectMapFileType } from '@/core/files/detect-file-type';
import { loadMapFile, loadEventFile, importIofXmlFile } from '@/core/files/load-map-file';
import { useT } from '@/i18n/use-t';

// Enable react-konva strict mode for React 18 compatibility
useStrictMode(true);

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/gif,image/tiff,application/pdf,.ocd';

/** Return true if the filename has the given extension (case-insensitive). */
function hasExtension(name: string, ext: string): boolean {
  return name.toLowerCase().endsWith(ext.toLowerCase());
}

export function App() {
  useKeyboardShortcuts();
  const t = useT();
  const hasImage = useMapImageStore((s) => s.image !== null);
  const event = useEventStore((s) => s.event);
  const mapFileName = event?.mapFile?.name;
  const hasEventButNoMap = event !== null && !hasImage;

  const [dragOver, setDragOver] = useState(false);
  const [dropLoading, setDropLoading] = useState(false);

  // Hidden file input for the "Load Map" button shown in the no-map empty state
  const mapFileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers
  // ---------------------------------------------------------------------------

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only clear the overlay when leaving the root element itself, not when
    // moving into a child element (relatedTarget is null when leaving the window).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Required to allow drop
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Categorise files by type
    const overprintFiles = files.filter((f) => hasExtension(f.name, '.overprint'));
    const xmlFiles = files.filter((f) => hasExtension(f.name, '.xml'));
    const mapFiles = files.filter((f) => detectMapFileType(f) !== 'unknown');

    setDropLoading(true);

    try {
      // --- Scenario: .overprint + map file dropped together ---
      // Load the event first so its saved scale/dpi is in the store, then load
      // the map — no prompt required.
      if (overprintFiles.length > 0 && mapFiles.length > 0) {
        const overprintFile = overprintFiles[0]!;
        const loaded = await loadEventFile(overprintFile);

        if (loaded) {
          // The event's mapFile.name tells us which dropped file is the map.
          const expectedMapName = useEventStore.getState().event?.mapFile?.name;
          const matchingMap =
            expectedMapName != null
              ? (mapFiles.find((f) => f.name === expectedMapName) ?? mapFiles[0]!)
              : mapFiles[0]!;
          await loadMapFile(matchingMap);
        }

        // Process any remaining overprint files beyond the first
        for (const f of overprintFiles.slice(1)) {
          await loadEventFile(f);
        }
      } else {
        // --- General scenario: process each file by type ---

        // .overprint files first
        for (const f of overprintFiles) {
          await loadEventFile(f);
        }

        // Map files next
        for (const f of mapFiles) {
          await loadMapFile(f);
        }
      }

      // IOF XML files last (always)
      for (const f of xmlFiles) {
        await importIofXmlFile(f);
      }
    } finally {
      setDropLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // "Load Map" button handler for the empty-state prompt
  // ---------------------------------------------------------------------------

  const handleLoadMapClick = () => {
    mapFileInputRef.current?.click();
  };

  const handleMapFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDropLoading(true);
    try {
      await loadMapFile(file);
    } finally {
      setDropLoading(false);
    }
    e.target.value = '';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toolbar />

      <main className="relative flex flex-1 overflow-hidden">
        {hasImage ? (
          <>
            <div className="flex-1 overflow-hidden bg-gray-100">
              <MapCanvas />
            </div>
            <DescriptionPanel />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-100">
            {hasEventButNoMap ? (
              <>
                <p className="text-base font-medium text-gray-700">
                  {t('eventLoadedNoMap').replace('{name}', event.name)}
                </p>
                {mapFileName != null && (
                  <p className="font-mono text-sm font-medium text-violet-700">
                    {mapFileName}
                  </p>
                )}
                <p className="text-sm text-gray-500">
                  {t('dragOrClickLoadMap')}
                </p>
                <button
                  onClick={handleLoadMapClick}
                  disabled={dropLoading}
                  className="mt-1 rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {dropLoading ? t('loadingMap') : t('loadMapButton')}
                </button>
              </>
            ) : (
              <p className="text-gray-400">{t('dropFilesHere')}</p>
            )}
          </div>
        )}

        {/* Full-screen drag-over overlay */}
        {dragOver && (
          <div
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
            style={{
              background: 'rgba(99, 102, 241, 0.12)',
              border: '3px dashed #6366f1',
              borderRadius: '4px',
            }}
          >
            <span className="rounded-lg bg-white/90 px-6 py-3 text-lg font-semibold text-indigo-700 shadow-lg">
              {t('dropFilesToOpen')}
            </span>
          </div>
        )}
      </main>

      {/* Hidden file input for the "Load Map" button */}
      <input
        ref={mapFileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleMapFileInputChange}
        className="hidden"
      />
    </div>
  );
}
