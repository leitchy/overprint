/**
 * `useT()` — lightweight translation hook.
 *
 * Returns a typed `t(key, params?)` function that translates a UI string key
 * into the current app language. Supports `{param}` interpolation.
 *
 * Fallback chain:
 *   1. Exact language match (e.g. 'fr')
 *   2. Base language strip (e.g. 'nb' for 'nb-NO')
 *   3. English
 *
 * Type safety: `TranslationKey` is derived from the English object — typos
 * like `t('flie')` are caught at compile time.
 */
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { translations, type TranslationKey } from './translations';

export function useT(): (key: TranslationKey, params?: Record<string, string | number>) => string {
  const lang = useAppSettingsStore((s) => s.appLanguage);

  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    // 1. Exact language match
    let str: string | undefined = translations[lang]?.[key];

    // 2. Try base language (strip region, e.g. 'nb-NO' → 'nb')
    if (!str) {
      const base = lang.split('-')[0] ?? '';
      if (base !== lang) {
        str = translations[base]?.[key];
      }
    }

    // 3. Fallback to English (always complete)
    let result: string = str ?? translations['en']?.[key] ?? key;

    // 4. Interpolate {param} placeholders
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.split(`{${k}}`).join(String(v));
      }
    }

    return result;
  };
}
