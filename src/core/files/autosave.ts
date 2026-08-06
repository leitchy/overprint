/**
 * Auto-save / crash recovery.
 *
 * Persists the current event (course design only — NOT the embedded map image,
 * which is large and can be re-loaded) to localStorage, debounced on changes.
 * On startup, if a draft exists and no event is loaded, the app offers to restore
 * it. Best-effort: any storage error is swallowed so it never blocks editing.
 */
import type { OverprintEvent } from '@/core/models/types';
import { serializeEvent, deserializeEvent } from './overprint-format';

const AUTOSAVE_KEY = 'overprint:autosave:v1';
/** Stay comfortably under the ~5 MB localStorage cap. */
const MAX_BYTES = 4_500_000;

interface AutosaveDraft {
  ts: number;
  name: string;
  json: string;
}

/** Persist the current event (no embedded map image, so it stays small). */
export function saveDraft(event: OverprintEvent): void {
  try {
    const json = serializeEvent(event);
    if (json.length > MAX_BYTES) return; // too large — skip silently
    const payload: AutosaveDraft = { ts: Date.now(), name: event.name, json };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch {
    // storage full / unavailable — auto-save is best-effort
  }
}

export interface DraftInfo {
  ts: number;
  name: string;
}

/** Metadata about a stored draft, or null when there is none. */
export function getDraftInfo(): DraftInfo | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as AutosaveDraft;
    if (!d?.json) return null;
    return { ts: d.ts, name: d.name };
  } catch {
    return null;
  }
}

/** Restore the event from the stored draft. Throws if none / invalid. */
export function restoreDraft(): OverprintEvent {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) throw new Error('No auto-saved draft');
  const d = JSON.parse(raw) as AutosaveDraft;
  const { event } = deserializeEvent(d.json);
  return event;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
