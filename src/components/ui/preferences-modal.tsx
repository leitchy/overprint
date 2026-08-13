/**
 * Preferences modal — currently just the app interface language selector.
 * Opened from "Preferences…" in the File menu.
 */
import { useRef } from 'react';
import { useAppSettingsStore, type ThemePreference } from '@/stores/app-settings-store';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n/languages';
import { useT } from '@/i18n/use-t';
import { useModalClose } from './use-modal-close';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

interface PreferencesModalProps {
  onClose: () => void;
}

export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const t = useT();
  const appLanguage = useAppSettingsStore((s) => s.appLanguage);
  const setAppLanguage = useAppSettingsStore((s) => s.setAppLanguage);
  const theme = useAppSettingsStore((s) => s.theme);
  const setTheme = useAppSettingsStore((s) => s.setTheme);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Arrow-key roving selection across the theme segments (radiogroup pattern).
  const onThemeKeyDown = (e: React.KeyboardEvent) => {
    const idx = THEME_OPTIONS.indexOf(theme);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setTheme(THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length]!);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setTheme(THEME_OPTIONS[(idx - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length]!);
    }
  };
  const { handleBackdropClick } = useModalClose(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('preferencesTitle')}
    >
      <div
        ref={dialogRef}
        className="w-[360px] rounded-lg border border-edge bg-surface shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-base font-semibold text-content">{t('preferencesTitle')}</h2>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-faint hover:text-content-2"
            aria-label={t('close')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* App language */}
          <div>
            <label
              htmlFor="app-language-select"
              className="block text-sm font-medium text-content-2"
            >
              {t('appLanguageLabel')}
            </label>
            <p className="mt-0.5 text-xs text-faint">{t('appLanguageDescription')}</p>
            <select
              id="app-language-select"
              value={appLanguage}
              onChange={(e) => setAppLanguage(e.target.value)}
              className="mt-1.5 w-full rounded border border-edge-strong px-2 py-1.5 text-sm text-content-2 outline-none focus:border-accent-edge"
            >
              {SUPPORTED_APP_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.englishName})
                </option>
              ))}
            </select>
          </div>

          {/* Appearance / theme */}
          <div>
            <span id="appearance-label" className="block text-sm font-medium text-content-2">
              {t('appearanceLabel')}
            </span>
            <p className="mt-0.5 text-xs text-faint">{t('appearanceDescription')}</p>
            <div
              role="radiogroup"
              aria-labelledby="appearance-label"
              onKeyDown={onThemeKeyDown}
              className="mt-1.5 inline-flex rounded-md border border-edge-strong p-0.5"
            >
              {THEME_OPTIONS.map((opt) => {
                const selected = theme === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTheme(opt)}
                    className={`rounded px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-edge ${
                      selected
                        ? 'bg-accent text-accent-contrast'
                        : 'text-content-2 hover:bg-muted'
                    }`}
                  >
                    {t(`theme_${opt}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-edge px-4 py-3">
          <button
            onClick={onClose}
            className="rounded bg-neutral-solid px-4 py-1.5 text-sm font-medium text-neutral-solid-contrast hover:bg-neutral-solid-hover"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
