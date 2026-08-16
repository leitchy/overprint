/**
 * Screen-only map-layer dimming (map-layer-toggles feature).
 *
 * A course setter can dim groups of OCAD/OMAP map colours (contours/water/
 * vegetation/open) to declutter a busy map while placing controls. Both loaders
 * tag rendered SVG elements with `data-cat="<group>"` (see ink-classification's
 * {@link MapColourGroup}); this helper prepends a `<style>` rule that fades those
 * groups. Nothing is removed — so hidden features stay ghost-visible (a setter
 * never places a control on an *invisible* cliff/marsh), any misclassification
 * reads as "faded" rather than "the toggle broke", and there's no `<defs>` /
 * `<pattern>` bookkeeping. SVG rasterised via `<img>` honours the internal
 * `<style>`, and the same rule drives the live DOM-SVG path instantly.
 *
 * SCREEN-ONLY: the result is function-local and handed straight to the
 * rasterizer — it is NEVER written back into `map-image-store.rerender.svg`
 * (which exports read verbatim). See `export-theme-safety.test.ts`.
 */
import type { MapColourGroup } from './ink-classification';

/** Opacity a dimmed group is faded to (ghost-visible, not removed). */
export const DIM_OPACITY = 0.12;

/** Canonical, order-independent key for a dimmed-group set (re-raster cache key). */
export function dimKey(dimmed: Iterable<MapColourGroup>): string {
  return [...dimmed].sort().join(',');
}

/**
 * Return `svg` with a `<style>` rule fading each dimmed group to {@link DIM_OPACITY}.
 * Empty set → the input string is returned unchanged (zero cost when unused).
 */
export function applyMapDimming(svg: string, dimmed: Iterable<MapColourGroup>): string {
  const groups = [...dimmed];
  if (groups.length === 0) return svg;
  const rules = groups.map((g) => `[data-cat="${g}"]{opacity:${DIM_OPACITY}}`).join('');
  const style = `<style>${rules}</style>`;
  // Insert immediately after the opening <svg …> tag. If (defensively) there is
  // no <svg> tag, return the input untouched rather than corrupt it.
  const opening = /<svg\b[^>]*>/.exec(svg);
  if (!opening) return svg;
  const at = opening.index + opening[0].length;
  return svg.slice(0, at) + style + svg.slice(at);
}
