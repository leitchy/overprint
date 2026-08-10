import type { OverprintEvent, SpecialItem, CourseControl, CourseFork } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import {
  asControlId, asCourseId, asEventId, asSpecialItemId,
  asCourseControlId, asForkId, asBranchId, generateCourseControlId,
} from '@/utils/id';
import { DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';

/** Restore branded ids on a CourseControl and backfill a stable courseControlId
 *  for files saved before the fork feature existed. */
function restoreCourseControl(cc: CourseControl): CourseControl {
  return {
    ...cc,
    controlId: asControlId(cc.controlId as unknown as string),
    courseControlId: cc.courseControlId != null
      ? asCourseControlId(cc.courseControlId as unknown as string)
      : generateCourseControlId(),
  };
}

/** Restore branded ids on a course's fork/variation generators (Phase 1). */
function restoreVariations(variations: CourseFork[] | undefined): CourseFork[] | undefined {
  if (!Array.isArray(variations)) return undefined;
  return variations.map((fork) => ({
    ...fork,
    id: asForkId(fork.id as unknown as string),
    anchorCourseControlId: asCourseControlId(fork.anchorCourseControlId as unknown as string),
    branches: (fork.branches ?? []).map((branch) => ({
      ...branch,
      id: asBranchId(branch.id as unknown as string),
      controls: (branch.controls ?? []).map(restoreCourseControl),
    })),
  }));
}

const FORMAT_ID = 'overprint';
const SUPPORTED_MAJOR_VERSION = 0; // 0.x.x

interface OverprintFileEnvelope {
  formatId: string;
  version: string;
  event: OverprintEvent;
  /** Base64-encoded map image (data URL). When present, the image is auto-loaded. */
  embeddedMapImage?: string;
}

/**
 * Serialize an OverprintEvent to a JSON string for saving as .overprint file.
 * The map image is NOT included by default — only mapFile metadata.
 * Pass `embeddedMapImage` (a data URL) to create a self-contained file.
 */
export function serializeEvent(event: OverprintEvent, embeddedMapImage?: string): string {
  const envelope: OverprintFileEnvelope = {
    formatId: FORMAT_ID,
    version: event.version,
    event,
  };
  if (embeddedMapImage) {
    envelope.embeddedMapImage = embeddedMapImage;
  }
  return JSON.stringify(envelope, null, 2);
}

export interface DeserializeResult {
  event: OverprintEvent;
  embeddedMapImage?: string;
}

/**
 * Deserialize a .overprint JSON string back to an OverprintEvent.
 * Validates format ID and version, restores branded IDs.
 * Returns the event and optionally an embedded map image data URL.
 */
export function deserializeEvent(json: string): DeserializeResult {
  const parsed: unknown = JSON.parse(json);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid .overprint file: not a JSON object');
  }

  const envelope = parsed as Record<string, unknown>;

  // Validate format ID
  if (envelope['formatId'] !== FORMAT_ID) {
    throw new Error(
      `Invalid .overprint file: expected formatId "${FORMAT_ID}", got "${String(envelope['formatId'])}"`,
    );
  }

  // Validate version
  const version = String(envelope['version'] ?? '0.0.0');
  const majorVersion = parseInt(version.split('.')[0] ?? '0', 10);
  if (majorVersion > SUPPORTED_MAJOR_VERSION) {
    throw new Error(
      `Unsupported .overprint version: ${version}. This app supports version ${SUPPORTED_MAJOR_VERSION}.x.x`,
    );
  }

  const rawEvent = envelope['event'] as Record<string, unknown>;
  if (!rawEvent || typeof rawEvent !== 'object') {
    throw new Error('Invalid .overprint file: missing event data');
  }

  // Restore branded IDs and apply defaults for forward compatibility
  const event = restoreBrandedIds(rawEvent as unknown as OverprintEvent);
  const embeddedMapImage = typeof envelope['embeddedMapImage'] === 'string'
    ? envelope['embeddedMapImage'] as string
    : undefined;
  return { event, embeddedMapImage };
}

/**
 * Walk the event object and cast string IDs back to branded types.
 * Also apply defaults for any missing fields (forward compat).
 */
function restoreBrandedIds(raw: OverprintEvent): OverprintEvent {
  const mergedSettings = {
    ...DEFAULT_EVENT_SETTINGS,
    ...raw.settings,
    pageSetup: {
      ...DEFAULT_EVENT_SETTINGS.pageSetup,
      ...(raw.settings?.pageSetup ?? {}),
      margins: {
        ...DEFAULT_EVENT_SETTINGS.pageSetup.margins,
        ...(raw.settings?.pageSetup?.margins ?? {}),
      },
    },
  };

  // Migration: bump the old buggy default line width (exactly 0.2mm) to the IOF-spec
  // 0.35mm (ISOM 2017-2 §3.7). Any other deliberately-set width is left untouched.
  if (mergedSettings.lineWidth === 0.2) mergedSettings.lineWidth = 0.35;

  // Restore event ID
  const event: OverprintEvent = {
    ...raw,
    id: asEventId(raw.id as unknown as string),
    settings: mergedSettings,
  };

  // Restore control IDs in the controls record
  const controls: Record<ControlId, (typeof event.controls)[ControlId]> = {};
  for (const [key, control] of Object.entries(raw.controls)) {
    const id = asControlId(key);
    controls[id] = {
      ...control,
      id: asControlId(control.id as unknown as string),
    };
  }
  event.controls = controls;

  // Restore course IDs, CourseControl ids (incl. backfilled courseControlId), and forks
  event.courses = raw.courses.map((course) => ({
    ...course,
    id: asCourseId(course.id as unknown as string),
    controls: course.controls.map(restoreCourseControl),
    settings: course.settings ?? {},
    variations: restoreVariations(course.variations),
  }));

  // Restore special items with branded IDs (default to [] for files saved before this feature)
  const rawItems = (raw as unknown as { specialItems?: unknown[] }).specialItems ?? [];
  event.specialItems = rawItems.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const restored: SpecialItem = {
      ...(item as unknown as SpecialItem),
      id: asSpecialItemId(String(item['id'])),
    };
    // Restore courseIds entries as branded CourseId
    if (Array.isArray(item['courseIds'])) {
      (restored as { courseIds: ReturnType<typeof asCourseId>[] }).courseIds =
        (item['courseIds'] as string[]).map(asCourseId);
    }
    // Migration: legacy 'dangerousArea' was a point symbol (no vertices); it is
    // now a hatched area. Give old point items a small default polygon.
    if (restored.type === 'dangerousArea' && !Array.isArray((item as { vertices?: unknown }).vertices)) {
      (restored as unknown as { vertices: { x: number; y: number }[] }).vertices = [
        { x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }, { x: 0, y: 80 },
      ];
    }
    return restored;
  });

  return event;
}
