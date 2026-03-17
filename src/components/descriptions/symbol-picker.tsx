import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getSymbolsForColumn } from '@/core/iof/symbol-db';
import type { SymbolColumn } from '@/core/iof/symbol-db';
import { SymbolIcon } from './symbol-icon';

interface SymbolPickerProps {
  column: SymbolColumn;
  anchorRect: DOMRect;
  currentValue?: string;
  onSelect: (symbolId: string | undefined) => void;
  onClose: () => void;
}

export function SymbolPicker({
  column,
  anchorRect,
  currentValue,
  onSelect,
  onClose,
}: SymbolPickerProps) {
  const [filter, setFilter] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const symbols = getSymbolsForColumn(column);
  const filtered = filter
    ? symbols.filter((s) =>
        s.name.toLowerCase().includes(filter.toLowerCase()),
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

  // Position: below the anchor cell, left-aligned
  const top = anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - 260);

  return createPortal(
    <div
      ref={pickerRef}
      className="fixed z-50 w-[250px] rounded border border-gray-300 bg-white shadow-lg"
      style={{ top, left }}
    >
      {/* Header */}
      <div className="border-b border-gray-200 px-2 py-1.5">
        <div className="mb-1 text-xs font-medium text-gray-500">
          Column {column}
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search symbols..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-violet-400"
        />
      </div>

      {/* Clear button */}
      {currentValue && (
        <button
          onClick={() => onSelect(undefined)}
          className="w-full border-b border-gray-100 px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50"
        >
          Clear
        </button>
      )}

      {/* Symbol list */}
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-gray-400">
            No symbols found
          </div>
        ) : (
          filtered.map((symbol) => (
            <button
              key={symbol.id}
              onClick={() => onSelect(symbol.id)}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-violet-50 ${
                symbol.id === currentValue ? 'bg-violet-100 font-medium' : ''
              }`}
            >
              <SymbolIcon symbolId={symbol.id} size={24} className="shrink-0" />
              <span className="truncate text-gray-700">{symbol.name}</span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
