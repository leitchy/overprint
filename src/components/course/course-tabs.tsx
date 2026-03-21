import { useState, useRef, useEffect, useCallback } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToastStore } from '@/stores/toast-store';
import type { CourseId } from '@/utils/id';
import { useT } from '@/i18n/use-t';


/**
 * Course list for the side panel — click a course to make it active,
 * with inline rename, delete, and add new course.
 */
export function CourseList() {
  const t = useT();
  const courses = useEventStore((s) => s.event?.courses ?? []);
  const activeCourseId = useEventStore((s) => s.activeCourseId);
  const viewMode = useEventStore((s) => s.viewMode);
  const setActiveCourse = useEventStore((s) => s.setActiveCourse);
  const showAllControls = useEventStore((s) => s.showAllControls);
  const addCourse = useEventStore((s) => s.addCourse);
  const duplicateCourse = useEventStore((s) => s.duplicateCourse);
  const renameCourse = useEventStore((s) => s.renameCourse);
  const deleteCourse = useEventStore((s) => s.deleteCourse);
  const visibleCourseIds = useEventStore((s) => s.visibleCourseIds);
  const toggleCourseVisibility = useEventStore((s) => s.toggleCourseVisibility);
  const showAllCourses = useEventStore((s) => s.showAllCourses);
  const hideAllCourses = useEventStore((s) => s.hideAllCourses);

  const [renamingId, setRenamingId] = useState<CourseId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Inline course creation state
  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  // Inline delete confirmation
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<CourseId | null>(null);

  useEffect(() => {
    if (renamingId !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }
  }, [creating]);

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
    // Stop ALL key events from bubbling — prevents Delete key
    // from triggering control removal while editing the name
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleRenameCommit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  }

  function handleAddCourse() {
    setCreateValue(`Course ${courses.length + 1}`);
    setCreating(true);
  }

  const handleCreateCommit = useCallback(() => {
    const trimmed = createValue.trim();
    if (trimmed) {
      addCourse(trimmed);
    }
    setCreating(false);
  }, [createValue, addCourse]);

  function handleCreateCancel() {
    setCreating(false);
  }

  function handleCreateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleCreateCommit();
    } else if (e.key === 'Escape') {
      handleCreateCancel();
    }
  }

  // Auto-cancel delete confirmation after 3s
  useEffect(() => {
    if (confirmingDeleteId === null) return;
    const timer = setTimeout(() => setConfirmingDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDeleteId]);

  function handleDeleteCourse(e: React.MouseEvent, id: CourseId) {
    e.stopPropagation();
    setConfirmingDeleteId(id);
  }

  function handleConfirmDelete(id: CourseId) {
    deleteCourse(id);
    setConfirmingDeleteId(null);
    useToastStore.getState().addToast(t('courseDeleted'));
  }

  return (
    <div className="border-b border-gray-200">
      {/* All controls entry */}
      <div
        className={`flex items-center px-3 py-1.5 text-sm italic ${
          viewMode === 'allControls'
            ? 'border-l-2 border-l-gray-400 bg-gray-50 font-medium text-gray-700'
            : 'cursor-pointer border-l-2 border-l-transparent text-gray-400 hover:bg-gray-50'
        }`}
        onClick={() => showAllControls()}
      >
        {t('allControls')}
      </div>

      {/* Thin separator + visibility bulk controls */}
      {courses.length > 1 && (
        <div className="mx-3 flex items-center justify-end gap-1 border-t border-gray-100 py-1 max-lg:py-1.5">
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-300 max-lg:text-xs max-lg:px-2 max-lg:py-1"
            onClick={() => showAllCourses()}
          >
            {t('showAll')}
          </button>
          <span className="text-[10px] text-gray-300">&middot;</span>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-300 max-lg:text-xs max-lg:px-2 max-lg:py-1"
            onClick={() => hideAllCourses()}
          >
            {t('hideAll')}
          </button>
        </div>
      )}

      {/* Course list */}
      {courses.map((course) => {
        const isActive = course.id === activeCourseId;
        const isRenaming = renamingId === course.id;
        const isConfirmingDelete = confirmingDeleteId === course.id;

        if (isConfirmingDelete) {
          return (
            <div
              key={course.id}
              className="flex items-center gap-1 border-l-2 border-l-red-400 bg-red-50 px-3 py-1.5 text-sm"
            >
              <span className="flex-1 truncate text-xs text-red-700">
                {t('confirmDelete')} &ldquo;{course.name}&rdquo;
              </span>
              <button
                className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                onClick={() => handleConfirmDelete(course.id)}
              >
                {t('yes')}
              </button>
              <button
                className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                onClick={() => setConfirmingDeleteId(null)}
              >
                {t('no')}
              </button>
            </div>
          );
        }

        const isVisible = !!visibleCourseIds[course.id];

        return (
          <div
            key={course.id}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm ${
              isActive
                ? 'border-l-2 border-l-violet-500 bg-violet-50 font-medium text-gray-900'
                : 'cursor-pointer border-l-2 border-l-transparent text-gray-500 hover:bg-gray-50'
            }`}
            onClick={() => {
              if (!isActive) setActiveCourse(course.id);
            }}
          >
            {/* Eye toggle — only on inactive courses */}
            {!isActive && (
              <button
                aria-label={isVisible ? `Hide ${course.name}` : `Show ${course.name}`}
                aria-pressed={isVisible}
                title={isVisible ? `Hide ${course.name}` : `Show ${course.name}`}
                className="shrink-0 rounded p-0.5 focus:outline-none focus:ring-1 focus:ring-violet-300 max-lg:p-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCourseVisibility(course.id);
                }}
              >
                {isVisible ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-500">
                    <path d="M8 3C4.511 3 1.486 5.032.38 7.753a.75.75 0 0 0 0 .494C1.486 10.968 4.511 13 8 13s6.514-2.032 7.62-4.753a.75.75 0 0 0 0-.494C14.514 5.032 11.489 3 8 3Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
                    <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-300">
                    <path d="M.838 1.543a.75.75 0 0 1 1.12-.025l12.5 12a.75.75 0 1 1-1.04 1.08l-2.014-1.935A8.889 8.889 0 0 1 8 13c-3.489 0-6.514-2.032-7.62-4.753a.75.75 0 0 1 0-.494 8.574 8.574 0 0 1 2.637-3.385L.863 2.568a.75.75 0 0 1-.025-1.025Zm3.423 4.577a3.5 3.5 0 0 0 4.69 4.504l-.975-.937A2 2 0 0 1 6 8c0-.088.006-.175.017-.259l-1.756-1.621Zm6.584 3.09-1.27-1.22A2 2 0 0 0 8.07 6.06l-1.2-1.153A3.5 3.5 0 0 1 11.5 8c0 .474-.094.926-.265 1.338l-.39-.128Z" />
                    <path d="M15.62 7.753A8.756 8.756 0 0 0 13.058 4.6l-1.064 1.065a7.236 7.236 0 0 1 2.15 2.588 7.253 7.253 0 0 1-6.144 4.24l-.937.9C7.396 13.463 7.7 13.5 8 13.5c3.489 0 6.514-2.532 7.62-5.247a.75.75 0 0 0 0-.494v-.006Z" />
                  </svg>
                )}
              </button>
            )}

            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                aria-label="Course name"
                className="min-w-0 flex-1 rounded border border-violet-400 px-1 py-0 text-sm outline-none"
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameCommit}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{course.name}</span>
            )}

            {/* Rename button — only on active course */}
            {isActive && !isRenaming && (
              <button
                aria-label="Rename course"
                title="Rename"
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameStart(course.id, course.name);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L2.317 11.21a1.75 1.75 0 0 0-.476.89l-.455 2.732a.75.75 0 0 0 .884.884l2.732-.455a1.75 1.75 0 0 0 .89-.476l8.698-8.696a1.75 1.75 0 0 0 0-2.475ZM3.71 12.29l-.316 1.895 1.895-.316.87-.87-1.579-1.579-.87.87Zm1.44-1.44 5.5-5.5 1.579 1.579-5.5 5.5L5.15 10.85ZM11.72 4.28l.53-.53a.25.25 0 0 1 .353 0l.648.648a.25.25 0 0 1 0 .353l-.53.53-1.001-1.001Z" />
                </svg>
              </button>
            )}

            {/* Duplicate button — only on active course */}
            {isActive && !isRenaming && (
              <button
                aria-label="Duplicate course"
                title="Duplicate"
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateCourse(course.id);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M10.5 3a.75.75 0 0 1 .75.75v1h1a.75.75 0 0 1 0 1.5h-1v1a.75.75 0 0 1-1.5 0v-1h-1a.75.75 0 0 1 0-1.5h1v-1A.75.75 0 0 1 10.5 3Z" />
                  <path d="M3.5 1A1.5 1.5 0 0 0 2 2.5v9A1.5 1.5 0 0 0 3.5 13h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 1h-9ZM3.5 2.5h9v9h-9v-9Z" />
                </svg>
              </button>
            )}

            {/* Delete button — hidden when only 1 course */}
            {courses.length > 1 && (
              <button
                aria-label={`Delete ${course.name}`}
                title="Delete"
                className="shrink-0 rounded p-0.5 text-gray-300 hover:text-red-500"
                onClick={(e) => handleDeleteCourse(e, course.id)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      {/* Inline course creation input */}
      {creating && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-l-2 border-l-violet-300 bg-violet-50">
          <input
            ref={createInputRef}
            type="text"
            value={createValue}
            aria-label={t('createCourse')}
            className="min-w-0 flex-1 rounded border border-violet-400 px-1 py-0 text-sm outline-none"
            onChange={(e) => setCreateValue(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            onBlur={handleCreateCommit}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Add course button */}
      <button
        aria-label={t('addCourse')}
        title={t('addCourse')}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        onClick={handleAddCourse}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
        </svg>
        {t('addCourse')}
      </button>
    </div>
  );
}
