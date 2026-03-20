import { useSyncExternalStore } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg';

const BREAKPOINTS = {
  md: '(min-width: 640px)',
  lg: '(min-width: 1024px)',
} as const;

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'lg';
  if (window.matchMedia(BREAKPOINTS.lg).matches) return 'lg';
  if (window.matchMedia(BREAKPOINTS.md).matches) return 'md';
  return 'sm';
}

let currentBreakpoint = getBreakpoint();
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Set up media query listeners once — they live for the lifetime of the SPA
  if (listeners.size === 1 && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const update = () => {
      const next = getBreakpoint();
      if (next !== currentBreakpoint) {
        currentBreakpoint = next;
        listeners.forEach((cb) => cb());
      }
    };

    window.matchMedia(BREAKPOINTS.md).addEventListener('change', update);
    window.matchMedia(BREAKPOINTS.lg).addEventListener('change', update);
  }

  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Breakpoint {
  return currentBreakpoint;
}

function getServerSnapshot(): Breakpoint {
  return 'lg';
}

/** Returns the current responsive breakpoint: 'sm' (<640px), 'md' (640-1023px), 'lg' (>=1024px) */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Convenience: true when viewport is phone-sized (<640px) */
export function useIsMobile(): boolean {
  return useBreakpoint() === 'sm';
}

/** Convenience: true when viewport is tablet or phone (<1024px) */
export function useIsCompact(): boolean {
  return useBreakpoint() !== 'lg';
}
