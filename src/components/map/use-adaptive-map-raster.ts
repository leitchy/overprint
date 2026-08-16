import { useEffect, useRef } from 'react';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useEventStore } from '@/stores/event-store';
import { rasterizeSvgToImage } from '@/core/files/rasterize-svg';
import { maxRasterLongSide } from '@/core/files/raster-config';
import { applyMapDimming, dimKey } from '@/core/files/apply-map-dimming';

/** Debounce (ms) after zoom settles before re-rasterizing. */
const SETTLE_MS = 200;
/** Shorter debounce for a discrete layer-dimming toggle (not a continuous gesture). */
const TOGGLE_MS = 30;
/** Re-render only when the target density changes by more than this ratio. */
const FACTOR_EPSILON = 0.15;
/** Default PDF base DPI if the event metadata is missing. */
const PDF_BASE_DPI = 200;

/**
 * Adaptive map re-rasterization (roadmap item #1).
 *
 * The base map bitmap is rasterized once at load (~4000px long side) and drawn
 * into a fixed logical rectangle on the Konva canvas. When zoomed in, that bitmap
 * is upscaled and blurs. This hook watches the viewport and, once zoom settles,
 * re-rasterizes the *same* vector source (OCAD/OMAP SVG or PDF page) at a higher
 * pixel density — up to a device-aware cap — then swaps the bitmap in place
 * (logical dimensions and control coordinates are unchanged). Zooming back out
 * restores the lightweight base bitmap to release memory.
 *
 * The same path also applies **screen-only layer dimming**: when the setter dims
 * map-colour groups (`map-image-store.dimmedMapGroups`), the source SVG is passed
 * through `applyMapDimming` before rasterizing. A dim change must re-raster even
 * at base density (the common case), so the density guards below are gated on the
 * dim key as well — a naive "restore the base bitmap on zoom-out" would otherwise
 * drop the dimming, and a base-zoom toggle would be a silent no-op. The captured
 * `baseImageRef` is always the UNFILTERED base, so clearing all dimming restores
 * it directly with no re-raster.
 */
export function useAdaptiveMapRaster(disabled = false): void {
  const mapVersion = useMapImageStore((s) => s.mapVersion);

  // Generation guard so a slow render can't overwrite a newer one.
  const genRef = useRef(0);
  // The density factor currently applied to the displayed bitmap (1 = base).
  const appliedFactorRef = useRef(1);
  // The dim key currently baked into the displayed bitmap ('' = no dimming).
  const appliedDimKeyRef = useRef('');
  // The original UNFILTERED base bitmap, restored when density AND dimming are base.
  const baseImageRef = useRef<MapImageBitmap>(null);

  // On a new map, capture its base bitmap and reset density/dim tracking.
  useEffect(() => {
    baseImageRef.current = useMapImageStore.getState().image;
    appliedFactorRef.current = 1;
    appliedDimKeyRef.current = '';
    genRef.current++;
  }, [mapVersion]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (disabled) return; // DOM-SVG layer owns display — no bitmap swaps
      const store = useMapImageStore.getState();
      const rerender = store.rerender;
      if (!rerender) return; // raster maps: nothing to sharpen or dim

      const logicalLong = Math.max(store.imageWidth, store.imageHeight);
      if (logicalLong <= 0) return;

      const dimmed = store.dimmedMapGroups;
      const key = dimKey(dimmed);
      const dimChanged = key !== appliedDimKeyRef.current;

      const zoom = useViewportStore.getState().zoom;
      const dpr = window.devicePixelRatio || 1;
      const cap = maxRasterLongSide();

      // Pixels we'd need on the long side to render the map ~1:1 on screen,
      // clamped to the device cap. Target density is base (1) at/below base+eps.
      const desiredLong = Math.min(logicalLong * zoom * dpr, cap);
      const rawFactor = desiredLong / logicalLong;
      const targetFactor = rawFactor <= 1 + FACTOR_EPSILON ? 1 : rawFactor;
      const applied = appliedFactorRef.current;

      // Nothing to do — same density bucket AND same dim set.
      const densityStable = targetFactor === 1
        ? applied <= 1 + FACTOR_EPSILON
        : Math.abs(targetFactor - applied) <= applied * FACTOR_EPSILON;
      if (densityStable && !dimChanged) return;

      // Fast path: base density with no dimming → blit the unfiltered base bitmap.
      if (targetFactor === 1 && dimmed.length === 0) {
        if (baseImageRef.current) {
          useMapImageStore.getState().setImageBitmap(baseImageRef.current);
          appliedFactorRef.current = 1;
          appliedDimKeyRef.current = '';
        }
        return;
      }

      const gen = ++genRef.current;
      const pxW = Math.round(store.imageWidth * targetFactor);
      const pxH = Math.round(store.imageHeight * targetFactor);

      try {
        let bitmap: MapImageBitmap;
        if (rerender.kind === 'svg') {
          // Dimming is function-local — never written back to the store (exports
          // read `rerender.svg` verbatim). Empty set → applyMapDimming is a no-op.
          const svg = applyMapDimming(rerender.svg, dimmed);
          bitmap = await rasterizeSvgToImage(svg, pxW, pxH, 'blob');
        } else {
          // PDF maps have no data-cat tags (dimming unsupported); dimmed is always
          // empty for them, so this stays a pure density re-render.
          const buffer = store.pdfArrayBuffer;
          if (!buffer) return;
          const baseDpi = useEventStore.getState().event?.mapFile?.dpi ?? PDF_BASE_DPI;
          const { renderPdfPageToCanvas } = await import('@/core/files/load-pdf');
          bitmap = await renderPdfPageToCanvas(buffer, baseDpi * targetFactor);
        }

        // A newer render (or new map) started while we awaited — discard this one.
        if (gen !== genRef.current) return;
        useMapImageStore.getState().setImageBitmap(bitmap);
        appliedFactorRef.current = targetFactor;
        appliedDimKeyRef.current = key;
      } catch (err) {
        console.error('Adaptive map re-rasterization failed:', err);
      }
    };

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    // React to zoom (and pan — cheap, run() early-returns when nothing changed).
    const unsubZoom = useViewportStore.subscribe(() => schedule(SETTLE_MS));
    // React to a layer-dimming toggle — snappier than the zoom-settle debounce,
    // and only when the dim SET actually changes (ignore bitmap swaps we cause).
    let lastDimKey = dimKey(useMapImageStore.getState().dimmedMapGroups);
    const unsubDim = useMapImageStore.subscribe((s) => {
      const k = dimKey(s.dimmedMapGroups);
      if (k !== lastDimKey) {
        lastDimKey = k;
        schedule(TOGGLE_MS);
      }
    });
    schedule(SETTLE_MS); // handle a map that loads already zoomed

    return () => {
      unsubZoom();
      unsubDim();
      if (timer) clearTimeout(timer);
    };
  }, [mapVersion, disabled]);
}

type MapImageBitmap = HTMLImageElement | HTMLCanvasElement | null;
