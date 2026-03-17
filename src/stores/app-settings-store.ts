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

function detectInitialLanguage(): string {
  // 1. Previously saved preference
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY_LANGUAGE);
  if (saved) {
    const isSupported = SUPPORTED_APP_LANGUAGES.some((l) => l.code === saved);
    if (isSupported) return saved;
  }

  // 2. Browser language — try exact match first, then base language
  const browserLang = navigator.language; // e.g. 'fr-FR', 'en-AU', 'de'
  const exactMatch = SUPPORTED_APP_LANGUAGES.find((l) => l.code === browserLang);
  if (exactMatch) return exactMatch.code;

  const baseLang = browserLang.split('-')[0] ?? '';
  const baseMatch = SUPPORTED_APP_LANGUAGES.find((l) => l.code === baseLang);
  if (baseMatch) return baseMatch.code;

  return 'en';
}

function detectInitialShowPrintBoundary(): boolean {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PRINT_BOUNDARY);
  return saved === 'true';
}

interface AppSettingsState {
  appLanguage: string;
  /** Whether to show the print boundary rectangle on the canvas. */
  showPrintBoundary: boolean;
}

interface AppSettingsActions {
  setAppLanguage: (lang: string) => void;
  setShowPrintBoundary: (show: boolean) => void;
}

export const useAppSettingsStore = create<AppSettingsState & AppSettingsActions>()((set) => ({
  appLanguage: detectInitialLanguage(),
  showPrintBoundary: detectInitialShowPrintBoundary(),

  setAppLanguage: (lang: string) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_LANGUAGE, lang);
    set({ appLanguage: lang });
  },

  setShowPrintBoundary: (show: boolean) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_PRINT_BOUNDARY, String(show));
    set({ showPrintBoundary: show });
  },
}));
