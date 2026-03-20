/**
 * SpecialItemsLayer — Konva Layer rendering all special overlay items
 * (text, line, rectangle, IOF symbols) for the active/all courses.
 *
 * Sits above the course overprint layer and below the print boundary layer.
 * Handles selection, dragging, and placement of new items in addSpecialItem mode.
 */
import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { Layer, Line, Rect, Text, Group, Circle, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import type {
  SpecialItem,
  TextItem,
  LineItem,
  RectangleItem,
  DescriptionBoxItem,
  IofSymbolItem,
  MapPoint,
} from '@/core/models/types';
import { useDescriptionCanvas } from '@/core/descriptions/use-description-canvas';
import { computeGridLayout } from '@/core/descriptions/canvas-description-renderer';
import { generateSpecialItemId } from '@/utils/id';
import { isEditableTarget } from '@/utils/dom';
import { OVERPRINT_PURPLE, SCREEN_LINE_MULTIPLIER } from '@/core/models/constants';

const SELECTION_DASH = [6, 4];
const SELECTION_COLOR = '#FFD700';
const NATURAL_HEIGHT_COLOR = '#4CAF50';
const NATURAL_HEIGHT_SNAP = 8;
const DEFAULT_LINE_WIDTH = 2;
const IOF_SYMBOL_SIZE = 20; // px radius / half-size for IOF symbols

// ---------------------------------------------------------------------------
// IOF symbol renderers (inline Konva shapes)
// ---------------------------------------------------------------------------

interface IofSymbolShapeProps {
  color: string;
  lineWidth: number;
}

/** Out of bounds: hatched square */
function OutOfBoundsShape({ color, lineWidth }: IofSymbolShapeProps) {
  const s = IOF_SYMBOL_SIZE;
  return (
    <>
      <Rect x={-s} y={-s} width={s * 2} height={s * 2} stroke={color} strokeWidth={lineWidth} fill="transparent" listening={false} />
      {/* Diagonal hatch lines */}
      {[-3, -1, 1, 3].map((offset) => (
        <Line
          key={offset}
          points={[offset * (s / 4) - s, -s, offset * (s / 4) + s, s]}
          stroke={color}
          strokeWidth={lineWidth * 0.7}
          listening={false}
        />
      ))}
    </>
  );
}

/** Dangerous area: triangle with ! */
function DangerousAreaShape({ color, lineWidth }: IofSymbolShapeProps) {
  const s = IOF_SYMBOL_SIZE;
  return (
    <>
      <Line
        points={[0, -s, s * 0.9, s * 0.7, -s * 0.9, s * 0.7, 0, -s]}
        closed
        stroke={color}
        strokeWidth={lineWidth}
        fill="transparent"
        listening={false}
      />
      <Text text="!" x={-4} y={-8} fontSize={s} fill={color} listening={false} />
    </>
  );
}

/** Water location: circle with wave */
function WaterLocationShape({ color, lineWidth }: IofSymbolShapeProps) {
  const s = IOF_SYMBOL_SIZE;
  return (
    <>
      <Circle radius={s} stroke={color} strokeWidth={lineWidth} fill="transparent" listening={false} />
      <Line
        points={[-s * 0.5, 0, -s * 0.15, -s * 0.25, s * 0.15, s * 0.25, s * 0.5, 0]}
        stroke={color}
        strokeWidth={lineWidth}
        tension={0.5}
        listening={false}
      />
    </>
  );
}

/** First aid: cross (+) shape */
function FirstAidShape({ color, lineWidth }: IofSymbolShapeProps) {
  const s = IOF_SYMBOL_SIZE * 0.7;
  return (
    <>
      <Line points={[0, -s, 0, s]} stroke={color} strokeWidth={lineWidth * 2} lineCap="round" listening={false} />
      <Line points={[-s, 0, s, 0]} stroke={color} strokeWidth={lineWidth * 2} lineCap="round" listening={false} />
    </>
  );
}

/** Forbidden route: X shape */
function ForbiddenRouteShape({ color, lineWidth }: IofSymbolShapeProps) {
  const s = IOF_SYMBOL_SIZE * 0.7;
  return (
    <>
      <Line points={[-s, -s, s, s]} stroke={color} strokeWidth={lineWidth * 2} lineCap="round" listening={false} />
      <Line points={[s, -s, -s, s]} stroke={color} strokeWidth={lineWidth * 2} lineCap="round" listening={false} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Individual item renderers
// ---------------------------------------------------------------------------

interface ItemProps<T extends SpecialItem> {
  item: T;
  isSelected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (pos: MapPoint) => void;
  onDblClick?: () => void;
}

const TextItemShape = memo(function TextItemShape({
  item,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
  onDblClick,
}: ItemProps<TextItem>) {
  const color = item.color ?? OVERPRINT_PURPLE;
  const konvaFontStyle = [
    item.fontStyle === 'italic' ? 'italic' : '',
    item.fontWeight === 'bold' ? 'bold' : '',
  ].filter(Boolean).join(' ') || 'normal';

  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e: KonvaEventObject<TouchEvent>) => { e.cancelBubble = true; onSelect(); }}
      onDblClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onDblClick?.(); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd({ x: e.target.x(), y: e.target.y() });
      }}
    >
      {isSelected && (
        <Rect
          x={-4}
          y={-item.fontSize * 0.2}
          width={item.text.length * item.fontSize * 0.65 + 8}
          height={item.fontSize * 1.3}
          stroke={SELECTION_COLOR}
          strokeWidth={1.5}
          dash={SELECTION_DASH}
          fill="transparent"
          listening={false}
        />
      )}
      <Text
        text={item.text}
        fontSize={item.fontSize}
        fontStyle={konvaFontStyle}
        fill={color}
        listening={true}
      />
    </Group>
  );
});

