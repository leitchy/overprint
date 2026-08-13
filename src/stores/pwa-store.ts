/**
 * PWA lifecycle state — service-worker updates and the install prompt.
 *
 * We register the service worker via the non-React `registerSW` helper and push
 * its state into this store so multiple, unrelated parts of the UI (the update
 * banner, the File menu's "Install App" / "Check for Updates" items) can all
 * read and drive it. See ADR-018.
 *
 * Update policy (field-tool safety): the SW is registered in `prompt` mode, so a
 * freshly-deployed version is fully precached but sits *waiting* — it never
 * swaps in mid-session. `needRefresh` just surfaces a gentle banner; the user
 * decides when to reload, and reloading first flushes the auto-save draft so no
 * course work is lost.
 */
import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';
import { saveDraft } from '@/core/files/autosave';
import { useEventStore } from '@/stores/event-store';

interface PwaState {
  /** A new version is precached and waiting to be applied. */
  needRefresh: boolean;
  /** The app shell finished precaching and now works offline. */
  offlineReady: boolean;
  /** A deferred install prompt is available (Chromium only). */
  canInstall: boolean;
}

interface PwaActions {
  /** Flush the auto-save draft, then activate the waiting SW and reload. */
  applyUpdate: () => void;
  /** Manually poll for a new SW (escape hatch for standalone/iOS). */
  checkForUpdate: () => Promise<void>;
  /** Show the native install prompt; resolves to the user's choice. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismissOfflineReady: () => void;
  /** Hide the update banner without applying (it resurfaces on next launch). */
  dismissUpdate: () => void;
}

// Module-scoped handles set up by initPwa(); not part of the reactive store.
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let installEvent: BeforeInstallPromptEvent | null = null;

export const usePwaStore = create<PwaState & PwaActions>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  canInstall: false,

  applyUpdate: () => {
    // Persist the latest course work synchronously before the page reloads —
    // the reload restores the draft, but the debounced auto-save may not have
    // fired yet, and the map image must be re-loaded afterwards.
    const event = useEventStore.getState().event;
    if (event) saveDraft(event);
    if (updateSW) void updateSW(true);
    else window.location.reload();
  },

  checkForUpdate: async () => {
    try {
      await registration?.update();
    } catch {
      // offline or transient — nothing to do
    }
  },

  promptInstall: async () => {
    if (!installEvent) return 'unavailable';
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    set({ canInstall: false });
    return outcome;
  },

  dismissOfflineReady: () => set({ offlineReady: false }),

  dismissUpdate: () => set({ needRefresh: false }),
}));

/**
 * Register the service worker and wire the install prompt. Call once at startup.
 * No-ops when service workers are unavailable (e.g. non-secure contexts).
 */
export function initPwa(): void {
  // Best-effort persistent storage — on iOS this is what stops Safari evicting
  // the SW cache and the auto-save draft after ~7 days of non-use.
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the prompt for our own "Install App" action
    installEvent = e;
    usePwaStore.setState({ canInstall: true });
  });

  window.addEventListener('appinstalled', () => {
    installEvent = null;
    usePwaStore.setState({ canInstall: false });
  });

  if (!('serviceWorker' in navigator)) return;

  updateSW = registerSW({
    onNeedRefresh() {
      usePwaStore.setState({ needRefresh: true });
    },
    onOfflineReady() {
      usePwaStore.setState({ offlineReady: true });
    },
    onRegisteredSW(_swUrl, r) {
      registration = r;
    },
  });
}
