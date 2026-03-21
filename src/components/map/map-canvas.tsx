import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line as KonvaLine, Image as KonvaImage, Rect as KonvaRect } from 'react-konva';
import type { Stage as StageType } from 'konva/lib/Stage';
import type Konva from 'konva';
import { useCanvasSize } from './use-canvas-size';
import { useMapNavigation, fitToView } from './use-map-navigation';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { overprintPixelDimensions } from '@/core/geometry/overprint-dimensions';
import { OVERPRINT_PURPLE, SCREEN_LINE_MULTIPLIER } from '@/core/models/constants';
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
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useIsTouch } from '@/hooks/use-is-touch';
import { SlideDrawer } from '@/components/ui/slide-drawer';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ControlContextMenu } from '@/components/course/control-context-menu';
import { CenterReticle } from '@/components/map/center-reticle';
import { NudgePad } from '@/components/ui/nudge-pad';
import { GpsBridge } from '@/components/map/gps-bridge';
import { GpsPositionIndicator } from '@/components/map/gps-position-layer';
import { GpsStatusChip } from '@/components/map/gps-status-chip';
import { CalibrationPanel } from '@/components/map/calibration-panel';
import { GpsPlaceButton } from '@/components/map/gps-place-button';
import { hapticConfirm } from '@/utils/haptics';

// Module-level stage reference — allows toolbar and export utilities to access
// the Konva stage without prop drilling.
let _stageInstance: StageType | null = null;

/** Returns the current Konva Stage instance, or null if unmounted. */
export function getStageInstance(): StageType | null {
  return _stageInstance;
}

