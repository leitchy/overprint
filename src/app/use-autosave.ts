import { useEffect, useRef } from 'react';
import { useEventStore } from '@/stores/event-store';
import { saveDraft } from '@/core/files/autosave';

/** Debounce (ms) after the last change before writing the auto-save draft. */
const DEBOUNCE_MS = 1500;

/**
 * Debounced auto-save of the current event to localStorage for crash recovery.
 * Fires on any store change (control edits, course changes, settings) and writes
 * the latest event after a short quiet period. Does nothing while no event is loaded.
 */
export function useAutosave(): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsub = useEventStore.subscribe((state) => {
      const event = state.event;
      if (!event) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saveDraft(event), DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
