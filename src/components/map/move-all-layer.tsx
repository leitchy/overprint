/**
 * MoveAllLayer — the "move all controls" tool (E5).
 *
 * When the moveAll tool is active this layer captures a drag anywhere on the map
 * and translates the entire event (controls, bend points, print areas, special
 * items) by the drag delta — used to re-anchor onto a revised base map. A live
 * arrow previews the shift; the move is committed as one undoable action on
 * release. Self-contained (like SpecialItemsLayer) so it doesn't touch the
 * pan/zoom navigation hook.
 */
import { memo, useState } from 'react';
import { Layer, Rect, Arrow } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import type { MapPoint } from '@/core/models/types';

const COVER = 1_000_000; // large transparent capture rect (map pixels)

function pointerPos(e: KonvaEventObject<MouseEvent>): MapPoint | null {
  const stage = e.target.getStage();
  const p = stage?.getRelativePointerPosition();
  return p ? { x: p.x, y: p.y } : null;
}

export const MoveAllLayer = memo(function MoveAllLayer() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const moveAllControls = useEventStore((s) => s.moveAllControls);
  const [drag, setDrag] = useState<{ start: MapPoint; current: MapPoint } | null>(null);

  if (activeTool.type !== 'moveAll') return null;

  const handleDown = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const pos = pointerPos(e);
    if (pos) setDrag({ start: pos, current: pos });
  };

  const handleMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!drag) return;
    const pos = pointerPos(e);
    if (pos) setDrag((prev) => (prev ? { ...prev, current: pos } : null));
  };

  const handleUp = () => {
    if (drag) {
      const dx = drag.current.x - drag.start.x;
      const dy = drag.current.y - drag.start.y;
      if (Math.hypot(dx, dy) > 2) moveAllControls(dx, dy);
      setDrag(null);
    }
    setTool({ type: 'pan' });
  };

  return (
    <Layer onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp}>
      {/* Full-cover transparent capture so the drag starts anywhere, even over a control */}
      <Rect x={-COVER} y={-COVER} width={COVER * 2} height={COVER * 2} fill="#000" opacity={0.001} />
      {drag && (Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y) > 2) && (
        <Arrow
          points={[drag.start.x, drag.start.y, drag.current.x, drag.current.y]}
          stroke="#FFD700"
          fill="#FFD700"
          strokeWidth={3}
          pointerLength={12}
          pointerWidth={12}
          listening={false}
        />
      )}
    </Layer>
  );
});
