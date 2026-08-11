import { useMemo, useState } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useModalClose } from './use-modal-close';
import { BottomSheet } from './bottom-sheet';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { assignRelayTeams, type RelayIssue } from '@/core/models/relay-assignment';
import { resolveGenerators } from '@/core/models/variation-enumerator';
import { saveString, saveBlob, sanitizeFilename } from '@/core/files/download';
import { useT } from '@/i18n/use-t';
import type { TranslationKey } from '@/i18n/translations';
import type { CourseId } from '@/utils/id';
import type { RelaySettings } from '@/core/models/types';

/** Translation key for each fixed-pin issue kind. */
const ISSUE_KEYS: Record<RelayIssue['kind'], TranslationKey> = {
  legUnassignable: 'relayIssueLegUnassignable',
  legPinnedOutOfRange: 'relayIssueLegOutOfRange',
  unknownBranch: 'relayIssueUnknownBranch',
  duplicateLegPin: 'relayIssueDuplicateLegPin',
};

interface RelayModalProps {
  courseId: CourseId;
  onClose: () => void;
}

const DEFAULT_SETTINGS: RelaySettings = { firstTeamNumber: 1, teams: 0, legs: 1 };

/**
 * Relay team-assignment modal (E10 Phase 3). Configure teams × legs and preview
 * the per-(team, leg) variation grid, with IOF XML / PDF export. Launched from the
 * Variations section (via tool-store `relayModalCourseId`) and mounted from the
 * toolbar, mirroring the Audit modal's responsive desktop/BottomSheet structure.
 */
