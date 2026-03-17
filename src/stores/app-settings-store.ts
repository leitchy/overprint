/**
 * App-level settings store (not per-event).
 *
 * Currently holds only the UI language preference, persisted to localStorage.
 * Initialisation order:
 *   1. Saved value from localStorage
 *   2. Browser's navigator.language matched against SUPPORTED_APP_LANGUAGES
 *   3. Fallback to 'en'
 */
import { create } from 'zustand';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n/languages';

const LOCAL_STORAGE_KEY = 'overprint-app-language';

function detectInitialLanguage(): string {
  // 1. Previously saved preference
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
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

interface AppSettingsState {
  appLanguage: string;
}

interface AppSettingsActions {
  setAppLanguage: (lang: string) => void;
}

export const useAppSettingsStore = create<AppSettingsState & AppSettingsActions>()((set) => ({
  appLanguage: detectInitialLanguage(),

  setAppLanguage: (lang: string) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, lang);
    set({ appLanguage: lang });
  },
}));
