import { useEffect } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useT } from '@/i18n/use-t';
import type { PaperSize } from '@/core/models/types';

const PRINT_SCALE_PRESETS = [4000, 5000, 7500, 10000, 15000];

const PAPER_SIZES: Array<{ value: PaperSize; label: string }> = [
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'A3', label: 'A3 (297 × 420 mm)' },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
];

interface PrintSettingsModalProps {
  onClose: () => void;
}

export function PrintSettingsModal({ onClose }: PrintSettingsModalProps) {
  const t = useT();
  const settings = useEventStore((s) => s.event?.settings);
  const updateSettings = useEventStore((s) => s.updateSettings);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!settings) return null;

  const { pageSetup, printScale } = settings;

  const updatePageSetup = (updates: Partial<typeof pageSetup>) => {
    updateSettings({ pageSetup: { ...pageSetup, ...updates } });
  };

  const updateMargin = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    updateSettings({
      pageSetup: {
        ...pageSetup,
        margins: { ...pageSetup.margins, [side]: value },
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('pageSetupTitle')}
    >
      <div className="w-[400px] rounded-lg border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">{t('pageSetupTitle')}</h2>
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
          {/* Print Scale */}
          <div>
            <label htmlFor="print-scale" className="block text-sm font-medium text-gray-700">
              {t('printScaleLabel')}
            </label>
            <select
              id="print-scale"
              value={printScale}
              onChange={(e) => updateSettings({ printScale: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-violet-400"
            >
              {PRINT_SCALE_PRESETS.map((s) => (
                <option key={s} value={s}>1:{s.toLocaleString()}</option>
              ))}
            </select>
          </div>

          {/* Paper Size */}
          <div>
            <label htmlFor="paper-size" className="block text-sm font-medium text-gray-700">
              {t('paperSizeLabel')}
            </label>
            <select
              id="paper-size"
              value={pageSetup.paperSize}
              onChange={(e) => updatePageSetup({ paperSize: e.target.value as PaperSize })}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-700 outline-none focus:border-violet-400"
            >
              {PAPER_SIZES.map((ps) => (
                <option key={ps.value} value={ps.value}>{ps.label}</option>
              ))}
            </select>
          </div>

          {/* Orientation */}
          <div>
            <span className="block text-sm font-medium text-gray-700">{t('orientationLabel')}</span>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => updatePageSetup({ orientation: 'portrait' })}
                className={`flex-1 rounded border px-3 py-1.5 text-sm font-medium ${
                  pageSetup.orientation === 'portrait'
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t('portrait')}
              </button>
              <button
                onClick={() => updatePageSetup({ orientation: 'landscape' })}
                className={`flex-1 rounded border px-3 py-1.5 text-sm font-medium ${
                  pageSetup.orientation === 'landscape'
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t('landscape')}
              </button>
            </div>
          </div>

          {/* Margins */}
          <div>
            <span className="block text-sm font-medium text-gray-700">
              {t('marginsLabel')} <span className="font-normal text-gray-400">({t('mm')})</span>
            </span>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div key={side}>
                  <label htmlFor={`margin-${side}`} className="block text-[10px] text-gray-400">
                    {t(side)}
                  </label>
                  <input
                    id={`margin-${side}`}
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={pageSetup.margins[side]}
                    onChange={(e) => updateMargin(side, Math.max(0, Number(e.target.value)))}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 outline-none focus:border-violet-400"
                  />
                </div>
              ))}
            </div>
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
