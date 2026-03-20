import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  separator?: false;
  /** Submenu items — renders a nested dropdown on hover. */
  children?: MenuEntry[];
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

interface FileMenuProps {
  items: MenuEntry[];
  label?: string;
  variant?: 'default' | 'menubar';
}

export function FileMenu({ items, label = 'File', variant = 'default' }: FileMenuProps) {
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

  const triggerClass =
    variant === 'menubar'
      ? `rounded px-3 py-1.5 text-sm font-medium flex items-center gap-1 ${
          open
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`
      : `rounded px-3 py-1.5 text-sm font-medium ${
          open
            ? 'bg-gray-800 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`;

  const dropdownAlign = variant === 'menubar' ? 'left-0' : 'right-0';

  return (
    <div ref={menuRef} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {label}
        {variant === 'menubar' && <span className="text-xs leading-none">▾</span>}
      </button>
      {open && (
        <div
          className={`absolute ${dropdownAlign} top-full z-50 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg`}
        >
          {items.map((entry, i) =>
            entry.separator ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : entry.children ? (
              <SubMenuItem
                key={i}
                entry={entry}
                onClose={() => setOpen(false)}
              />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (!entry.disabled && entry.onClick) {
                    setOpen(false);
                    entry.onClick();
                  }
                }}
                disabled={entry.disabled}
                className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm ${
                  entry.disabled
                    ? 'cursor-default text-gray-300'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{entry.label}</span>
                {entry.shortcut && (
                  <span className="ml-8 text-xs text-gray-400">{entry.shortcut}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submenu item — opens a nested dropdown to the right on hover
// ---------------------------------------------------------------------------

function SubMenuItem({ entry, onClose }: { entry: MenuItem; onClose: () => void }) {
  const [subOpen, setSubOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending timeout on unmount
  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!entry.disabled) setSubOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setSubOpen(false), 150);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={() => {
          if (!entry.disabled) setSubOpen((o) => !o);
        }}
        disabled={entry.disabled}
        className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm ${
          entry.disabled
            ? 'cursor-default text-gray-300'
            : subOpen
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span>{entry.label}</span>
        <span className="ml-4 text-xs text-gray-400">▸</span>
      </button>
      {subOpen && entry.children && (
        <div className="absolute left-full top-0 z-50 ml-0.5 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {entry.children.map((child, i) =>
            child.separator ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (!child.disabled && child.onClick) {
                    onClose();
                    child.onClick();
                  }
                }}
                disabled={child.disabled}
                className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm ${
                  child.disabled
                    ? 'cursor-default text-gray-300'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{child.label}</span>
                {child.shortcut && (
                  <span className="ml-8 text-xs text-gray-400">{child.shortcut}</span>
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
