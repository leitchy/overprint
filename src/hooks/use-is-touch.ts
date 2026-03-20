import { useSyncExternalStore } from 'react';

const MQ = '(pointer: coarse)';

function getIsTouch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MQ).matches;
}

let current = getIsTouch();
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Set up media query listener once — lives for the lifetime of the SPA
  if (listeners.size === 1 && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const update = () => {
      const next = getIsTouch();
      if (next !== current) {
        current = next;
        listeners.forEach((cb) => cb());
      }
    };
    window.matchMedia(MQ).addEventListener('change', update);
  }

  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return current;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Returns true when the primary pointing device is coarse (touch screen) */
export function useIsTouch(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
