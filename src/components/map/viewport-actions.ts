/**
 * Viewport actions shared by the View menu and the keyboard shortcuts, so the two
 * can never drift apart. Zoom steps match the menu (× / ÷ 1.25); fit reuses the
 * pure fitToView helper against the live map-canvas container.
 */
import { useViewportStore } from '@/stores/viewport-store';
import { useMapImageStore } from '@/stores/map-image-store';
import { fitToView } from '@/components/map/use-map-navigation';

const ZOOM_STEP = 1.25;

export function zoomIn(): void {
  const { zoom, setZoom } = useViewportStore.getState();
  setZoom(zoom * ZOOM_STEP);
}

export function zoomOut(): void {
  const { zoom, setZoom } = useViewportStore.getState();
  setZoom(zoom / ZOOM_STEP);
}

/** Fit the loaded map to the map-canvas container. No-op when there is no map or container. */
export function fitMapToWindow(): void {
  const { imageWidth, imageHeight } = useMapImageStore.getState();
  const container = document.querySelector('[data-map-container]');
  if (!container || imageWidth <= 0 || imageHeight <= 0) return;
  const { width, height } = container.getBoundingClientRect();
  useViewportStore.getState().setViewport(fitToView(imageWidth, imageHeight, width, height));
}
