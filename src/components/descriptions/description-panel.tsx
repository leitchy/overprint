import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { DescriptionSheet } from './description-sheet';

export function DescriptionPanel() {
  const event = useEventStore((s) => s.event);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const selectedControlId = useEventStore((s) => s.selectedControlId);
  const isOpen = useToolStore((s) => s.descriptionsPanelOpen);

  const activeCourse = event?.courses.find((c) => c.id === activeCourseId);
  const mapFile = event?.mapFile;

  if (!isOpen || !activeCourse || !event || !mapFile) return null;

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
          selectedControlId={selectedControlId}
          onSelectControl={(id) => {
            useEventStore.getState().setSelectedControl(id);
          }}
          onCellClick={(controlId, column) => {
            // Symbol picker will be wired here in Step 4
            console.log('Edit cell:', controlId, column);
          }}
        />
      </div>
    </div>
  );
}
