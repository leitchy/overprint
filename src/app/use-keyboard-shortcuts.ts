import { useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import { isEditableTarget } from '@/utils/dom';

/**
 * Global keyboard shortcuts for the app.
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEventStore.temporal.getState().undo();
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useEventStore.temporal.getState().redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
