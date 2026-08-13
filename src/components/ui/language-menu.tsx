/**
 * Language switcher — a globe button in the top bar that opens a popover listing
 * the app UI languages by their native name.
 *
 * Rationale: changing language used to be buried three levels deep (View →
 * Preferences → a select), all labelled in the current language — so a user who
 * landed in a language they couldn't read had no easy way back. The globe icon is
 * a language-neutral affordance that's always visible, and each option is shown in
 * its own script (Deutsch, Español, 日本語 …) with a check on the active one, so
 * anyone can recognise their language regardless of the current UI language.
 * The fuller Preferences dialog is kept for future settings.
 */
import { useEffect, useRef, useState } from 'react';
import { useAppSettingsStore } from '@/stores/app-settings-store';
import { SUPPORTED_APP_LANGUAGES } from '@/i18n/languages';
import { useT } from '@/i18n/use-t';

interface LanguageMenuProps {
  /** Larger tap target for the mobile/tablet toolbar. */
  compact?: boolean;
}

export function LanguageMenu({ compact = false }: LanguageMenuProps) {
  const t = useT();
  const appLanguage = useAppSettingsStore((s) => s.appLanguage);
  const setAppLanguage = useAppSettingsStore((s) => s.setAppLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Resolve the current entry (exact code, else base language), for the badge + check.
  const base = appLanguage.split('-')[0];
  const current =
    SUPPORTED_APP_LANGUAGES.find((l) => l.code === appLanguage) ??
    SUPPORTED_APP_LANGUAGES.find((l) => l.code === base);
  const code = (current?.code ?? base ?? appLanguage).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('appLanguageLabel')}
        title={t('appLanguageLabel')}
        className={`flex items-center gap-1 rounded text-sm font-medium ${
          compact ? 'h-10 px-2.5' : 'px-2 py-1.5'
        } ${open ? 'bg-muted text-content' : 'text-subtle hover:bg-surface-2 hover:text-content'}`}
      >
        <GlobeIcon />
        <span className="tabular-nums">{code}</span>
        <span className="text-xs leading-none">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-edge bg-surface py-1 shadow-lg"
        >
          {SUPPORTED_APP_LANGUAGES.map((lang) => {
            const active = lang.code === current?.code;
            return (
              <button
                key={lang.code}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setAppLanguage(lang.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  active ? 'bg-accent-soft text-accent-text' : 'text-content-2 hover:bg-muted'
                }`}
              >
                <span className="w-4 flex-none text-accent-text">{active ? '✓' : ''}</span>
                <span className="flex-1">{lang.nativeName}</span>
                <span className="text-xs text-faint">{lang.code.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" />
      <ellipse cx="10" cy="10" rx="3.25" ry="7.25" />
      <line x1="2.9" y1="7.5" x2="17.1" y2="7.5" />
      <line x1="2.9" y1="12.5" x2="17.1" y2="12.5" />
    </svg>
  );
}
