import { useStrictMode } from 'react-konva';
import { MapCanvas } from '@/components/map/map-canvas';
import { Toolbar } from '@/components/ui/toolbar';
import { useMapImageStore } from '@/stores/map-image-store';

// Enable react-konva strict mode for React 18 compatibility
useStrictMode(true);

export function App() {
  const hasImage = useMapImageStore((s) => s.image !== null);

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex-1 overflow-hidden bg-gray-100">
        {hasImage ? (
          <MapCanvas />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            Load a map to get started
          </div>
        )}
      </main>
    </div>
  );
}
