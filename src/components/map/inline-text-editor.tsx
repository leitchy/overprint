import { useState, useEffect, useRef } from 'react';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import { useViewportStore } from '@/stores/viewport-store';
import type { TextItem, SpecialItem } from '@/core/models/types';

/**
 * HTML input overlay for editing text special items inline on the canvas.
 * Positioned absolutely over the Konva canvas at the text item's screen coordinates.
 */
export function InlineTextEditor() {
  const editingId = useToolStore((s) => s.editingTextItemId);
  const setEditingId = useToolStore((s) => s.setEditingTextItemId);
  const specialItems = useEventStore((s) => s.event?.specialItems);
  const updateSpecialItem = useEventStore((s) => s.updateSpecialItem);
  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);

  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const item = editingId
    ? specialItems?.find((i) => i.id === editingId && i.type === 'text') as TextItem | undefined
    : undefined;

  useEffect(() => {
    if (item) {
      setValue(item.text);
      // Focus after a tick to ensure the input is rendered
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [item]);

  if (!item) return null;

  // Convert map pixel position to screen position
  const screenX = item.position.x * zoom + panX;
  const screenY = item.position.y * zoom + panY;
  const screenFontSize = item.fontSize * zoom;

  const commit = () => {
    if (value.trim()) {
      updateSpecialItem(editingId!, { text: value.trim() } as Partial<SpecialItem>);
    }
    setEditingId(null);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditingId(null);
      }}
      onBlur={commit}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY - screenFontSize * 0.2,
        fontSize: Math.max(12, screenFontSize),
        fontFamily: 'sans-serif',
        color: item.color ?? '#C850A0',
        fontWeight: item.fontWeight === 'bold' ? 'bold' : 'normal',
        fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
        background: 'rgba(255,255,255,0.9)',
        border: '1px solid #a78bfa',
        borderRadius: 3,
        padding: '0 4px',
        outline: 'none',
        zIndex: 40,
        minWidth: 60,
      }}
    />
  );
}
