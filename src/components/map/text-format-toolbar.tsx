import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import type { TextItem, SpecialItem } from '@/core/models/types';
import { mmToMapPixels, mapPixelsToMm } from '@/core/geometry/overprint-dimensions';

const FONT_SIZE_PRESETS = [
  { label: 'S', mm: 3 },
  { label: 'M', mm: 4 },
  { label: 'L', mm: 6 },
  { label: 'XL', mm: 8 },
];

const COLOR_PRESETS = [
  { label: 'Purple', value: '#CD59A4' },
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#CC0000' },
  { label: 'Blue', value: '#0066CC' },
  { label: 'White', value: '#FFFFFF' },
];

export function TextFormatToolbar() {
  const selectedId = useToolStore((s) => s.selectedSpecialItemId);
  const event = useEventStore((s) => s.event);
  const updateSpecialItem = useEventStore((s) => s.updateSpecialItem);

  if (!selectedId || !event) return null;

  const item = event.specialItems.find((i) => i.id === selectedId);
  if (!item || item.type !== 'text') return null;

  const textItem = item as TextItem;
  const dpi = event.mapFile?.dpi ?? 150;
  const mmToPixels = (mm: number) => mmToMapPixels(mm, dpi);
  const currentMm = mapPixelsToMm(textItem.fontSize, dpi);

  const update = (updates: Partial<TextItem>) => {
    updateSpecialItem(selectedId, updates as Partial<SpecialItem>);
  };

  return (
    <div className="absolute left-1/2 top-2 z-40 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg">
      {/* Font size presets */}
      {FONT_SIZE_PRESETS.map((preset) => {
        const isActive = Math.abs(currentMm - preset.mm) < 0.5;
        return (
          <button
            key={preset.label}
            onClick={() => update({ fontSize: mmToPixels(preset.mm) })}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isActive
                ? 'bg-violet-100 text-violet-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={`${preset.mm}mm`}
          >
            {preset.label}
          </button>
        );
      })}

      <div className="mx-1 h-4 w-px bg-gray-200" />

      {/* Bold */}
      <button
        onClick={() => update({ fontWeight: textItem.fontWeight === 'bold' ? 'normal' : 'bold' })}
        className={`rounded px-2 py-0.5 text-xs font-bold ${
          textItem.fontWeight === 'bold'
            ? 'bg-violet-100 text-violet-700'
            : 'text-gray-500 hover:bg-gray-100'
        }`}
        title="Bold"
      >
        B
      </button>

      {/* Italic */}
      <button
        onClick={() => update({ fontStyle: textItem.fontStyle === 'italic' ? 'normal' : 'italic' })}
        className={`rounded px-2 py-0.5 text-xs italic ${
          textItem.fontStyle === 'italic'
            ? 'bg-violet-100 text-violet-700'
            : 'text-gray-500 hover:bg-gray-100'
        }`}
        title="Italic"
      >
        I
      </button>

      <div className="mx-1 h-4 w-px bg-gray-200" />

      {/* Colour */}
      {COLOR_PRESETS.map((c) => {
        const isActive = (textItem.color ?? '#CD59A4') === c.value;
        return (
          <button
            key={c.value}
            onClick={() => update({ color: c.value })}
            className={`h-5 w-5 rounded-full border-2 ${
              isActive ? 'border-violet-500' : 'border-gray-200 hover:border-gray-400'
            }`}
            style={{ backgroundColor: c.value }}
            title={c.label}
          />
        );
      })}
    </div>
  );
}
