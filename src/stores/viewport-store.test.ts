import { describe, it, expect, beforeEach } from 'vitest';
import { useViewportStore, MIN_ZOOM, MAX_ZOOM } from './viewport-store';

beforeEach(() => {
  useViewportStore.getState().resetView();
});

describe('viewport-store', () => {
  it('starts with default values', () => {
    const state = useViewportStore.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  it('sets zoom', () => {
    useViewportStore.getState().setZoom(2.5);
    expect(useViewportStore.getState().zoom).toBe(2.5);
  });

  it('clamps zoom to minimum', () => {
    useViewportStore.getState().setZoom(0.01);
    expect(useViewportStore.getState().zoom).toBe(MIN_ZOOM);
  });

  it('clamps zoom to maximum', () => {
    useViewportStore.getState().setZoom(50);
    expect(useViewportStore.getState().zoom).toBe(MAX_ZOOM);
  });

  it('sets pan', () => {
    useViewportStore.getState().setPan(100, 200);
    const state = useViewportStore.getState();
    expect(state.panX).toBe(100);
    expect(state.panY).toBe(200);
  });

  it('sets viewport with partial update', () => {
    useViewportStore.getState().setViewport({ zoom: 3, panX: 50 });
    const state = useViewportStore.getState();
    expect(state.zoom).toBe(3);
    expect(state.panX).toBe(50);
    expect(state.panY).toBe(0); // unchanged
  });

  it('clamps zoom in setViewport', () => {
    useViewportStore.getState().setViewport({ zoom: 100 });
    expect(useViewportStore.getState().zoom).toBe(MAX_ZOOM);
  });

  it('resets view', () => {
    useViewportStore.getState().setZoom(5);
    useViewportStore.getState().setPan(300, 400);
    useViewportStore.getState().resetView();
    const state = useViewportStore.getState();
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });
});
