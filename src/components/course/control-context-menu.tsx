import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalClose } from '@/components/ui/use-modal-close';
import { useEventStore } from '@/stores/event-store';
import { useToastStore } from '@/stores/toast-store';
import type { ControlId, CourseId } from '@/utils/id';
import type { CourseControlType } from '@/core/models/types';
import { useT } from '@/i18n/use-t';

interface ContextMenuState {
  controlId: ControlId;
  screenX: number;
  screenY: number;
}

interface ControlContextMenuProps {
  menu: ContextMenuState;
  courseId: CourseId;
  onClose: () => void;
}

const MIDDLE_TYPES: CourseControlType[] = ['control', 'crossingPoint', 'mapExchange'];

function nextType(current: CourseControlType): CourseControlType {
  const idx = MIDDLE_TYPES.indexOf(current);
  return MIDDLE_TYPES[(idx + 1) % MIDDLE_TYPES.length] ?? 'control';
}

export function ControlContextMenu({ menu, courseId, onClose }: ControlContextMenuProps) {
  const t = useT();
  const { handleBackdropClick } = useModalClose(onClose);

  const control = useEventStore((s) => s.event?.controls[menu.controlId]);
  const course = useEventStore((s) => s.event?.courses.find((c) => c.id === courseId));
  const removeControlFromCourse = useEventStore((s) => s.removeControlFromCourse);
  const setCourseControlType = useEventStore((s) => s.setCourseControlType);
  const setControlCode = useEventStore((s) => s.setControlCode);

  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(0);

  if (!control || !course) return null;

  const ccIndex = course.controls.findIndex((cc) => cc.controlId === menu.controlId);
  const cc = course.controls[ccIndex];
  const isMiddle = ccIndex > 0 && ccIndex < course.controls.length - 1;

  // Clamp to viewport
  const x = Math.min(menu.screenX, window.innerWidth - 180);
  const y = Math.min(menu.screenY, window.innerHeight - 160);

  const handleDelete = () => {
    removeControlFromCourse(courseId, menu.controlId);
    useToastStore.getState().addToast(t('controlDeleted'));
    onClose();
  };

  const handleCycleType = () => {
    if (cc && isMiddle) {
      setCourseControlType(courseId, ccIndex, nextType(cc.type));
    }
    onClose();
  };

  const handleCodeCommit = () => {
    if (codeDraft > 30) {
      setControlCode(menu.controlId, codeDraft);
    }
    setEditingCode(false);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={handleBackdropClick}
    >
      <div
        className="absolute rounded-lg bg-white shadow-xl border border-gray-200 py-1 min-w-[160px]"
        style={{ left: x, top: y }}
      >
        {/* Delete */}
        <button
          className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 active:bg-red-50"
          onClick={handleDelete}
        >
          {t('deleteControl')}
        </button>

        <div className="mx-2 border-t border-gray-100" />

        {/* Change code */}
        {editingCode ? (
          <div className="flex items-center gap-1 px-4 py-2">
            <span className="text-xs text-gray-500">#</span>
            <input
              autoFocus
              type="number"
              min={31}
              value={codeDraft}
              className="w-16 rounded border border-violet-400 px-1 py-0.5 text-sm outline-none"
              onChange={(e) => setCodeDraft(Number(e.target.value))}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleCodeCommit();
                if (e.key === 'Escape') onClose();
              }}
              onBlur={handleCodeCommit}
            />
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-gray-700 active:bg-gray-50"
            onClick={() => {
              setEditingCode(true);
              setCodeDraft(control.code);
            }}
          >
            <span>{t('clickToEditCode')}</span>
            <span className="text-xs text-gray-400">#{control.code}</span>
          </button>
        )}

        {/* Change type — only for middle controls */}
        {isMiddle && cc && (
          <>
            <div className="mx-2 border-t border-gray-100" />
            <button
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-gray-700 active:bg-gray-50"
              onClick={handleCycleType}
            >
              <span>{t('courseControlType')}</span>
              <span className="text-xs text-gray-400">{cc.type}</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
