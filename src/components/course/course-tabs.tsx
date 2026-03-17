import { useState, useRef, useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import type { CourseId } from '@/utils/id';

/**
 * Horizontal tab bar for switching, adding, renaming, and deleting courses.
 */
export function CourseTabs() {
  const courses = useEventStore((s) => s.event?.courses ?? []);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const setActiveCourse = useEventStore((s) => s.setActiveCourse);
  const addCourse = useEventStore((s) => s.addCourse);
  const renameCourse = useEventStore((s) => s.renameCourse);
  const deleteCourse = useEventStore((s) => s.deleteCourse);

  // Which tab is currently being renamed (null = none)
  const [renamingId, setRenamingId] = useState<CourseId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the rename input when it appears
  useEffect(() => {
    if (renamingId !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  function handleRenameStart(id: CourseId, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  function handleRenameCommit() {
    if (renamingId === null) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameCourse(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  function handleRenameCancel() {
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleRenameCommit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  }

  function handleAddCourse() {
    const name = window.prompt('Course name:', `Course ${courses.length + 1}`);
    if (name && name.trim()) {
      addCourse(name.trim());
    }
  }

  function handleDeleteCourse(id: CourseId, name: string) {
    const confirmed = window.confirm(`Delete course "${name}"?`);
    if (confirmed) {
      deleteCourse(id);
    }
  }

  return (
    <div className="flex items-end overflow-x-auto border-b border-gray-200 bg-gray-50">
      {courses.map((course) => {
        const isActive = course.id === activeCourseId;
        const isRenaming = renamingId === course.id;

        return (
          <div
            key={course.id}
            className={`group relative flex min-w-0 shrink-0 items-center gap-1 border-r border-gray-200 px-3 py-2 text-sm ${
              isActive
                ? 'border-b-2 border-b-violet-500 bg-white text-gray-900'
                : 'cursor-pointer bg-gray-50 text-gray-500 hover:bg-gray-100'
            }`}
            onClick={() => {
              if (!isActive) {
                setActiveCourse(course.id);
              }
            }}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                aria-label="Course name"
                className="w-24 rounded border border-violet-400 px-1 py-0 text-sm outline-none"
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameCommit}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="max-w-32 truncate">{course.name}</span>
            )}

            {/* Pencil rename button — only on active tab */}
            {isActive && !isRenaming && (
              <button
                aria-label="Rename course"
                title="Rename course"
                className="ml-1 rounded p-0.5 text-gray-400 hover:text-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameStart(course.id, course.name);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L2.317 11.21a1.75 1.75 0 0 0-.476.89l-.455 2.732a.75.75 0 0 0 .884.884l2.732-.455a1.75 1.75 0 0 0 .89-.476l8.698-8.696a1.75 1.75 0 0 0 0-2.475ZM3.71 12.29l-.316 1.895 1.895-.316.87-.87-1.579-1.579-.87.87Zm1.44-1.44 5.5-5.5 1.579 1.579-5.5 5.5L5.15 10.85ZM11.72 4.28l.53-.53a.25.25 0 0 1 .353 0l.648.648a.25.25 0 0 1 0 .353l-.53.53-1.001-1.001Z" />
                </svg>
              </button>
            )}

            {/* Delete button — hidden when only 1 course */}
            {courses.length > 1 && (
              <button
                aria-label={`Delete ${course.name}`}
                title={`Delete ${course.name}`}
                className="ml-1 rounded p-0.5 text-gray-300 hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCourse(course.id, course.name);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      {/* Add course button */}
      <button
        aria-label="Add course"
        title="Add course"
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        onClick={handleAddCourse}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
        </svg>
        <span>Add course</span>
      </button>
    </div>
  );
}
