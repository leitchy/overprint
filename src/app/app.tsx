import { useStrictMode } from 'react-konva';
import { MapCanvas } from '@/components/map/map-canvas';
import { Toolbar } from '@/components/ui/toolbar';
import { DescriptionPanel } from '@/components/descriptions/description-panel';
import { useMapImageStore } from '@/stores/map-image-store';
import { useEventStore } from '@/stores/event-store';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

// Enable react-konva strict mode for React 18 compatibility
useStrictMode(true);

export function App() {
  useKeyboardShortcuts();
  const hasImage = useMapImageStore((s) => s.image !== null);
  const event = useEventStore((s) => s.event);
  const mapFileName = event?.mapFile?.name;
  const hasEventButNoMap = event !== null && !hasImage;

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex flex-1 overflow-hidden">
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
                <p className="text-gray-600">
                  Event loaded: <span className="font-medium">{event.name}</span>
                </p>
                <p className="text-gray-500">
                  Please load the map file:{' '}
                  <span className="font-mono text-sm font-medium text-gray-700">
                    {mapFileName ?? 'unknown'}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  Click "Load Map" to open the map file
                </p>
              </>
            ) : (
              <p className="text-gray-400">Load a map to get started</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