const LineItemShape = memo(function LineItemShape({
  item,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
  onUpdate,
}: ItemProps<LineItem> & { onUpdate?: (updates: Partial<SpecialItem>) => void }) {
  const color = item.color ?? OVERPRINT_PURPLE;
  const dx = item.endPosition.x - item.position.x;
  const dy = item.endPosition.y - item.position.y;
  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e: KonvaEventObject<TouchEvent>) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd({ x: e.target.x(), y: e.target.y() });
      }}
    >
      <Line
        points={[0, 0, dx, dy]}
        stroke={color}
        strokeWidth={(item.lineWidth ?? DEFAULT_LINE_WIDTH) * SCREEN_LINE_MULTIPLIER}
        lineCap="round"
        listening={true}
        hitStrokeWidth={12}
      />
      {isSelected && (
        <>
          {/* Start handle — drag to move start point */}
          <Circle
            x={0} y={0} radius={6} fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newPos = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: 0, y: 0 });
              onUpdate?.({ position: newPos } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = 'move';
            }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = '';
            }}
          />
          {/* End handle — drag to move end point */}
          <Circle
            x={dx} y={dy} radius={6} fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newEnd = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: dx, y: dy });
              onUpdate?.({ endPosition: newEnd } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = 'move';
            }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => {
              const c = e.target.getStage()?.container();
              if (c) c.style.cursor = '';
            }}
          />
        </>
      )}
    </Group>
  );
});

