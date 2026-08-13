/**
 * Behavioural tests for the global keyboard shortcuts. The hook attaches window
 * listeners; we drive it by dispatching real KeyboardEvents and asserting store
 * state. Focused on the newly-wired tool/zoom/Space shortcuts and their guards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';

function keydown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}
function keyup(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}
function loadMap() {
  useMapImageStore.setState({ image: {}, imageWidth: 100, imageHeight: 100 } as never);
}
function mount() {
  renderHook(() => useKeyboardShortcuts());
}

beforeEach(() => {
  useToolStore.setState({ activeTool: { type: 'pan' }, descriptionsPanelOpen: false, shortcutsModalOpen: false });
  useEventStore.setState({ viewMode: 'course' } as never);
  useMapImageStore.setState({ image: null } as never);
  useViewportStore.getState().resetView();
  document.body.innerHTML = '';
});

afterEach(() => cleanup());

describe('tool shortcuts', () => {
  it('A selects the Add Control tool (map loaded, course view)', () => {
    loadMap();
    mount();
    keydown('a');
    expect(useToolStore.getState().activeTool.type).toBe('addControl');
  });

  it('A is a no-op in the All-Controls view (mirrors the disabled button)', () => {
    loadMap();
    useEventStore.setState({ viewMode: 'allControls' } as never);
    mount();
    keydown('a');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
  });

  it('V selects the Pan tool', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown('v');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
  });

  it('D toggles the descriptions panel', () => {
    loadMap();
    mount();
    keydown('d');
    expect(useToolStore.getState().descriptionsPanelOpen).toBe(true);
    keydown('d');
    expect(useToolStore.getState().descriptionsPanelOpen).toBe(false);
  });

  it('tool keys are no-ops with no map loaded', () => {
    mount();
    keydown('a');
    keydown('d');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
    expect(useToolStore.getState().descriptionsPanelOpen).toBe(false);
  });

  it('ignores keys while typing in an input', () => {
    loadMap();
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(useToolStore.getState().activeTool.type).toBe('pan');
  });
});

describe('zoom shortcuts', () => {
  it('Cmd/Ctrl += zooms in and -/= round-trips', () => {
    loadMap();
    mount();
    keydown('=', { metaKey: true });
    expect(useViewportStore.getState().zoom).toBeCloseTo(1.25, 5);
    keydown('-', { metaKey: true });
    expect(useViewportStore.getState().zoom).toBeCloseTo(1, 5);
  });

  it('zoom is a no-op with no map loaded', () => {
    mount();
    keydown('=', { metaKey: true });
    expect(useViewportStore.getState().zoom).toBe(1);
  });
});

describe('Space hold-to-pan', () => {
  it('switches to Pan while held and restores the prior tool on release', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown(' ');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
    keyup(' ');
    expect(useToolStore.getState().activeTool.type).toBe('addControl');
  });

  it('does not hijack Space when a button is focused', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    keydown(' ');
    expect(useToolStore.getState().activeTool.type).toBe('addControl'); // unchanged
  });

  it('key-repeat while held does not overwrite the saved tool', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown(' ');
    keydown(' '); // repeat — must not capture "pan" as the tool to restore
    keyup(' ');
    expect(useToolStore.getState().activeTool.type).toBe('addControl');
  });
});

describe('modal + GPS still work', () => {
  it('? opens the shortcuts modal', () => {
    mount();
    keydown('?');
    expect(useToolStore.getState().shortcutsModalOpen).toBe(true);
  });
});

describe('hardening (review findings)', () => {
  it('⇧⌘Z fires redo even though the key is uppercase "Z" (case-insensitive)', () => {
    const redoSpy = vi.spyOn(useEventStore.temporal.getState(), 'redo');
    mount();
    keydown('Z', { metaKey: true, shiftKey: true });
    expect(redoSpy).toHaveBeenCalledTimes(1);
    redoSpy.mockRestore();
  });

  it('⌘Z fires undo even with CapsLock (uppercase "Z", no shift)', () => {
    const undoSpy = vi.spyOn(useEventStore.temporal.getState(), 'undo');
    mount();
    keydown('Z', { metaKey: true });
    expect(undoSpy).toHaveBeenCalledTimes(1);
    undoSpy.mockRestore();
  });

  it('restores the tool if focus is lost while Space is held (no keyup arrives)', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown(' ');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
    window.dispatchEvent(new Event('blur')); // alt-tab / focus loss — keyup never comes
    expect(useToolStore.getState().activeTool.type).toBe('addControl');
  });

  it('does not clobber a tool the user selects during the Space hold', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown(' '); // → pan, saved addControl
    useToolStore.getState().setTool({ type: 'setPrintArea' }); // user changes tool mid-hold
    keyup(' ');
    expect(useToolStore.getState().activeTool.type).toBe('setPrintArea'); // not force-restored
  });

  it('stays on pan if the map is unloaded during the Space hold', () => {
    loadMap();
    useToolStore.setState({ activeTool: { type: 'addControl' } });
    mount();
    keydown(' ');
    useMapImageStore.setState({ image: null } as never);
    keyup(' ');
    expect(useToolStore.getState().activeTool.type).toBe('pan');
  });

  it('leaves Alt+D to the browser (does not toggle descriptions)', () => {
    loadMap();
    mount();
    keydown('d', { altKey: true });
    expect(useToolStore.getState().descriptionsPanelOpen).toBe(false);
  });

  it('ignores OS key-repeat on toggles (holding D does not flip it back)', () => {
    loadMap();
    mount();
    keydown('d'); // opens
    keydown('d', { repeat: true }); // auto-repeat — ignored
    expect(useToolStore.getState().descriptionsPanelOpen).toBe(true);
  });
});
