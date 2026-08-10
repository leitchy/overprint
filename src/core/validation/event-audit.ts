import type { Control, Course, CourseControl, OverprintEvent } from '@/core/models/types';
import { forEachCourseControl } from '@/core/models/course-controls';
import { enumerateVariations } from '@/core/models/variation-enumerator';
import { courseForkIssues, type ForkIssueKind } from '@/core/models/fork-validation';
import type { ControlId, CourseId } from '@/utils/id';
import { mapDistanceMetres } from '@/core/geometry/distance';
import { AMBIGUOUS_PAIRS, SELF_AMBIGUOUS_CODES } from './ambiguous-codes';

export type AuditSeverity = 'error' | 'warning';

export interface AuditItem {
  severity: AuditSeverity;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  courseId?: CourseId;
  controlId?: ControlId;
}

export interface AuditContext {
  imgWidth: number;
  imgHeight: number;
}

const SHORT_LEG_THRESHOLD = 30; // metres
const LONG_LEG_THRESHOLD = 3000; // metres
const CLOSE_CONTROL_THRESHOLD = 100; // metres — controls of the same feature closer than this

/**
 * Audit an event for common course setting errors and warnings.
 * Pure function — no store access, no side effects.
 * Returns items sorted: errors first, then warnings.
 */
export function auditEvent(
  event: OverprintEvent,
  mapContext?: AuditContext,
): AuditItem[] {
  const items: AuditItem[] = [];
  const { controls, courses, mapFile } = event;

  // --- Event-level checks ---

  if (!mapFile) {
    items.push({ severity: 'error', messageKey: 'auditNoMap' });
  }

  // --- Duplicate control codes (O(n) via Map) ---

  const codeToId = new Map<number, ControlId>();
  const reportedDuplicates = new Set<number>();
  for (const control of Object.values(controls)) {
    const existing = codeToId.get(control.code);
    if (existing && !reportedDuplicates.has(control.code)) {
      items.push({
        severity: 'error',
        messageKey: 'auditDuplicateCode',
        messageParams: { code: control.code },
        controlId: control.id,
      });
      reportedDuplicates.add(control.code);
    } else {
      codeToId.set(control.code, control.id);
    }
  }

  // --- Ambiguous codes ---

  for (const control of Object.values(controls)) {
    const pair = AMBIGUOUS_PAIRS[control.code];
    if (pair !== undefined && codeToId.has(pair)) {
      // Only report once per pair
      if (control.code < pair) {
        items.push({
          severity: 'warning',
          messageKey: 'auditAmbiguousCode',
          messageParams: { code: control.code, other: pair },
          controlId: control.id,
        });
      }
    }
    if (SELF_AMBIGUOUS_CODES.has(control.code)) {
      items.push({
        severity: 'warning',
        messageKey: 'auditAmbiguousSelf',
        messageParams: { code: control.code },
        controlId: control.id,
      });
    }
  }

  // --- Control outside map bounds ---

  if (mapContext) {
    for (const control of Object.values(controls)) {
      const { x, y } = control.position;
      if (x < 0 || y < 0 || x > mapContext.imgWidth || y > mapContext.imgHeight) {
        items.push({
          severity: 'warning',
          messageKey: 'auditControlOutOfBounds',
          messageParams: { code: control.code },
          controlId: control.id,
        });
      }
    }
  }

  // --- Missing descriptions ---

  for (const control of Object.values(controls)) {
    if (!control.description.columnD) {
      items.push({
        severity: 'warning',
        messageKey: 'auditMissingDescription',
        messageParams: { code: control.code },
        controlId: control.id,
      });
    }
  }

  // --- Unused controls ---

  const usedControlIds = new Set<ControlId>();
  for (const course of courses) {
    // Walk trunk AND fork-branch controls — a control used only inside a
    // branch is still used (no false "unused control" warning).
    forEachCourseControl(course, (cc) => {
      usedControlIds.add(cc.controlId);
    });
  }
  for (const control of Object.values(controls)) {
    if (!usedControlIds.has(control.id)) {
      items.push({
        severity: 'warning',
        messageKey: 'auditUnusedControl',
        messageParams: { code: control.code },
        controlId: control.id,
      });
    }
  }

  // --- Controls too close with the same feature (may confuse competitors) ---

  if (mapFile) {
    const list = Object.values(controls);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const fa = a.description.columnD;
        if (!fa || fa !== b.description.columnD) continue;
        const dist = mapDistanceMetres(a.position, b.position, mapFile.scale, mapFile.dpi);
        if (dist < CLOSE_CONTROL_THRESHOLD) {
          items.push({
            severity: 'warning',
            messageKey: 'auditCloseControlsSameFeature',
            messageParams: { codeA: a.code, codeB: b.code, dist: Math.round(dist) },
            controlId: a.id,
          });
        }
      }
    }
  }

  // --- Legs run in opposite directions across courses (head-on risk) ---

  const directedLegs = new Set<string>(); // "aId->bId"
  for (const course of courses) {
    for (let i = 1; i < course.controls.length; i++) {
      const a = course.controls[i - 1]!.controlId;
      const b = course.controls[i]!.controlId;
      if (a !== b) directedLegs.add(`${a}->${b}`);
    }
  }
  const reportedOpposite = new Set<string>();
  for (const leg of directedLegs) {
    const [a, b] = leg.split('->') as [ControlId, ControlId];
    if (!directedLegs.has(`${b}->${a}`)) continue;
    const key = [a, b].sort().join('|');
    if (reportedOpposite.has(key)) continue;
    reportedOpposite.add(key);
    const ca = controls[a];
    const cb = controls[b];
    if (ca && cb) {
      items.push({
        severity: 'warning',
        messageKey: 'auditOppositeLegs',
        messageParams: { codeA: ca.code, codeB: cb.code },
      });
    }
  }

  // --- Per-course checks, run per enumerated fork variation (E10) ---
  // A no-fork course yields one variation over its own controls, so the checks
  // (and their output) are exactly the pre-fork behaviour. For forked courses,
  // every branch combination is checked; a finding that appears in EVERY
  // variation is trunk-level and reported once under the plain course name,
  // while a branch-specific finding keeps the variation-coded name.

  for (const course of courses) {
    const { variations } = enumerateVariations(course);
    const grouped = new Map<string, { item: AuditItem; count: number }>();

    for (const v of variations) {
      const name = v.code ? `${course.name} ${v.code}` : course.name;
      const vItems = auditCourseControls(v.controls, course, name, controls, mapFile);
      for (const item of vItems) {
        // Dedupe across variations on everything EXCEPT the (coded) name.
        const { name: _name, ...rest } = item.messageParams ?? {};
        const key = `${item.messageKey}|${item.controlId ?? ''}|${JSON.stringify(rest)}`;
        const g = grouped.get(key);
        if (g) g.count += 1;
        else grouped.set(key, { item, count: 1 });
      }
    }

    for (const { item, count } of grouped.values()) {
      if (count === variations.length && item.messageParams?.name != null) {
        item.messageParams = { ...item.messageParams, name: course.name };
      }
      items.push(item);
    }

    // Structural fork issues (incomplete/invalid forks) — surfaced as errors
    // so a half-built fork is caught before export.
    for (const issue of courseForkIssues(course)) {
      items.push({
        // tooManyLoops is a legibility hint, not a blocker; everything else is structural.
        severity: issue.kind === 'tooManyLoops' ? 'warning' : 'error',
        messageKey: FORK_ISSUE_MESSAGE_KEYS[issue.kind],
        messageParams: { name: course.name },
        courseId: course.id,
      });
    }
  }

  // Sort: errors first, then warnings
  items.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });

  return items;
}

