/**
 * Contextual help — a small "?" button placed next to a complex panel's heading.
 * Clicking opens a popover with a one-line summary and a "Learn more" link that
 * jumps to the matching Getting Started section. All copy comes from the help
 * content (single source of truth), so there is no per-string i18n to maintain.
 */
import { useEffect, useRef, useState } from 'react';
import { getHelpSection } from '@/i18n/help/en';
import { useToolStore } from '@/stores/tool-store';
import { useT } from '@/i18n/use-t';

interface HelpButtonProps {
  /** Getting Started section id this help points at. */
  sectionId: string;
  /** Accessible label; defaults to the generic "Help". */
  label?: string;
}

export function HelpButton({ sectionId, label }: HelpButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const section = getHelpSection(sectionId);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture-phase + stopPropagation so Escape closes only this popover, not a
      // surrounding modal that also listens for Escape on document (useModalClose).
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!section) return null;

  const openGuide = () => {
    setOpen(false);
    useToolStore.getState().openGettingStarted(sectionId);
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label ?? t('help')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${
          open
            ? 'border-violet-400 bg-violet-100 text-violet-700'
            : 'border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-500'
        }`}
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label ?? t('help')}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-gray-200 bg-white p-3 text-left shadow-lg"
        >
          <p className="text-xs leading-relaxed text-gray-600">{section.summary}</p>
          <button
            type="button"
            onClick={openGuide}
            className="mt-2 text-xs font-medium text-violet-600 hover:underline"
          >
            Learn more →
          </button>
        </div>
      )}
    </div>
  );
}
