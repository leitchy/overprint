import { useState } from 'react';
import { getDraftInfo, restoreDraft, clearDraft } from '@/core/files/autosave';
import { useEventStore } from '@/stores/event-store';
import { useToastStore } from '@/stores/toast-store';

/**
 * Startup banner offering to restore auto-saved work after a crash / tab close.
 * Shown only when a draft exists and no event is currently loaded.
 */
export function RecoveryPrompt() {
  const event = useEventStore((s) => s.event);
  // Snapshot the draft once on mount so restoring/creating an event doesn't hide it mid-interaction.
  const [draft] = useState(() => getDraftInfo());
  const [dismissed, setDismissed] = useState(false);

  if (event || !draft || dismissed) return null;

  const when = new Date(draft.ts).toLocaleString();

  const restore = () => {
    try {
      const restored = restoreDraft();
      useEventStore.getState().loadEvent(restored);
      useToastStore.getState().addToast('Recovered unsaved work');
    } catch {
      useToastStore.getState().addToast('Could not recover the draft');
      clearDraft();
    }
    setDismissed(true);
  };

  const discard = () => {
    clearDraft();
    setDismissed(true);
  };

  return (
    <div className="fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-accent-edge bg-surface px-4 py-2.5 shadow-lg">
      <span className="text-sm text-content-2">
        Recover unsaved work — <span className="font-medium">“{draft.name}”</span>
        <span className="text-faint"> ({when})</span>?
      </span>
      <button
        onClick={restore}
        className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Restore
      </button>
      <button
        onClick={discard}
        className="rounded px-2 py-1 text-sm text-subtle hover:text-content"
      >
        Discard
      </button>
    </div>
  );
}
