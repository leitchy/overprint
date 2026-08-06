import { useEffect, useRef } from 'react';
import { useMapImageStore } from '@/stores/map-image-store';
import { useViewportStore } from '@/stores/viewport-store';
import { useEventStore } from '@/stores/event-store';
import { rasterizeSvgToImage } from '@/core/files/rasterize-svg';
import { maxRasterLongSide } from '@/core/files/raster-config';

/** Debounce (ms) after zoom settles before re-rasterizing. */
const SETTLE_MS = 200;
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
 */
export function useAdaptiveMapRaster(disabled = false): void {
  const mapVersion = useMapImageStore((s) => s.mapVersion);

  // Generation guard so a slow render can't overwrite a newer one.
  const genRef = useRef(0);
  // The density factor currently applied to the displayed bitmap (1 = base).
  const appliedFactorRef = useRef(1);
  // The original base bitmap, restored on zoom-out.
  const baseImageRef = useRef<MapImageBitmap>(null);

  // On a new map, capture its base bitmap and reset density tracking.
  useEffect(() => {
    baseImageRef.current = useMapImageStore.getState().image;
    appliedFactorRef.current = 1;
    genRef.current++;
  }, [mapVersion]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (disabled) return; // DOM-SVG layer owns display — no bitmap swaps
      const store = useMapImageStore.getState();
      const rerender = store.rerender;
      if (!rerender) return; // raster maps: nothing to sharpen

      const logicalLong = Math.max(store.imageWidth, store.imageHeight);
      if (logicalLong <= 0) return;

      const zoom = useViewportStore.getState().zoom;
      const dpr = window.devicePixelRatio || 1;
      const cap = maxRasterLongSide();

      // Pixels we'd need on the long side to render the map ~1:1 on screen,
      // clamped to the device cap.
      const desiredLong = Math.min(logicalLong * zoom * dpr, cap);
      const desiredFactor = desiredLong / logicalLong;
      const applied = appliedFactorRef.current;

      // Back at (or below) base density — restore the base bitmap, free the big one.
      if (desiredFactor <= 1 + FACTOR_EPSILON) {
        if (applied > 1 + FACTOR_EPSILON && baseImageRef.current) {
          useMapImageStore.getState().setImageBitmap(baseImageRef.current);
          appliedFactorRef.current = 1;
        }
        return;
      }

      // Skip small changes to avoid thrashing re-renders.
      if (Math.abs(desiredFactor - applied) <= applied * FACTOR_EPSILON) return;

      const gen = ++genRef.current;
      const pxW = Math.round(store.imageWidth * desiredFactor);
      const pxH = Math.round(store.imageHeight * desiredFactor);

      try {
        let bitmap: MapImageBitmap;
        if (rerender.kind === 'svg') {
          bitmap = await rasterizeSvgToImage(rerender.svg, pxW, pxH, 'blob');
        } else {
          const buffer = store.pdfArrayBuffer;
          if (!buffer) return;
          const baseDpi = useEventStore.getState().event?.mapFile?.dpi ?? PDF_BASE_DPI;
          const { renderPdfPageToCanvas } = await import('@/core/files/load-pdf');
          bitmap = await renderPdfPageToCanvas(buffer, baseDpi * desiredFactor);
        }

        // A newer render (or new map) started while we awaited — discard this one.
        if (gen !== genRef.current) return;
        useMapImageStore.getState().setImageBitmap(bitmap);
        appliedFactorRef.current = desiredFactor;
      } catch (err) {
        console.error('Adaptive map re-rasterization failed:', err);
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, SETTLE_MS);
    };

    // React to zoom (and pan — cheap, run() early-returns when density is unchanged).
    const unsub = useViewportStore.subscribe(schedule);
    schedule(); // handle the case where the map loads already zoomed

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [mapVersion, disabled]);
}

type MapImageBitmap = HTMLImageElement | HTMLCanvasElement | null;
