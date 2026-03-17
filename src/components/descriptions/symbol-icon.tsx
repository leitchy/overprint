import { getSymbolSvg } from '@/core/iof/symbol-db';

interface SymbolIconProps {
  symbolId: string;
  size?: number;
  className?: string;
}

export function SymbolIcon({ symbolId, size = 24, className = '' }: SymbolIconProps) {
  const svg = getSymbolSvg(symbolId);

  if (!svg) {
    // Text fallback for symbols without SVG
    return (
      <span
        className={`inline-flex items-center justify-center text-[8px] text-gray-400 ${className}`}
        style={{ width: size, height: size }}
      >
        {symbolId}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
