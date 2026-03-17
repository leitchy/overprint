/**
 * Preferences modal — currently just the app interface language selector.
 * Opened from "Preferences…" in the File menu.
 */
import { useRef } from 'react';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n/languages';
import { useT } from '@/i18n/use-t';
import { useModalClose } from './use-modal-close';

interface PreferencesModalProps {
  onClose: () => void;
}

export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const t = useT();
  const appLanguage = useAppSettingsStore((s) => s.appLanguage);
  const setAppLanguage = useAppSettingsStore((s) => s.setAppLanguage);
  const dialogRef = useRef<HTMLDivElement>(null);
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
        className="w-[360px] rounded-lg border border-gray-200 bg-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">{t('preferencesTitle')}</h2>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-gray-400 hover:text-gray-700"
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
              className="block text-sm font-medium text-gray-700"
            >
              {t('appLanguageLabel')}
            </label>
            <p className="mt-0.5 text-xs text-gray-400">{t('appLanguageDescription')}</p>
            <select
              id="app-language-select"
              value={appLanguage}
              onChange={(e) => setAppLanguage(e.target.value)}
              className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-violet-400"
            >
              {SUPPORTED_APP_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.englishName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded bg-gray-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
