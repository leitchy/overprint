import { SlideDrawer } from './slide-drawer';
import type { MenuEntry, MenuItem } from './file-menu';

interface MenuSection {
  label: string;
  items: MenuEntry[];
}

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  sections: MenuSection[];
}

function MenuItemButton({
  item,
  indent = false,
  onClose,
}: {
  item: MenuItem;
  indent?: boolean;
  onClose: () => void;
}) {
  return (
    <button
      onClick={() => {
        if (!item.disabled && item.onClick) {
          onClose();
          item.onClick();
        }
      }}
      disabled={item.disabled}
      className={`flex w-full items-center justify-between py-2.5 text-left text-sm ${
        indent ? 'px-6' : 'px-4'
      } ${
        item.disabled
          ? 'cursor-default text-gray-300'
          : 'text-gray-700 active:bg-gray-100'
      }`}
    >
      <span>{item.label}</span>
      {!indent && item.shortcut && (
        <span className="ml-4 text-xs text-gray-400">{item.shortcut}</span>
      )}
    </button>
  );
}

export function MobileMenuDrawer({ open, onClose, sections }: MobileMenuDrawerProps) {
  return (
    <SlideDrawer open={open} onClose={onClose} side="left" width="280px">
      <div className="px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900">Overprint</span>
        <span className="text-[10px] text-gray-400 ml-1">v{__APP_VERSION__}</span>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain py-2">
        {sections.map((section) => (
          <div key={section.label}>
            {/* Section header */}
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {section.label}
            </div>

            {/* Items */}
            {section.items.map((entry, i) => {
              if ('separator' in entry && entry.separator) {
                return <div key={i} className="my-1 mx-4 border-t border-gray-100" />;
              }

              const item = entry as MenuItem;

              // Flatten children (submenus) into the list for mobile
              if (item.children) {
                return (
                  <div key={item.label}>
                    <div className="px-4 py-2 text-xs font-medium text-gray-500">
                      {item.label}
                    </div>
                    {item.children.map((child, ci) => {
                      if ('separator' in child && child.separator) {
                        return <div key={ci} className="my-1 mx-4 border-t border-gray-100" />;
                      }
                      return (
                        <MenuItemButton
                          key={(child as MenuItem).label}
                          item={child as MenuItem}
                          indent
                          onClose={onClose}
                        />
                      );
                    })}
                  </div>
                );
              }

              return (
                <MenuItemButton
                  key={item.label}
                  item={item}
                  onClose={onClose}
                />
              );
            })}
          </div>
        ))}
      </nav>
    </SlideDrawer>
  );
}
