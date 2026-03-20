/**
 * Getting Started drawer — slides in from the right side.
 * Non-modal: the canvas stays visible and interactive behind it.
 */
import { helpContent } from '@/i18n/help/en';
import { useT } from '@/i18n/use-t';
import { useModalClose } from './use-modal-close';

interface GettingStartedDrawerProps {
  onClose: () => void;
}

export function GettingStartedDrawer({ onClose }: GettingStartedDrawerProps) {
  const t = useT();
  useModalClose(onClose); // Escape key handling

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-[480px] flex-col border-l border-gray-200 bg-white shadow-xl"
      role="complementary"
      aria-label={t('gettingStarted')}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="text-base font-semibold text-gray-900">{t('gettingStarted')}</h2>
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

      {/* Body — collapsible sections */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {helpContent.sections.map((section, i) => (
          <details key={i} open={i === 0}>
            <summary className="cursor-pointer rounded px-2 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 select-none">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">
                {i + 1}
              </span>
              {section.title}
            </summary>
            <p className="mt-1 mb-3 pl-9 text-sm leading-relaxed text-gray-600">
              {section.body}
            </p>
          </details>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-5 py-3">
        <button
          onClick={onClose}
          className="w-full rounded bg-gray-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          {t('close')}
        </button>
      </div>
    </div>
  );
}
