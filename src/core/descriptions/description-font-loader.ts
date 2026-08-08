/**
 * Web-font loading for the on-screen control description renderer (C8).
 *
 * Registers Roboto and Roboto Condensed (the same subsetted TTF assets the
 * PDF exporters embed) via the FontFace API so `ctx.font` on the description
 * canvas can use them. Loading is lazy: the TTFs are only fetched the first
 * time a description canvas renders.
 *
 * Degrades gracefully: where the FontFace API is unavailable (jsdom tests,
 * very old browsers) or a fetch fails, callers keep the generic `sans-serif`
 * fallback in the font stacks below.
 */
import robotoRegularUrl from '@/assets/fonts/Roboto-Regular.ttf?url';
import robotoBoldUrl from '@/assets/fonts/Roboto-Bold.ttf?url';
import robotoCondensedRegularUrl from '@/assets/fonts/RobotoCondensed-Regular.ttf?url';
import robotoCondensedBoldUrl from '@/assets/fonts/RobotoCondensed-Bold.ttf?url';

/** Canvas font stack for header rows (PurplePen uses the regular face). */
export const DESC_HEADER_FONT_FAMILY = "'Roboto', sans-serif";

/** Canvas font stack for grid cell text (PurplePen uses the condensed face). */
export const DESC_CELL_FONT_FAMILY = "'Roboto Condensed', 'Roboto', sans-serif";

let loadPromise: Promise<boolean> | null = null;

/**
 * Load and register the description web fonts. Resolves `true` once the
 * fonts are available to canvas contexts, `false` if loading is not possible.
 * Idempotent — concurrent/repeat callers share one load.
 */
export function loadDescriptionFonts(): Promise<boolean> {
  loadPromise ??= doLoad();
  return loadPromise;
}

async function doLoad(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return false;
  }
  const faces: Array<[family: string, url: string, weight: string]> = [
    ['Roboto', robotoRegularUrl, '400'],
    ['Roboto', robotoBoldUrl, '700'],
    ['Roboto Condensed', robotoCondensedRegularUrl, '400'],
    ['Roboto Condensed', robotoCondensedBoldUrl, '700'],
  ];
  try {
    const loaded = await Promise.all(
      faces.map(([family, url, weight]) =>
        new FontFace(family, `url(${url})`, { weight }).load(),
      ),
    );
    for (const face of loaded) document.fonts.add(face);
    return true;
  } catch (err) {
    console.warn('Description fonts unavailable, falling back to sans-serif:', err);
    return false;
  }
}