const RectangleItemShape = memo(function RectangleItemShape({
  item,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
  onUpdate,
}: ItemProps<RectangleItem> & { onUpdate?: (updates: Partial<SpecialItem>) => void }) {
  const color = item.color ?? OVERPRINT_PURPLE;
  const w = item.endPosition.x - item.position.x;
  const h = item.endPosition.y - item.position.y;
  const minX = Math.min(0, w);
  const minY = Math.min(0, h);
  const absW = Math.abs(w);
  const absH = Math.abs(h);
  const strokeW = (item.lineWidth ?? DEFAULT_LINE_WIDTH) * SCREEN_LINE_MULTIPLIER;

  // Refs for imperative resize preview (same pattern as DescriptionBoxItemShape)
  const rectRef = useRef<Konva.Rect>(null);

  const updateRectVisuals = useCallback((tlX: number, tlY: number, brX: number, brY: number) => {
    const rw = Math.abs(brX - tlX);
    const rh = Math.abs(brY - tlY);
    const rx = Math.min(tlX, brX);
    const ry = Math.min(tlY, brY);
    rectRef.current?.setAttrs({ x: rx, y: ry, width: rw, height: rh });
    rectRef.current?.getLayer()?.batchDraw();
  }, []);

  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e: KonvaEventObject<TouchEvent>) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd({ x: e.target.x(), y: e.target.y() });
      }}
    >
      <Rect
        ref={rectRef}
        x={minX}
        y={minY}
        width={absW}
        height={absH}
        stroke={color}
        strokeWidth={strokeW}
        fill="transparent"
        listening={true}
      />
      {isSelected && (
        <>
          {/* Position corner */}
          <Circle
            x={0} y={0} radius={6} fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragMove={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              updateRectVisuals(e.target.x(), e.target.y(), w, h);
            }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newPos = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: 0, y: 0 });
              onUpdate?.({ position: newPos } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'nwse-resize'; }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ''; }}
          />
          {/* EndPosition corner */}
          <Circle
            x={w} y={h} radius={6} fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragMove={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              updateRectVisuals(0, 0, e.target.x(), e.target.y());
            }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newEnd = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: w, y: h });
              onUpdate?.({ endPosition: newEnd } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'nwse-resize'; }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ''; }}
          />
        </>
      )}
    </Group>
  );
});

