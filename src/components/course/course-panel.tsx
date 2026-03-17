import { useState } from 'react';
import type { Course, Control, CourseControlType } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { useEventStore } from '@/stores/event-store';
import { calculateCourseLength } from '@/core/geometry/course-length';
import { CourseList } from './course-tabs';
import { SUPPORTED_IOF_LANGUAGES } from '@/i18n/languages';
import { useT } from '@/i18n/use-t';

interface CoursePanelProps {
  course: Course | null;
  controls: Record<ControlId, Control>;
  courseId: CourseId | null;
  selectedControlId: ControlId | null;
}

/** Middle-control types that can be cycled through. */
const MIDDLE_CONTROL_TYPES: CourseControlType[] = ['control', 'crossingPoint', 'mapExchange'];

/** Display label for each control type in the panel. */
function typeLabel(type: CourseControlType, index: number): string {
  switch (type) {
    case 'start': return 'S';
    case 'finish': return 'F';
    case 'crossingPoint': return 'X';
    case 'mapExchange': return 'ME';
    default: return String(index + 1);
  }
}

/** Next type in the cycle for middle controls. */
function nextMiddleType(current: CourseControlType): CourseControlType {
  const idx = MIDDLE_CONTROL_TYPES.indexOf(current);
  return MIDDLE_CONTROL_TYPES[(idx + 1) % MIDDLE_CONTROL_TYPES.length] ?? 'control';
}

export function CoursePanel({
  course,
  controls,
  courseId,
  selectedControlId,
}: CoursePanelProps) {
  const t = useT();
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const descriptionLang = useEventStore((s) => s.event?.settings.language ?? 'en');
  const updateSettings = useEventStore((s) => s.updateSettings);
  const setSelectedControl = useEventStore((s) => s.setSelectedControl);
  const moveControlInCourse = useEventStore((s) => s.moveControlInCourse);
  const removeControlFromCourse = useEventStore((s) => s.removeControlFromCourse);
  const setControlCode = useEventStore((s) => s.setControlCode);
  const setCourseControlType = useEventStore((s) => s.setCourseControlType);
  const setCourseType = useEventStore((s) => s.setCourseType);
  const setControlScore = useEventStore((s) => s.setControlScore);

  const [editingCodeId, setEditingCodeId] = useState<ControlId | null>(null);
  const [codeDraft, setCodeDraft] = useState(0);
  const [editingScoreIndex, setEditingScoreIndex] = useState<number | null>(null);
  const [scoreDraft, setScoreDraft] = useState(0);

  const lengthMetres =
    course && mapFile
      ? calculateCourseLength(course.controls, controls, mapFile.scale, mapFile.dpi)
      : 0;
  const lengthKm = (lengthMetres / 1000).toFixed(1);

  const isScoreCourse = course?.courseType === 'score';

  return (
    <div className="absolute right-4 top-4 w-56 rounded bg-white/90 shadow">
      {/* Course list — always visible */}
      <CourseList />

      {/* Active course details */}
      {course && courseId && (
        <>
          {/* Course stats + course type toggle */}
          <div className="border-b border-gray-200 px-3 py-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {course.controls.length} {course.controls.length !== 1 ? t('controls') : t('control')}
                {!isScoreCourse && course.controls.length >= 2 && ` \u00B7 ${lengthKm} ${t('km')}`}
              </div>
              <button
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isScoreCourse
                    ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title={t('courseType')}
                onClick={() => setCourseType(courseId, isScoreCourse ? 'normal' : 'score')}
              >
                {isScoreCourse ? t('scoreCourse') : t('normalCourse')}
              </button>
            </div>
          </div>

          {/* Control list */}
          {course.controls.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">
              {t('noControlsYet')}
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {course.controls.map((cc, index) => {
                const control = controls[cc.controlId];
                if (!control) return null;

                const isSelected = cc.controlId === selectedControlId;
                const isFirst = index === 0;
                const isLast = index === course.controls.length - 1;
                const isMiddle = !isFirst && !isLast;
                const label = typeLabel(cc.type, index);

                return (
                  <li
                    key={cc.controlId}
                    className={`flex items-center gap-1 px-3 py-1 text-xs ${
                      isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedControl(cc.controlId)}
                  >
                    {/* Type indicator — clickable to cycle for middle controls */}
                    {isMiddle ? (
                      <button
                        className="w-6 shrink-0 text-center font-medium text-violet-500 hover:text-violet-700 rounded hover:bg-violet-50"
                        title={t('courseControlType')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCourseControlType(courseId, index, nextMiddleType(cc.type));
                        }}
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="w-6 shrink-0 text-center font-medium text-gray-500">
                        {label}
                      </span>
                    )}

                    {editingCodeId === cc.controlId ? (
                      <input
                        autoFocus
                        type="number"
                        min={31}
                        value={codeDraft}
                        className="w-14 flex-1 font-mono text-gray-700 border-b border-violet-400 bg-transparent outline-none px-1 text-xs"
                        onChange={(e) => setCodeDraft(Number(e.target.value))}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            if (codeDraft > 30) setControlCode(cc.controlId, codeDraft);
                            setEditingCodeId(null);
                          }
                          if (e.key === 'Escape') {
                            setEditingCodeId(null);
                          }
                        }}
                        onBlur={() => {
                          if (codeDraft > 30) setControlCode(cc.controlId, codeDraft);
                          setEditingCodeId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="flex-1 font-mono text-gray-700 cursor-pointer hover:text-violet-600"
                        title={t('clickToEditCode')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCodeId(cc.controlId);
                          setCodeDraft(control.code);
                        }}
                      >
                        #{control.code}
                      </span>
                    )}

                    {/* Score value — shown for score courses, editable */}
                    {isScoreCourse && (
                      editingScoreIndex === index ? (
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          value={scoreDraft}
                          className="w-10 font-mono text-gray-700 border-b border-violet-400 bg-transparent outline-none px-1 text-xs text-right"
                          onChange={(e) => setScoreDraft(Number(e.target.value))}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              if (e.key === 'Enter' && scoreDraft >= 0) {
                                setControlScore(courseId, index, scoreDraft || undefined);
                              }
                              setEditingScoreIndex(null);
                            }
                          }}
                          onBlur={() => {
                            if (scoreDraft >= 0) {
                              setControlScore(courseId, index, scoreDraft || undefined);
                            }
                            setEditingScoreIndex(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="w-10 text-right font-mono text-violet-600 cursor-pointer hover:text-violet-800 shrink-0"
                          title={t('scoreLabel')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingScoreIndex(index);
                            setScoreDraft(cc.score ?? 0);
                          }}
                        >
                          {cc.score ?? '—'}
                        </span>
                      )
                    )}

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
                      title={t('removeFromCourse')}
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

      {/* Description language selector — always visible when event is loaded */}
      <div className="border-t border-gray-200 px-3 py-2">
        <label className="block text-[10px] font-medium text-gray-400 mb-1">
          {t('descriptionLanguageLabel')}
        </label>
        <select
          value={descriptionLang}
          onChange={(e) => updateSettings({ language: e.target.value })}
          className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-600 outline-none focus:border-violet-400"
        >
          {SUPPORTED_IOF_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName} ({lang.englishName})
            </option>
          ))}
        </select>
      </div>

      {/* Empty state when no courses */}
      {!course && (
        <div className="px-3 py-2 text-xs text-gray-400">
          {t('addCourseToStart')}
        </div>
      )}
    </div>
  );
}
