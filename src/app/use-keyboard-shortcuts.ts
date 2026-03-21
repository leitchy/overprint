import { useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import { useGpsStore } from '@/stores/gps-store';
import { useToastStore } from '@/stores/toast-store';
import { isEditableTarget } from '@/utils/dom';
import { hapticTap } from '@/utils/haptics';

/**
 * Global keyboard shortcuts for the app.
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - ?: Keyboard shortcuts modal
 * - G: Place control at GPS position (when addControl tool active + GPS has fix)
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
      } else if ((e.key === 'g' || e.key === 'G') && !mod) {
        // Place control at GPS position
        const tool = useToolStore.getState().activeTool;
        if (tool.type !== 'addControl') return;
        const { enabled, mapPoint, status } = useGpsStore.getState();
        if (!enabled || !mapPoint || (status !== 'active' && status !== 'poor-signal')) return;
        e.preventDefault();
        useEventStore.getState().addControlToCourse({ x: mapPoint.x, y: mapPoint.y });
        hapticTap();
        useToastStore.getState().addToast('Control placed at GPS position');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
