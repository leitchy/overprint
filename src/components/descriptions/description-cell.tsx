import { useRef } from 'react';
import { getSymbolName } from '@/core/iof/symbol-db';

interface DescriptionCellProps {
  value?: string;           // IOF symbol ID or text
  isEditable?: boolean;
  isSelected?: boolean;
  onClick?: (cellElement: HTMLElement) => void;
}

export function DescriptionCell({
  value,
  isEditable = false,
  isSelected = false,
  onClick,
}: DescriptionCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const displayText = value ? getSymbolName(value) : '';
  const isEmpty = !value;

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
        border border-gray-800 px-0.5 py-0.5
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
      title={value ? getSymbolName(value) : isEditable ? 'Click to set' : ''}
    >
      {displayText && (
        <span className="truncate text-[10px] leading-tight text-gray-700">
          {displayText}
        </span>
      )}
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
        border border-gray-800 px-0.5 py-0.5
        text-xs font-medium
        ${muted ? 'text-gray-500' : 'text-gray-800'}
      `}
    >
      {value}
    </div>
  );
}
