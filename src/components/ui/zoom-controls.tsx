import { useViewportStore } from '@/stores/viewport-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { fitToView } from '@/components/map/use-map-navigation';

interface ZoomControlsProps {
  containerWidth: number;
  containerHeight: number;
}

export function ZoomControls({ containerWidth, containerHeight }: ZoomControlsProps) {
  const zoom = useViewportStore((s) => s.zoom);
  const setViewport = useViewportStore((s) => s.setViewport);
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);

  const handleZoomIn = () => {
    setViewport({ zoom: zoom * 1.25 });
  };

  const handleZoomOut = () => {
    setViewport({ zoom: zoom / 1.25 });
  };

  const handleFitToView = () => {
    const fit = fitToView(imageWidth, imageHeight, containerWidth, containerHeight);
    setViewport(fit);
  };

  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded bg-white/90 px-2 py-1 shadow">
      <button
        onClick={handleZoomOut}
        className="rounded px-2 py-0.5 text-sm hover:bg-gray-100"
        title="Zoom out"
      >
        −
      </button>
      <span className="min-w-[3.5rem] text-center text-xs text-gray-600">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={handleZoomIn}
        className="rounded px-2 py-0.5 text-sm hover:bg-gray-100"
        title="Zoom in"
      >
        +
      </button>
      <div className="mx-1 h-4 w-px bg-gray-300" />
      <button
        onClick={handleFitToView}
        className="rounded px-2 py-0.5 text-xs hover:bg-gray-100"
        title="Fit to view"
      >
        Fit
      </button>
    </div>
  );
}
