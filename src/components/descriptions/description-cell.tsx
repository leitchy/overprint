import { useRef } from 'react';
import { getSymbolName, getSymbolSvg } from '@/core/iof/symbol-db';
import { SymbolIcon } from './symbol-icon';

interface DescriptionCellProps {
  value?: string;           // IOF symbol ID
  /** Free-text content (e.g. column-F dimensions). Takes precedence over `value`. */
  text?: string;
  lang?: string;            // BCP 47 language tag for symbol name/tooltip
  isEditable?: boolean;
  isSelected?: boolean;
  /** When true, render symbol name as text instead of the SVG icon. */
  textOnly?: boolean;
  onClick?: (cellElement: HTMLElement) => void;
}

export function DescriptionCell({
  value,
  text,
  lang = 'en',
  isEditable = false,
  isSelected = false,
  textOnly = false,
  onClick,
}: DescriptionCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const hasText = !!text && text.trim() !== '';
  const hasSvg = value ? !!getSymbolSvg(value) : false;
  const isEmpty = !value && !hasText;

  const handleClick = () => {
    if (isEditable && cellRef.current) {
      onClick?.(cellRef.current);
    }
  };

  return (
    <div
      ref={cellRef}
      className={`
        flex items-center justify-center overflow-hidden text-center
        border border-gray-800 px-0.5 py-0.5 min-h-[1.5rem]
        ${isEditable ? 'cursor-pointer' : ''}
        ${isEditable && isEmpty ? 'border-dashed border-gray-400' : ''}
        ${isEditable && !isEmpty ? 'hover:bg-violet-50' : ''}
        ${isEditable && isEmpty ? 'hover:bg-gray-50' : ''}
        ${isSelected ? 'bg-violet-100 ring-2 ring-violet-500 ring-inset' : ''}
      `}
      onClick={handleClick}
      tabIndex={isEditable ? 0 : undefined}
      onKeyDown={
        isEditable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      role={isEditable ? 'button' : undefined}
      title={hasText ? text : value ? getSymbolName(value, lang) : isEditable ? 'Click to set' : ''}
    >
      {hasText ? (
        <span className="truncate text-[10px] font-medium leading-tight text-gray-700">{text}</span>
      ) : value ? (
        hasSvg && !textOnly ? (
          <SymbolIcon symbolId={value} size={20} />
        ) : (
          <span className="truncate text-[9px] leading-tight text-gray-600">
            {getSymbolName(value, lang)}
          </span>
        )
      ) : null}
    </div>
  );
}

interface NumberCellProps {
  value: string | number;
  muted?: boolean;
}

export function NumberCell({ value, muted = false }: NumberCellProps) {
  return (
    <div
      className={`
        flex items-center justify-center
        border border-gray-800 px-0.5 py-0.5 min-h-[1.5rem]
        text-xs font-medium
        ${muted ? 'text-gray-500' : 'text-gray-800'}
      `}
    >
      {value}
    </div>
  );
}
