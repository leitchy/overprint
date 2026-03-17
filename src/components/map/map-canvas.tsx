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
import { PrintBoundary } from '@/components/map/print-boundary';

// Module-level stage reference — allows toolbar and export utilities to access
// the Konva stage without prop drilling.
let _stageInstance: StageType | null = null;

/** Returns the current Konva Stage instance, or null if unmounted. */
export function getStageInstance(): StageType | null {
  return _stageInstance;
}

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

  // Get active course — defensive: treat stale activeCourseId as null
  const activeCourse = event?.courses.find((c) => c.id === activeCourseId) ?? null;

  // Background courses — all courses except the active one
  const backgroundCourses = event?.courses.filter((c) => c.id !== activeCourseId) ?? [];

  // Control IDs in the active course — used to hide their shapes in background
  // renderers (legs still draw through them, but shapes are rendered by the active course)
  const activeControlIds = new Set(activeCourse?.controls.map((cc) => cc.controlId) ?? []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={(node) => {
            // Keep both the local ref and the module-level instance in sync
            (stageRef as React.MutableRefObject<StageType | null>).current = node;
            _stageInstance = node;
          }}
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
          {/* Map layer — dimmed when any course has controls for overprint visibility */}
          <Layer
            listening={false}
            opacity={
              event?.courses.some((c) => c.controls.length > 0) ? 0.6 : 1
            }
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

          {/* Course overprint layer — background courses (grey) then active course (purple).
              Background controls render AFTER active course so they get hit priority
              for shared control reuse in addControl mode. */}
          <Layer>
            {activeCourse && dimensions && event && activeCourseId && (
              <CourseRenderer
                course={activeCourse}
                controls={event.controls}
                dimensions={dimensions}
                selectedControlId={selectedControlId}
                draggable={activeTool === 'pan'}
                allowLegInsert={activeTool === 'addControl'}
                courseId={activeCourseId}
                onSelectControl={(id) => {
                  useEventStore.getState().setSelectedControl(id);
                }}
                onDragControlEnd={(id, x, y) => {
                  useEventStore.getState().updateControlPosition(id, { x, y });
                }}
                onNumberDragEnd={(controlIndex, offset) => {
                  if (activeCourseId) {
                    useEventStore.getState().setNumberOffset(activeCourseId, controlIndex, offset);
                  }
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

            {/* Background courses — rendered AFTER active course in same layer
                so their controls get hit priority over active course's leg lines
                for shared control reuse in addControl mode.
                Exclude controls already in the active course to prevent background
                shapes from blocking drag/selection on the active version. */}
            {dimensions && event && backgroundCourses.map((bgCourse) => (
              <CourseRenderer
                key={bgCourse.id}
                course={bgCourse}
                controls={event.controls}
                hideControlIds={activeControlIds}
                dimensions={dimensions}
                selectedControlId={null}
                draggable={false}
                allowLegInsert={false}
                color="#C0C0C0"
                showNumbers={false}
                clickable={activeTool === 'addControl'}
                onSelectControl={(controlId) => {
                  const store = useEventStore.getState();
                  if (!store.activeCourseId || !activeCourse) return;
                  store.insertControlInCourse(
                    store.activeCourseId,
                    controlId,
                    activeCourse.controls.length,
                  );
                }}
                onDragControlEnd={() => { /* no-op */ }}
              />
            ))}

            {/* Print boundary — dashed rectangle showing the printable area at
                the current print scale. Non-interactive; rendered on top of all
                course shapes so it is always visible. */}
            <PrintBoundary />
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
      {event && (
        <CoursePanel
          course={activeCourse}
          controls={event.controls}
          courseId={activeCourseId}
          selectedControlId={selectedControlId}
        />
      )}
    </div>
  );
}
