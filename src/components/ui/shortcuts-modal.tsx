/**
 * Keyboard shortcuts modal — two-column layout with shortcuts and supported formats.
 * Triggered by `?` key or Help > Keyboard Shortcuts.
 */
import { useT } from '@/i18n/use-t';
import type { TranslationKey } from '@/i18n/translations';
import { useModalClose } from './use-modal-close';

interface ShortcutsModalProps {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '\u2318' : 'Ctrl';

interface ShortcutEntry {
  /** Translation key for the action label */
  labelKey: TranslationKey;
  /** Keyboard shortcut display string */
  shortcut: string;
}

const NAVIGATION_SHORTCUTS: ShortcutEntry[] = [
  { labelKey: 'zoomIn', shortcut: `${mod}+` },
  { labelKey: 'zoomOut', shortcut: `${mod}\u2212` },
  { labelKey: 'fitToWindow', shortcut: `${mod}0` },
  { labelKey: 'toolPan', shortcut: 'Space' },
  { labelKey: 'undo', shortcut: `${mod}Z` },
  { labelKey: 'redo', shortcut: `\u21E7${mod}Z` },
];

const EDITING_SHORTCUTS: ShortcutEntry[] = [
  { labelKey: 'toolAddControl', shortcut: 'A' },
  { labelKey: 'toolPan', shortcut: 'V / Esc' },
  { labelKey: 'deleteControl', shortcut: 'Del' },
  { labelKey: 'toolDescriptions', shortcut: 'D' },
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
      <div className="w-[560px] rounded-lg border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">{t('keyboardShortcuts')}</h2>
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

        {/* Shortcuts — two columns */}
        <div className="grid grid-cols-2 gap-6 px-5 py-4">
          {/* Left: Navigation */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t('shortcutsCourseEditing')}
            </h3>
            <div className="space-y-1.5">
              {EDITING_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.labelKey} label={t(s.labelKey)} shortcut={s.shortcut} />
              ))}
            </div>
          </div>
        </div>

        {/* Supported formats */}
        <div className="border-t border-gray-100 px-5 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t('supportedFormats')}
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
            <div>
              <span className="font-medium text-gray-500">Load map:</span>
              <ul className="mt-0.5 space-y-0.5 pl-3">
                {LOAD_FORMATS.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
            <div>
              <span className="font-medium text-gray-500">Export:</span>
              <ul className="mt-0.5 space-y-0.5 pl-3">
                {EXPORT_FORMATS.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <span className="mt-1.5 block font-medium text-gray-500">Save/load:</span>
              <ul className="mt-0.5 pl-3">
                <li>.overprint</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-5 py-3">
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

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-500 border border-gray-200">
        {shortcut}
      </kbd>
    </div>
  );
}
