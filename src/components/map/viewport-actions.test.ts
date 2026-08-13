import { describe, it, expect, beforeEach } from 'vitest';
import { zoomIn, zoomOut, fitMapToWindow } from './viewport-actions';
import { useViewportStore, MIN_ZOOM, MAX_ZOOM } from '@/stores/viewport-store';
import { useMapImageStore } from '@/stores/map-image-store';

beforeEach(() => {
  useViewportStore.getState().resetView();
  useMapImageStore.setState({ image: null, imageWidth: 0, imageHeight: 0 } as never);
  document.body.innerHTML = '';
});

describe('viewport-actions — zoom', () => {
  it('zoomIn multiplies zoom by the 1.25 step', () => {
    zoomIn();
    expect(useViewportStore.getState().zoom).toBeCloseTo(1.25, 5);
  });

  it('zoomOut divides zoom by the 1.25 step', () => {
    useViewportStore.getState().setZoom(1.25);
    zoomOut();
    expect(useViewportStore.getState().zoom).toBeCloseTo(1, 5);
  });

  it('zoomIn clamps at MAX_ZOOM', () => {
    useViewportStore.getState().setZoom(MAX_ZOOM);
    zoomIn();
    expect(useViewportStore.getState().zoom).toBe(MAX_ZOOM);
  });

  it('zoomOut clamps at MIN_ZOOM', () => {
    useViewportStore.getState().setZoom(MIN_ZOOM);
    zoomOut();
    expect(useViewportStore.getState().zoom).toBe(MIN_ZOOM);
  });
});

describe('viewport-actions — fitMapToWindow', () => {
  it('is a no-op when no map container is present', () => {
    useMapImageStore.setState({ imageWidth: 100, imageHeight: 100 } as never);
    const zoomBefore = useViewportStore.getState().zoom;
    fitMapToWindow();
    expect(useViewportStore.getState().zoom).toBe(zoomBefore);
  });

  it('is a no-op with a container but no loaded image', () => {
    addContainer(500, 500);
    const zoomBefore = useViewportStore.getState().zoom;
    fitMapToWindow();
    expect(useViewportStore.getState().zoom).toBe(zoomBefore);
  });

  it('fits and centres the map inside the container', () => {
    useMapImageStore.setState({ image: {}, imageWidth: 1000, imageHeight: 1000 } as never);
    addContainer(500, 500);
    fitMapToWindow();
    // fitToView: (500 - 2*20) / 1000 = 0.46; centred → (500 - 1000*0.46)/2 = 20
    const { zoom, panX, panY } = useViewportStore.getState();
    expect(zoom).toBeCloseTo(0.46, 5);
    expect(panX).toBeCloseTo(20, 5);
    expect(panY).toBeCloseTo(20, 5);
  });
});

function addContainer(width: number, height: number): void {
  const div = document.createElement('div');
  div.setAttribute('data-map-container', '');
  div.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(div);
}
