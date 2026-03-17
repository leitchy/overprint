import { useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useCanvasSize } from './use-canvas-size';
import { useMapNavigation, fitToView } from './use-map-navigation';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { overprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { createControl } from '@/core/models/defaults';
import { CourseRenderer } from '@/components/course/course-renderer';
import { CoursePanel } from '@/components/course/course-panel';
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
  const activeTool = useToolStore((s) => s.activeTool);

  // Event store selectors
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const selectedControlId = useEventStore((s) => s.selectedControlId);

  const {
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useMapNavigation({ stageRef });

  // Auto-fit when image first loads (or when container size becomes available)
  const fittedImageRef = useRef<typeof image>(null);
  useEffect(() => {
    // Skip if no image, or already fitted this image, or container not sized yet
    if (!image || image === fittedImageRef.current || size.width <= 0 || size.height <= 0) return;

    const fit = fitToView(imageWidth, imageHeight, size.width, size.height);
    useViewportStore.getState().setViewport(fit);

    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: fit.zoom, y: fit.zoom });
      stage.position({ x: fit.panX, y: fit.panY });
      stage.batchDraw();
    }

    fittedImageRef.current = image;
  }, [image, imageWidth, imageHeight, size.width, size.height]);

  // Cursor management based on tool
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    container.style.cursor = activeTool === 'addControl' ? 'crosshair' : 'default';
  }, [activeTool]);

  // Compute overprint dimensions
  const dpi = event?.mapFile?.dpi ?? 150;
  const dimensions = event ? overprintPixelDimensions(event.settings, dpi) : null;

  // Get active course controls for rendering
  const activeCourse = event?.courses.find((c) => c.id === activeCourseId) ?? null;

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
          {/* Map layer — dimmed when course has controls for overprint visibility */}
          <Layer
            listening={false}
            opacity={activeCourse && activeCourse.controls.length > 0 ? 0.6 : 1}
          >
            {image && (
              <KonvaImage
                image={image}
                width={imageWidth}
                height={imageHeight}
                perfectDrawEnabled={false}
              />
            )}
          </Layer>

          {/* Course overprint layer */}
          <Layer>
            {activeCourse && dimensions && event && (
              <CourseRenderer
                course={activeCourse}
                controls={event.controls}
                dimensions={dimensions}
                selectedControlId={selectedControlId}
                draggable={activeTool === 'pan'}
                allowLegInsert={activeTool === 'addControl'}
                onSelectControl={(id) => {
                  useEventStore.getState().setSelectedControl(id);
                }}
                onDragControlEnd={(id, x, y) => {
                  useEventStore.getState().updateControlPosition(id, { x, y });
                }}
                onInsertOnLeg={(position, afterIndex) => {
                  const store = useEventStore.getState();
                  if (!store.activeCourseId || !store.event) return;
                  // Create a new control and insert at the leg position
                  const code = Math.max(
                    30,
                    ...Object.values(store.event.controls).map((c) => c.code),
                  ) + 1;
                  const control = createControl(code, position);
                  // Add to controls pool via immer mutation
                  useEventStore.setState((state) => {
                    if (state.event) {
                      state.event.controls[control.id] = control;
                    }
                  });
                  store.insertControlInCourse(
                    store.activeCourseId,
                    control.id,
                    afterIndex,
                  );
                }}
              />
            )}
          </Layer>
        </Stage>
      )}
      {image && (
        <>
          <MapSettingsPanel />
          {activeCourse && event && activeCourseId && (
            <CoursePanel
              course={activeCourse}
              controls={event.controls}
              courseId={activeCourseId}
              selectedControlId={selectedControlId}
            />
          )}
          <ZoomControls
            containerWidth={size.width}
            containerHeight={size.height}
          />
        </>
      )}
    </div>
  );
}
