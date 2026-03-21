/**
 * Platform detection utilities.
 */

/** Detect iOS or iPadOS (iPadOS 13+ reports as MacIntel with touch). */
export function isIOSOrIPadOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * File accept string for map/event file inputs.
 *
 * Desktop: specific extensions give a filtered file picker.
 * iOS/iPadOS: falls back to all files because iOS greys out files with
 * unregistered UTIs (.ocd, .omap, .xmap have no registered MIME type).
 * See webkit.org/b/226171.
 */
export const MAP_FILE_ACCEPT = isIOSOrIPadOS()
  ? '*/*'
  : 'image/png,image/jpeg,image/gif,image/tiff,image/bmp,application/pdf,.ocd,.omap,.xmap';
