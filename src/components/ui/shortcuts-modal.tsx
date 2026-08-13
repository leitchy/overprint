/**
 * Keyboard shortcuts modal — two-column layout with shortcuts and supported formats.
 * Triggered by `?` key or Help > Keyboard Shortcuts.
 */
import { useT } from '@/i18n/use-t';
import type { TranslationKey } from '@/i18n/translations';
import { MOD_KEY } from '@/utils/platform';
import { useModalClose } from './use-modal-close';

interface ShortcutsModalProps {
  onClose: () => void;
}

interface ShortcutEntry {
  /** Translation key for the action label */
  labelKey: TranslationKey;
  /** Keyboard shortcut display string */
  shortcut: string;
}

// Every entry here is actually wired up \u2014 see use-keyboard-shortcuts.ts (tools,
// zoom, GPS) and use-map-navigation.ts (delete, arrow-pan). Secondary pan methods
// (drag / hold-Space / arrows) live in the note under the grid.
const NAVIGATION_SHORTCUTS: ShortcutEntry[] = [
  { labelKey: 'zoomIn', shortcut: `${MOD_KEY}+` },
  { labelKey: 'zoomOut', shortcut: `${MOD_KEY}\u2212` },
  { labelKey: 'fitToWindow', shortcut: `${MOD_KEY}0` },
  { labelKey: 'undo', shortcut: `${MOD_KEY}Z` },
  { labelKey: 'redo', shortcut: `\u21E7${MOD_KEY}Z` },
];

const EDITING_SHORTCUTS: ShortcutEntry[] = [
  { labelKey: 'toolAddControl', shortcut: 'A' },
  { labelKey: 'toolPan', shortcut: 'V' },
  { labelKey: 'toolDescriptions', shortcut: 'D' },
  { labelKey: 'deleteControl', shortcut: 'Del' },
  { labelKey: 'gpsPlaceAtGps', shortcut: 'G' },
  { labelKey: 'keyboardShortcuts', shortcut: '?' },
];

const LOAD_FORMATS = [
  'PNG, JPEG, GIF, TIFF, BMP',
  'PDF',
  'OCAD (.ocd)',
  'OpenOrienteering Mapper (.omap, .xmap)',
];

const EXPORT_FORMATS = [
  'PDF (course maps, descriptions)',
  'IOF XML v3',
  'PNG, JPEG',
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const t = useT();
  const { handleBackdropClick } = useModalClose(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('keyboardShortcuts')}
    >
      <div className="w-[560px] rounded-lg border border-edge bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-base font-semibold text-content">{t('keyboardShortcuts')}</h2>
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

        {/* Shortcuts — two columns */}
        <div className="grid grid-cols-2 gap-6 px-5 py-4">
          {/* Left: Navigation */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              {t('shortcutsNavigation')}
            </h3>
            <div className="space-y-1.5">
              {NAVIGATION_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.labelKey} label={t(s.labelKey)} shortcut={s.shortcut} />
              ))}
            </div>
          </div>

          {/* Right: Course editing */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              {t('shortcutsCourseEditing')}
            </h3>
            <div className="space-y-1.5">
              {EDITING_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.labelKey} label={t(s.labelKey)} shortcut={s.shortcut} />
              ))}
            </div>
          </div>
        </div>

        {/* Gesture note — secondary zoom/pan methods and the G caveat */}
        <p className="px-5 -mt-1 pb-3 text-xs text-faint">
          Scroll or pinch to zoom · drag, hold <kbd className="font-mono">Space</kbd>, or arrow keys to
          pan · <kbd className="font-mono">G</kbd> requires the Add Control tool and a GPS fix.
        </p>

        {/* Supported formats */}
        <div className="border-t border-edge px-5 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('supportedFormats')}
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-subtle">
            <div>
              <span className="font-medium text-subtle">Load map:</span>
              <ul className="mt-0.5 space-y-0.5 pl-3">
                {LOAD_FORMATS.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div>
              <span className="font-medium text-subtle">Export:</span>
              <ul className="mt-0.5 space-y-0.5 pl-3">
                {EXPORT_FORMATS.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <span className="mt-1.5 block font-medium text-subtle">Save/load:</span>
              <ul className="mt-0.5 pl-3">
                <li>.overprint</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-edge px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-faint">
              Overprint v{__APP_VERSION__}
              {__APP_COMMIT__ !== 'local' && ` (${__APP_COMMIT__.slice(0, 7)})`}
            </span>
            <a
              href="https://github.com/leitchy/overprint/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent-text hover:underline"
            >
              {t('whatsNew')}
            </a>
          </div>
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

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-content-2">{label}</span>
      <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-subtle border border-edge">
        {shortcut}
      </kbd>
    </div>
  );
}