const DescriptionBoxItemShape = memo(function DescriptionBoxItemShape({
  item,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
  onUpdate,
}: ItemProps<DescriptionBoxItem> & { onUpdate?: (updates: Partial<SpecialItem>) => void }) {
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);

  // Refs for imperative visual updates during drag (avoids React re-render flicker)
  const bgRectRef = useRef<Konva.Rect>(null);
  const imgNodeRef = useRef<Konva.Image>(null);
  const selRectRef = useRef<Konva.Rect>(null);
  const guideLineRef = useRef<Konva.Line>(null);
  const endHandleRef = useRef<Konva.Circle>(null);

  // Find the course this description box belongs to
  const courseId = item.courseIds?.[0] ?? activeCourseId;
  const course = event?.courses.find((c) => c.id === courseId);
  const controls = event?.controls ?? {};
  const mapScale = event?.mapFile?.scale ?? event?.settings.printScale ?? 10000;
  const mapDpi = event?.mapFile?.dpi ?? 96;
  const appearance = course?.settings.descriptionAppearance ?? 'symbols';
  const lang = event?.settings.language ?? 'en';

  // Store dimensions
  const storeW = item.endPosition.x - item.position.x;
  const storeH = item.endPosition.y - item.position.y;
  const absW = Math.abs(storeW);
  const absH = Math.abs(storeH);
  const rectX = Math.min(0, storeW);
  const rectY = Math.min(0, storeH);

  const descriptionCanvas = useDescriptionCanvas(
    course,
    controls,
    mapScale,
    mapDpi,
    absW,
    appearance,
    lang,
  );

  // Scale canvas image to fit box (maintain aspect ratio, fill width)
  const canvasScale = descriptionCanvas ? absW / descriptionCanvas.width : 1;
  const canvasDisplayH = descriptionCanvas
    ? Math.min(descriptionCanvas.height * canvasScale, absH)
    : absH;

  // Imperative update of visual elements during handle drag — no React state, no flicker
  const updateDragVisuals = useCallback((tlX: number, tlY: number, brX: number, brY: number) => {
    const w = Math.abs(brX - tlX);
    const h = Math.abs(brY - tlY);
    const rx = Math.min(tlX, brX);
    const ry = Math.min(tlY, brY);

    bgRectRef.current?.setAttrs({ x: rx, y: ry, width: w, height: h });

    if (imgNodeRef.current && descriptionCanvas) {
      const scale = w / descriptionCanvas.width;
      imgNodeRef.current.position({ x: rx, y: ry });
      imgNodeRef.current.width(w);
      imgNodeRef.current.height(Math.min(descriptionCanvas.height * scale, h));
    }

    selRectRef.current?.setAttrs({
      x: rx - 2, y: ry - 2, width: w + 4, height: h + 4,
    });

    // Natural height guide
    if (course && w > 10) {
      const nh = computeGridLayout(course, w, appearance).gridHeight;
      const isNear = Math.abs(h - nh) < NATURAL_HEIGHT_SNAP;
      guideLineRef.current?.setAttrs({
        points: [rx, ry + nh, rx + w, ry + nh],
        visible: !isNear,
      });
      selRectRef.current?.setAttrs({
        stroke: isNear ? NATURAL_HEIGHT_COLOR : SELECTION_COLOR,
        strokeWidth: isNear ? 2.5 : 1.5,
      });
      endHandleRef.current?.setAttrs({
        fill: isNear ? NATURAL_HEIGHT_COLOR : SELECTION_COLOR,
      });
    }

    bgRectRef.current?.getLayer()?.batchDraw();
  }, [descriptionCanvas, course, appearance]);

  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e: KonvaEventObject<TouchEvent>) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd({ x: e.target.x(), y: e.target.y() });
      }}
    >
      {/* White background */}
      <Rect
        ref={bgRectRef}
        x={rectX}
        y={rectY}
        width={absW}
        height={absH}
        fill="#FFFFFF"
        stroke="#000000"
        strokeWidth={1}
        listening={true}
      />
      {/* Rendered description grid */}
      {descriptionCanvas && (
        <KonvaImage
          ref={imgNodeRef}
          x={rectX}
          y={rectY}
          width={absW}
          height={canvasDisplayH}
          image={descriptionCanvas}
          listening={false}
        />
      )}
      {/* Natural height guide — toggled visible imperatively during drag */}
      {isSelected && (
        <Line
          ref={guideLineRef}
          points={[0, 0, 0, 0]}
          stroke={NATURAL_HEIGHT_COLOR}
          strokeWidth={1.5}
          dash={[6, 3]}
          listening={false}
          opacity={0.8}
          visible={false}
        />
      )}
      {/* Selection handles */}
      {isSelected && (
        <>
          <Rect
            ref={selRectRef}
            x={rectX - 2}
            y={rectY - 2}
            width={absW + 4}
            height={absH + 4}
            stroke={SELECTION_COLOR}
            strokeWidth={1.5}
            dash={SELECTION_DASH}
            fill="transparent"
            listening={false}
          />
          {/* Position corner */}
          <Circle
            x={0} y={0} radius={6} fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragMove={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              updateDragVisuals(e.target.x(), e.target.y(), storeW, storeH);
            }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newPos = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: 0, y: 0 });
              guideLineRef.current?.setAttrs({ visible: false });
              onUpdate?.({ position: newPos } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'nwse-resize'; }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ''; }}
          />
          {/* EndPosition corner */}
          <Circle
            ref={endHandleRef}
            x={storeW} y={storeH} radius={6}
            fill={SELECTION_COLOR}
            draggable={!!onUpdate}
            onDragStart={(e: KonvaEventObject<DragEvent>) => { e.cancelBubble = true; }}
            onDragMove={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              updateDragVisuals(0, 0, e.target.x(), e.target.y());
            }}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
              e.cancelBubble = true;
              const newEnd = { x: item.position.x + e.target.x(), y: item.position.y + e.target.y() };
              e.target.position({ x: storeW, y: storeH });
              guideLineRef.current?.setAttrs({ visible: false });
              onUpdate?.({ endPosition: newEnd } as Partial<SpecialItem>);
            }}
            onMouseEnter={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'nwse-resize'; }}
            onMouseLeave={(e: KonvaEventObject<MouseEvent>) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = ''; }}
          />
        </>
      )}
    </Group>
  );
});

