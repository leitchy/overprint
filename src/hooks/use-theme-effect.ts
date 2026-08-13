/**
 * Applies the user's theme preference to the document.
 *
 * Writes the *resolved* theme ('light' | 'dark') to `data-theme` on <html> and
 * keeps `color-scheme` + the `<meta name=theme-color>` in sync. When the
 * preference is 'system', it follows `prefers-color-scheme` and reacts to OS
 * changes live. A `storage` listener syncs the choice across tabs.
 *
 * The same resolution runs in a tiny inline script in index.html before React
 * mounts (no-flash); this hook is the idempotent React-side owner thereafter.
 */
import { useEffect } from 'react';
import {
  useAppSettingsStore,
  type ThemePreference,
  LOCAL_STORAGE_KEY_THEME,
} from '@/stores/app-settings-store';

// Keep in sync with index.css: DARK == --c-surface (dark), LIGHT == the
// index.html <meta name=theme-color> brand colour.
const THEME_COLOR_DARK = '#14161b';
const THEME_COLOR_LIGHT = '#C850A0';

const darkMql = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Resolve a preference to the concrete theme actually shown. */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Apply a resolved theme to the document (data-theme, color-scheme, meta). */
export function applyResolvedTheme(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

export function useThemeEffect(): void {
  const theme = useAppSettingsStore((s) => s.theme);

  useEffect(() => {
    const mql = darkMql();
    const apply = () => applyResolvedTheme(resolveTheme(theme, mql?.matches ?? false));
    apply();

    // Follow OS changes only while tracking the system preference.
    if (theme === 'system' && mql) {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  // Cross-tab: mirror a theme change made in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY_THEME) {
        const next = e.newValue;
        if (next === 'light' || next === 'dark' || next === 'system') {
          useAppSettingsStore.getState().setTheme(next);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
