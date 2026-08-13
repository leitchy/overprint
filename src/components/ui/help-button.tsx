/**
 * Contextual help — a small "?" button placed next to a complex panel's heading.
 * Clicking opens a popover with a one-line summary and a "Learn more" link that
 * jumps to the matching Getting Started section. All copy comes from the help
 * content (single source of truth), so there is no per-string i18n to maintain.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const popoverRef = useRef<HTMLDivElement>(null);
  // Horizontal nudge (px) to keep the popover on-screen — placements live in panels
  // on either edge (e.g. the right-hand course panel), so left-0 can overflow.
  const [shiftX, setShiftX] = useState(0);
  const section = getHelpSection(sectionId);

  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    // Measure at the un-shifted position, then clamp within the viewport.
    const base = rect.left - shiftX;
    let next = 0;
    if (base + rect.width > window.innerWidth - margin) {
      next = window.innerWidth - margin - (base + rect.width); // move left
    }
    if (base + next < margin) {
      next = margin - base; // don't push past the left edge
    }
    setShiftX(next);
  }, [open]);

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
            ? 'border-accent-edge bg-accent-soft-2 text-accent-text'
            : 'border-edge-strong text-faint hover:border-accent-edge hover:text-accent-text'
        }`}
      >
        ?
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label ?? t('help')}
          style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-edge bg-surface p-3 text-left shadow-lg"
        >
          <p className="text-xs leading-relaxed text-subtle">{section.summary}</p>
          <button
            type="button"
            onClick={openGuide}
            className="mt-2 text-xs font-medium text-accent-text hover:underline"
          >
            Learn more →
          </button>
        </div>
      )}
    </div>
  );
}
