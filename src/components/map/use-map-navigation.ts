import { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';
import type { Stage as StageType } from 'konva/lib/Stage';
import { useViewportStore, MIN_ZOOM, MAX_ZOOM } from '@/stores/viewport-store';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import { generateSpecialItemId } from '@/utils/id';

// Enable hit detection during drag for correct touch events
Konva.hitOnDragEnabled = true;

const ZOOM_SENSITIVITY = 1.05;
const SYNC_DEBOUNCE_MS = 100;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

interface UseMapNavigationOptions {
  stageRef: React.RefObject<StageType | null>;
}

export function useMapNavigation({ stageRef }: UseMapNavigationOptions) {
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastTouchDistRef = useRef(0);
  const lastTouchCenterRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Debounced sync to Zustand — only on gesture end
  const syncToStore = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      useViewportStore.getState().setViewport({
        zoom: stage.scaleX(),
        panX: stage.x(),
        panY: stage.y(),
      });
    }, SYNC_DEBOUNCE_MS);
  }, [stageRef]);

  // Focal-point zoom — mutate Stage imperatively for performance
  const applyZoom = useCallback(
    (newZoom: number, pointerX: number, pointerY: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const oldZoom = stage.scaleX();
      const clamped = clampZoom(newZoom);

      const newX = pointerX - (pointerX - stage.x()) * (clamped / oldZoom);
      const newY = pointerY - (pointerY - stage.y()) * (clamped / oldZoom);

      stage.scale({ x: clamped, y: clamped });
      stage.position({ x: newX, y: newY });
      stage.batchDraw();
      syncToStore();
    },
    [stageRef, syncToStore],
  );

  // Wheel handler — zoom or scroll
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // ctrlKey = trackpad pinch or Ctrl+scroll
      if (e.evt.ctrlKey || e.evt.metaKey) {
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const factor = Math.pow(ZOOM_SENSITIVITY, direction * 3);
        applyZoom(stage.scaleX() * factor, pointer.x, pointer.y);
      } else {
        // Regular scroll = pan
        stage.position({
          x: stage.x() - e.evt.deltaX,
          y: stage.y() - e.evt.deltaY,
        });
        stage.batchDraw();
        syncToStore();
      }
    },
    [stageRef, applyZoom, syncToStore],
  );

  // Mouse down — tool-aware: pan mode vs add-control mode
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;

      const isLeft = e.evt.button === 0;
      const isMiddle = e.evt.button === 1;

      // Middle button always pans regardless of tool
      if (isMiddle) {
        e.evt.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        return;
      }

      if (!isLeft) return;

      // If click landed on a shape (not empty canvas), let shape handle it
      if (e.target !== e.target.getStage()) return;

      const activeTool = useToolStore.getState().activeTool;

      if (activeTool.type === 'addControl') {
        // Add control at click position (in map-image coordinates)
        e.evt.preventDefault();
        const pos = stage.getRelativePointerPosition();
        if (pos) {
          useEventStore.getState().addControlToCourse({ x: pos.x, y: pos.y });
        }
      } else if (activeTool.type === 'addSpecialItem') {
        // Place a special item at click position
        e.evt.preventDefault();
        const pos = stage.getRelativePointerPosition();
        if (pos) {
          const itemType = activeTool.itemType;
          const store = useEventStore.getState();

          // Convert mm to map pixels for text sizing
          const dpi = useEventStore.getState().event?.mapFile?.dpi ?? 150;
          const mmToPixels = (mm: number) => (mm * dpi) / 25.4;

          if (itemType === 'text') {
            const text = window.prompt('Text:');
            if (text && text.trim()) {
              store.addSpecialItem({
                id: generateSpecialItemId(),
                type: 'text',
                text: text.trim(),
                fontSize: mmToPixels(4), // 4mm text height in map pixels
                position: { x: pos.x, y: pos.y },
              });
            }
          } else if (itemType === 'line') {
            // Place a default-length line (100px in map coords)
            store.addSpecialItem({
              id: generateSpecialItemId(),
              type: 'line',
              position: { x: pos.x, y: pos.y },
              endPosition: { x: pos.x + mmToPixels(30), y: pos.y },
            });
          } else if (itemType === 'rectangle') {
            // Place a default-sized rectangle (30x20mm in map coords)
            store.addSpecialItem({
              id: generateSpecialItemId(),
              type: 'rectangle',
              position: { x: pos.x, y: pos.y },
              endPosition: { x: pos.x + mmToPixels(30), y: pos.y + mmToPixels(20) },
            });
          } else {
            // IOF symbols — click to place
            store.addSpecialItem({
              id: generateSpecialItemId(),
              type: itemType,
              position: { x: pos.x, y: pos.y },
            });
          }

          // Switch back to Pan mode after placing so user can immediately move/edit
          useToolStore.getState().setTool({ type: 'pan' });
        }
      } else if (activeTool.type === 'pan') {
        // Pan mode — start panning, deselect any selected control
        e.evt.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        useEventStore.getState().setSelectedControl(null);
      }
    },
    [stageRef],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isPanningRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;

      const dx = e.evt.clientX - panStartRef.current.x;
      const dy = e.evt.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };

      stage.position({
        x: stage.x() + dx,
        y: stage.y() + dy,
      });
      stage.batchDraw();
    },
    [stageRef],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      syncToStore();
    }
  }, [syncToStore]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length === 1) {
        // Single finger — start pan
        const touch = touches[0];
        if (touch) {
          isPanningRef.current = true;
          panStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
      } else if (touches.length === 2) {
        // Two fingers — start pinch
        isPanningRef.current = false;
        const t0 = touches[0];
        const t1 = touches[1];
        if (t0 && t1) {
          const dx = t0.clientX - t1.clientX;
          const dy = t0.clientY - t1.clientY;
          lastTouchDistRef.current = Math.sqrt(dx * dx + dy * dy);
          lastTouchCenterRef.current = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
          };
        }
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const touches = e.evt.touches;

      if (touches.length === 1 && isPanningRef.current) {
        // Single finger pan
        const touch = touches[0];
        if (touch) {
          const dx = touch.clientX - panStartRef.current.x;
          const dy = touch.clientY - panStartRef.current.y;
          panStartRef.current = { x: touch.clientX, y: touch.clientY };
          stage.position({ x: stage.x() + dx, y: stage.y() + dy });
          stage.batchDraw();
        }
      } else if (touches.length === 2) {
        // Two finger pinch zoom
        const t0 = touches[0];
        const t1 = touches[1];
        if (t0 && t1) {
          const dx = t0.clientX - t1.clientX;
          const dy = t0.clientY - t1.clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const center = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
          };

          if (lastTouchDistRef.current > 0) {
            const scale = dist / lastTouchDistRef.current;
            applyZoom(stage.scaleX() * scale, center.x, center.y);
          }

          lastTouchDistRef.current = dist;
          lastTouchCenterRef.current = center;
        }
      }
    },
    [stageRef, applyZoom],
  );

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    lastTouchDistRef.current = 0;
    syncToStore();
  }, [syncToStore]);

  const ARROW_PAN_STEP = 50;

  // Keyboard: Space tracking + arrow key panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in form elements
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        spaceDownRef.current = true;
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;

      // Delete/Backspace — remove selected control, or last control if none selected
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const { selectedControlId, activeCourseId, event } = useEventStore.getState();
        if (!activeCourseId || !event) return;

        const course = event.courses.find((c) => c.id === activeCourseId);
        if (!course || course.controls.length === 0) return;

        e.preventDefault();

        if (selectedControlId) {
          // Delete the selected control
          useEventStore.getState().removeControlFromCourse(activeCourseId, selectedControlId);
        } else {
          // No selection — delete the most recent (last) control
          const lastCc = course.controls[course.controls.length - 1];
          if (lastCc) {
            useEventStore.getState().removeControlFromCourse(activeCourseId, lastCc.controlId);
          }
        }
        return;
      }

      let dx = 0;
      let dy = 0;
      switch (e.code) {
        case 'ArrowLeft':  dx = ARROW_PAN_STEP; break;
        case 'ArrowRight': dx = -ARROW_PAN_STEP; break;
        case 'ArrowUp':    dy = ARROW_PAN_STEP; break;
        case 'ArrowDown':  dy = -ARROW_PAN_STEP; break;
        default: return;
      }

      e.preventDefault();
      stage.position({ x: stage.x() + dx, y: stage.y() + dy });
      stage.batchDraw();
      syncToStore();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [stageRef, syncToStore]);

  // Cleanup sync timeout
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  return {
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

/**
 * Calculate viewport to fit an image within a container.
 */
export function fitToView(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 20,
): { zoom: number; panX: number; panY: number } {
  const availWidth = containerWidth - padding * 2;
  const availHeight = containerHeight - padding * 2;

  if (availWidth <= 0 || availHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  const zoom = clampZoom(
    Math.min(availWidth / imageWidth, availHeight / imageHeight),
  );

  const panX = (containerWidth - imageWidth * zoom) / 2;
  const panY = (containerHeight - imageHeight * zoom) / 2;

  return { zoom, panX, panY };
}
