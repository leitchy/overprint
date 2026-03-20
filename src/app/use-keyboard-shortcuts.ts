import { useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { isEditableTarget } from '@/utils/dom';

/**
 * Global keyboard shortcuts for the app.
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - ?: Keyboard shortcuts modal
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
      } else if (e.key === '?' && !mod) {
        e.preventDefault();
        useToolStore.getState().toggleShortcutsModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
