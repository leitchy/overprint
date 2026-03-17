/**
 * `useT()` — lightweight translation hook.
 *
 * Returns a typed `t(key)` function that translates a UI string key into the
 * current app language. Fallback chain:
 *   1. Exact language match (e.g. 'fr')
 *   2. Base language strip (e.g. 'nb' for 'nb-NO')
 *   3. English
 *
 * Type safety: `TranslationKey` is derived from the English object — typos
 * like `t('flie')` are caught at compile time.
 */
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { translations, type TranslationKey } from './translations';

export function useT(): (key: TranslationKey) => string {
  const lang = useAppSettingsStore((s) => s.appLanguage);

  return (key: TranslationKey): string => {
    // 1. Exact language match
    const exact = translations[lang]?.[key];
    if (exact) return exact;

    // 2. Try base language (strip region, e.g. 'nb-NO' → 'nb')
    const base = lang.split('-')[0] ?? '';
    if (base !== lang) {
      const baseMatch = translations[base]?.[key];
      if (baseMatch) return baseMatch;
    }

    // 3. Fallback to English (always complete)
    return translations['en']?.[key] ?? key;
  };
}
