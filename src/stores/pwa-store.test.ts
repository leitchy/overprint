import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// --- Mock the virtual SW-register module and the auto-save side effect --------
const updateSW = vi.fn(() => Promise.resolve());
let capturedOpts: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (url: string, reg?: ServiceWorkerRegistration) => void;
} = {};

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: typeof capturedOpts) => {
    capturedOpts = opts;
    return updateSW;
  },
}));

const saveDraft = vi.fn();
vi.mock('@/core/files/autosave', () => ({ saveDraft: (...a: unknown[]) => saveDraft(...a) }));

import { usePwaStore, initPwa } from './pwa-store';
import { useEventStore } from './event-store';

beforeEach(() => {
  vi.clearAllMocks();
  capturedOpts = {};
  usePwaStore.setState({ needRefresh: false, offlineReady: false, canInstall: false });
  useEventStore.getState().newEvent('Test');
  // jsdom lacks serviceWorker/storage — stub just enough for initPwa's guards.
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  Object.defineProperty(navigator, 'storage', {
    value: { persist: () => Promise.resolve(true) },
    configurable: true,
  });
});

describe('pwa-store', () => {
  it('reflects SW lifecycle callbacks in the store', () => {
    initPwa();
    expect(usePwaStore.getState().needRefresh).toBe(false);

    capturedOpts.onOfflineReady?.();
    expect(usePwaStore.getState().offlineReady).toBe(true);

    capturedOpts.onNeedRefresh?.();
    expect(usePwaStore.getState().needRefresh).toBe(true);
  });

  it('flushes the auto-save draft before reloading on applyUpdate', () => {
    initPwa();
    const event = useEventStore.getState().event;
    usePwaStore.getState().applyUpdate();

    expect(saveDraft).toHaveBeenCalledWith(event);
    expect(updateSW).toHaveBeenCalledWith(true);
    // Order matters: the draft must be written before the page reloads.
    const saveOrder = (saveDraft as Mock).mock.invocationCallOrder[0]!;
    const reloadOrder = (updateSW as Mock).mock.invocationCallOrder[0]!;
    expect(saveOrder).toBeLessThan(reloadOrder);
  });

  it('reports install as unavailable when no prompt was captured', async () => {
    initPwa();
    await expect(usePwaStore.getState().promptInstall()).resolves.toBe('unavailable');
  });

  it('captures beforeinstallprompt and exposes it via the store', async () => {
    initPwa();
    const userChoice = Promise.resolve({ outcome: 'accepted' as const, platform: 'web' });
    const evt = Object.assign(new Event('beforeinstallprompt'), {
      platforms: ['web'],
      userChoice,
      prompt: vi.fn(() => Promise.resolve()),
    });
    window.dispatchEvent(evt);

    expect(usePwaStore.getState().canInstall).toBe(true);
    await expect(usePwaStore.getState().promptInstall()).resolves.toBe('accepted');
    expect(usePwaStore.getState().canInstall).toBe(false);
  });
});
