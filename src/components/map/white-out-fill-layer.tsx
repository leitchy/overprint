/**
 * WhiteOutFillLayer — renders the opaque white fill of white-out special items.
 *
 * This is a separate, non-interactive Konva Layer placed BELOW the course
 * overprint (but above the map image) so a white-out masks stale map content
 * while course symbols still draw on top of it. Selection, dragging and resizing
 * of white-outs live in SpecialItemsLayer (above the course), which renders a
 * transparent hit area over the same bounds.
 */
import { memo } from 'react';
import { Layer, Rect } from 'react-konva';
import { useEventStore } from '@/stores/event-store';
import type { WhiteOutItem } from '@/core/models/types';

export const WhiteOutFillLayer = memo(function WhiteOutFillLayer() {
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  if (!event) return null;

  const whiteOuts = event.specialItems.filter(
    (item): item is WhiteOutItem => item.type === 'whiteOut',
  ).filter((item) => {
    if (!item.courseIds || item.courseIds.length === 0) return true;
    return activeCourseId !== null && item.courseIds.includes(activeCourseId);
  });

  if (whiteOuts.length === 0) return null;

  return (
    <Layer listening={false}>
      {whiteOuts.map((item) => {
        const x = Math.min(item.position.x, item.endPosition.x);
        const y = Math.min(item.position.y, item.endPosition.y);
        const w = Math.abs(item.endPosition.x - item.position.x);
        const h = Math.abs(item.endPosition.y - item.position.y);
        return (
          <Rect
            key={item.id}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={item.color ?? '#FFFFFF'}
            listening={false}
            perfectDrawEnabled={false}
          />
        );
      })}
    </Layer>
  );
});
