/**
 * Shared DOM utilities used across keyboard-event handlers.
 */

/**
 * Returns true when the event target is an editable form element.
 * Use this to avoid intercepting keyboard shortcuts while the user is typing.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
