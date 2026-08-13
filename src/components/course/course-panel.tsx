import { useMemo, useState } from 'react';
import type { Course, Control, CourseControlType } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { useEventStore } from '@/stores/event-store';
import { calculateCourseLength } from '@/core/geometry/course-length';
import { countCourseParts, getPartControls } from '@/core/models/course-parts';
import { CourseList } from './course-tabs';
import { VariationsSection } from './variations-section';
import { SUPPORTED_IOF_LANGUAGES } from '@/i18n/languages';
import { SCALE_PRESETS } from '@/core/models/constants';
import { useT } from '@/i18n/use-t';

interface CoursePanelProps {
  course: Course | null;
  controls: Record<ControlId, Control>;
  courseId: CourseId | null;
  selectedControlId: ControlId | null;
  /** When true, skip absolute positioning (used inside drawer/sheet) */
  embedded?: boolean;
}

/** Middle-control types that can be cycled through. */
const MIDDLE_CONTROL_TYPES: CourseControlType[] = ['control', 'crossingPoint', 'mapExchange', 'mapFlip'];

/** Display label for each control type in the panel. */
function typeLabel(type: CourseControlType, index: number): string {
  switch (type) {
    case 'start': return 'S';
    case 'finish': return 'F';
    case 'crossingPoint': return 'X';
    case 'mapExchange': return 'ME';
    case 'mapFlip': return 'MF';
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
  embedded = false,
}: CoursePanelProps) {
  const t = useT();
  const mapFile = useEventStore((s) => s.event?.mapFile);
  const eventSettings = useEventStore((s) => s.event?.settings);
  const descriptionLang = useEventStore((s) => s.event?.settings.language ?? 'en');
  const updateSettings = useEventStore((s) => s.updateSettings);
  const updateCourseSettings = useEventStore((s) => s.updateCourseSettings);
  const clearPrintArea = useEventStore((s) => s.clearPrintArea);
  const viewMode = useEventStore((s) => s.viewMode);
  const setSelectedControl = useEventStore((s) => s.setSelectedControl);
  const moveControlInCourse = useEventStore((s) => s.moveControlInCourse);
  const removeControlFromCourse = useEventStore((s) => s.removeControlFromCourse);
  const setControlCode = useEventStore((s) => s.setControlCode);
  const setCourseControlType = useEventStore((s) => s.setCourseControlType);
  const setCourseType = useEventStore((s) => s.setCourseType);
  const setControlScore = useEventStore((s) => s.setControlScore);
  const autoPlaceNumbers = useEventStore((s) => s.autoPlaceNumbers);
  const activePartIndex = useEventStore((s) => s.activePartIndex);
  const setActivePartIndex = useEventStore((s) => s.setActivePartIndex);
  const setPartShowFinish = useEventStore((s) => s.setPartShowFinish);

  const [editingCodeId, setEditingCodeId] = useState<ControlId | null>(null);
  const [codeDraft, setCodeDraft] = useState(0);
  const [editingScoreIndex, setEditingScoreIndex] = useState<number | null>(null);
  const [scoreDraft, setScoreDraft] = useState(0);
  const [courseSettingsOpen, setCourseSettingsOpen] = useState(false);

  const isScoreCourse = course?.courseType === 'score';

  // Multi-part course support
  const totalParts = useMemo(
    () => course ? countCourseParts(course.controls) : 1,
    [course],
  );
  const isMultiPart = totalParts > 1;

  // Filter controls to active part for stats display
  const displayControls = useMemo(
    () => course && activePartIndex !== null ? getPartControls(course, activePartIndex) : course?.controls ?? [],
    [course, activePartIndex],
  );

  const lengthMetres =
    course && mapFile
      ? calculateCourseLength(displayControls, controls, mapFile.scale, mapFile.dpi)
      : 0;
  const lengthKm = (lengthMetres / 1000).toFixed(1);

  // All-controls view: collapsed panel showing only course list + language selector
  if (viewMode === 'allControls') {
    return (
      <div className={embedded ? 'w-full' : 'absolute right-4 top-4 w-64 rounded bg-surface/90 shadow'}>
        <CourseList />
        <div className="border-t border-edge px-3 py-2">
          <p className="mb-2 text-[10px] italic text-faint">{t('viewingAllControls')}</p>
          <label className="block text-[10px] font-medium text-faint mb-1">
            {t('descriptionLanguageLabel')}
          </label>
          <select
            value={descriptionLang}
            onChange={(e) => updateSettings({ language: e.target.value })}
            className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
          >
            {SUPPORTED_IOF_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.englishName})
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'w-full' : 'absolute right-4 top-4 w-64 rounded bg-surface/90 shadow'}>
      {/* Course list — always visible */}
      <CourseList />

      {/* Active course details */}
      {course && courseId && (
        <>
          {/* Course stats + course type toggle */}
          <div className="border-b border-edge px-3 py-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-faint">
                {displayControls.length} {displayControls.length !== 1 ? t('controls') : t('control')}
                {!isScoreCourse && displayControls.length >= 2 && ` \u00B7 ${lengthKm} ${t('km')}`}
              </div>
              <button
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isScoreCourse
                    ? 'bg-accent-soft-2 text-accent-text hover:bg-accent-soft-2'
                    : 'text-faint hover:text-subtle hover:bg-muted'
                }`}
                title={t('courseType')}
                onClick={() => setCourseType(courseId, isScoreCourse ? 'normal' : 'score')}
              >
                {isScoreCourse ? t('scoreCourse') : t('normalCourse')}
              </button>
            </div>

            {/* Part selector — multi-part courses only */}
            {isMultiPart && (
              <div
                role="group"
                aria-label={t('allParts')}
                className="mt-1 flex overflow-x-auto gap-1 pb-0.5"
                style={{ scrollbarWidth: 'none' }}
              >
                <button
                  aria-pressed={activePartIndex === null}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors
                    focus:outline-none focus:ring-1 focus:ring-accent-edge
                    max-lg:px-3 max-lg:py-1.5 max-lg:text-xs max-lg:min-h-11 max-lg:flex max-lg:items-center ${
                    activePartIndex === null
                      ? 'bg-accent-soft-2 text-accent-text'
                      : 'bg-muted text-subtle hover:bg-accent-soft hover:text-accent-text'
                  }`}
                  onClick={() => setActivePartIndex(null)}
                >
                  {t('allParts')}
                </button>
                {Array.from({ length: totalParts }, (_, i) => (
                  <button
                    key={i}
                    aria-pressed={activePartIndex === i}
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors
                      focus:outline-none focus:ring-1 focus:ring-accent-edge
                      max-lg:px-3 max-lg:py-1.5 max-lg:text-xs max-lg:min-h-11 max-lg:flex max-lg:items-center ${
                      activePartIndex === i
                        ? 'bg-accent-soft-2 text-accent-text'
                        : 'bg-muted text-subtle hover:bg-accent-soft hover:text-accent-text'
                    }`}
                    onClick={() => setActivePartIndex(i)}
                  >
                    {totalParts > 3 ? String(i + 1) : `${t('partLabel')} ${i + 1}`}
                  </button>
                ))}
              </div>
            )}

            {/* Finish circle — shows which part owns the finish.
                "All Parts": read-only text. Specific part: radio checkbox. */}
            {isMultiPart && courseId && (() => {
              const finishPart = course?.partOptions?.findIndex((po) => po?.showFinish) ?? -1;
              const ownerPart = finishPart >= 0 ? finishPart : totalParts - 1;

              if (activePartIndex === null) {
                // All Parts — static text showing which part has the finish
                return (
                  <div className="mt-1 text-[10px] text-faint max-lg:text-xs max-lg:py-1">
                    {t('finishOnPart')} {ownerPart + 1}
                  </div>
                );
              }

              const isOwner = activePartIndex === ownerPart;
              return (
                <label className={`mt-1 flex items-center gap-1.5 text-[10px] max-lg:text-xs max-lg:py-1 ${
                  isOwner ? 'text-accent-text' : 'text-subtle cursor-pointer'
                }`}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-edge-strong text-accent-text focus:ring-accent-edge max-lg:h-4 max-lg:w-4"
                    checked={isOwner}
                    disabled={isOwner}
                    onChange={() => {
                      for (let i = 0; i < totalParts; i++) {
                        setPartShowFinish(courseId, i, i === activePartIndex);
                      }
                    }}
                  />
                  {t('showFinishOnPart')}
                </label>
              );
            })()}
          </div>

          {/* Control list */}
          {course.controls.length === 0 ? (
            <div className="px-3 py-2 text-xs text-faint">
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
                    className={`flex items-center gap-1 px-3 py-1 text-xs max-lg:py-2.5 ${
                      isSelected ? 'bg-warning-soft' : 'hover:bg-surface-2'
                    }`}
                    onClick={() => setSelectedControl(cc.controlId)}
                  >
                    {/* Type indicator — clickable to cycle for middle controls */}
                    {isMiddle ? (
                      <button
                        className="w-6 shrink-0 text-center font-medium text-accent-text hover:text-accent-text rounded hover:bg-accent-soft"
                        title={t('courseControlType')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCourseControlType(courseId, index, nextMiddleType(cc.type));
                        }}
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="w-6 shrink-0 text-center font-medium text-subtle">
                        {label}
                      </span>
                    )}

                    {editingCodeId === cc.controlId ? (
                      <input
                        autoFocus
                        type="number"
                        min={31}
                        value={codeDraft}
                        className="w-14 flex-1 font-mono text-content-2 border-b border-accent-edge bg-transparent outline-none px-1 text-xs"
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
                        className="flex-1 font-mono text-content-2 cursor-pointer hover:text-accent-text"
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
                          className="w-10 font-mono text-content-2 border-b border-accent-edge bg-transparent outline-none px-1 text-xs text-right"
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
                          className="w-10 text-right font-mono text-accent-text cursor-pointer hover:text-accent-text shrink-0"
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
                      className="rounded px-1 text-faint hover:text-content-2 disabled:invisible max-lg:px-2 max-lg:py-1"
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
                      className="rounded px-1 text-faint hover:text-content-2 disabled:invisible max-lg:px-2 max-lg:py-1"
                      title="Move down"
                    >
                      &darr;
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeControlFromCourse(courseId, cc.controlId);
                      }}
                      className="rounded px-1 text-danger-text hover:text-danger-text max-lg:px-2 max-lg:py-1"
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

      {/* Variations (course forks, E10) — normal courses only */}
      {course && courseId && !isScoreCourse && (
        <VariationsSection
          course={course}
          controls={controls}
          courseId={courseId}
          selectedControlId={selectedControlId}
        />
      )}

      {/* Course Settings — collapsible section */}
      {course && courseId && (
        <div className="border-t border-edge">
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint hover:bg-surface-2"
            onClick={() => setCourseSettingsOpen((v) => !v)}
          >
            <span>{t('courseSettings')}</span>
            <span>{courseSettingsOpen ? '▲' : '▼'}</span>
          </button>
          {courseSettingsOpen && (
            <div className="px-3 pb-2 space-y-2">
              {/* Label mode */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('labelMode')}
                </label>
                <select
                  value={course.settings.labelMode ?? 'sequence'}
                  onChange={(e) => updateCourseSettings(courseId, { labelMode: e.target.value as 'sequence' | 'code' | 'both' | 'none' })}
                  className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                >
                  <option value="sequence">{t('labelSequence')}</option>
                  <option value="code">{t('labelCode')}</option>
                  <option value="both">{t('labelBoth')}</option>
                  <option value="none">{t('labelNone')}</option>
                </select>
              </div>

              {/* Auto-place control numbers */}
              {!isScoreCourse && (
                <button
                  onClick={() => autoPlaceNumbers(courseId)}
                  className="w-full rounded border border-accent-edge bg-accent-soft px-2 py-1 text-xs font-medium text-accent-text hover:bg-accent-soft-2"
                  title="Position all control numbers automatically to avoid legs, circles and other numbers"
                >
                  Auto-place numbers
                </button>
              )}

              {/* Description appearance */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('descriptionAppearance')}
                </label>
                <select
                  value={course.settings.descriptionAppearance ?? 'symbols'}
                  onChange={(e) => updateCourseSettings(courseId, { descriptionAppearance: e.target.value as 'symbols' | 'text' | 'symbolsAndText' })}
                  className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                >
                  <option value="symbols">{t('symbolsMode')}</option>
                  <option value="text">{t('textMode')}</option>
                  <option value="symbolsAndText">{t('symbolsAndTextMode')}</option>
                </select>
              </div>

              {/* Print scale */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('printScaleLabel')}
                </label>
                <select
                  value={course.settings.printScale ?? (eventSettings?.printScale ?? 15000)}
                  onChange={(e) => updateCourseSettings(courseId, { printScale: Number(e.target.value) })}
                  className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                >
                  <option value="">— {t('printScaleLabel')} (event default) —</option>
                  {SCALE_PRESETS.map((s) => (
                    <option key={s} value={s}>1:{s.toLocaleString()}</option>
                  ))}
                </select>
              </div>

              {/* Climb */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('climb')} ({t('climbMetres')})
                </label>
                <input
                  type="number"
                  min={0}
                  value={course.climb ?? course.settings.climb ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const val = e.target.value === '' ? undefined : Number(e.target.value);
                    updateCourseSettings(courseId, { climb: val });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                />
              </div>

              {/* Secondary title */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('secondaryTitle')}
                </label>
                <input
                  type="text"
                  value={course.settings.secondaryTitle ?? ''}
                  placeholder={t('secondaryTitlePlaceholder')}
                  onChange={(e) => updateCourseSettings(courseId, { secondaryTitle: e.target.value || undefined })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                />
              </div>

              {/* Page orientation override */}
              <div>
                <label className="block text-[10px] font-medium text-faint mb-0.5">
                  {t('orientationLabel')}
                </label>
                <select
                  value={course.settings.pageSetup?.orientation ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      // Clear override — use event default
                      const { orientation: _, ...rest } = course.settings.pageSetup ?? {};
                      const hasKeys = Object.keys(rest).length > 0;
                      updateCourseSettings(courseId, { pageSetup: hasKeys ? rest : undefined });
                    } else {
                      updateCourseSettings(courseId, {
                        pageSetup: { ...course.settings.pageSetup, orientation: val as 'portrait' | 'landscape' },
                      });
                    }
                  }}
                  className="w-full rounded border border-edge px-1 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
                >
                  <option value="">{t('useDefault')} ({eventSettings?.pageSetup.orientation ?? 'portrait'})</option>
                  <option value="portrait">{t('portrait')}</option>
                  <option value="landscape">{t('landscape')}</option>
                </select>
              </div>

              {/* Clear print area */}
              {course.settings.printArea && (
                <button
                  className="w-full rounded border border-edge px-2 py-1 text-xs text-subtle hover:border-danger hover:text-danger-text"
                  onClick={() => clearPrintArea(courseId)}
                >
                  {t('clearPrintArea')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Description language selector — always visible when event is loaded */}
      <div className="border-t border-edge px-3 py-2">
        <label className="block text-[10px] font-medium text-faint mb-1">
          {t('descriptionLanguageLabel')}
        </label>
        <select
          value={descriptionLang}
          onChange={(e) => updateSettings({ language: e.target.value })}
          className="w-full rounded border border-edge px-1.5 py-1 text-xs text-subtle outline-none focus:border-accent-edge"
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
        <div className="px-3 py-2 text-xs text-faint">
          {t('addCourseToStart')}
        </div>
      )}
    </div>
  );
}
