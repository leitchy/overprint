/**
 * App-level settings store (not per-event).
 *
 * Holds UI language preference and display toggles, all persisted to localStorage.
 * Initialisation order for language:
 *   1. Saved value from localStorage
 *   2. Browser's navigator.language matched against SUPPORTED_APP_LANGUAGES
 *   3. Fallback to 'en'
 */
import { create } from 'zustand';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n/languages';

const LOCAL_STORAGE_KEY_LANGUAGE = 'overprint-app-language';
const LOCAL_STORAGE_KEY_PRINT_BOUNDARY = 'overprint-show-print-boundary';
/** Exported so the no-flash inline script in index.html and its drift test agree on the key. */
export const LOCAL_STORAGE_KEY_THEME = 'overprint-theme';
const LOCAL_STORAGE_KEY_MAP_FADE = 'overprint-map-fade';

/** User theme preference. 'system' follows the OS via prefers-color-scheme. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Safe localStorage access — returns null in environments without localStorage (tests, SSR). */
function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Ignore — localStorage unavailable (tests, SSR, quota exceeded)
  }
}

function detectInitialLanguage(): string {
  // 1. Previously saved preference
  const saved = storageGet(LOCAL_STORAGE_KEY_LANGUAGE);
  if (saved) {
    const isSupported = SUPPORTED_APP_LANGUAGES.some((l) => l.code === saved);
    if (isSupported) return saved;
  }

  // 2. Browser language — try exact match first, then base language
  const browserLang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  const exactMatch = SUPPORTED_APP_LANGUAGES.find((l) => l.code === browserLang);
  if (exactMatch) return exactMatch.code;

  const baseLang = browserLang.split('-')[0] ?? '';
  const baseMatch = SUPPORTED_APP_LANGUAGES.find((l) => l.code === baseLang);
  if (baseMatch) return baseMatch.code;

  return 'en';
}

function detectInitialShowPrintBoundary(): boolean {
  return storageGet(LOCAL_STORAGE_KEY_PRINT_BOUNDARY) === 'true';
}

function detectInitialTheme(): ThemePreference {
  const saved = storageGet(LOCAL_STORAGE_KEY_THEME);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

/** Clamp the map-fade value to its valid range: −1 (white) … 0 (off) … +1 (dark). */
const clampFade = (n: number): number => Math.max(-1, Math.min(1, n));

/** Map-fade slider: −1 = fully white (design aid) … 0 = off … +1 = fully dark (night glare). */
function detectInitialMapFade(): number {
  const raw = Number(storageGet(LOCAL_STORAGE_KEY_MAP_FADE));
  if (!Number.isFinite(raw)) return 0;
  return clampFade(raw);
}

interface AppSettingsState {
  appLanguage: string;
  /** Whether to show the print boundary rectangle on the canvas. */
  showPrintBoundary: boolean;
  /** Light/dark/system theme preference. */
  theme: ThemePreference;
  /** Screen-only map fade: −1 (white) … 0 (off) … +1 (dark). Never affects exports. */
  mapFade: number;
}

interface AppSettingsActions {
  setAppLanguage: (lang: string) => void;
  setShowPrintBoundary: (show: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  setMapFade: (fade: number) => void;
}

export const useAppSettingsStore = create<AppSettingsState & AppSettingsActions>()((set) => ({
  appLanguage: detectInitialLanguage(),
  showPrintBoundary: detectInitialShowPrintBoundary(),
  theme: detectInitialTheme(),
  mapFade: detectInitialMapFade(),

  setAppLanguage: (lang: string) => {
    storageSet(LOCAL_STORAGE_KEY_LANGUAGE, lang);
    set({ appLanguage: lang });
  },

  setShowPrintBoundary: (show: boolean) => {
    storageSet(LOCAL_STORAGE_KEY_PRINT_BOUNDARY, String(show));
    set({ showPrintBoundary: show });
  },

  setTheme: (theme: ThemePreference) => {
    storageSet(LOCAL_STORAGE_KEY_THEME, theme);
    set({ theme });
  },

  setMapFade: (fade: number) => {
    const clamped = clampFade(fade);
    storageSet(LOCAL_STORAGE_KEY_MAP_FADE, String(clamped));
    set({ mapFade: clamped });
  },
}));
