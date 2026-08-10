import { useMemo, useState } from 'react';
import type { Control, Course } from '@/core/models/types';
import type { ControlId, CourseId } from '@/utils/id';
import { useEventStore } from '@/stores/event-store';
import { enumerateVariations, factorial, MAX_VARIATIONS } from '@/core/models/variation-enumerator';
import { courseForkIssues, type ForkIssue, type ForkIssueKind } from '@/core/models/fork-validation';
import { calculateCourseLength, courseLengthRange } from '@/core/geometry/course-length';
import { useT } from '@/i18n/use-t';
import type { TranslationKey } from '@/i18n/translations';

interface VariationsSectionProps {
  course: Course;
  controls: Record<ControlId, Control>;
  courseId: CourseId;
  selectedControlId: ControlId | null;
}

/** Translation key for each fork issue kind. */
const ISSUE_KEYS: Record<ForkIssueKind, TranslationKey> = {
  anchorUnresolved: 'forkIssueAnchorUnresolved',
  anchorIsExchange: 'forkIssueAnchorIsExchange',
  rejoinAcrossExchange: 'forkIssueRejoinAcrossExchange',
  exchangeInBranch: 'forkIssueExchangeInBranch',
  scoreCourse: 'forkIssueScoreCourse',
  duplicateLabel: 'forkIssueDuplicateLabel',
  emptyBranch: 'forkIssueEmptyBranch',
  tooFewLoops: 'forkIssueTooFewLoops',
  duplicateAnchor: 'forkIssueDuplicateAnchor',
  tooManyLoops: 'forkIssueTooManyLoops',
};

/** Format metres as a one-decimal km string. */
function km(metres: number): string {
  return (metres / 1000).toFixed(1);
}

/**
 * Course-fork editing UI (E10.5). Collapsible "Variations" section of the
 * course panel: add/remove forks and branches, assign controls to branches,
 * pick the on-canvas variation, and vet lengths/validity. Only rendered for
 * normal (non-score) courses — forks are meaningless on score courses.
 */
