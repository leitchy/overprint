import { useState } from 'react';
import { useToolStore } from '@/stores/tool-store';
import { useEventStore } from '@/stores/event-store';
import type { Tool } from '@/stores/tool-store';
import { useT } from '@/i18n/use-t';

export function MobileFab() {
  const t = useT();
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const viewMode = useEventStore((s) => s.viewMode);
  const [expanded, setExpanded] = useState(false);

  const tools: { tool: Tool; label: string; icon: string }[] = [
    { tool: { type: 'pan' }, label: t('toolPan'), icon: '✋' },
    { tool: { type: 'addControl' }, label: t('toolAddControl'), icon: '⊕' },
  ];

  const primaryTool = activeTool.type === 'addControl'
    ? tools[1]!
    : tools[0]!;

  const handlePrimaryClick = () => {
    if (expanded) {
      setExpanded(false);
    } else {
      // Toggle between pan and addControl
      if (activeTool.type === 'pan' && viewMode !== 'allControls') {
        setTool({ type: 'addControl' });
      } else {
        setTool({ type: 'pan' });
      }
    }
  };

  const handleLongPress = () => {
    setExpanded(true);
  };

  return (
    <div
      className="absolute bottom-20 right-4 z-30 flex flex-col-reverse items-center gap-2"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {/* Primary FAB */}
      <button
        onClick={handlePrimaryClick}
        onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white text-xl shadow-lg active:bg-violet-700"
        title={primaryTool.label}
        aria-label={primaryTool.label}
      >
        {primaryTool.icon}
      </button>

      {/* Expanded secondary tools */}
      {expanded && (
        <>
          {tools.map(({ tool, label, icon }) => {
            const isActive = activeTool.type === tool.type;
            return (
              <button
                key={tool.type}
                onClick={() => {
                  setTool(tool);
                  setExpanded(false);
                }}
                className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-md ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-gray-700'
                }`}
                title={label}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
          {/* Dismiss scrim */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setExpanded(false)}
          />
        </>
      )}
    </div>
  );
}