/** Audit messageKey for each structural fork issue kind. */
const FORK_ISSUE_MESSAGE_KEYS: Record<ForkIssueKind, string> = {
  anchorUnresolved: 'auditForkAnchorUnresolved',
  anchorIsExchange: 'auditForkAnchorIsExchange',
  rejoinAcrossExchange: 'auditForkRejoinAcrossExchange',
  exchangeInBranch: 'auditForkExchangeInBranch',
  scoreCourse: 'auditForkScoreCourse',
  duplicateLabel: 'auditForkDuplicateLabel',
  emptyBranch: 'auditForkEmptyBranch',
  tooFewLoops: 'auditForkTooFewLoops',
  duplicateAnchor: 'auditForkDuplicateAnchor',
  tooManyLoops: 'auditForkTooManyLoops',
};

/**
 * The per-course checks, over ONE linear control sequence (a single enumerated
 * variation — or the course's own controls when it has no forks).
 * `courseName` already carries the variation code where applicable.
 */
function auditCourseControls(
  courseControls: CourseControl[],
  course: Course,
  courseName: string,
  controls: Record<ControlId, Control>,
  mapFile: OverprintEvent['mapFile'],
): AuditItem[] {
  const items: AuditItem[] = [];
  const courseId = course.id;

  // Consecutive duplicate controls (zero-length leg — a planning error)
  for (let i = 1; i < courseControls.length; i++) {
    if (courseControls[i]!.controlId === courseControls[i - 1]!.controlId) {
      const c = controls[courseControls[i]!.controlId];
      items.push({
        severity: 'error',
        messageKey: 'auditConsecutiveDuplicate',
        messageParams: { name: courseName, code: c ? c.code : 0 },
        courseId,
        controlId: courseControls[i]!.controlId,
      });
    }
  }

  // Empty course
  if (courseControls.length === 0) {
    items.push({
      severity: 'error',
      messageKey: 'auditEmptyCourse',
      messageParams: { name: courseName },
      courseId,
    });
    return items;
  }

  // Missing start/finish (normal courses only)
  if (course.courseType === 'normal') {
    const hasStart = courseControls.some((cc) => cc.type === 'start');
    const hasFinish = courseControls.some((cc) => cc.type === 'finish');
    if (!hasStart) {
      items.push({
        severity: 'error',
        messageKey: 'auditMissingStart',
        messageParams: { name: courseName },
        courseId,
      });
    }
    if (!hasFinish) {
      items.push({
        severity: 'error',
        messageKey: 'auditMissingFinish',
        messageParams: { name: courseName },
        courseId,
      });
    }
  }

  // Score course without scores
  if (course.courseType === 'score') {
    const missingScores = courseControls.some(
      (cc) => cc.type === 'control' && cc.score === undefined,
    );
    if (missingScores) {
      items.push({
        severity: 'warning',
        messageKey: 'auditScoreNoPoints',
        messageParams: { name: courseName },
        courseId,
      });
    }
  }

  // Leg length checks (need mapFile for distance calculation)
  if (mapFile && course.courseType === 'normal') {
    for (let i = 1; i < courseControls.length; i++) {
      const prevCtrl = controls[courseControls[i - 1]!.controlId];
      const currCtrl = controls[courseControls[i]!.controlId];
      if (!prevCtrl || !currCtrl) continue;

      const dist = mapDistanceMetres(
        prevCtrl.position,
        currCtrl.position,
        mapFile.scale,
        mapFile.dpi,
      );

      if (dist < SHORT_LEG_THRESHOLD) {
        items.push({
          severity: 'warning',
          messageKey: 'auditShortLeg',
          messageParams: {
            length: Math.round(dist),
            name: courseName,
            from: prevCtrl.code,
            to: currCtrl.code,
          },
          courseId,
          controlId: currCtrl.id,
        });
      } else if (dist > LONG_LEG_THRESHOLD) {
        items.push({
          severity: 'warning',
          messageKey: 'auditLongLeg',
          messageParams: {
            length: Math.round(dist),
            name: courseName,
            from: prevCtrl.code,
            to: currCtrl.code,
          },
          courseId,
          controlId: currCtrl.id,
        });
      }
    }
  }

  return items;
}
