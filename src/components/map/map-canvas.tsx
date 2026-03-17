import { useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useCanvasSize } from './use-canvas-size';
import { useMapNavigation, fitToView } from './use-map-navigation';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { ZoomControls } from '@/components/ui/zoom-controls';
import { MapSettingsPanel } from '@/components/ui/map-settings-panel';

export function MapCanvas() {
  const [containerRef, size] = useCanvasSize();
  const stageRef = useRef<StageType>(null);
  const image = useMapImageStore((s) => s.image);
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);
  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);

  const {
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useMapNavigation({ stageRef });

  // Auto-fit when image first loads
  const prevImageRef = useRef<typeof image>(null);
  useEffect(() => {
    if (image && image !== prevImageRef.current && size.width > 0 && size.height > 0) {
      const fit = fitToView(imageWidth, imageHeight, size.width, size.height);
      useViewportStore.getState().setViewport(fit);

      // Also apply to stage imperatively for immediate effect
      const stage = stageRef.current;
      if (stage) {
        stage.scale({ x: fit.zoom, y: fit.zoom });
        stage.position({ x: fit.panX, y: fit.panY });
        stage.batchDraw();
      }
    }
    prevImageRef.current = image;
  }, [image, imageWidth, imageHeight, size.width, size.height]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          scaleX={zoom}
          scaleY={zoom}
          x={panX}
          y={panY}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Map layer — no event listening for performance */}
          <Layer listening={false}>
            {image && (
              <KonvaImage
                image={image}
                width={imageWidth}
                height={imageHeight}
                perfectDrawEnabled={false}
              />
            )}
          </Layer>

          {/* Course overprint layer — will be added in Phase 1 */}
          <Layer>
            {/* Controls, legs, start/finish will render here */}
          </Layer>
        </Stage>
      )}
      {image && (
        <>
          <MapSettingsPanel />
          <ZoomControls
            containerWidth={size.width}
            containerHeight={size.height}
          />
        </>
      )}
    </div>
  );
}
