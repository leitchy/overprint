import { useState } from 'react';
import { useEventStore } from '@/stores/event-store';
import { useT } from '@/i18n/use-t';

interface EventNameEditorProps {
  eventName: string;
  /** Additional classes for the display span */
  className?: string;
  /** Additional classes for the editing input */
  inputClassName?: string;
  /** Show the pencil icon on hover (desktop only) */
  showPencil?: boolean;
}

export function EventNameEditor({
  eventName,
  className = '',
  inputClassName = '',
  showPencil = false,
}: EventNameEditorProps) {
  const t = useT();
  const setEventName = useEventStore((s) => s.setEventName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) setEventName(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={commit}
        className={`text-sm text-gray-500 border-b border-violet-400 bg-transparent outline-none px-1 ${inputClassName}`}
      />
    );
  }

  return (
    <span
      className={`text-sm text-gray-500 cursor-pointer ${className}`}
      onClick={() => { setEditing(true); setDraft(eventName); }}
      title={t('clickToEditEventName')}
    >
      {eventName}
      {showPencil && (
        <span className="opacity-0 group-hover:opacity-50 text-xs ml-1">&#9998;</span>
      )}
    </span>
  );
}
