import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: false;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

interface FileMenuProps {
  items: MenuEntry[];
  /** Button label. Defaults to "File" if not provided. */
  label?: string;
}

export function FileMenu({ items, label = 'File' }: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded px-3 py-1.5 text-sm font-medium ${
          open
            ? 'bg-gray-800 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((entry, i) =>
            entry.separator ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (!entry.disabled) {
                    setOpen(false);
                    entry.onClick();
                  }
                }}
                disabled={entry.disabled}
                className={`block w-full px-4 py-1.5 text-left text-sm ${
                  entry.disabled
                    ? 'cursor-default text-gray-300'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
