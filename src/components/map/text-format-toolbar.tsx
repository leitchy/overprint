import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import type { TextItem, LineItem, RectangleItem, SpecialItem } from '@/core/models/types';
import { mmToMapPixels, mapPixelsToMm } from '@/core/geometry/overprint-dimensions';
import { OVERPRINT_PURPLE } from '@/core/models/constants';

const FONT_SIZE_PRESETS = [
  { label: 'S', mm: 3 },
  { label: 'M', mm: 4 },
  { label: 'L', mm: 6 },
  { label: 'XL', mm: 8 },
];

const LINE_WIDTH_PRESETS = [
  { label: 'Thin', value: 1 },
  { label: 'Medium', value: 2 },
  { label: 'Thick', value: 4 },
];

const COLOR_PRESETS = [
  { label: 'Purple', value: OVERPRINT_PURPLE },
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#CC0000' },
  { label: 'Blue', value: '#0066CC' },
  { label: 'White', value: '#FFFFFF' },
];

/**
 * Context-aware format toolbar for special items.
 * Shows different controls based on the selected item type:
 * - Text: font size, bold, italic, color
 * - Line/Rectangle: line width, color
 * - IOF symbols: color
 * - Description box: nothing (auto-generated)
 */
export function TextFormatToolbar() {
  const selectedId = useToolStore((s) => s.selectedSpecialItemId);
  const specialItems = useEventStore((s) => s.event?.specialItems);
  const dpi = useEventStore((s) => s.event?.mapFile?.dpi) ?? 150;
  const updateSpecialItem = useEventStore((s) => s.updateSpecialItem);

  if (!selectedId || !specialItems) return null;

  const item = specialItems.find((i) => i.id === selectedId);
  if (!item) return null;

  // Description boxes have no editable properties
  if (item.type === 'descriptionBox') return null;
  const update = (updates: Partial<SpecialItem>) => {
    updateSpecialItem(selectedId, updates);
  };

  const currentColor = item.color ?? OVERPRINT_PURPLE;

  return (
    <div className="absolute left-1/2 top-2 z-40 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg">
      {/* Text-specific controls */}
      {item.type === 'text' && (
        <TextControls item={item} dpi={dpi} update={update} />
      )}

      {/* Line width controls for lines and rectangles */}
      {(item.type === 'line' || item.type === 'rectangle') && (
        <LineWidthControls item={item} update={update} />
      )}

      {/* Separator before color (if there are controls before it) */}
      {(item.type === 'text' || item.type === 'line' || item.type === 'rectangle') && (
        <div className="mx-1 h-4 w-px bg-gray-200" />
      )}

      {/* Color presets — shown for all editable item types */}
      {COLOR_PRESETS.map((c) => {
        const isActive = currentColor === c.value;
        return (
          <button
            key={c.value}
            onClick={() => update({ color: c.value } as Partial<SpecialItem>)}
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

function TextControls({
  item,
  dpi,
  update,
}: {
  item: TextItem;
  dpi: number;
  update: (updates: Partial<SpecialItem>) => void;
}) {
  const mmToPixels = (mm: number) => mmToMapPixels(mm, dpi);
  const currentMm = mapPixelsToMm(item.fontSize, dpi);

  return (
    <>
      {/* Font size presets */}
      {FONT_SIZE_PRESETS.map((preset) => {
        const isActive = Math.abs(currentMm - preset.mm) < 0.5;
        return (
          <button
            key={preset.label}
            onClick={() => update({ fontSize: mmToPixels(preset.mm) } as Partial<SpecialItem>)}
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
        onClick={() => update({ fontWeight: item.fontWeight === 'bold' ? 'normal' : 'bold' } as Partial<SpecialItem>)}
        className={`rounded px-2 py-0.5 text-xs font-bold ${
          item.fontWeight === 'bold'
            ? 'bg-violet-100 text-violet-700'
            : 'text-gray-500 hover:bg-gray-100'
        }`}
        title="Bold"
      >
        B
      </button>

      {/* Italic */}
      <button
        onClick={() => update({ fontStyle: item.fontStyle === 'italic' ? 'normal' : 'italic' } as Partial<SpecialItem>)}
        className={`rounded px-2 py-0.5 text-xs italic ${
          item.fontStyle === 'italic'
            ? 'bg-violet-100 text-violet-700'
            : 'text-gray-500 hover:bg-gray-100'
        }`}
        title="Italic"
      >
        I
      </button>
    </>
  );
}

function LineWidthControls({
  item,
  update,
}: {
  item: LineItem | RectangleItem;
  update: (updates: Partial<SpecialItem>) => void;
}) {
  const currentWidth = item.lineWidth ?? 2;

  return (
    <>
      {LINE_WIDTH_PRESETS.map((preset) => {
        const isActive = Math.abs(currentWidth - preset.value) < 0.5;
        return (
          <button
            key={preset.label}
            onClick={() => update({ lineWidth: preset.value } as Partial<SpecialItem>)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isActive
                ? 'bg-violet-100 text-violet-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={`${preset.label} (${preset.value}px)`}
          >
            {preset.label}
          </button>
        );
      })}
    </>
  );
}
