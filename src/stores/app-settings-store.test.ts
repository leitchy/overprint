import { describe, it, expect, beforeEach } from 'vitest';
import { useAppSettingsStore, LOCAL_STORAGE_KEY_THEME } from './app-settings-store';

// jsdom here has no localStorage — provide a minimal in-memory implementation.
function installLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  installLocalStorage();
  localStorage.clear();
  useAppSettingsStore.setState({ theme: 'system', mapFade: 0 });
});

describe('app-settings-store — theme', () => {
  it('defaults to system and persists a set theme', () => {
    expect(useAppSettingsStore.getState().theme).toBe('system');
    useAppSettingsStore.getState().setTheme('dark');
    expect(useAppSettingsStore.getState().theme).toBe('dark');
    expect(localStorage.getItem(LOCAL_STORAGE_KEY_THEME)).toBe('dark');
  });
});

describe('app-settings-store — mapFade', () => {
  it('defaults to 0 (off)', () => {
    expect(useAppSettingsStore.getState().mapFade).toBe(0);
  });

  it('persists and clamps to [-1, 1]', () => {
    useAppSettingsStore.getState().setMapFade(0.6);
    expect(useAppSettingsStore.getState().mapFade).toBe(0.6);
    expect(localStorage.getItem('overprint-map-fade')).toBe('0.6');

    useAppSettingsStore.getState().setMapFade(5);
    expect(useAppSettingsStore.getState().mapFade).toBe(1);
    useAppSettingsStore.getState().setMapFade(-5);
    expect(useAppSettingsStore.getState().mapFade).toBe(-1);
  });
});