export function VariationsSection({
  course,
  controls,
  courseId,
  selectedControlId,
}: VariationsSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const mapFile = useEventStore((s) => s.event?.mapFile);
  const activeVariationIndex = useEventStore((s) => s.activeVariationIndex);
  const setActiveVariationIndex = useEventStore((s) => s.setActiveVariationIndex);
  const addFork = useEventStore((s) => s.addFork);
  const addLoop = useEventStore((s) => s.addLoop);
  const removeFork = useEventStore((s) => s.removeFork);
  const addBranch = useEventStore((s) => s.addBranch);
  const removeBranch = useEventStore((s) => s.removeBranch);
  const setBranchLabel = useEventStore((s) => s.setBranchLabel);
  const addControlToBranch = useEventStore((s) => s.addControlToBranch);
  const removeControlFromBranch = useEventStore((s) => s.removeControlFromBranch);

  const forks = course.variations ?? [];
  const enumeration = useMemo(() => enumerateVariations(course), [course]);
  const issues = useMemo(() => courseForkIssues(course), [course]);
  const hasPicker = enumeration.variations.length > 1;

  // Fork anchoring uses the panel's selected control: it must be an interior
  // trunk control (entry leg + rejoin), a plain control (not S/F/exchange),
  // and not already carry a fork.
  const selectedTrunkIndex = selectedControlId
    ? course.controls.findIndex((cc) => cc.controlId === selectedControlId)
    : -1;
  const selectedCC =
    selectedTrunkIndex >= 0 ? course.controls[selectedTrunkIndex] : undefined;
  const anchorId =
    selectedTrunkIndex > 0 &&
    selectedTrunkIndex < course.controls.length - 1 &&
    selectedCC?.type === 'control' &&
    selectedCC.courseControlId !== undefined &&
    !forks.some((f) => f.anchorCourseControlId === selectedCC.courseControlId)
      ? selectedCC.courseControlId
      : null;

  // Pool controls for the per-branch "add control" picker, sorted by code
  const poolControls = useMemo(
    () => Object.values(controls).sort((a, b) => a.code - b.code),
    [controls],
  );

  const lengthRange =
    hasPicker && mapFile
      ? courseLengthRange(course, controls, mapFile.scale, mapFile.dpi)
      : null;

  const clampedIndex = Math.min(
    Math.max(activeVariationIndex, 0),
    enumeration.variations.length - 1,
  );

  const issueText = (issue: ForkIssue): string => {
    const fork = forks.find((f) => f.id === issue.forkId);
    const label = fork?.branches.find((b) => b.id === issue.branchId)?.label ?? '?';
    return t(ISSUE_KEYS[issue.kind], { label });
  };

  return (
    <div className="border-t border-gray-200">
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {t('variationsTitle')}
          {forks.length > 0 && (
            <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-violet-700 normal-case">
              {forks.length}
            </span>
          )}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-2">
          {/* Add a fork or a loop at the currently selected trunk control */}
          <div className="flex gap-1">
            <button
              disabled={!anchorId}
              onClick={() => anchorId && addFork(courseId, anchorId)}
              className="flex-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
              title={anchorId ? undefined : t('addForkHint')}
            >
              {t('addForkAtSelected')}
            </button>
            <button
              disabled={!anchorId}
              onClick={() => anchorId && addLoop(courseId, anchorId)}
              className="flex-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
              title={anchorId ? undefined : t('addForkHint')}
            >
              {t('addLoopAtSelected')}
            </button>
          </div>
          {!anchorId && (
            <p className="text-[10px] italic text-gray-400">{t('addForkHint')}</p>
          )}

          {/* Fork list */}
          {forks.map((fork) => {
            const anchorCC = course.controls.find(
              (cc) => cc.courseControlId === fork.anchorCourseControlId,
            );
            const anchorCode = anchorCC ? controls[anchorCC.controlId]?.code : undefined;
            const forkIssues = issues.filter((i) => i.forkId === fork.id);
            const isLoop = fork.kind === 'loop';

            return (
              <div key={fork.id} className="rounded border border-gray-200">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-medium text-gray-600">
                    {t(isLoop ? 'loopAtControl' : 'forkAtControl', { code: anchorCode ?? '?' })}
                    {isLoop && (
                      <span className="ml-1 text-[10px] font-normal text-gray-400">
                        {t('variationsLoopCount', { n: factorial(fork.branches.length) })}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => removeFork(courseId, fork.id)}
                    className="rounded px-1 text-red-300 hover:text-red-600"
                    title={t('removeForkLabel')}
                  >
                    &times;
                  </button>
                </div>

                {/* Inline warnings for this fork */}
                {forkIssues.length > 0 && (
                  <ul className="px-2 pb-1 space-y-0.5">
                    {forkIssues.map((issue, i) => (
                      <li key={i} className="text-[10px] text-amber-600">
                        ⚠ {issueText(issue)}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Branches */}
                {fork.branches.map((branch) => (
                  <div key={branch.id} className="border-t border-gray-100 px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        key={`${branch.id}-${branch.label}`}
                        defaultValue={branch.label}
                        maxLength={3}
                        aria-label={t('branchLabelLabel')}
                        className="w-8 rounded border border-gray-200 px-1 py-0.5 text-center text-xs font-medium text-violet-700 outline-none focus:border-violet-400"
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        onBlur={(e) =>
                          setBranchLabel(courseId, fork.id, branch.id, e.target.value)
                        }
                      />

                      {/* Branch controls as removable chips */}
                      <div className="flex flex-1 flex-wrap items-center gap-1">
                        {branch.controls.map((cc) => (
                          <button
                            key={cc.courseControlId ?? cc.controlId}
                            onClick={() =>
                              cc.courseControlId &&
                              removeControlFromBranch(courseId, fork.id, branch.id, cc.courseControlId)
                            }
                            className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] text-gray-600 hover:bg-red-50 hover:text-red-600"
                            title={t('removeFromCourse')}
                          >
                            #{controls[cc.controlId]?.code ?? '?'} &times;
                          </button>
                        ))}

                        {/* Add a pool control to this branch */}
                        <select
                          value=""
                          aria-label={t('addControlToBranchPlaceholder')}
                          onChange={(e) => {
                            if (e.target.value) {
                              addControlToBranch(courseId, fork.id, branch.id, e.target.value as ControlId);
                            }
                          }}
                          className="rounded border border-gray-200 px-0.5 py-0.5 text-[10px] text-gray-500 outline-none focus:border-violet-400"
                        >
                          <option value="">{t('addControlToBranchPlaceholder')}</option>
                          {poolControls.map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.code}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => removeBranch(courseId, fork.id, branch.id)}
                        className="rounded px-1 text-red-300 hover:text-red-600"
                        title={t('removeBranchLabel')}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}

                <div className="border-t border-gray-100 px-2 py-1">
                  <button
                    onClick={() => addBranch(courseId, fork.id)}
                    className="rounded px-1 text-[10px] font-medium text-violet-600 hover:bg-violet-50"
                  >
                    + {t(isLoop ? 'addLoopLabel' : 'addBranchLabel')}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Truncation warning — too many combinations to enumerate */}
          {enumeration.truncated && (
            <p className="rounded bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600">
              ⚠ {t('variationsTruncatedWarning', { max: MAX_VARIATIONS })}
            </p>
          )}

          {/* Variation picker — drives the canvas render */}
          {hasPicker && (
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-0.5">
                {t('variationLabel')}
                {lengthRange &&
                  ` · ${km(lengthRange.minM)}–${km(lengthRange.maxM)} ${t('km')}`}
              </label>
              <select
                value={clampedIndex}
                aria-label={t('variationLabel')}
                onChange={(e) => setActiveVariationIndex(Number(e.target.value))}
                className="w-full rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-600 outline-none focus:border-violet-400"
              >
                {enumeration.variations.map((v) => {
                  const len = mapFile
                    ? ` — ${km(calculateCourseLength(v.controls, controls, mapFile.scale, mapFile.dpi))} ${t('km')}`
                    : '';
                  return (
                    <option key={v.index} value={v.index}>
                      {v.code}{len}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