export function MapCanvas() {
  /** Shared gesture-active flag — suppresses resize/store updates during touch gestures */
  const gestureActiveRef = useRef(false);
  /** Set true after a pinch gesture — suppresses the onDblTap that iOS fires when lifting two fingers */
  const wasPinchRef = useRef(false);
  const [containerRef, size] = useCanvasSize(gestureActiveRef);
  const stageRef = useRef<StageType>(null);
  const rubberBandRef = useRef<Konva.Line>(null);
  const courseLayerRef = useRef<Konva.Layer>(null);
  const rubberBandLayerRef = useRef<Konva.Layer>(null);
  const image = useMapImageStore((s) => s.image);
  const imageWidth = useMapImageStore((s) => s.imageWidth);
  const imageHeight = useMapImageStore((s) => s.imageHeight);
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
  const visibleCourseIds = useEventStore((s) => s.visibleCourseIds);

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
  } = useMapNavigation({ stageRef, gestureActiveRef });

  // Force re-render during print area drag so the preview rectangle updates
  const [printAreaPreview, setPrintAreaPreview] = useState<{
    minX: number; minY: number; maxX: number; maxY: number;
  } | null>(null);

  // Auto-fit when image first loads (or when container size first becomes available).
  // Deliberately ignores subsequent size changes to prevent pinch-zoom bounce-back —
  // iOS triggers container resize during touch gestures.
  const fittedImageRef = useRef<typeof image>(null);
  const hasFittedRef = useRef(false);

  // Reset the fit flag when the image changes (new map loaded).
  // MUST be declared before the fit effect so it runs first in the same commit.
  useEffect(() => {
    if (image !== fittedImageRef.current) {
      hasFittedRef.current = false;
    }
  }, [image]);

  useEffect(() => {
    if (!image || hasFittedRef.current) return;
    if (size.width <= 0 || size.height <= 0) return;

    const fit = fitToView(imageWidth, imageHeight, size.width, size.height);
    useViewportStore.getState().setViewport(fit);

    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: fit.zoom, y: fit.zoom });
      stage.position({ x: fit.panX, y: fit.panY });
      stage.batchDraw();
    }

    fittedImageRef.current = image;
    hasFittedRef.current = true;
  }, [image, imageWidth, imageHeight, size.width, size.height]);

  // Apply viewport store changes imperatively to the stage.
  // The Stage is intentionally NOT driven by controlled scaleX/scaleY/x/y props —
  // doing so causes a bounce-back on iOS pinch-zoom because React re-renders the
  // Stage with stale store values while the debounced syncToStore is still pending.
  // Instead, navigation mutates the stage directly and writes back to the store once
  // the gesture ends. This subscriber handles external viewport changes (e.g. +/- zoom
  // buttons, fit-to-view) that originate from the store rather than from gestures.
  useEffect(() => {
    return useViewportStore.subscribe((state) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (gestureActiveRef.current) return;
      const tol = 0.0001;
      if (
        Math.abs(stage.scaleX() - state.zoom) > tol ||
        Math.abs(stage.x() - state.panX) > tol ||
        Math.abs(stage.y() - state.panY) > tol
      ) {
        stage.scale({ x: state.zoom, y: state.zoom });
        stage.position({ x: state.panX, y: state.panY });
        stage.batchDraw();
      }
    });
  }, [stageRef]);

  // Cursor management based on tool
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    if (activeTool.type === 'addControl' || activeTool.type === 'addSpecialItem' || activeTool.type === 'setPrintArea' || activeTool.type === 'calibrate') {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = 'default';
    }
  }, [activeTool]);

  // Prevent iOS/Chrome from handling touch gestures on the canvas.
  // Only preventDefault on touchmove (not touchstart — that blocks Konva's touchend).
  // Set gesture flag here since this fires before Konva's handler.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.touchAction = 'none';

    const onStart = () => {
      gestureActiveRef.current = true;
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2) wasPinchRef.current = true;
    };
    const onEnd = () => {
      // Sync is done in Konva's handleTouchEnd (fires before Konva resets draggables).
      // Reset wasPinchRef after a short delay — allows onDblTap to see the flag
      // and suppress the pinch-end false double-tap, then clears it so future
      // genuine double-taps work.
      setTimeout(() => { wasPinchRef.current = false; }, 300);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [containerRef]);

  // Set multiply blend mode on overprint layers so dark map features show through purple.
  // Uses Konva internal _canvas (underscore convention) — stable across Konva versions.
  useEffect(() => {
    for (const ref of [courseLayerRef, rubberBandLayerRef]) {
      const canvas = (ref.current?.getCanvas() as unknown as { _canvas?: HTMLCanvasElement })?._canvas;
      if (canvas) canvas.style.mixBlendMode = 'multiply';
    }
  }, []);

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

  // Rubber-band line — imperative update on mouse move (no React re-renders)
  const updateRubberBand = useCallback(() => {
    const line = rubberBandRef.current;
    if (!line) return;

    const stage = stageRef.current;
    if (!stage || activeTool.type !== 'addControl') {
      if (line.visible()) { line.visible(false); line.getLayer()?.batchDraw(); }
      return;
    }

    const pos = stage.getRelativePointerPosition();
    const state = useEventStore.getState();
    const course = state.event?.courses.find((c) => c.id === state.activeCourseId);

    if (!pos || !course || course.controls.length === 0 || course.courseType === 'score') {
      if (line.visible()) { line.visible(false); line.getLayer()?.batchDraw(); }
      return;
    }

    const lastCC = course.controls[course.controls.length - 1]!;
    const ctrl = state.event?.controls[lastCC.controlId];
    if (!ctrl) {
      if (line.visible()) { line.visible(false); line.getLayer()?.batchDraw(); }
      return;
    }

    line.points([ctrl.position.x, ctrl.position.y, pos.x, pos.y]);
    line.visible(true);
    line.getLayer()?.batchDraw();
  }, [activeTool.type]);

  // Hide rubber-band when tool changes or no active course
  useEffect(() => {
    const line = rubberBandRef.current;
    if (line && activeTool.type !== 'addControl') {
      line.visible(false);
      line.getLayer()?.batchDraw();
    }
  }, [activeTool.type]);

  const handleMouseLeave = useCallback(() => {
    const line = rubberBandRef.current;
    if (line && line.visible()) {
      line.visible(false);
      line.getLayer()?.batchDraw();
    }
  }, []);

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
    () => courses?.filter((c) => c.id !== activeCourseId && visibleCourseIds[c.id]) ?? [],
    [courses, activeCourseId, visibleCourseIds],
  );
  const activeControlIds = useMemo(
    () => new Set(activeCourse?.controls.map((cc) => cc.controlId) ?? []),
    [activeCourse],
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

  const breakpoint = useBreakpoint();
  const isTouch = useIsTouch();
  const mobilePanelOpen = useToolStore((s) => s.mobilePanelOpen);
  const toggleMobilePanel = useToolStore((s) => s.toggleMobilePanel);

  // Context menu for long-press on controls (touch only)
  const [contextMenu, setContextMenu] = useState<{
    controlId: ControlId;
    screenX: number;
    screenY: number;
  } | null>(null);

  const handleLongPressControl = useCallback((controlId: ControlId, screenX: number, screenY: number) => {
    setContextMenu({ controlId, screenX, screenY });
  }, []);

  return (
    <div ref={containerRef} data-map-container className="relative h-full w-full overflow-hidden touch-none">
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={(node) => {
            // Keep both the local ref and the module-level instance in sync
            (stageRef as React.MutableRefObject<StageType | null>).current = node;
            _stageInstance = node;
          }}
          width={size.width}
          height={size.height}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => { handleMouseMove(e); handleMouseMoveForPreview(); updateRubberBand(); }}
          onMouseUp={() => { handleMouseUp(); handleMouseMoveForPreview(); }}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDblTap={(e) => {
            // Double-tap to fit map — only on empty canvas in pan mode.
            // IMPORTANT: suppress after a pinch gesture — lifting two fingers
            // registers as a double-tap on iOS, which would reset the zoom.
            if (activeTool.type !== 'pan') return;
            if (wasPinchRef.current) { wasPinchRef.current = false; return; }
            const stage = stageRef.current;
            if (!stage || e.target !== stage) return;
            const fit = fitToView(imageWidth, imageHeight, size.width, size.height);
            useViewportStore.getState().setViewport(fit);
            stage.scale({ x: fit.zoom, y: fit.zoom });
            stage.position({ x: fit.panX, y: fit.panY });
            stage.batchDraw();
            hapticConfirm();
          }}
        >
          {/* Map layer — dimmed when controls are visible for overprint readability */}
          <Layer
            listening={false}
            opacity={1}
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

          {/* Course overprint layer — multiply blend so dark map features show through */}
          <Layer ref={courseLayerRef}>
            {viewMode === 'allControls' ? (
              /* All-controls view: all controls (no legs) + active course legs */
              <>
                {/* Active course legs rendered first (behind) in grey */}
                {activeCourse && dimensions && controls && (
                  <CourseRenderer
                    course={activeCourse}
                    controls={controls}
                    dimensions={dimensions}
                    selectedControlId={null}
                    draggable={false}
                    allowLegInsert={false}
                    showNumbers={false}
                    color="#C0C0C0"
                    onSelectControl={() => {}}
                    onDragControlEnd={() => {}}
                  />
                )}
                {/* All controls overlay (no legs, with numbers) */}
                {allControlsCourse && dimensions && controls && (
                  <CourseRenderer
                    course={allControlsCourse}
                    controls={controls}
                    dimensions={dimensions}
                    selectedControlId={selectedControlId}
                    draggable={false}
                    allowLegInsert={false}
                    showNumbers={true}
                    onSelectControl={handleSelectControl}
                    onDragControlEnd={() => {}}
                  />
                )}
              </>
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
                    onLongPressControl={isTouch ? handleLongPressControl : undefined}
                    onNumberDragEnd={(controlIndex, offset) => {
                      if (activeCourseId) {
                        useEventStore.getState().setNumberOffset(activeCourseId, controlIndex, offset);
                      }
                    }}
                    onInsertOnLeg={(position, afterIndex) => {
                      const store = useEventStore.getState();
                      if (!store.activeCourseId || !store.event) return;
                      const code = Math.max(
                        30,
                        ...Object.values(store.event.controls).map((c) => c.code),
                      ) + 1;
                      const control = createControl(code, position);
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
                    editLegs={activeTool.type === 'pan'}
                    onAddBendPoint={(controlIndex, position, insertAt) => {
                      if (activeCourseId) {
                        useEventStore.getState().addBendPoint(activeCourseId, controlIndex, insertAt, position);
                      }
                    }}
                    onBendPointDragEnd={(controlIndex, bendIndex, position) => {
                      if (activeCourseId) {
                        const store = useEventStore.getState();
                        const course = store.event?.courses.find((c) => c.id === activeCourseId);
                        const cc = course?.controls[controlIndex];
                        if (cc?.bendPoints) {
                          const updated = [...cc.bendPoints];
                          updated[bendIndex] = position;
                          store.setBendPoints(activeCourseId, controlIndex, updated);
                        }
                      }
                    }}
                    onRemoveBendPoint={(controlIndex, bendIndex) => {
                      if (activeCourseId) {
                        useEventStore.getState().removeBendPoint(activeCourseId, controlIndex, bendIndex);
                      }
                    }}
                    onGapDragEnd={(controlIndex, gapIndex, gap) => {
                      if (activeCourseId) {
                        useEventStore.getState().updateLegGap(activeCourseId, controlIndex, gapIndex, gap);
                      }
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

          {/* Rubber-band preview line — multiply blend to match course layer */}
          <Layer ref={rubberBandLayerRef} listening={false}>
            <KonvaLine
              ref={rubberBandRef}
              points={[]}
              stroke={OVERPRINT_PURPLE}
              strokeWidth={2 * SCREEN_LINE_MULTIPLIER}
              dash={[8, 4]}
              visible={false}
              listening={false}
            />
          </Layer>

          {/* Special items layer — interactive annotations above the overprint */}
          <SpecialItemsLayer />

          {/* Overlay layer — GPS dot, print boundary, print area preview (non-interactive) */}
          <Layer listening={false}>
            <GpsPositionIndicator />
            {viewMode === 'course' && <PrintBoundary />}
            {printAreaPreview && (
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
            )}
          </Layer>
        </Stage>
      )}
      {/* GPS bridge (non-rendering) — connects GPS hook to geo-transform pipeline */}
      <GpsBridge />
      {/* Calibration panel for non-georeferenced maps */}
      <CalibrationPanel />
      {/* GPS status chip — DOM overlay */}
      <GpsStatusChip />
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
      {/* Course panel — desktop: floating panel, tablet: slide drawer, phone: bottom sheet */}
      {hasEvent && controls && (() => {
        const panelProps = { course: activeCourse, controls, courseId: activeCourseId, selectedControlId };

        if (breakpoint === 'lg') {
          return <CoursePanel {...panelProps} />;
        }

        return (
          <>
            {/* Drawer/sheet toggle button */}
            {mobilePanelOpen !== 'course' && (
              <button
                onClick={() => toggleMobilePanel('course')}
                className="absolute right-0 top-16 z-30 rounded-l-lg bg-white/90 px-2 py-3 text-xs font-medium text-gray-600 shadow"
              >
                {activeCourse?.name ?? 'Courses'} ›
              </button>
            )}

            {breakpoint === 'md' ? (
              <SlideDrawer
                open={mobilePanelOpen === 'course'}
                onClose={() => toggleMobilePanel('course')}
                side="right"
                width="260px"
              >
                <CoursePanel {...panelProps} embedded />
              </SlideDrawer>
            ) : (
              <BottomSheet
                open={mobilePanelOpen === 'course'}
                onClose={() => toggleMobilePanel('course')}
                snapPoints={[0.45, 0.85]}
              >
                <CoursePanel {...panelProps} embedded />
              </BottomSheet>
            )}
          </>
        );
      })()}

      {/* Nudge pad for fine positioning (touch only) */}
      {isTouch && selectedControlId && <NudgePad />}

      {/* GPS "Place at GPS" button (tablet/desktop only — phone uses CenterReticle) */}
      {breakpoint !== 'sm' && <GpsPlaceButton />}

      {/* Center-reticle placement mode (phone only) */}
      {breakpoint === 'sm' && isTouch && activeTool.type === 'addControl' && (
        <CenterReticle
          stageRef={stageRef}
          containerWidth={size.width}
          containerHeight={size.height}
        />
      )}

      {/* Long-press context menu (touch only) */}
      {contextMenu && activeCourseId && (
        <ControlContextMenu
          menu={contextMenu}
          courseId={activeCourseId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
