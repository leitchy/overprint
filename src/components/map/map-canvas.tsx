import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect as KonvaRect } from 'react-konva';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useCanvasSize } from './use-canvas-size';
import { useMapNavigation, fitToView } from './use-map-navigation';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { overprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { createControl } from '@/core/models/defaults';
import type { ControlId, CourseId } from '@/utils/id';
import type { Course } from '@/core/models/types';
import { CourseRenderer } from '@/components/course/course-renderer';
import { CoursePanel } from '@/components/course/course-panel';
import { ZoomControls } from '@/components/ui/zoom-controls';
import { MapSettingsPanel } from '@/components/ui/map-settings-panel';
import { PrintBoundary } from '@/components/map/print-boundary';
import { TextFormatToolbar } from '@/components/map/text-format-toolbar';
import { InlineTextEditor } from '@/components/map/inline-text-editor';
import { SpecialItemsLayer } from '@/components/map/special-items-layer';

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

  // Narrow event store selectors — each subscribes only to its slice
  const courses = useEventStore((s) => s.event?.courses);
  const controls = useEventStore((s) => s.event?.controls);
  const settings = useEventStore((s) => s.event?.settings);
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const hasEvent = useEventStore((s) => s.event !== null);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const selectedControlId = useEventStore((s) => s.selectedControlId);
  const viewMode = useEventStore((s) => s.viewMode);

  const {
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    printAreaDragRef,
    isPrintAreaDraggingRef,
  } = useMapNavigation({ stageRef });

  // Force re-render during print area drag so the preview rectangle updates
  const [printAreaPreview, setPrintAreaPreview] = useState<{
    minX: number; minY: number; maxX: number; maxY: number;
  } | null>(null);

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
    if (activeTool.type === 'addControl' || activeTool.type === 'addSpecialItem' || activeTool.type === 'setPrintArea') {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = 'default';
    }
  }, [activeTool]);

  // Track print area drag for preview rectangle
  const handleMouseMoveForPreview = useCallback(() => {
    if (isPrintAreaDraggingRef.current && printAreaDragRef.current) {
      const drag = printAreaDragRef.current;
      setPrintAreaPreview({
        minX: Math.min(drag.startX, drag.endX),
        minY: Math.min(drag.startY, drag.endY),
        maxX: Math.max(drag.startX, drag.endX),
        maxY: Math.max(drag.startY, drag.endY),
      });
    } else {
      setPrintAreaPreview(null);
    }
  }, [isPrintAreaDraggingRef, printAreaDragRef]);

  // Compute overprint dimensions — only recomputes when settings or dpi change
  const dpi = mapFile?.dpi ?? 150;
  const dimensions = useMemo(
    () => (settings ? overprintPixelDimensions(settings, dpi) : null),
    [settings, dpi],
  );

  // Derived course collections — memoised to avoid downstream re-renders
  const activeCourse = useMemo(
    () => courses?.find((c) => c.id === activeCourseId) ?? null,
    [courses, activeCourseId],
  );
  const backgroundCourses = useMemo(
    () => courses?.filter((c) => c.id !== activeCourseId) ?? [],
    [courses, activeCourseId],
  );
  const activeControlIds = useMemo(
    () => new Set(activeCourse?.controls.map((cc) => cc.controlId) ?? []),
    [activeCourse],
  );
  const hasControls = useMemo(
    () => courses?.some((c) => c.controls.length > 0) ?? false,
    [courses],
  );

  // Synthetic "all controls" course — used when viewMode === 'allControls'
  const allControlsCourse = useMemo((): Course | null => {
    if (viewMode !== 'allControls' || !controls) return null;
    const allControls = Object.values(controls);
    if (allControls.length === 0) return null;
    return {
      id: 'all-controls' as CourseId,
      name: 'All controls',
      courseType: 'score',
      controls: allControls.map((c) => ({
        controlId: c.id,
        type: 'control' as const,
      })),
      settings: {},
    };
  }, [viewMode, controls]);

  // Stable callbacks for CourseRenderer — prevents memo'd children from re-rendering
  const handleSelectControl = useCallback((id: ControlId) => {
    useEventStore.getState().setSelectedControl(id);
    useToolStore.getState().setSelectedSpecialItem(null); // deselect any special item
  }, []);

  const handleDragControlEnd = useCallback((id: ControlId, x: number, y: number) => {
    useEventStore.getState().updateControlPosition(id, { x, y });
  }, []);

  return (
    <div ref={containerRef} data-map-container className="relative h-full w-full overflow-hidden">
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
          onMouseMove={(e) => { handleMouseMove(e); handleMouseMoveForPreview(); }}
          onMouseUp={() => { handleMouseUp(); handleMouseMoveForPreview(); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Map layer — dimmed when controls are visible for overprint readability */}
          <Layer
            listening={false}
            opacity={(hasControls || (viewMode === 'allControls' && allControlsCourse !== null)) ? 0.6 : 1}
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

          {/* Course overprint layer — branches on viewMode */}
          <Layer>
            {viewMode === 'allControls' ? (
              /* All-controls view: synthetic score course with no legs */
              allControlsCourse && dimensions && controls && (
                <CourseRenderer
                  course={allControlsCourse}
                  controls={controls}
                  dimensions={dimensions}
                  selectedControlId={selectedControlId}
                  draggable={false}
                  allowLegInsert={false}
                  showNumbers={true}
                  onSelectControl={handleSelectControl}
                  onDragControlEnd={() => { /* no-op */ }}
                />
              )
            ) : (
              /* Course view: active course (purple) + background courses (grey).
                 Background controls render AFTER active course so they get hit
                 priority for shared control reuse in addControl mode. */
              <>
                {activeCourse && dimensions && controls && activeCourseId && (
                  <CourseRenderer
                    course={activeCourse}
                    controls={controls}
                    dimensions={dimensions}
                    selectedControlId={selectedControlId}
                    draggable={activeTool.type === 'pan'}
                    allowLegInsert={activeTool.type === 'addControl'}
                    courseId={activeCourseId}
                    onSelectControl={handleSelectControl}
                    onDragControlEnd={handleDragControlEnd}
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
                {dimensions && controls && backgroundCourses.map((bgCourse) => (
                  <CourseRenderer
                    key={bgCourse.id}
                    course={bgCourse}
                    controls={controls}
                    hideControlIds={activeControlIds}
                    dimensions={dimensions}
                    selectedControlId={null}
                    draggable={false}
                    allowLegInsert={false}
                    color="#C0C0C0"
                    showNumbers={false}
                    clickable={activeTool.type === 'addControl'}
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
              </>
            )}
          </Layer>

          {/* Special items layer — interactive annotations above the overprint */}
          <SpecialItemsLayer />

          {/* Print boundary layer — non-interactive, only in course view */}
          {viewMode === 'course' && (
            <Layer listening={false}>
              <PrintBoundary />
            </Layer>
          )}

          {/* Print area drag preview — shown while dragging the setPrintArea tool */}
          {printAreaPreview && (
            <Layer listening={false}>
              <KonvaRect
                x={printAreaPreview.minX}
                y={printAreaPreview.minY}
                width={printAreaPreview.maxX - printAreaPreview.minX}
                height={printAreaPreview.maxY - printAreaPreview.minY}
                fill="rgba(59, 130, 246, 0.15)"
                stroke="rgba(59, 130, 246, 0.7)"
                strokeWidth={2}
                dash={[8, 4]}
                perfectDrawEnabled={false}
              />
            </Layer>
          )}
        </Stage>
      )}
      <TextFormatToolbar />
      <InlineTextEditor />
      {image && (
        <>
          <MapSettingsPanel />
          <ZoomControls
            containerWidth={size.width}
            containerHeight={size.height}
          />
        </>
      )}
      {hasEvent && controls && (
        <CoursePanel
          course={activeCourse}
          controls={controls}
          courseId={activeCourseId}
          selectedControlId={selectedControlId}
        />
      )}
    </div>
  );
}
