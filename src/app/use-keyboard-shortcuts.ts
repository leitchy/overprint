import { useEffect, useRef } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useToolStore } from '@/stores/tool-store';
import type { Tool } from '@/stores/tool-store';
import { useGpsStore } from '@/stores/gps-store';
import { useToastStore } from '@/stores/toast-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { zoomIn, zoomOut, fitMapToWindow } from '@/components/map/viewport-actions';
import { isEditableTarget } from '@/utils/dom';
import { hapticTap } from '@/utils/haptics';

const hasMap = () => useMapImageStore.getState().image !== null;

/** ARIA roles whose focused element consumes Space itself — don't hijack it for pan. */
const ACTIVATABLE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option',
]);

function isActivatableFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY') return true;
  const role = el.getAttribute('role');
  return role !== null && ACTIVATABLE_ROLES.has(role);
}

/**
 * Global keyboard shortcuts. Text-entry is excluded via isEditableTarget (every
 * text field in the app is input/textarea/select — no contenteditable).
 *
 * Modified:  ⌘/Ctrl+Z undo · ⇧⌘/Ctrl+Z redo · ⌘/Ctrl +/-/0 zoom in/out/fit
 * Tools:     A add-control · V pan · D descriptions · Space (hold) temporary pan
 * Other:     ? shortcuts modal · G place control at GPS position
 *
 * Map-view keys (Delete, arrow-pan) live in use-map-navigation.ts, which owns the stage.
 */
export function useKeyboardShortcuts(): void {
  // Tool active before Space-to-pan was held, restored on release/blur. null when not space-panning.
  const preSpaceToolRef = useRef<Tool | null>(null);

  useEffect(() => {
    // Restore the pre-Space tool — but only if the world still allows it: the user
    // may have changed tools during the hold (don't clobber), or the saved tool may
    // no longer be valid (map unloaded, or All-Controls view for add-control → stay on pan).
    const restorePreSpaceTool = () => {
      const saved = preSpaceToolRef.current;
      preSpaceToolRef.current = null;
      if (!saved) return;
      if (useToolStore.getState().activeTool.type !== 'pan') return; // changed during the hold
      if (!hasMap()) return; // map gone — stay on pan
      if (saved.type === 'addControl' && useEventStore.getState().viewMode === 'allControls') return;
      useToolStore.getState().setTool(saved);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      // --- Modified shortcuts (Cmd/Ctrl) --------------------------------------
      // key is compared case-insensitively: with Shift or CapsLock, e.key is 'Z'.
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useEventStore.temporal.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        useEventStore.temporal.getState().redo();
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        if (!hasMap()) return;
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && (e.key === '-' || e.key === '_')) {
        if (!hasMap()) return;
        e.preventDefault();
        zoomOut();
        return;
      }
      if (mod && e.key === '0') {
        if (!hasMap()) return;
        e.preventDefault();
        fitMapToWindow();
        return;
      }
      if (mod) return; // leave every other Cmd/Ctrl combo to the browser

      // --- Unmodified shortcuts -----------------------------------------------
      if (e.altKey) return; // leave Alt+key combos (e.g. Alt+D address bar) to the browser/OS
      if (e.repeat) return; // ignore OS key-repeat for toggles and one-shots

      if (e.key === '?') {
        e.preventDefault();
        useToolStore.getState().toggleShortcutsModal();
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'g') {
        // Place a control at the current GPS position (Add Control tool + a fix).
        const tool = useToolStore.getState().activeTool;
        if (tool.type !== 'addControl') return;
        const { enabled, mapPoint, status } = useGpsStore.getState();
        if (!enabled || !mapPoint || (status !== 'active' && status !== 'poor-signal')) return;
        e.preventDefault();
        useEventStore.getState().addControlToCourse({ x: mapPoint.x, y: mapPoint.y });
        hapticTap();
        useToastStore.getState().addToast('Control placed at GPS position');
        return;
      }

      if (!hasMap()) return; // the remaining tool shortcuts need a loaded map

      if (key === 'a') {
        // Mirror the Add Control button — unavailable in the All-Controls view.
        if (useEventStore.getState().viewMode === 'allControls') return;
        e.preventDefault();
        useToolStore.getState().setTool({ type: 'addControl' });
        return;
      }
      if (key === 'v') {
        e.preventDefault();
        useToolStore.getState().setTool({ type: 'pan' });
        return;
      }
      if (key === 'd') {
        e.preventDefault();
        useToolStore.getState().toggleDescriptionsPanel();
        return;
      }
      if (e.key === ' ') {
        if (isActivatableFocused()) return; // let a focused control use Space itself
        e.preventDefault(); // stop the page scrolling while space-panning
        const { activeTool, setTool } = useToolStore.getState();
        if (activeTool.type === 'pan') return; // already panning — nothing to save/restore
        preSpaceToolRef.current = activeTool;
        setTool({ type: 'pan' });
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') restorePreSpaceTool();
    };

    // Focus/visibility loss while Space is held means the keyup never reaches us —
    // recover so the pan tool doesn't get stuck (and the stale ref doesn't poison
    // the next Space press).
    const handleBlur = () => restorePreSpaceTool();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
}
