import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { useT } from '@/i18n/use-t';

export function MobileBottomBar() {
  const t = useT();
  const toggleMobilePanel = useToolStore((s) => s.toggleMobilePanel);
  const toggleDescriptionsPanel = useToolStore((s) => s.toggleDescriptionsPanel);

  const courseName = useEventStore((s) => {
    const course = s.event?.courses.find((c) => c.id === s.activeCourseId);
    return course?.name;
  });
  const controlCount = useEventStore((s) => {
    const course = s.event?.courses.find((c) => c.id === s.activeCourseId);
    return course?.controls.length ?? 0;
  });
  const hasControls = useEventStore((s) => Object.keys(s.event?.controls ?? {}).length > 0);

  return (
    <div
      className="flex items-center justify-between border-t border-edge bg-surface px-3"
      style={{
        height: 'var(--mobile-nav-height)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Course info — tap to open course panel */}
      <button
        onClick={() => toggleMobilePanel('course')}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="truncate text-sm font-medium text-content-2">
          {courseName ?? t('noControlsYet')}
        </span>
        <span className="shrink-0 text-xs text-faint">
          {controlCount > 0 && `${controlCount} ${controlCount === 1 ? t('control') : t('controls')}`}
        </span>
      </button>

      {/* Descriptions button */}
      {hasControls && (
        <button
          onClick={toggleDescriptionsPanel}
          className="ml-2 rounded px-3 py-2 text-xs font-medium text-accent-text hover:bg-accent-soft"
        >
          {t('toolDescriptions')}
        </button>
      )}
    </div>
  );
}
