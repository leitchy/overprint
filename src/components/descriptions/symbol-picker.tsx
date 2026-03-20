import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getSymbolsForColumn, getSymbolName } from '@/core/iof/symbol-db';
import type { SymbolColumn } from '@/core/iof/symbol-db';
import { SymbolIcon } from './symbol-icon';
import { useBreakpoint } from '@/hooks/use-breakpoint';

interface SymbolPickerProps {
  column: SymbolColumn;
  anchorRect: DOMRect;
  currentValue?: string;
  /** BCP 47 language tag for symbol names and search. Default: 'en'. */
  lang?: string;
  onSelect: (symbolId: string | undefined) => void;
  onClose: () => void;
}

export function SymbolPicker({
  column,
  anchorRect,
  currentValue,
  lang = 'en',
  onSelect,
  onClose,
}: SymbolPickerProps) {
  const [filter, setFilter] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const symbols = getSymbolsForColumn(column);
  const filtered = filter
    ? symbols.filter((s) =>
        getSymbolName(s.id, lang).toLowerCase().includes(filter.toLowerCase()),
      )
    : symbols;

  // Focus search input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Use timeout to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(timer);
    };
  }, [onClose]);

  const breakpoint = useBreakpoint();

  // Desktop: positioned popover below anchor cell
  // Mobile: full-width bottom panel
  const isDesktop = breakpoint === 'lg';
  const top = isDesktop ? anchorRect.bottom + 4 : undefined;
  const left = isDesktop ? Math.min(anchorRect.left, window.innerWidth - 260) : undefined;

  const pickerContent = (
    <>
      {/* Header */}
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-500">
            Column {column}
          </span>
          {!isDesktop && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
              &times;
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search symbols..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-violet-400"
        />
      </div>

      {/* Clear button */}
      {currentValue && (
        <button
          onClick={() => onSelect(undefined)}
          className="w-full border-b border-gray-100 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
        >
          Clear
        </button>
      )}

      {/* Symbol list */}
      <div className={isDesktop ? 'max-h-64 overflow-y-auto' : 'overflow-y-auto'} style={!isDesktop ? { maxHeight: '50vh' } : undefined}>
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            No symbols found
          </div>
        ) : (
          filtered.map((symbol) => (
            <button
              key={symbol.id}
              onClick={() => onSelect(symbol.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50 ${
                symbol.id === currentValue ? 'bg-violet-100 font-medium' : ''
              }`}
            >
              <SymbolIcon symbolId={symbol.id} size={28} className="shrink-0" />
              <span className="truncate text-gray-700">{getSymbolName(symbol.id, lang)}</span>
            </button>
          ))
        )}
      </div>
    </>
  );

  // Mobile: full-screen overlay anchored to bottom
  if (!isDesktop) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
        <div
          ref={pickerRef}
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-2xl"
          style={{ maxHeight: '70vh', paddingBottom: 'var(--safe-bottom)' }}
        >
          {pickerContent}
        </div>
      </>,
      document.body,
    );
  }

  // Desktop: positioned popover
  return createPortal(
    <div
      ref={pickerRef}
      className="fixed z-50 w-[250px] rounded border border-gray-300 bg-white shadow-lg"
      style={{ top, left }}
    >
      {pickerContent}
    </div>,
    document.body,
  );
}
