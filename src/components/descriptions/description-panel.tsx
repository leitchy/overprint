import { useState, useCallback } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { DescriptionSheet } from './description-sheet';
import { SymbolPicker } from './symbol-picker';
import type { ControlId } from '@/utils/id';
import type { SymbolColumn } from '@/core/iof/symbol-db';

interface PickerState {
  controlId: ControlId;
  column: SymbolColumn;
  anchorRect: DOMRect;
}

export function DescriptionPanel() {
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const selectedControlId = useEventStore((s) => s.selectedControlId);
  const isOpen = useToolStore((s) => s.descriptionsPanelOpen);
  // Description language is per-event (stored in .overprint), not a global pref
  const descriptionLang = event?.settings.language ?? 'en';

  const [picker, setPicker] = useState<PickerState | null>(null);

  const activeCourse = event?.courses.find((c) => c.id === activeCourseId);
  const mapFile = event?.mapFile;

  const handleCellClick = useCallback(
    (controlId: ControlId, column: string, cellElement: HTMLElement) => {
      const rect = cellElement.getBoundingClientRect();
      setPicker({
        controlId,
        column: column as SymbolColumn,
        anchorRect: rect,
      });
    },
    [],
  );

  const handleSymbolSelect = useCallback(
    (symbolId: string | undefined) => {
      if (!picker) return;
      useEventStore
        .getState()
        .updateControlDescription(picker.controlId, picker.column, symbolId);
      setPicker(null);
    },
    [picker],
  );

  if (!isOpen || !activeCourse || !event || !mapFile) return null;

  // Get current value for picker
  const pickerCurrentValue = picker
    ? (() => {
        const control = event.controls[picker.controlId];
        if (!control) return undefined;
        const key = `column${picker.column}` as keyof typeof control.description;
        return control.description[key];
      })()
    : undefined;

  return (
    <div className="h-full w-[280px] shrink-0 border-l border-gray-200 bg-white">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-medium text-gray-700">Descriptions</span>
        <button
          onClick={() => useToolStore.getState().toggleDescriptionsPanel()}
          className="text-gray-400 hover:text-gray-600"
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Scrollable sheet */}
      <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(100% - 2.5rem)' }}>
        <DescriptionSheet
          course={activeCourse}
          controls={event.controls}
          mapScale={mapFile.scale}
          mapDpi={mapFile.dpi}
          lang={descriptionLang}
          selectedControlId={selectedControlId}
          onSelectControl={(id) => {
            useEventStore.getState().setSelectedControl(id);
          }}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Symbol picker popover */}
      {picker && (
        <SymbolPicker
          column={picker.column}
          anchorRect={picker.anchorRect}
          currentValue={pickerCurrentValue}
          lang={descriptionLang}
          onSelect={handleSymbolSelect}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
