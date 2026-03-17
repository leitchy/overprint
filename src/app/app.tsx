import { useStrictMode } from 'react-konva';
import { MapCanvas } from '@/components/map/map-canvas';
import { Toolbar } from '@/components/ui/toolbar';
import { DescriptionPanel } from '@/components/descriptions/description-panel';
import { useMapImageStore } from '@/stores/map-image-store';

// Enable react-konva strict mode for React 18 compatibility
useStrictMode(true);

export function App() {
  const hasImage = useMapImageStore((s) => s.image !== null);

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
          <div className="flex flex-1 items-center justify-center bg-gray-100 text-gray-400">
            Load a map to get started
          </div>
        )}
      </main>
    </div>
  );
}
