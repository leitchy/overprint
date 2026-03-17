import type { Course, Control } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { useEventStore } from '@/stores/event-store';
import { calculateCourseLength } from '@/core/geometry/course-length';
import { CourseList } from './course-tabs';

interface CoursePanelProps {
  course: Course | null;
  controls: Record<ControlId, Control>;
  courseId: CourseId | null;
  selectedControlId: ControlId | null;
}

export function CoursePanel({
  course,
  controls,
  courseId,
  selectedControlId,
}: CoursePanelProps) {
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const setSelectedControl = useEventStore((s) => s.setSelectedControl);
  const moveControlInCourse = useEventStore((s) => s.moveControlInCourse);
  const removeControlFromCourse = useEventStore((s) => s.removeControlFromCourse);

  const lengthMetres =
    course && mapFile
      ? calculateCourseLength(course.controls, controls, mapFile.scale, mapFile.dpi)
      : 0;
  const lengthKm = (lengthMetres / 1000).toFixed(1);

  return (
    <div className="absolute right-4 top-4 w-56 rounded bg-white/90 shadow">
      {/* Course list — always visible */}
      <CourseList />

      {/* Active course details */}
      {course && courseId && (
        <>
          {/* Course stats */}
          <div className="border-b border-gray-200 px-3 py-1.5">
            <div className="text-xs text-gray-400">
              {course.controls.length} control{course.controls.length !== 1 ? 's' : ''}
              {course.controls.length >= 2 && ` \u00B7 ${lengthKm} km`}
            </div>
          </div>

          {/* Control list */}
          {course.controls.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              No controls yet
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {course.controls.map((cc, index) => {
                const control = controls[cc.controlId];
                if (!control) return null;

                const isSelected = cc.controlId === selectedControlId;
                const isFirst = index === 0;
                const isLast = index === course.controls.length - 1;

                const typeLabel =
                  cc.type === 'start' ? 'S' :
                  cc.type === 'finish' ? 'F' :
                  String(index + 1);

                return (
                  <li
                    key={cc.controlId}
                    className={`flex items-center gap-1 px-3 py-1 text-xs ${
                      isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedControl(cc.controlId)}
                  >
                    <span className="w-5 text-center font-medium text-gray-500">
                      {typeLabel}
                    </span>
                    <span className="flex-1 font-mono text-gray-700">
                      #{control.code}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveControlInCourse(courseId, index, index - 1);
                      }}
                      disabled={isFirst}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:invisible"
                      title="Move up"
                    >
                      &uarr;
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveControlInCourse(courseId, index, index + 1);
                      }}
                      disabled={isLast}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:invisible"
                      title="Move down"
                    >
                      &darr;
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeControlFromCourse(courseId, cc.controlId);
                      }}
                      className="rounded px-1 text-red-300 hover:text-red-600"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Empty state when no courses */}
      {!course && (
        <div className="px-3 py-2 text-xs text-gray-400">
          Add a course to get started
        </div>
      )}
    </div>
  );
}
