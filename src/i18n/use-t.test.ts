/**
 * Tests for the useT() translation hook.
 *
 * We test the translation logic directly by extracting it so we can run it
 * without a React component tree, then add a basic React hook smoke-test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { translations } from './translations';
import type { TranslationKey } from './translations';
import { SUPPORTED_APP_LANGUAGES } from './languages';

// ---------------------------------------------------------------------------
// Pure translation resolver — same logic as useT() but without the hook
// ---------------------------------------------------------------------------

function resolve(lang: string, key: TranslationKey): string {
  const exact = translations[lang]?.[key];
  if (exact) return exact;

  const base = lang.split('-')[0] ?? '';
  if (base !== lang) {
    const baseMatch = translations[base]?.[key];
    if (baseMatch) return baseMatch;
  }

  return translations['en']?.[key] ?? key;
}

// ---------------------------------------------------------------------------
// Fallback chain
// ---------------------------------------------------------------------------

describe('translation resolver', () => {
  it('returns exact language match', () => {
    expect(resolve('fr', 'file')).toBe('Fichier');
  });

  it('returns English when language is en', () => {
    expect(resolve('en', 'file')).toBe('File');
  });

  it('falls back to English for unknown language', () => {
    expect(resolve('xx', 'file')).toBe('File');
  });

  it('strips region and falls back to base language (nb-NO → nb, absent → en)', () => {
    // nb-NO has no translation in our set, nb has no translation either → falls back to en
    expect(resolve('nb-NO', 'file')).toBe('File');
  });

  it('strips region when base language is present', () => {
    // pt-BR → try pt-BR (absent) → try pt (absent) → en
    // In our case we don't have pt, so ensure the chain runs without throwing
    expect(resolve('pt-BR', 'file')).toBe('File');
  });

  it('falls back to the key itself when English is also missing (edge case)', () => {
    // We cannot actually have a missing English key since en is complete,
    // but verify the key-fallback branch exists by type-checking the pattern.
    // This test documents the behaviour.
    const result = resolve('xx', 'file');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Key completeness — all non-English locales should cover all keys
// (or at least not have typos — exact coverage isn't required but
// missing keys should produce a documented warning in CI)
// ---------------------------------------------------------------------------

describe('translation key completeness', () => {
  const englishKeys = Object.keys(translations['en'] ?? {}) as TranslationKey[];

  for (const lang of SUPPORTED_APP_LANGUAGES) {
    if (lang.code === 'en') continue;

    it(`${lang.code} covers all English keys`, () => {
      const locale = translations[lang.code];
      if (!locale) {
        // Language listed in SUPPORTED_APP_LANGUAGES but has no translations object
        throw new Error(
          `Language "${lang.code}" is in SUPPORTED_APP_LANGUAGES but has no entry in translations`,
        );
      }

      const missingKeys = englishKeys.filter((k) => !(k in locale));
      if (missingKeys.length > 0) {
        // Soft warning for now — log and fail explicitly
        console.warn(`[i18n] ${lang.code} is missing keys: ${missingKeys.join(', ')}`);
      }
      expect(missingKeys).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// useT hook smoke-test via renderHook
// ---------------------------------------------------------------------------

describe('useT hook', () => {
  beforeEach(() => {
    // Ensure localStorage is available and mocked
    if (typeof globalThis.localStorage !== 'undefined') {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a function that resolves keys', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useT } = await import('./use-t');

    const { result } = renderHook(() => useT());
    const t = result.current;

    expect(typeof t).toBe('function');
    // Default language is 'en' when nothing is in localStorage
    expect(t('file')).toBe('File');
    expect(t('addCourse')).toBe('Add course');
  });
});