const IofSymbolItemShape = memo(function IofSymbolItemShape({
  item,
  isSelected,
  draggable,
  onSelect,
  onDragEnd,
}: ItemProps<IofSymbolItem>) {
  const color = item.color ?? OVERPRINT_PURPLE;
  const lineWidth = DEFAULT_LINE_WIDTH * SCREEN_LINE_MULTIPLIER;

  const symbolShape = (() => {
    switch (item.type) {
      case 'outOfBounds': return <OutOfBoundsShape color={color} lineWidth={lineWidth} />;
      case 'dangerousArea': return <DangerousAreaShape color={color} lineWidth={lineWidth} />;
      case 'waterLocation': return <WaterLocationShape color={color} lineWidth={lineWidth} />;
      case 'firstAid': return <FirstAidShape color={color} lineWidth={lineWidth} />;
      case 'forbiddenRoute': return <ForbiddenRouteShape color={color} lineWidth={lineWidth} />;
    }
  })();

  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onClick={(e: KonvaEventObject<MouseEvent>) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e: KonvaEventObject<TouchEvent>) => { e.cancelBubble = true; onSelect(); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        onDragEnd({ x: e.target.x(), y: e.target.y() });
      }}
    >
      {isSelected && (
        <Circle
          radius={IOF_SYMBOL_SIZE + 6}
          stroke={SELECTION_COLOR}
          strokeWidth={1.5}
          dash={SELECTION_DASH}
          fill="transparent"
          listening={false}
        />
      )}
      {symbolShape}
      {/* Hit target */}
      <Rect
        x={-IOF_SYMBOL_SIZE}
        y={-IOF_SYMBOL_SIZE}
        width={IOF_SYMBOL_SIZE * 2}
        height={IOF_SYMBOL_SIZE * 2}
        fill="#000"
        opacity={0.001}
      />
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Drawing preview — shown while dragging to create a new line/rectangle
// ---------------------------------------------------------------------------

interface DrawPreviewProps {
  itemType: 'line' | 'rectangle' | 'descriptionBox';
  start: MapPoint;
  end: MapPoint;
  naturalHeight?: number;
}

function DrawPreview({ itemType, start, end, naturalHeight }: DrawPreviewProps) {
  if (itemType === 'line') {
    return (
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={OVERPRINT_PURPLE}
        strokeWidth={DEFAULT_LINE_WIDTH * SCREEN_LINE_MULTIPLIER}
        dash={[6, 4]}
        lineCap="round"
        listening={false}
      />
    );
  }
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const absW = Math.abs(end.x - start.x);
  const absH = Math.abs(end.y - start.y);

  if (itemType === 'descriptionBox') {
    const isNearNatural = naturalHeight != null && Math.abs(absH - naturalHeight) < NATURAL_HEIGHT_SNAP;
    return (
      <>
        <Rect
          x={minX}
          y={minY}
          width={absW}
          height={absH}
          stroke={isNearNatural ? NATURAL_HEIGHT_COLOR : '#000000'}
          strokeWidth={isNearNatural ? 2.5 : 1.5}
          dash={[6, 4]}
          fill="rgba(255,255,255,0.7)"
          listening={false}
        />
        {naturalHeight != null && !isNearNatural && absW > 10 && (
          <Line
            points={[minX, minY + naturalHeight, minX + absW, minY + naturalHeight]}
            stroke={NATURAL_HEIGHT_COLOR}
            strokeWidth={1.5}
            dash={[6, 3]}
            listening={false}
            opacity={0.8}
          />
        )}
      </>
    );
  }

  return (
    <Rect
      x={minX}
      y={minY}
      width={absW}
      height={absH}
      stroke={OVERPRINT_PURPLE}
      strokeWidth={DEFAULT_LINE_WIDTH * SCREEN_LINE_MULTIPLIER}
      dash={[6, 4]}
      fill="transparent"
      listening={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Stage pointer position helper
// ---------------------------------------------------------------------------

function stagePointerPosition(e: KonvaEventObject<MouseEvent>): MapPoint | null {
  const stage = e.target.getStage();
  if (!stage) return null;
  const pos = stage.getRelativePointerPosition();
  if (!pos) return null;
  return { x: pos.x, y: pos.y };
}

// ---------------------------------------------------------------------------
// Main layer component
// ---------------------------------------------------------------------------

interface DrawState {
  start: MapPoint;
  current: MapPoint;
}

export const SpecialItemsLayer = memo(function SpecialItemsLayer() {
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const addSpecialItem = useEventStore((s) => s.addSpecialItem);
  const updateSpecialItem = useEventStore((s) => s.updateSpecialItem);
  const deleteSpecialItem = useEventStore((s) => s.deleteSpecialItem);

  const activeTool = useToolStore((s) => s.activeTool);
  const selectedSpecialItemId = useToolStore((s) => s.selectedSpecialItemId);
  const setSelectedSpecialItem = useToolStore((s) => s.setSelectedSpecialItem);

  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const setEditingTextItemId = useToolStore((s) => s.setEditingTextItemId);

  // Delete key removes the selected special item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedSpecialItemId) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation(); // Prevent control deletion handler from also firing
        deleteSpecialItem(selectedSpecialItemId);
        setSelectedSpecialItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSpecialItemId, deleteSpecialItem, setSelectedSpecialItem]);

  if (!event) return null;

  const isPan = activeTool.type === 'pan';
  const isAddSpecialItem = activeTool.type === 'addSpecialItem';
  const addItemType = isAddSpecialItem ? activeTool.itemType : null;

  // Filter items to show: items with no courseIds restriction OR the active course is in the list
  const visibleItems = event.specialItems.filter((item) => {
    if (!item.courseIds || item.courseIds.length === 0) return true;
    return activeCourseId !== null && item.courseIds.includes(activeCourseId);
  });

  // Handle stage background click/mousedown/mousemove/mouseup for placement
  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!isAddSpecialItem || !addItemType) return;
    // Only fire on the stage background (not on existing items)
    if (e.target !== e.target.getStage() && e.target.getParent()?.getType() !== 'Layer') return;

    const pos = stagePointerPosition(e);
    if (!pos) return;

    if (addItemType === 'line' || addItemType === 'rectangle' || addItemType === 'descriptionBox') {
      setDrawState({ start: pos, current: pos });
    }
  };

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!drawState) return;
    const pos = stagePointerPosition(e);
    if (!pos) return;
    setDrawState((prev) => prev ? { ...prev, current: pos } : null);
  };

  const handleStageMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    if (!drawState || !addItemType) return;
    const pos = stagePointerPosition(e);
    const end = pos ?? drawState.current;

    const dx = end.x - drawState.start.x;
    const dy = end.y - drawState.start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only commit if dragged more than 5px
    if (distance > 5) {
      if (addItemType === 'line') {
        addSpecialItem({
          id: generateSpecialItemId(),
          type: 'line',
          position: drawState.start,
          endPosition: end,
        });
      } else if (addItemType === 'rectangle') {
        addSpecialItem({
          id: generateSpecialItemId(),
          type: 'rectangle',
          position: drawState.start,
          endPosition: end,
        });
      } else if (addItemType === 'descriptionBox') {
        addSpecialItem({
          id: generateSpecialItemId(),
          type: 'descriptionBox',
          position: drawState.start,
          endPosition: end,
          courseIds: activeCourseId ? [activeCourseId] : undefined,
        });
      }
    }

    setDrawState(null);
  };

  const handleItemSelect = (id: typeof selectedSpecialItemId) => {
    setSelectedSpecialItem(id);
    // Clear control selection when a special item is selected
    useEventStore.getState().setSelectedControl(null);
  };

  const handleTextDblClick = (item: TextItem) => {
    setEditingTextItemId(item.id);
  };

  // Natural height for description box draw preview
  let drawPreviewNaturalHeight: number | undefined;
  if (drawState && addItemType === 'descriptionBox') {
    const previewCourse = activeCourseId
      ? event?.courses.find((c) => c.id === activeCourseId)
      : undefined;
    if (previewCourse) {
      const previewW = Math.abs(drawState.current.x - drawState.start.x);
      if (previewW > 10) {
        drawPreviewNaturalHeight = computeGridLayout(
          previewCourse, previewW, previewCourse.settings.descriptionAppearance ?? 'symbols',
        ).gridHeight;
      }
    }
  }

  return (
    <Layer
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseUp={handleStageMouseUp}
    >
      {/* Render existing items */}
      {visibleItems.map((item) => {
        const isSelected = item.id === selectedSpecialItemId;
        const commonProps = {
          isSelected,
          draggable: isPan,
          onSelect: () => handleItemSelect(item.id),
        };

        switch (item.type) {
          case 'text':
            return (
              <TextItemShape
                key={item.id}
                item={item}
                {...commonProps}
                onDragEnd={(pos) => updateSpecialItem(item.id, { position: pos } as Partial<SpecialItem>)}
                onDblClick={() => handleTextDblClick(item)}
              />
            );
          case 'line':
            return (
              <LineItemShape
                key={item.id}
                item={item}
                {...commonProps}
                onDragEnd={(pos) => {
                  const ldx = item.endPosition.x - item.position.x;
                  const ldy = item.endPosition.y - item.position.y;
                  updateSpecialItem(item.id, {
                    position: pos,
                    endPosition: { x: pos.x + ldx, y: pos.y + ldy },
                  } as Partial<SpecialItem>);
                }}
                onUpdate={(updates) => updateSpecialItem(item.id, updates)}
              />
            );
          case 'rectangle':
            return (
              <RectangleItemShape
                key={item.id}
                item={item}
                {...commonProps}
                onDragEnd={(pos) => {
                  const rw = item.endPosition.x - item.position.x;
                  const rh = item.endPosition.y - item.position.y;
                  updateSpecialItem(item.id, {
                    position: pos,
                    endPosition: { x: pos.x + rw, y: pos.y + rh },
                  } as Partial<SpecialItem>);
                }}
                onUpdate={(updates) => updateSpecialItem(item.id, updates)}
              />
            );
          case 'descriptionBox':
            return (
              <DescriptionBoxItemShape
                key={item.id}
                item={item}
                {...commonProps}
                onDragEnd={(pos) => {
                  const bw = item.endPosition.x - item.position.x;
                  const bh = item.endPosition.y - item.position.y;
                  updateSpecialItem(item.id, {
                    position: pos,
                    endPosition: { x: pos.x + bw, y: pos.y + bh },
                  } as Partial<SpecialItem>);
                }}
                onUpdate={(updates) => updateSpecialItem(item.id, updates)}
              />
            );
          default:
            return (
              <IofSymbolItemShape
                key={item.id}
                item={item as IofSymbolItem}
                {...commonProps}
                onDragEnd={(pos) => updateSpecialItem(item.id, { position: pos } as Partial<SpecialItem>)}
              />
            );
        }
      })}

      {/* Draw preview for line/rectangle while dragging */}
      {drawState && addItemType && (addItemType === 'line' || addItemType === 'rectangle' || addItemType === 'descriptionBox') && (
        <DrawPreview
          itemType={addItemType}
          start={drawState.start}
          end={drawState.current}
          naturalHeight={drawPreviewNaturalHeight}
        />
      )}
    </Layer>
  );
});
