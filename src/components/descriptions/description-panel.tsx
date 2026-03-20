import { useState, useCallback, useMemo } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { DescriptionSheet } from './description-sheet';
import { SymbolPicker } from './symbol-picker';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import type { ControlId, CourseId } from '@/utils/id';
import type { Course } from '@/core/models/types';
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
  const viewMode = useEventStore((s) => s.viewMode);
  const isOpen = useToolStore((s) => s.descriptionsPanelOpen);
  const breakpoint = useBreakpoint();
  // Description language is per-event (stored in .overprint), not a global pref
  const descriptionLang = event?.settings.language ?? 'en';

  const [picker, setPicker] = useState<PickerState | null>(null);

  const activeCourse = event?.courses.find((c) => c.id === activeCourseId);
  const mapFile = event?.mapFile;

  // Synthetic "all controls" course — controls sorted by code number
  const allControlsCourse = useMemo((): Course | null => {
    if (viewMode !== 'allControls' || !event) return null;
    const allControls = Object.values(event.controls);
    if (allControls.length === 0) return null;
    return {
      id: 'all-controls' as CourseId,
      name: 'All controls',
      courseType: 'score',
      controls: [...allControls]
        .sort((a, b) => a.code - b.code)
        .map((c) => ({ controlId: c.id, type: 'control' as const })),
      settings: {},
    };
  }, [viewMode, event]);

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

  if (!isOpen || !event || !mapFile) return null;

  // In all-controls mode we need either the synthetic course or bail
  if (viewMode === 'allControls' && !allControlsCourse) return null;
  // In course mode we need an active course
  if (viewMode === 'course' && !activeCourse) return null;

  const sheetCourse = viewMode === 'allControls' ? allControlsCourse! : activeCourse!;

  // Get current value for picker
  const pickerCurrentValue = picker
    ? (() => {
        const control = event.controls[picker.controlId];
        if (!control) return undefined;
        const key = `column${picker.column}` as keyof typeof control.description;
        return control.description[key];
      })()
    : undefined;

  const sheetContent = (
    <>
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
      <div className="overflow-y-auto p-3" style={{ maxHeight: breakpoint === 'lg' ? 'calc(100% - 2.5rem)' : undefined }}>
        <DescriptionSheet
          course={sheetCourse}
          controls={event.controls}
          mapScale={mapFile.scale}
          mapDpi={mapFile.dpi}
          lang={descriptionLang}
          selectedControlId={selectedControlId}
          mode={viewMode === 'allControls' ? 'allControls' : 'course'}
          textOnly={activeCourse?.settings.descriptionAppearance === 'text'}
          onSelectControl={(id) => {
            useEventStore.getState().setSelectedControl(id);
          }}
          onCellClick={viewMode === 'course' ? handleCellClick : undefined}
        />
      </div>

      {/* Symbol picker popover — only in course mode */}
      {picker && viewMode === 'course' && (
        <SymbolPicker
          column={picker.column}
          anchorRect={picker.anchorRect}
          currentValue={pickerCurrentValue}
          lang={descriptionLang}
          onSelect={handleSymbolSelect}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );

  // Desktop: sidebar
  if (breakpoint === 'lg') {
    return (
      <div className="h-full w-70 shrink-0 border-l border-gray-200 bg-white">
        {sheetContent}
      </div>
    );
  }

  // Tablet: bottom sheet at 50%, Phone: bottom sheet at 90% (near full-screen)
  const handleClose = () => useToolStore.getState().toggleDescriptionsPanel();
  return (
    <BottomSheet
      open={isOpen}
      onClose={handleClose}
      snapPoints={breakpoint === 'sm' ? [0.9] : [0.5, 0.85]}
    >
      {sheetContent}
    </BottomSheet>
  );
}
