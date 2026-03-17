import type { OverprintEvent } from '@/core/models/types';
import type { ControlId } from '@/utils/id';
import { asControlId, asCourseId, asEventId } from '@/utils/id';
import { DEFAULT_EVENT_SETTINGS } from '@/core/models/defaults';

const FORMAT_ID = 'overprint';
const SUPPORTED_MAJOR_VERSION = 0; // 0.x.x

interface OverprintFileEnvelope {
  formatId: string;
  version: string;
  event: OverprintEvent;
}

/**
 * Serialize an OverprintEvent to a JSON string for saving as .overprint file.
 * The map image is NOT included — only mapFile metadata (name, type, scale, dpi).
 */
export function serializeEvent(event: OverprintEvent): string {
  const envelope: OverprintFileEnvelope = {
    formatId: FORMAT_ID,
    version: event.version,
    event,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Deserialize a .overprint JSON string back to an OverprintEvent.
 * Validates format ID and version, restores branded IDs.
 */
export function deserializeEvent(json: string): OverprintEvent {
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
  return restoreBrandedIds(rawEvent as unknown as OverprintEvent);
}

/**
 * Walk the event object and cast string IDs back to branded types.
 * Also apply defaults for any missing fields (forward compat).
 */
function restoreBrandedIds(raw: OverprintEvent): OverprintEvent {
  // Restore event ID
  const event: OverprintEvent = {
    ...raw,
    id: asEventId(raw.id as unknown as string),
    settings: {
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
    },
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

  // Restore course IDs and CourseControl controlIds
  event.courses = raw.courses.map((course) => ({
    ...course,
    id: asCourseId(course.id as unknown as string),
    controls: course.controls.map((cc) => ({
      ...cc,
      controlId: asControlId(cc.controlId as unknown as string),
    })),
    settings: course.settings ?? {},
  }));

  return event;
}
