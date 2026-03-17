/**
 * Language metadata for Overprint.
 *
 * Two separate lists:
 *   - SUPPORTED_IOF_LANGUAGES: all BCP 47 codes that svg-control-descriptions
 *     provides translations for. Used for the per-event description language
 *     selector (22 languages).
 *   - SUPPORTED_APP_LANGUAGES: subset where we have actual UI translations.
 *     Used for the app interface language selector.
 */

export interface LanguageInfo {
  /** BCP 47 language tag (e.g. 'en', 'fr', 'nb-NO') */
  code: string;
  /** Name as written in that language (e.g. 'Français', '日本語') */
  nativeName: string;
  /** Name in English (e.g. 'French', 'Japanese') */
  englishName: string;
}

/**
 * All languages supported by the svg-control-descriptions IOF symbol package.
 * These are valid values for EventSettings.language.
 */
export const SUPPORTED_IOF_LANGUAGES: LanguageInfo[] = [
  { code: 'bg',    nativeName: 'Български',              englishName: 'Bulgarian' },
  { code: 'ca',    nativeName: 'Català',                  englishName: 'Catalan' },
  { code: 'cs',    nativeName: 'Čeština',                 englishName: 'Czech' },
  { code: 'de',    nativeName: 'Deutsch',                 englishName: 'German' },
  { code: 'en',    nativeName: 'English',                 englishName: 'English' },
  { code: 'en-AU', nativeName: 'English (Australia)',     englishName: 'English (Australia)' },
  { code: 'en-GB', nativeName: 'English (UK)',            englishName: 'English (UK)' },
  { code: 'es',    nativeName: 'Español',                 englishName: 'Spanish' },
  { code: 'et',    nativeName: 'Eesti',                   englishName: 'Estonian' },
  { code: 'fi',    nativeName: 'Suomi',                   englishName: 'Finnish' },
  { code: 'fr',    nativeName: 'Français',                englishName: 'French' },
  { code: 'hu',    nativeName: 'Magyar',                  englishName: 'Hungarian' },
  { code: 'it',    nativeName: 'Italiano',                englishName: 'Italian' },
  { code: 'ja',    nativeName: '日本語',                  englishName: 'Japanese' },
  { code: 'nb-NO', nativeName: 'Norsk bokmål',            englishName: 'Norwegian Bokmål' },
  { code: 'nn-NO', nativeName: 'Norsk nynorsk',           englishName: 'Norwegian Nynorsk' },
  { code: 'pl',    nativeName: 'Polski',                  englishName: 'Polish' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)',      englishName: 'Portuguese (Brazil)' },
  { code: 'ro',    nativeName: 'Română',                  englishName: 'Romanian' },
  { code: 'sv',    nativeName: 'Svenska',                 englishName: 'Swedish' },
  { code: 'zh-HK', nativeName: '中文（香港）',             englishName: 'Chinese (Hong Kong)' },
  { code: 'zh-TW', nativeName: '中文（臺灣）',             englishName: 'Chinese (Taiwan)' },
];

/**
 * Languages for which we have actual UI translations.
 * This is the subset shown in the "App language" preference dropdown.
 */
export const SUPPORTED_APP_LANGUAGES: LanguageInfo[] = [
  { code: 'en', nativeName: 'English',   englishName: 'English' },
  { code: 'de', nativeName: 'Deutsch',   englishName: 'German' },
  { code: 'es', nativeName: 'Español',   englishName: 'Spanish' },
  { code: 'fi', nativeName: 'Suomi',     englishName: 'Finnish' },
  { code: 'fr', nativeName: 'Français',  englishName: 'French' },
  { code: 'it', nativeName: 'Italiano',  englishName: 'Italian' },
  { code: 'ja', nativeName: '日本語',    englishName: 'Japanese' },
  { code: 'sv', nativeName: 'Svenska',   englishName: 'Swedish' },
];
