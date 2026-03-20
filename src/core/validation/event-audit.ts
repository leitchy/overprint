import type { OverprintEvent } from '@/core/models/types';
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
    for (const cc of course.controls) {
      usedControlIds.add(cc.controlId);
    }
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

  // --- Per-course checks ---

  for (const course of courses) {
    const courseId = course.id;
    const courseName = course.name;

    // Empty course
    if (course.controls.length === 0) {
      items.push({
        severity: 'error',
        messageKey: 'auditEmptyCourse',
        messageParams: { name: courseName },
        courseId,
      });
      continue;
    }

    // Missing start/finish (normal courses only)
    if (course.courseType === 'normal') {
      const hasStart = course.controls.some((cc) => cc.type === 'start');
      const hasFinish = course.controls.some((cc) => cc.type === 'finish');
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
      const missingScores = course.controls.some(
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
      for (let i = 1; i < course.controls.length; i++) {
        const prevCtrl = controls[course.controls[i - 1]!.controlId];
        const currCtrl = controls[course.controls[i]!.controlId];
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
  }

  // Sort: errors first, then warnings
  items.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });

  return items;
}