export function RelayModal({ courseId, onClose }: RelayModalProps) {
  const t = useT();
  const breakpoint = useBreakpoint();
  const event = useEventStore((s) => s.event);
  const setRelaySettings = useEventStore((s) => s.setRelaySettings);
  const toggleRelayFixedLeg = useEventStore((s) => s.toggleRelayFixedLeg);
  const [fixedOpen, setFixedOpen] = useState(false);

  const courseIndex = event?.courses.findIndex((c) => c.id === courseId) ?? -1;
  const course = courseIndex >= 0 ? event!.courses[courseIndex] : undefined;
  const settings = course?.relay ?? DEFAULT_SETTINGS;

  // `course` changes reference on every settings/variation edit (Immer), and the
  // assignment only reads `event.controls`, so those two deps are sufficient.
  const assignment = useMemo(() => {
    if (!course || !event) return null;
    return assignRelayTeams(course, event.controls, settings);
  }, [course, event?.controls, settings]);

  // Fork generators only — loops carry no branch choice, so they can't be pinned.
  const forkGens = useMemo(
    () => (course ? resolveGenerators(course).generators.filter((g) => g.fork.kind === 'fork') : []),
    [course],
  );

  if (!course || !event) return null;

  const update = (patch: Partial<RelaySettings>) => setRelaySettings(courseId, patch);
  const canExport = settings.teams > 0 && assignment != null && assignment.teams.length > 0;
  const anchorCode = (anchorIndex: number): number | undefined =>
    event!.controls[course!.controls[anchorIndex]!.controlId]?.code;
  const issueText = (iss: RelayIssue): string =>
    t(ISSUE_KEYS[iss.kind], { code: iss.anchorCode, leg: (iss.leg ?? 0) + 1 });

  const handleExportXml = async () => {
    const { exportRelayIofXml } = await import('@/core/iof/export-relay-xml');
    const xml = exportRelayIofXml(event, course);
    const base = sanitizeFilename(event.name || course.name, 'relay');
    await saveString(xml, `${base}-relay.xml`, 'application/xml', [
      { description: 'IOF XML', accept: { 'application/xml': ['.xml'] } },
    ]);
  };

  const handleExportPdf = async () => {
    const { generateRelayTablePdf } = await import('@/core/export/pdf-relay-table');
    const { blob, suggestedName } = await generateRelayTablePdf(event, courseIndex);
    await saveBlob(blob, suggestedName, [
      { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } },
    ]);
  };

  const legHeaders = Array.from({ length: settings.legs }, (_, l) => l + 1);

  const content = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('relayTeamsTitle')}</h2>
          <p className="text-xs text-gray-500">{course.name}</p>
        </div>
        <button onClick={onClose} className="text-lg text-gray-400 hover:text-gray-600">
          &times;
        </button>
      </div>

      {/* Settings */}
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-4 py-3">
        <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {t('relayFirstTeamNumber')}
          <input
            type="number"
            min={0}
            value={settings.firstTeamNumber}
            onChange={(e) => update({ firstTeamNumber: Number(e.target.value) })}
            className="mt-0.5 w-20 rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 outline-none focus:border-violet-400"
          />
        </label>
        <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {t('relayTeams')}
          <input
            type="number"
            min={0}
            value={settings.teams}
            onChange={(e) => update({ teams: Number(e.target.value) })}
            className="mt-0.5 w-20 rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 outline-none focus:border-violet-400"
          />
        </label>
        <label className="flex flex-col text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {t('relayLegs')}
          <input
            type="number"
            min={1}
            value={settings.legs}
            onChange={(e) => update({ legs: Number(e.target.value) })}
            className="mt-0.5 w-20 rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 outline-none focus:border-violet-400"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <button
            disabled={!canExport}
            onClick={handleExportXml}
            className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {t('relayExportXml')}
          </button>
          <button
            disabled={!canExport}
            onClick={handleExportPdf}
            className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {t('relayExportPdf')}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {assignment && assignment.warnings.length > 0 && (
        <ul className="space-y-0.5 border-b border-gray-100 bg-amber-50 px-4 py-2">
          {assignment.warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-amber-700">
              ⚠{' '}
              {t('relayUnevenDivisionWarning', {
                code: w.anchorCode,
                more: w.moreLabels.join(''),
                moreLegs: w.moreLegs,
                less: w.lessLabels.join(''),
                lessLegs: w.lessLegs,
              })}
            </li>
          ))}
        </ul>
      )}
      {assignment && settings.teams > assignment.totalVariations && assignment.totalVariations > 1 && (
        <p className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-[11px] text-blue-700">
          ℹ {t('relayDuplicateTeamsNote', { n: settings.teams - assignment.totalVariations })}
        </p>
      )}

      {/* Fixed-pin validation errors */}
      {assignment && assignment.issues.length > 0 && (
        <ul className="space-y-0.5 border-b border-gray-100 bg-red-50 px-4 py-2">
          {assignment.issues.map((iss, i) => (
            <li key={i} className="text-[11px] text-red-700">
              ⚠ {issueText(iss)}
            </li>
          ))}
        </ul>
      )}

      {/* Fixed legs (E10 Phase 3b) — only forks can be pinned */}
      {settings.teams > 0 && forkGens.length > 0 && (
        <div className="border-b border-gray-100 px-4 py-2">
          <button
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-400"
            onClick={() => setFixedOpen((v) => !v)}
          >
            <span>{t('relayFixedLegsTitle')}</span>
            <span>{fixedOpen ? '▲' : '▼'}</span>
          </button>
          {fixedOpen && (
            <div className="mt-1 space-y-2">
              <p className="text-[10px] italic text-gray-400">{t('relayFixedLegsHint')}</p>
              {forkGens.map((gen) => (
                <div key={gen.fork.id}>
                  <div className="mb-0.5 text-[11px] font-medium text-gray-600">
                    {t('forkAtControl', { code: anchorCode(gen.anchorIndex) ?? '?' })}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-[11px]">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 bg-white px-1.5 py-0.5" />
                          {legHeaders.map((n) => (
                            <th key={n} className="px-1.5 py-0.5 font-normal text-gray-400">
                              {t('relayLeg', { n })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gen.fork.branches.map((b) => (
                          <tr key={b.id}>
                            <td className="sticky left-0 z-10 bg-white px-1.5 py-0.5 font-medium text-violet-700">
                              {b.label}
                            </td>
                            {legHeaders.map((n) => {
                              const leg = n - 1;
                              const pinned = settings.fixedBranches?.[String(b.id)]?.includes(leg) ?? false;
                              return (
                                <td key={n} className="p-0.5 text-center">
                                  <button
                                    aria-label={`${t('relayBranchRow', { label: b.label })} ${t('relayLeg', { n })}`}
                                    aria-pressed={pinned}
                                    onClick={() => toggleRelayFixedLeg(courseId, gen.fork.id, b.id, leg)}
                                    className={`h-5 w-6 rounded border text-[10px] ${
                                      pinned
                                        ? 'border-violet-500 bg-violet-500 text-white'
                                        : 'border-gray-200 text-gray-300 hover:bg-violet-50'
                                    }`}
                                  >
                                    {pinned ? '●' : ''}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-auto" style={{ maxHeight: breakpoint === 'lg' ? '400px' : undefined }}>
        {!assignment || assignment.teams.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            {assignment && assignment.totalVariations <= 1 ? t('relayNoVariations') : `${t('relayTeams')}: 0`}
          </p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-gray-50">
                <th className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">
                  {t('relayTeamColumn')}
                </th>
                {legHeaders.map((n) => (
                  <th key={n} className="border border-gray-200 px-2 py-1 font-semibold text-gray-600">
                    {t('relayLeg', { n })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignment.teams.map((team) => (
                <tr key={team.teamNumber}>
                  <td className="border border-gray-200 px-2 py-1 font-medium text-gray-500">
                    {team.teamNumber}
                  </td>
                  {team.legs.map((code, l) => (
                    <td key={l} className="border border-gray-200 px-2 py-1 text-center font-mono text-violet-700">
                      {code || '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  if (breakpoint === 'lg') {
    return <DesktopModal onClose={onClose}>{content}</DesktopModal>;
  }
  return (
    <BottomSheet open onClose={onClose} snapPoints={breakpoint === 'sm' ? [0.15, 0.9] : [0.15, 0.7]} initialSnap={1}>
      {content}
    </BottomSheet>
  );
}

function DesktopModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { handleBackdropClick } = useModalClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleBackdropClick}>
      <div className="max-h-[85vh] w-[min(48rem,92vw)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        {children}
      </div>
    </div>
  );
}
